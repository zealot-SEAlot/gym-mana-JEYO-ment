// The membership ledger: carried-over expiry dates and renewals (R7, R11, R44, R47, KTD8). Built in U4 and U7.
// No expiry date is stored anywhere. The expiry replay works it out from these two tables, so a
// void or a back-entry changes later expiries on its own (KTD8, schema session block 4)
import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { PLAN_LENGTH_UNITS } from "@jeyos/shared";

import { members } from "./members.ts";
import { payments } from "./payments.ts";
import { plans } from "./plans.ts";
import { recordChecks, recordColumns } from "./record-columns.ts";

// An expiry date the owner copies from the logbook or wall list for an existing member (R44).
// No payment, so it adds nothing to income. Only the owner may enter one: U4's route allows only
// the owner (KTD6)
export const carriedOverExpiries = sqliteTable(
  "carried_over_expiries",
  {
    id: integer("id").primaryKey(),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id),
    // Who entered it, and when
    ...recordColumns,
    // The member's last active day as a Manila date, like 2026-10-30 (R55)
    expiresOn: text("expires_on").notNull(),
  },
  (table) => [
    recordChecks("carried_over_expiries"),
    // One non-voided carried-over entry per member (KTD8). Voiding a wrong one lets the owner enter it again
    uniqueIndex("carried_over_expiries_one_per_member")
      .on(table.memberId)
      .where(sql`voided = 0`),
  ],
);

// One renewal per membership payment. The plan's length, unit, and price are copied at that moment,
// so a later change to the plan leaves this renewal as it was (R7). These copies can't be filled in
// later for old rows, which is why they are in the first migration (U7)
export const renewals = sqliteTable(
  "renewals",
  {
    id: integer("id").primaryKey(),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id),
    // Who renewed the member, and when. The replay orders renewals by occurredAt, then id (KTD8)
    ...recordColumns,
    // Which plan was chosen, for screens. The replay reads the copies below, never the plan row
    planId: integer("plan_id")
      .notNull()
      .references(() => plans.id),
    planLength: integer("plan_length").notNull(),
    planLengthUnit: text("plan_length_unit", { enum: PLAN_LENGTH_UNITS }).notNull(),
    planPriceCentavos: integer("plan_price_centavos").notNull(),
    // The membership payment that paid for it. One payment pays for one renewal (block 4)
    paymentId: integer("payment_id")
      .notNull()
      .unique()
      .references(() => payments.id),
  },
  () => [
    recordChecks("renewals"),
    check("renewals_plan_length", sql`plan_length > 0`),
    check("renewals_plan_length_unit", sql`plan_length_unit IN ('day', 'month')`),
    check("renewals_plan_price", sql`plan_price_centavos >= 0`),
  ],
);
