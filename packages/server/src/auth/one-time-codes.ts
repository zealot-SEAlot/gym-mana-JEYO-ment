// Codes a person reads off paper or a screen and types in once (KTD5): the owner's recovery code
// now, the door tablet's pairing code in U3c. Each is random, the same length every time, and
// stored only as a hash in one_time_codes.
import { createHash, randomInt } from "node:crypto";

// No 0/O, 1/I/L, or U/V pairs, so a code copied by hand from paper can't be misread
const ALPHABET = "ABCDEFGHJKMNPQRSTWXYZ23456789";
// 20 characters from 29 is about 97 bits: far too many to guess, even without the rate limit
const LENGTH = 20;

/** A new random code, shown once, like "K7QM-2XRT-9HPA-WD3N-E5YB", and the hash to store. */
export function newCode(): { code: string; codeHash: string } {
  let code = "";
  for (let n = 0; n < LENGTH; n += 1) {
    // randomInt picks each character evenly, unlike Math.random, which isn't safe for secrets
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return { code: code.match(/.{4}/g)!.join("-"), codeHash: hashCode(code) };
}

/**
 * The stored form of a typed code. Dashes, spaces, and lower case are ignored, so "k7qm 2xrt…"
 * matches. SHA-256, not argon2: the code is random and long, so a slow hash would add nothing.
 */
export function hashCode(typed: string): string {
  const normalized = typed.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return createHash("sha256").update(normalized).digest("hex");
}
