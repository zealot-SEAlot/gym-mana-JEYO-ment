// Headers that tell the browser to refuse common attacks (U2, plan step 5).
import type { RequestHandler } from "express";

// The page may load scripts, styles, images, and data only from the gym PC itself. A script slipped
// into a member's name cannot load code from elsewhere or send data out. U22 adds 'wasm-unsafe-eval'
// for the door scan page (KTD4), and U4 adds what the member photo camera needs
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "form-action 'self'",
  // No other website may show our pages inside a frame and trick staff into clicking
  "frame-ancestors 'none'",
].join("; ");

/** Sent on every response: pages, built files, and the API. */
export const securityHeaders: RequestHandler = (_request, response, next) => {
  response.setHeader("Content-Security-Policy", CONTENT_SECURITY_POLICY);
  // For one year, the browser opens this address only over HTTPS, even if someone types http://
  response.setHeader("Strict-Transport-Security", "max-age=31536000");
  // The browser trusts our Content-Type and never guesses that a text file is a script
  response.setHeader("X-Content-Type-Options", "nosniff");
  next();
};

/** Sent on API responses: member details and payments must never sit in a browser or proxy cache. */
export const noStore: RequestHandler = (_request, response, next) => {
  response.setHeader("Cache-Control", "no-store");
  next();
};
