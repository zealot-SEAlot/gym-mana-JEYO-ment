// Owner and staff sessions, stored in the sessions table (KTD5, R52, U3 plan step 2).
// The browser's cookie holds a random token; the table holds only its SHA-256 hash. A session ends
// when the user signs out, when it sits idle past the owner's timeout, or when its account is disabled.
import { createHash, randomBytes } from "node:crypto";

import { accounts, sessions } from "@jeyos/domain";
import type { AccountRole } from "@jeyos/shared";
import { eq } from "drizzle-orm";
import { z } from "zod";

import type { GymDatabase } from "../db/client.ts";
import { readSetting, registerSetting } from "../settings/settings.ts";

// ponytail: 30 is a placeholder until the owner picks the timeout (plan, "Still open")
export const sessionIdleMinutes = registerSetting(
  "auth.sessionIdleMinutes",
  // At least 5, so a slow typist isn't signed out mid-form; at most a 12-hour shift
  z.number().int().min(5).max(720),
  30,
);

/** Who a session belongs to, for the route guard and for the names copied onto records (R50). */
export interface SignedIn {
  accountId: number;
  role: AccountRole;
  displayName: string;
  csrfToken: string;
}

// 32 random bytes is 256 bits, far too many to guess. base64url keeps it safe inside a cookie.
// Also used for the door tablet's token (devices.ts)
export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

// SHA-256, not argon2: the token is already random and long, so a slow hash would add nothing
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Starts a session after a correct password. The token goes in the cookie and is never stored. */
export function startSession(
  db: GymDatabase,
  accountId: number,
  now: Date,
): { token: string; csrfToken: string } {
  const token = randomToken();
  const csrfToken = randomToken();
  db.insert(sessions)
    .values({
      tokenHash: hashToken(token),
      accountId,
      csrfToken,
      createdAt: now.toISOString(),
      lastActiveAt: now.toISOString(),
    })
    .run();
  return { token, csrfToken };
}

/**
 * The account behind a cookie's token, or null when the session is gone, idle too long, or its
 * account is disabled. userStarted says the user made this request; only then does the idle clock
 * restart, so the open desk feed and automatic reloads never keep a session alive (KTD10).
 */
export function findSession(
  db: GymDatabase,
  token: string,
  now: Date,
  userStarted: boolean,
): SignedIn | null {
  const tokenHash = hashToken(token);
  const row = db
    .select({
      accountId: sessions.accountId,
      csrfToken: sessions.csrfToken,
      lastActiveAt: sessions.lastActiveAt,
      role: accounts.role,
      displayName: accounts.displayName,
      disabled: accounts.disabled,
    })
    .from(sessions)
    .innerJoin(accounts, eq(accounts.id, sessions.accountId))
    .where(eq(sessions.tokenHash, tokenHash))
    .get();
  if (row === undefined) {
    return null;
  }

  const idleMs = now.getTime() - Date.parse(row.lastActiveAt);
  // Written as "not within the limit", so a last_active_at that doesn't parse (NaN) ends the session
  if (row.disabled || !(idleMs <= readSetting(db, sessionIdleMinutes) * 60_000)) {
    // Delete it now, so an old cookie can never come back, even if the timeout is raised later
    db.delete(sessions).where(eq(sessions.tokenHash, tokenHash)).run();
    return null;
  }

  if (userStarted) {
    db.update(sessions)
      .set({ lastActiveAt: now.toISOString() })
      .where(eq(sessions.tokenHash, tokenHash))
      .run();
  }
  return {
    accountId: row.accountId,
    role: row.role,
    displayName: row.displayName,
    csrfToken: row.csrfToken,
  };
}

/** Signs out: the cookie's token stops working at once. */
export function endSession(db: GymDatabase, token: string): void {
  db.delete(sessions)
    .where(eq(sessions.tokenHash, hashToken(token)))
    .run();
}
