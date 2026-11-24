// The password rule (KTD5), shared so the setup and staff forms check it before the server does.
import { z } from "zod";

// bcrypt, the fallback when argon2 can't install, reads only the first 72 bytes of a password and
// silently ignores the rest. Refusing anything longer means two passwords that differ only after
// byte 72 can never match, whichever method hashed them
const MAX_BYTES = 72;

// The size in UTF-8, the way the hash functions receive it: a, ñ, ₱, and 💪 are 1, 2, 3, and 4 bytes
function utf8Bytes(text: string): number {
  let bytes = 0;
  for (const character of text) {
    const code = character.charCodeAt(0);
    // JavaScript stores a character like 💪 as two units, and every such character is 4 bytes
    bytes += character.length === 2 ? 4 : code < 0x80 ? 1 : code < 0x800 ? 2 : 3;
  }
  return bytes;
}

export const passwordSchema = z
  .string()
  // Counted in characters as a person sees them, so 💪 counts once
  .refine((password) => [...password].length >= 12, "Use at least 12 characters")
  .refine((password) => utf8Bytes(password) <= MAX_BYTES, "Use a shorter password");
