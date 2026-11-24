// The desk's member routes (R8, R9, U4), mounted at /api/members. Owner and staff both register
// members; nobody else may see member data, so the door tablet and signed-out requests are refused.
// U8 adds edits, photo replacement, and erasure.
import { carryOverExpirySchema, registerMemberSchema } from "@jeyos/shared";
import type { RegisterMember } from "@jeyos/shared";
import type { z } from "zod";
import express from "express";
import type { Request, Router } from "express";
import { renderSVG } from "uqr";

import { allow } from "../auth/guard.ts";
import { signedInAs } from "../auth/sign-in.ts";
import type { GymDatabase, LocalOnlyDatabase } from "../db/client.ts";
import { HttpError } from "../http/errors.ts";
import { validateBody } from "../http/validate.ts";
import { carryOverExpiry, expiryOf } from "../membership/ledger.ts";
import { findMember, registerMember } from "./members.service.ts";
import type { Member } from "./members.service.ts";
import { memberPhotoPath, PHOTO_MAX_BYTES, preparePhoto, saveMemberPhoto } from "./photos.ts";

// The member the :id in the path names. Anything that isn't a member, or was erased, is "not found"
function memberFrom(gym: GymDatabase, localOnly: LocalOnlyDatabase, request: Request): Member {
  const id = Number(request.params.id);
  const member = Number.isSafeInteger(id) ? findMember(gym, localOnly, id) : null;
  if (member === null) {
    throw new HttpError(404, "member_not_found");
  }
  return member;
}

/**
 * POST /, GET /:id, GET /:id/qr.svg, POST /:id/photo, GET /:id/photo, and
 * POST /:id/carried-over-expiry. photosDir is config.photosDir.
 */
export function membersRouter(
  gym: GymDatabase,
  localOnly: LocalOnlyDatabase,
  photosDir: string,
): Router {
  const router = express.Router();

  router.post(
    "/",
    allow("owner", "staff"),
    validateBody(registerMemberSchema),
    (request, response) => {
      // allow() above has already refused a request with no signed-in account
      const signedIn = signedInAs(request)!;
      const member = registerMember(
        gym,
        localOnly,
        request.body as RegisterMember,
        signedIn,
        new Date(),
      );
      response.status(201).json(member);
    },
  );

  // expiresOn is worked out from the ledger on every read, never stored (KTD8)
  router.get("/:id", allow("owner", "staff"), (request, response) => {
    const member = memberFrom(gym, localOnly, request);
    response.json({ ...member, expiresOn: expiryOf(gym, member.id) });
  });

  // The card's QR code as a picture (R9). Error correction M still reads with a scratched or
  // creased card, and the 32 upper-case characters fit the 25-by-25 size (codes.ts)
  router.get("/:id/qr.svg", allow("owner", "staff"), (request, response) => {
    const { code } = memberFrom(gym, localOnly, request);
    response.type("image/svg+xml").send(renderSVG(code, { ecc: "M" }));
  });

  // The picture's own bytes are the body, not a form, so there is no file name to trust or
  // ignore. Any content type is read: the bytes decide what it is (preparePhoto), not the header.
  // Over PHOTO_MAX_BYTES, express.raw stops reading and answers 413 (errors.ts)
  router.post(
    "/:id/photo",
    allow("owner", "staff"),
    express.raw({ type: () => true, limit: PHOTO_MAX_BYTES }),
    async (request, response) => {
      const id = Number(request.params.id);
      // A JSON body was already read by express.json(), so it arrives here as an object
      const jpeg = Buffer.isBuffer(request.body) ? await preparePhoto(request.body) : null;
      if (jpeg === null) {
        throw new HttpError(415, "not_a_photo");
      }
      const result = Number.isSafeInteger(id)
        ? await saveMemberPhoto(gym, localOnly, photosDir, id, jpeg)
        : "member_not_found";
      if (result !== "saved") {
        throw new HttpError(result === "photo_exists" ? 409 : 404, result);
      }
      response.status(204).end();
    },
  );

  // Behind the same guard as every member route, so nobody on the gym Wi-Fi can fetch a face by
  // guessing a URL (KTD6). The door gets photos through its scan answer instead (U5)
  router.get("/:id/photo", allow("owner", "staff"), (request, response, next) => {
    const id = Number(request.params.id);
    const path = Number.isSafeInteger(id) ? memberPhotoPath(gym, localOnly, photosDir, id) : null;
    if (path === null) {
      throw new HttpError(404, "photo_not_found");
    }
    response.type("image/jpeg").sendFile(path, (error) => {
      // The row says there is a photo but the file is gone: a power cut between saving the row
      // and the file (photos.ts). The screen shows no photo, the same as for a member without one
      if (error !== undefined) {
        next(response.headersSent ? error : new HttpError(404, "photo_not_found"));
      }
    });
  });

  // The owner copies an existing member's expiry from the logbook or wall list (R44). Owner only:
  // staff can't make someone active without a payment (R4)
  router.post(
    "/:id/carried-over-expiry",
    allow("owner"),
    validateBody(carryOverExpirySchema),
    (request, response) => {
      const { expiresOn } = request.body as z.infer<typeof carryOverExpirySchema>;
      const id = Number(request.params.id);
      const result = Number.isSafeInteger(id)
        ? carryOverExpiry(gym, id, expiresOn, signedInAs(request)!, new Date())
        : "member_not_found";
      if (result !== "saved") {
        throw new HttpError(result === "already_carried_over" ? 409 : 404, result);
      }
      response.status(204).end();
    },
  );

  return router;
}
