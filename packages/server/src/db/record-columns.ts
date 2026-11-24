// Fills the shared record columns (KTD7, R50) for a record the signed-in account enters now.
// Spread into an insert: tx.insert(members).values({ ...enteredNow(signedIn, now), code })
import { manilaDate } from "@jeyos/shared";

import type { SignedIn } from "../auth/sessions.ts";

/**
 * A record typed in as it happens. U13's after-outage entries set occurredAt from the paper log
 * and entryMode "after_outage" instead.
 */
export function enteredNow(by: Pick<SignedIn, "accountId" | "displayName">, now: Date) {
  return {
    occurredAt: now.toISOString(),
    enteredAt: now.toISOString(),
    manilaDate: manilaDate(now),
    entryMode: "normal" as const,
    enteredByAccountId: by.accountId,
    // A copy, so renaming the account later leaves this record as it was (R50)
    enteredByName: by.displayName,
  };
}
