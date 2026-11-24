// Codes a person reads off paper or a screen and types in once (KTD5): the owner's recovery code
// and the door tablet's pairing code. Each is random, the same length every time, and stored only
// as a hash in one_time_codes.
import { createHash, randomInt } from "node:crypto";

import { oneTimeCodes } from "@jeyos/domain";
import type { ONE_TIME_CODE_PURPOSES } from "@jeyos/domain";
import { and, eq } from "drizzle-orm";

import type { GymDatabase } from "../db/client.ts";

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

/**
 * Uses up a typed code of this purpose. "used" means it was right and is now deleted, so a second
 * try finds nothing. Call it inside the transaction that acts on the code, so two requests with
 * the same code can't both use it. The caller counts tries with takeTry, since a wrong code
 * can't say which row it was aimed at.
 */
export function useCode(
  tx: Pick<GymDatabase, "select" | "delete">,
  purpose: (typeof ONE_TIME_CODE_PURPOSES)[number],
  typed: string,
  now: Date,
): "used" | "wrong" | "expired" {
  const stored = tx
    .select()
    .from(oneTimeCodes)
    .where(and(eq(oneTimeCodes.purpose, purpose), eq(oneTimeCodes.codeHash, hashCode(typed))))
    .get();
  if (stored === undefined) {
    return "wrong";
  }
  if (Date.parse(stored.expiresAt) <= now.getTime()) {
    return "expired";
  }
  tx.delete(oneTimeCodes).where(eq(oneTimeCodes.id, stored.id)).run();
  return "used";
}
