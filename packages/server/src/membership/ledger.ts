// The membership ledger: what the expiry replay reads (KTD8, R47). U4 adds the owner's carried-over
// dates (R44); U7 adds renewals. Nothing here stores an expiry date: expiryOf works it out each time.
import { carriedOverExpiries, expiryDate, members } from "@jeyos/domain";
import type { Ledger } from "@jeyos/domain";
import Database from "better-sqlite3";
import { and, eq } from "drizzle-orm";

import { writeAudit } from "../audit/audit-log.ts";
import type { SignedIn } from "../auth/sessions.ts";
import type { GymDatabase } from "../db/client.ts";
import { enteredNow } from "../db/record-columns.ts";

/**
 * Records an existing member's expiry date copied from the logbook or wall list (R44), marked as
 * carried over and with an audit row naming who entered it (KTD9). No payment is made, so the
 * daily report never counts it as income. Only the owner may call this; the route checks that.
 */
export function carryOverExpiry(
  gym: GymDatabase,
  memberId: number,
  expiresOn: string,
  by: Pick<SignedIn, "accountId" | "displayName">,
  now: Date,
): "saved" | "member_not_found" | "already_carried_over" {
  const member = gym
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.id, memberId), eq(members.erased, false)))
    .get();
  if (member === undefined) {
    return "member_not_found";
  }
  const entered = enteredNow(by, now);
  try {
    gym.transaction(() => {
      const { id } = gym
        .insert(carriedOverExpiries)
        .values({ ...entered, memberId, expiresOn })
        .returning({ id: carriedOverExpiries.id })
        .get();
      // Same connection, inside the same transaction: if this fails, the entry goes too (KTD9)
      writeAudit(gym, {
        tableName: "carried_over_expiries",
        rowId: id,
        action: "carry_over",
        account: { id: by.accountId, displayName: by.displayName },
        recordManilaDate: entered.manilaDate,
        after: { memberId, expiresOn },
      });
    });
  } catch (error) {
    // carried_over_expiries_one_per_member: the member already has one that isn't voided (KTD8).
    // A wrong one is voided first (U12), then entered again. The database decides, so two
    // entries sent at once can't both pass a check made before saving
    if (error instanceof Database.SqliteError && error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return "already_carried_over";
    }
    throw error;
  }
  return "saved";
}

/** The member's non-voided ledger entries, for the expiry replay. U7 adds their renewals. */
export function ledgerOf(gym: GymDatabase, memberId: number): Ledger {
  const carriedOver = gym
    .select({ expiresOn: carriedOverExpiries.expiresOn })
    .from(carriedOverExpiries)
    .where(and(eq(carriedOverExpiries.memberId, memberId), eq(carriedOverExpiries.voided, false)))
    .get();
  return { carriedOverExpiresOn: carriedOver?.expiresOn ?? null };
}

/** The member's last active day as a Manila date, or null when they have never been active. */
export function expiryOf(gym: GymDatabase, memberId: number): string | null {
  return expiryDate(ledgerOf(gym, memberId));
}
