// A member's expiry date, worked out from their ledger every time, never stored (KTD8, R47).
// U4 writes the starting point: the owner's carried-over date (R44). From Phase 3 this file
// belongs to the U7 owner, who adds the renewals replayed on top of it (R11, R55).

/** The member's non-voided ledger entries. U7 adds renewals here. */
export interface Ledger {
  // The one non-voided carried-over date, like "2026-10-30", or null when there is none (KTD8)
  carriedOverExpiresOn: string | null;
}

/** The member's last active day as a Manila date, or null for a member who has never been active. */
export function expiryDate(ledger: Ledger): string | null {
  return ledger.carriedOverExpiresOn;
}

/**
 * Whether the member may use the gym on a Manila day. The expiry date is the last active day
 * (R55), so a member who expires on October 30 is active all of October 30 and expired on
 * October 31. Both dates are YYYY-MM-DD, so comparing the text compares the days.
 */
export function isActiveOn(expiresOn: string | null, manilaDay: string): boolean {
  return expiresOn !== null && manilaDay <= expiresOn;
}
