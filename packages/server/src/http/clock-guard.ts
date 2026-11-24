// The clock guard (KTD7, R56). The triggers in migration 0001_triggers refuse a new record typed in
// earlier than the latest saved one, with the error 'clock_behind', which errors.ts turns into
// 409 for the fix-the-clock screen. Reads keep working. This file holds the owner's way out.
import { systemState } from "@jeyos/domain";
import { eq } from "drizzle-orm";

import type { GymDatabase } from "../db/client.ts";

/**
 * The owner confirms the PC's clock reads the right time. From then on the guard compares new
 * records with now, not with the record that tripped it, which the wrong clock dated in the future.
 * Only the owner may call this; U3's role guard protects the route that will.
 */
export function confirmClock(db: GymDatabase, accountId: number, now: Date): void {
  const confirmedAt = now.toISOString();
  db.update(systemState)
    .set({
      latestEnteredAt: confirmedAt,
      clockConfirmedAt: confirmedAt,
      clockConfirmedByAccountId: accountId,
    })
    .where(eq(systemState.id, 1))
    .run();
}
