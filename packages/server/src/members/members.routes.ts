// The desk's member routes (R8, R9, U4), mounted at /api/members. Owner and staff both register
// members; nobody else may see member data, so the door tablet and signed-out requests are refused.
// U4b adds the photo routes, and U8 adds edits and erasure.
import { registerMemberSchema } from "@jeyos/shared";
import type { RegisterMember } from "@jeyos/shared";
import express from "express";
import type { Request, Router } from "express";
import { renderSVG } from "uqr";

import { allow } from "../auth/guard.ts";
import { signedInAs } from "../auth/sign-in.ts";
import type { GymDatabase, LocalOnlyDatabase } from "../db/client.ts";
import { HttpError } from "../http/errors.ts";
import { validateBody } from "../http/validate.ts";
import { findMember, registerMember } from "./members.service.ts";
import type { Member } from "./members.service.ts";

// The member the :id in the path names. Anything that isn't a member, or was erased, is "not found"
function memberFrom(gym: GymDatabase, localOnly: LocalOnlyDatabase, request: Request): Member {
  const id = Number(request.params.id);
  const member = Number.isSafeInteger(id) ? findMember(gym, localOnly, id) : null;
  if (member === null) {
    throw new HttpError(404, "member_not_found");
  }
  return member;
}

/** POST /, GET /:id, and GET /:id/qr.svg. */
export function membersRouter(gym: GymDatabase, localOnly: LocalOnlyDatabase): Router {
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

  router.get("/:id", allow("owner", "staff"), (request, response) => {
    response.json(memberFrom(gym, localOnly, request));
  });

  // The card's QR code as a picture (R9). Error correction M still reads with a scratched or
  // creased card, and the 32 upper-case characters fit the 25-by-25 size (codes.ts)
  router.get("/:id/qr.svg", allow("owner", "staff"), (request, response) => {
    const { code } = memberFrom(gym, localOnly, request);
    response.type("image/svg+xml").send(renderSVG(code, { ecc: "M" }));
  });

  return router;
}
