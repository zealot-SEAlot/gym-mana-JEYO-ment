// The append-only audit log and the personal values it keeps apart (R41, R59, R62, KTD9). Built in U2c.
// Each service writes its audit row in the same transaction as the change it records (KTD9).
// The triggers that refuse updates and deletes on both tables, and the erasure exception, are
// SQL that Drizzle can't describe here, so U2c adds them in its own migration
import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { accounts } from "./accounts.ts";
import { members } from "./members.ts";

// The changes KTD9 lists. back_entry is an after-outage entry; back_entry_refused is one the
// R48 window refused, so it has no row to point at
export const AUDIT_ACTIONS = [
  "void",
  "correct",
  "override",
  "carry_over",
  "back_entry",
  "back_entry_refused",
  "member_edit",
  "erase",
] as const;

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: integer("id").primaryKey(),
    // The record the row describes, like ("payments", 12)
    tableName: text("table_name").notNull(),
    // Empty only for a refused back-entry, which saved no record
    rowId: integer("row_id"),
    action: text("action", { enum: AUDIT_ACTIONS }).notNull(),
    // Who acted, with a copy of their name then, like every record (R50, block 2)
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id),
    accountName: text("account_name").notNull(),
    // When they acted, as UTC text (block 1)
    actedAt: text("acted_at").notNull(),
    // The Manila date of the record that changed, so U11 can mark that day's report as changed
    // after closing (R61). For a refused back-entry, the date it would have had
    recordManilaDate: text("record_manila_date").notNull(),
    // Why, for a void or a correction (block 1). The service decides when it is required
    reason: text("reason"),
    // The record's values before and after, as JSON, with personal values left out (R41).
    // Those go in audit_personal_values
    beforeJson: text("before_json"),
    afterJson: text("after_json"),
  },
  () => [
    check(
      "audit_log_action",
      sql`action IN ('void', 'correct', 'override', 'carry_over', 'back_entry', 'back_entry_refused', 'member_edit', 'erase')`,
    ),
    check(
      "audit_log_row_unless_refused",
      sql`(action = 'back_entry_refused' AND row_id IS NULL) OR (action <> 'back_entry_refused' AND row_id IS NOT NULL)`,
    ),
    // json_valid(NULL) is NULL, which lets an empty value in
    check("audit_log_before_json", sql`json_valid(before_json)`),
    check("audit_log_after_json", sql`json_valid(after_json)`),
  ],
);

// One changed personal value, like a member's old and new phone number (R59). Kept apart so an
// erasure can blank these and leave the rest of the audit log untouched (R62, KTD9)
export const auditPersonalValues = sqliteTable(
  "audit_personal_values",
  {
    id: integer("id").primaryKey(),
    auditLogId: integer("audit_log_id")
      .notNull()
      .references(() => auditLog.id),
    // Whose value it is. The erasure finds every value to blank by this
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id),
    // The column that changed, like "phone"
    field: text("field").notNull(),
    before: text("before"),
    after: text("after"),
    // Set by the erasure, which also blanks both values, so screens show "erased" instead of "empty"
    redacted: integer("redacted", { mode: "boolean" }).notNull().default(false),
  },
  () => [
    check(
      "audit_personal_values_redacted_blank",
      sql`redacted = 0 OR (before IS NULL AND after IS NULL)`,
    ),
  ],
);
