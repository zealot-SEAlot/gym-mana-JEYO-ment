// The paired door tablet (R42, R51, R54, KTD5, U3 plan step 4). The tablet has no account. Pairing
// gives it a random token in an HttpOnly cookie, stored here only as a SHA-256 hash, like a
// session's. Routes let it in only when they declare allow("door"), which only scan routes do, so
// the tablet can't open member records, payments, sales, or staff screens (R42).
import { devices, oneTimeCodes } from "@jeyos/domain";
import { pairDeviceSchema } from "@jeyos/shared";
import { eq } from "drizzle-orm";
import express from "express";
import type { Request, RequestHandler, Router } from "express";
import type { z } from "zod";

import type { GymDatabase } from "../db/client.ts";
import { COOKIE_OPTIONS, readCookie } from "../http/cookies.ts";
import { HttpError } from "../http/errors.ts";
import { validateBody } from "../http/validate.ts";
import { allow } from "./guard.ts";
import { newCode, useCode } from "./one-time-codes.ts";
import { clearTries, takeTry } from "./rate-limit.ts";
import { hashToken, randomToken } from "./sessions.ts";

const COOKIE = "__Host-jeyos-device";

// A staff session ends when the browser closes, but the tablet must stay paired through restarts,
// so its cookie gets an expiry. Browsers cap that at 400 days, and the cookie is sent again on
// every request from the tablet, so a tablet in daily use never reaches it
const DEVICE_COOKIE_OPTIONS = { ...COOKIE_OPTIONS, maxAge: 400 * 86_400_000 };

// Long enough to walk from the desk to the door and type it in; short enough that a code left on
// the owner's screen soon stops working (KTD5: every code expires)
const PAIRING_CODE_MINUTES = 10;

// There is one pairing code at a time, so wrong guesses are counted together (KTD5)
const PAIRING_LIMIT_KEY = "code:pairing";

/** The tablet behind a request, for the route guard and the CSRF check. */
export interface PairedDevice {
  deviceId: number;
  csrfToken: string;
}

const deviceByRequest = new WeakMap<Request, PairedDevice>();

/** The paired tablet that sent this request, or null when it has no live device cookie. */
export function pairedDeviceOf(request: Request): PairedDevice | null {
  return deviceByRequest.get(request) ?? null;
}

/** Mounted on /api next to loadSession, so each route can ask pairedDeviceOf(request). */
export function loadDevice(db: GymDatabase): RequestHandler {
  return (request, response, next) => {
    const token = readCookie(request, COOKIE);
    if (token !== undefined) {
      const row = db
        .select({ deviceId: devices.id, csrfToken: devices.csrfToken })
        .from(devices)
        .where(eq(devices.tokenHash, hashToken(token)))
        .get();
      if (row === undefined) {
        // Revoked, or never paired here. Telling the browser to drop the cookie means the
        // tablet stops sending a dead token and shows the pairing screen
        response.clearCookie(COOKIE, COOKIE_OPTIONS);
      } else {
        deviceByRequest.set(request, row);
        response.cookie(COOKIE, token, DEVICE_COOKIE_OPTIONS);
      }
    }
    next();
  };
}

/**
 * Mounted at /api/devices: the owner's pairing code, tablet list, and revoke; the tablet's pair and
 * GET /this.
 */
export function devicesRouter(db: GymDatabase): Router {
  const router = express.Router();

  // The owner asks for a code, and the tablet types it in. Asking again replaces the old code
  router.post("/pairing-code", allow("owner"), (_request, response) => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + PAIRING_CODE_MINUTES * 60_000).toISOString();
    const { code, codeHash } = newCode();
    db.transaction((tx) => {
      // The one_time_codes_one_pairing index allows only one, so the old one goes first
      tx.delete(oneTimeCodes).where(eq(oneTimeCodes.purpose, "pairing")).run();
      tx.insert(oneTimeCodes)
        .values({ purpose: "pairing", codeHash, createdAt: now.toISOString(), expiresAt })
        .run();
    });
    // The only time the code is ever shown
    response.status(201).json({ pairingCode: code, expiresAt });
  });

  // Anyone, since the tablet has no login yet; the code is what proves the owner let it in
  router.post("/pair", allow("anyone"), validateBody(pairDeviceSchema), (request, response) => {
    const { pairingCode } = request.body as z.infer<typeof pairDeviceSchema>;
    const now = new Date();
    const waitSeconds = takeTry(db, PAIRING_LIMIT_KEY, now);
    if (waitSeconds > 0) {
      response.set("Retry-After", String(waitSeconds));
      throw new HttpError(429, "too_many_tries");
    }

    const token = randomToken();
    const csrfToken = randomToken();
    // A browser that was already paired gets a new token, and its old row goes, so the owner's
    // list never shows the same tablet twice
    const old = pairedDeviceOf(request);
    const deviceId = db.transaction((tx) => {
      const result = useCode(tx, "pairing", pairingCode, now);
      if (result === "wrong") {
        throw new HttpError(401, "wrong_pairing_code");
      }
      if (result === "expired") {
        throw new HttpError(401, "pairing_code_expired");
      }
      if (old !== null) {
        tx.delete(devices).where(eq(devices.id, old.deviceId)).run();
      }
      return tx
        .insert(devices)
        .values({ tokenHash: hashToken(token), csrfToken, pairedAt: now.toISOString() })
        .returning({ id: devices.id })
        .get().id;
    });
    clearTries(db, PAIRING_LIMIT_KEY);
    response.cookie(COOKIE, token, DEVICE_COOKIE_OPTIONS);
    response.status(201).json({ deviceId, csrfToken });
  });

  // The owner's list: when each tablet was paired, and its last scan's time and address (KTD5)
  router.get("/", allow("owner"), (_request, response) => {
    response.json(
      db
        .select({
          id: devices.id,
          pairedAt: devices.pairedAt,
          lastScanAt: devices.lastScanAt,
          lastScanAddress: devices.lastScanAddress,
        })
        .from(devices)
        .orderBy(devices.id)
        .all(),
    );
  });

  // Revoking deletes the row, so the tablet's cookie stops working on its next request (R51)
  router.delete("/:id", allow("owner"), (request, response) => {
    const id = Number(request.params.id);
    // A path like /devices/abc can't name a tablet, so it gets the same answer as a missing one
    const changes = Number.isSafeInteger(id)
      ? db.delete(devices).where(eq(devices.id, id)).run().changes
      : 0;
    if (changes === 0) {
      throw new HttpError(404, "device_not_found");
    }
    response.status(204).end();
  });

  // The door page asks this when it loads: a paired tablet gets its CSRF token back, which it
  // lost on reload, and an unpaired one gets 401, which tells it to show the pairing screen
  router.get("/this", allow("door"), (request, response) => {
    response.json(pairedDeviceOf(request));
  });

  return router;
}
