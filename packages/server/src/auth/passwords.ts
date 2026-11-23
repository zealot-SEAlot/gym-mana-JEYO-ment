// Password hashing for owner and staff accounts (KTD5, U3 plan step 2).
// argon2id normally. argon2 is a native package, so it is an optional dependency: if it fails to
// install on the gym PC, npm carries on and this file falls back to bcryptjs, which is plain
// JavaScript. Each stored hash records its method, so either kind can be checked later.
import type { PASSWORD_HASH_METHODS } from "@jeyos/domain";
import { passwordSchema } from "@jeyos/shared";
import bcrypt from "bcryptjs";

type HashMethod = (typeof PASSWORD_HASH_METHODS)[number];

// null when argon2 isn't installed or its native file won't load
const argon2 = await import("argon2").catch(() => null);

/** The method new passwords get. The System Status screen (U20) warns while it is "bcrypt". */
export const hashMethod: HashMethod = argon2 === null ? "bcrypt" : "argon2id";

/** Hashes a new password after checking the shared rule, for the accounts table's two columns. */
export async function hashPassword(
  password: string,
): Promise<{ passwordHash: string; passwordHashMethod: HashMethod }> {
  passwordSchema.parse(password);
  if (argon2 === null) {
    // Cost 12: about a quarter of a second per hash on a typical PC, which slows guessing
    return { passwordHash: await bcrypt.hash(password, 12), passwordHashMethod: "bcrypt" };
  }
  return {
    passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
    passwordHashMethod: "argon2id",
  };
}

/** Whether password matches a stored hash, checked with the method that made the hash. */
export async function verifyPassword(
  password: string,
  passwordHash: string,
  passwordHashMethod: HashMethod,
): Promise<boolean> {
  if (passwordHashMethod === "bcrypt") {
    return bcrypt.compare(password, passwordHash);
  }
  if (argon2 === null) {
    // A hash made while argon2 worked can't be checked without it. Fail loudly, not as a wrong password
    throw new Error("This password was hashed with argon2id, but argon2 isn't installed");
  }
  return argon2.verify(passwordHash, password);
}
