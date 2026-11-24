// The random token in a member's QR code (R9, R53). The door looks the member up by it (U5).
import { randomBytes } from "node:crypto";

/**
 * A new member code: 128 random bits as 32 upper-case hex characters, like "9F3A…C04E".
 * It takes no input, so it can't be worked out from a name, member number, or another code (R53).
 * Upper-case hex, not base64: a QR code holds 0-9 and A-Z in its compact mode, so the printed code
 * stays small, and a keyboard-style scanner (KTD4) can't break it by changing letter case.
 */
export function newMemberCode(): string {
  return randomBytes(16).toString("hex").toUpperCase();
}
