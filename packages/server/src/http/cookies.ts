// The two login cookies: a staff or owner session (auth/sign-in.ts) and a paired door tablet
// (auth/devices.ts). Both hold a random token that the server stores only as a hash.
import type { CookieOptions, Request } from "express";

// The __Host- prefix on both cookie names makes the browser refuse the cookie unless it is Secure,
// for the whole site, and set by the gym PC itself, so no other address on the network can plant one
export const COOKIE_OPTIONS: CookieOptions = {
  // Page scripts can't read it, so a script slipped into a member's name can't steal it
  httpOnly: true,
  secure: true,
  // The browser never sends it with a request that starts on another website
  sameSite: "strict",
  path: "/",
};

/** The value of the named cookie the browser sent, or undefined when it sent none. */
export function readCookie(request: Request, name: string): string | undefined {
  for (const pair of request.get("Cookie")?.split(";") ?? []) {
    const [key, value] = pair.trim().split("=");
    if (key === name) {
      return value;
    }
  }
  return undefined;
}
