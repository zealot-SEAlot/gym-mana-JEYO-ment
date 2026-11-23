// The CSRF check (KTD5, U3 plan step 2). Another website can make a staff member's browser send a
// form to the gym PC, and older browsers would attach the session cookie. So every write from a
// signed-in browser must also carry the session's CSRF token in a header. The gym's own pages got
// that token at sign-in; another website can't read it, so it can't send it.
import { timingSafeEqual } from "node:crypto";

import type { RequestHandler } from "express";

import { HttpError } from "../http/errors.ts";
import { signedInAs } from "./sign-in.ts";

// Requests that only read. Routes must never change data on these, or this check misses them
const READ_ONLY_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Compares in the same time whatever the first wrong character, so timing can't reveal a secret. */
export function sameToken(sent: string, expected: string): boolean {
  const a = Buffer.from(sent);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Mounted on /api right after loadSession: refuses a signed-in write without the right token. */
export const requireCsrfToken: RequestHandler = (request, _response, next) => {
  const signedIn = signedInAs(request);
  // A request without a live session has no cookie power to abuse; the route guard (U3b) decides
  // what a signed-out request may do
  if (signedIn !== null && !READ_ONLY_METHODS.has(request.method)) {
    if (!sameToken(request.get("X-CSRF-Token") ?? "", signedIn.csrfToken)) {
      throw new HttpError(403, "csrf_token_wrong");
    }
  }
  next();
};
