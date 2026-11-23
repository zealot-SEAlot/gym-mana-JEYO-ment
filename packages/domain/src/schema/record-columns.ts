// Columns every record the staff enter carries (KTD7, R18, R27, R50). Each table spreads them in:
//   sqliteTable("payments", { id: ..., ...recordColumns, ... }, () => [recordChecks("payments")])
import { sql } from "drizzle-orm";
import { check, integer, text } from "drizzle-orm/sqlite-core";

import { accounts } from "./accounts.ts";

// 'after_outage' marks a record typed in later from the paper log (U13)
export const ENTRY_MODES = ["normal", "after_outage"] as const;

// Times are UTC text like 2026-09-15T16:00:00.000Z, readable in a database viewer (schema session, block 1)
export const recordColumns = {
  // When it happened. For an after-outage entry, the time written on the paper log
  occurredAt: text("occurred_at").notNull(),
  // When it was typed into the system
  enteredAt: text("entered_at").notNull(),
  // The Manila calendar day of occurredAt, from manilaDate() in @jeyos/shared. Day-based rules read this
  manilaDate: text("manila_date").notNull(),
  entryMode: text("entry_mode", { enum: ENTRY_MODES }).notNull(),
  // Records are voided, never deleted. Who voided it, when, and why go in the audit log (block 1, KTD9)
  voided: integer("voided", { mode: "boolean" }).notNull().default(false),
  enteredByAccountId: integer("entered_by_account_id")
    .notNull()
    .references(() => accounts.id),
  // A copy of the account's display name when the record was entered, so a rename leaves it as it was (R50)
  enteredByName: text("entered_by_name").notNull(),
};

/** The database checks that go with recordColumns. The check names must be unique, so they start with the table name. */
export function recordChecks(tableName: string) {
  return check(`${tableName}_entry_mode`, sql`entry_mode IN ('normal', 'after_outage')`);
}
