// Owner setup on a fresh install, and the owner's forgotten-password reset (R49, KTD5, U3 plan
// step 1). Setup creates the one owner account and a recovery code to print. Only the gym PC itself
// may use either: setup needs the secret the install script wrote to the data folder and works only
// while there is no owner; the reset needs the printed recovery code.
import { readFileSync } from "node:fs";

import { accounts, oneTimeCodes, sessions } from "@jeyos/domain";
import { recoverySchema, setupSchema } from "@jeyos/shared";
import { eq } from "drizzle-orm";
import express from "express";
import type { Request, RequestHandler, Router } from "express";
import type { z } from "zod";

import type { GymDatabase } from "../db/client.ts";
import { HttpError } from "../http/errors.ts";
import { validateBody } from "../http/validate.ts";
import { sameToken } from "./csrf.ts";
import { allow } from "./guard.ts";
import { newCode, useCode } from "./one-time-codes.ts";
import { hashPassword } from "./passwords.ts";
import { clearTries, takeTry } from "./rate-limit.ts";

// ponytail: one year is a placeholder until the owner decides (KTD5 says every code expires).
// Once it expires, only a new code made by the signed-in owner can reset the owner password
const RECOVERY_CODE_DAYS = 365;

// There is one recovery code at a time, so wrong guesses are counted together (KTD5)
const RECOVERY_LIMIT_KEY = "code:recovery";

// The names the gym PC answers to on its own loopback connection. The certificate covers
// localhost (KTD3), so the owner opens https://localhost/ to run setup
const GYM_PC_NAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

// 127.0.0.1 and ::1, also in the ::ffff:127.0.0.1 form Node reports for IPv4 on a dual-stack socket
function isLoopback(address: string | undefined): boolean {
  return address === "::1" || (address?.replace(/^::ffff:/, "").startsWith("127.") ?? false);
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * True only for a request made on the gym PC itself, read from the connection, never from
 * headers like X-Forwarded-For that any device can fill in. The operating system delivers a
 * connection to 127.0.0.1 or ::1 only from the same machine, so a phone on the Wi-Fi that claims
 * the gym PC's address still arrives on the gym PC's Wi-Fi address and is refused.
 */
export function fromGymPcItself(request: Request): boolean {
  const { localAddress, remoteAddress } = request.socket;
  if (!isLoopback(localAddress) || !isLoopback(remoteAddress)) {
    return false;
  }
  // A website the owner visits could point its own name at 127.0.0.1 and send requests from the
  // owner's browser. Its Host header still names that website, so the allow-list refuses it
  const host = hostnameOf(`https://${request.get("Host") ?? ""}`);
  if (host === null || !GYM_PC_NAMES.has(host)) {
    return false;
  }
  // Browsers send Origin with every form and fetch POST. Another website's page has its own
  const origin = request.get("Origin");
  return origin === undefined || GYM_PC_NAMES.has(hostnameOf(origin) ?? "");
}

const gymPcOnly: RequestHandler = (request, _response, next) => {
  if (!fromGymPcItself(request)) {
    throw new HttpError(403, "not_on_gym_pc");
  }
  next();
};

// Takes the database or a transaction inside it; both can select
function ownerExists(db: Pick<GymDatabase, "select">): boolean {
  return db.select().from(accounts).where(eq(accounts.role, "owner")).get() !== undefined;
}

// Stores a new recovery code for the owner and returns it, to show once. The caller deletes the
// old one first: the one_time_codes_one_recovery index allows only one
function issueRecoveryCode(tx: Pick<GymDatabase, "insert">, now: Date): string {
  const { code, codeHash } = newCode();
  tx.insert(oneTimeCodes)
    .values({
      purpose: "recovery",
      codeHash,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + RECOVERY_CODE_DAYS * 86_400_000).toISOString(),
    })
    .run();
  return code;
}

/** POST / and POST /recover, mounted at /api/setup. setupSecretFile is where the install script wrote the secret. */
export function setupRouter(db: GymDatabase, setupSecretFile: string): Router {
  const router = express.Router();

  // Anyone, because nobody is signed in yet; gymPcOnly and the secret do the checking
  router.post(
    "/",
    allow("anyone"),
    gymPcOnly,
    validateBody(setupSchema),
    async (request, response) => {
      const { setupSecret, displayName, signInName, password } = request.body as z.infer<
        typeof setupSchema
      >;
      if (ownerExists(db)) {
        throw new HttpError(409, "setup_done");
      }
      let expected: string;
      try {
        expected = readFileSync(setupSecretFile, "utf8").trim();
      } catch {
        // The install script hasn't run, or the file was moved. Says so, instead of "wrong secret"
        throw new HttpError(503, "setup_secret_missing");
      }
      if (expected === "" || !sameToken(setupSecret, expected)) {
        throw new HttpError(403, "setup_secret_wrong");
      }

      // Hashing takes a moment, so it happens before the transaction, not inside it
      const hashed = await hashPassword(password);
      const now = new Date();
      const recoveryCode = db.transaction((tx) => {
        // Asked again inside the transaction: two setup forms sent at once can't both get here
        // first. The accounts_one_owner index would refuse the second owner anyway
        if (ownerExists(tx)) {
          throw new HttpError(409, "setup_done");
        }
        tx.insert(accounts)
          .values({ displayName, signInName, role: "owner", ...hashed })
          .run();
        return issueRecoveryCode(tx, now);
      });
      // The only time the code is ever shown. The setup screen asks the owner to print it
      response.status(201).json({ recoveryCode });
    },
  );

  // The owner forgot their password. The printed code sets a new one, works once, and ends every
  // owner session, so whoever was signed in as the owner is signed out (KTD5)
  router.post(
    "/recover",
    allow("anyone"),
    gymPcOnly,
    validateBody(recoverySchema),
    async (request, response) => {
      const { recoveryCode, newPassword } = request.body as z.infer<typeof recoverySchema>;
      const waitSeconds = takeTry(db, RECOVERY_LIMIT_KEY, new Date());
      if (waitSeconds > 0) {
        response.set("Retry-After", String(waitSeconds));
        throw new HttpError(429, "too_many_tries");
      }

      // Hashed before the code is checked, so the check and the change sit in one transaction with
      // no waiting inside it. Two requests with the same code can't both use it
      const hashed = await hashPassword(newPassword);
      const now = new Date();
      const newRecoveryCode = db.transaction((tx) => {
        // Used once: a right code is deleted here, so a second try finds nothing
        const result = useCode(tx, "recovery", recoveryCode, now);
        if (result === "wrong") {
          throw new HttpError(401, "wrong_recovery_code");
        }
        if (result === "expired") {
          throw new HttpError(401, "recovery_code_expired");
        }
        // Setup saved the owner and the first code together, so a code means there is an owner
        const owner = tx.select().from(accounts).where(eq(accounts.role, "owner")).get()!;
        tx.update(accounts).set(hashed).where(eq(accounts.id, owner.id)).run();
        tx.delete(sessions).where(eq(sessions.accountId, owner.id)).run();
        // A fresh code, so the owner is never left with no way back in
        return issueRecoveryCode(tx, now);
      });
      clearTries(db, RECOVERY_LIMIT_KEY);
      response.json({ recoveryCode: newRecoveryCode });
    },
  );

  return router;
}
