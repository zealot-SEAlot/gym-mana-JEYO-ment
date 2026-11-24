// Stored limits on guessing (KTD5, U3 plan step 2): five tries per 15 minutes for each sign-in
// name, and later each code and door device. The counts live in the rate_limits table, so
// restarting the server doesn't hand out fresh tries.
import { rateLimits } from "@jeyos/domain";
import { eq, lte, sql } from "drizzle-orm";

import type { GymDatabase } from "../db/client.ts";

const MAX_TRIES = 5;
const WINDOW_MS = 15 * 60_000;

/**
 * Uses up one try for key, like "sign-in:lee", and returns 0 to go ahead, or the seconds to wait.
 * The try is counted before the password is checked, not after: checking takes a moment, and
 * ten guesses sent at once would otherwise all pass before the first failure was saved.
 * Call clearTries after a correct answer, so only wrong answers stay counted.
 */
export function takeTry(db: GymDatabase, key: string, now: Date): number {
  // Forget windows that have ended, this key's included. This also stops made-up sign-in names
  // from piling up rows
  const cutoff = new Date(now.getTime() - WINDOW_MS).toISOString();
  db.delete(rateLimits).where(lte(rateLimits.windowStartedAt, cutoff)).run();

  const row = db.select().from(rateLimits).where(eq(rateLimits.key, key)).get();
  if (row !== undefined && row.failedAttempts >= MAX_TRIES) {
    const windowEnds = Date.parse(row.windowStartedAt) + WINDOW_MS;
    return Math.ceil((windowEnds - now.getTime()) / 1000);
  }

  // The first try starts the window; later ones add to it without moving it
  db.insert(rateLimits)
    .values({ key, failedAttempts: 1, windowStartedAt: now.toISOString() })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: { failedAttempts: sql`${rateLimits.failedAttempts} + 1` },
    })
    .run();
  return 0;
}

/** After a correct answer: the tries so far no longer count against key. */
export function clearTries(db: GymDatabase, key: string): void {
  db.delete(rateLimits).where(eq(rateLimits.key, key)).run();
}
