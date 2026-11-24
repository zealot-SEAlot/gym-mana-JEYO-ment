// Signing in and out over HTTP, and finding who sent each /api request (KTD5, R52, U3 plan step 2).
// Five wrong passwords for one sign-in name lock it for the rest of 15 minutes (rate-limit.ts).
// The session token travels only in an HttpOnly cookie, which page scripts can't read.
import { accounts } from "@jeyos/domain";
import { signInSchema } from "@jeyos/shared";
import { sql } from "drizzle-orm";
import express from "express";
import type { Request, RequestHandler, Router } from "express";
import type { z } from "zod";

import type { GymDatabase } from "../db/client.ts";
import { COOKIE_OPTIONS, readCookie } from "../http/cookies.ts";
import { HttpError } from "../http/errors.ts";
import { validateBody } from "../http/validate.ts";
import { allow } from "./guard.ts";
import { hashPassword, verifyPassword } from "./passwords.ts";
import { clearTries, takeTry } from "./rate-limit.ts";
import { endSession, findSession, startSession } from "./sessions.ts";
import type { SignedIn } from "./sessions.ts";

const COOKIE = "__Host-jeyos-session";

// The client sends this header on requests the user started: a click, a typed search, a saved
// form. The desk feed can't send headers and automatic reloads leave it off, so neither keeps a
// session alive (KTD10). A forgotten header signs someone out early, which they notice at once;
// the opposite default would keep sessions open forever, which nobody would notice
const USER_ACTION_HEADER = "X-User-Action";

// Checked when the sign-in name matches no account, so a wrong name takes as long as a wrong
// password and the timing can't reveal which sign-in names exist
const NO_ACCOUNT = await hashPassword("no account has this password");

// Who sent each request. A WeakMap lets the request be cleaned up as usual once it is answered
const signedInByRequest = new WeakMap<Request, SignedIn>();

/** The account that sent this request, or null when it has no live session. */
export function signedInAs(request: Request): SignedIn | null {
  return signedInByRequest.get(request) ?? null;
}

/** Mounted on /api before every router, so each route can ask signedInAs(request). */
export function loadSession(db: GymDatabase): RequestHandler {
  return (request, _response, next) => {
    const token = readCookie(request, COOKIE);
    if (token !== undefined) {
      const userStarted = request.get(USER_ACTION_HEADER) === "1";
      const signedIn = findSession(db, token, new Date(), userStarted);
      if (signedIn !== null) {
        signedInByRequest.set(request, signedIn);
      }
    }
    next();
  };
}

/** POST /sign-in, POST /sign-out, and GET /session, mounted at /api/auth. */
export function signInRouter(db: GymDatabase): Router {
  const router = express.Router();

  // Anyone, since signing in is how a signed-out person gets a session
  router.post(
    "/sign-in",
    allow("anyone"),
    validateBody(signInSchema),
    async (request, response) => {
      const { signInName, password } = request.body as z.infer<typeof signInSchema>;
      // Counted per sign-in name, whether or not an account has it, so the limit can't reveal
      // which names exist. Checked before the password, so a refused try costs no hashing
      const limitKey = `sign-in:${signInName.toLowerCase()}`;
      const waitSeconds = takeTry(db, limitKey, new Date());
      if (waitSeconds > 0) {
        // The standard header for "try again in this many seconds", for the sign-in screen
        response.set("Retry-After", String(waitSeconds));
        throw new HttpError(429, "too_many_tries");
      }
      // Sign-in names ignore upper and lower case, like the accounts_sign_in_name index
      const account = db
        .select()
        .from(accounts)
        .where(sql`lower(${accounts.signInName}) = lower(${signInName})`)
        .get();

      const stored = account ?? NO_ACCOUNT;
      const correct = await verifyPassword(
        password,
        stored.passwordHash,
        stored.passwordHashMethod,
      );
      // One answer for a wrong name, a wrong password, and a disabled account (R50), so the screen
      // never tells a stranger which of the three it was
      if (account === undefined || account.disabled || !correct) {
        throw new HttpError(401, "wrong_sign_in");
      }
      clearTries(db, limitKey);

      // A new token on every sign-in, and the old one ended, so a token someone saw before sign-in
      // is worthless afterwards
      const oldToken = readCookie(request, COOKIE);
      if (oldToken !== undefined) {
        endSession(db, oldToken);
      }
      const { token, csrfToken } = startSession(db, account.id, new Date());
      response.cookie(COOKIE, token, COOKIE_OPTIONS);
      response.json({ displayName: account.displayName, role: account.role, csrfToken });
    },
  );

  router.post("/sign-out", allow("anyone"), (request, response) => {
    const token = readCookie(request, COOKIE);
    if (token !== undefined) {
      endSession(db, token);
    }
    response.clearCookie(COOKIE, COOKIE_OPTIONS);
    response.status(204).end();
  });

  // After a reload the page has lost the CSRF token it got at sign-in, so it asks again here.
  // Another website can't read this answer, and its requests don't carry the cookie anyway
  router.get("/session", allow("anyone"), (request, response) => {
    const signedIn = signedInAs(request);
    response.json(
      signedIn && {
        displayName: signedIn.displayName,
        role: signedIn.role,
        csrfToken: signedIn.csrfToken,
      },
    );
  });

  return router;
}
