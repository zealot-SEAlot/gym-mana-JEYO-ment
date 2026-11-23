// Check-ins, rejected door scans, and the door-event sequence the desk feed follows
// (R15 to R18, R57, R58, KTD8, KTD10). Built in U5; U9 fills in the day-pass branch.
import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { accounts } from "./accounts.ts";
import { members } from "./members.ts";
import { recordChecks, recordColumns } from "./record-columns.ts";
import { dayPasses } from "./walkins.ts";

// One numbering shared by accepted door check-ins and rejected door scans, so the two never share
// an ID (KTD10). The desk feed sends this ID with each event and resumes from the last one it saw.
// autoIncrement makes SQLite never hand out an ID again, even if the newest row were deleted
export const doorEvents = sqliteTable("door_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
});

// Why the door refused a scan, one per "Reject" box in the scan diagram
export const REJECTION_REASONS = [
  "invalid_code",
  "expired",
  "already_used_today",
  "pass_not_valid",
] as const;

// Every refused door scan, so a desk check-in can point at the rejection it overrode (R58).
// No account and no void: the door tablet writes these, and nobody corrects them
export const rejections = sqliteTable(
  "rejections",
  {
    id: integer("id").primaryKey(),
    doorEventId: integer("door_event_id")
      .notNull()
      .unique()
      .references(() => doorEvents.id),
    // UTC text and the Manila day, like every record (block 1). The desk reloads today's rejections by manilaDate
    occurredAt: text("occurred_at").notNull(),
    manilaDate: text("manila_date").notNull(),
    reason: text("reason", { enum: REJECTION_REASONS }).notNull(),
    // The first 12 characters of what was scanned, after U5 checks its format (KTD10). Too short
    // to be a working code. Screens show it only as plain text. Empty if the scan failed the
    // format check, or after an erasure clears it (U8, R62)
    scannedValue: text("scanned_value"),
    // Who was refused, when the scan matched someone. The desk shows their name and photo (R14)
    memberId: integer("member_id").references(() => members.id),
    dayPassId: integer("day_pass_id").references(() => dayPasses.id),
  },
  () => [
    check("rejections_scanned_value_length", sql`length(scanned_value) <= 12`),
    // An invalid code matched nobody, a member reason needs the member, and a pass reason needs the pass
    check(
      "rejections_reason_matches_scan",
      sql`(reason = 'invalid_code' AND member_id IS NULL AND day_pass_id IS NULL) OR (reason IN ('expired', 'already_used_today') AND member_id IS NOT NULL AND day_pass_id IS NULL) OR (reason = 'pass_not_valid' AND member_id IS NULL AND day_pass_id IS NOT NULL)`,
    ),
  ],
);

// KTD8. scan_using: a door accept, the day's first desk check-in, or a back-entered one. It uses
// up the day's scan. override: a desk check-in after the scan is used, or a day-pass re-admission
export const CHECK_IN_KINDS = ["scan_using", "override"] as const;

export const CHECK_IN_SOURCES = ["door", "desk"] as const;

// Every accepted check-in, for a member or a day pass (R18)
export const checkIns = sqliteTable(
  "check_ins",
  {
    id: integer("id").primaryKey(),
    ...recordColumns,
    // The door tablet has no account, so a door check-in has neither of these (R18). A desk
    // check-in has both. These two replace the required ones in recordColumns
    enteredByAccountId: integer("entered_by_account_id").references(() => accounts.id),
    enteredByName: text("entered_by_name"),
    kind: text("kind", { enum: CHECK_IN_KINDS }).notNull(),
    source: text("source", { enum: CHECK_IN_SOURCES }).notNull(),
    // Exactly one of these two is filled
    memberId: integer("member_id").references(() => members.id),
    dayPassId: integer("day_pass_id").references(() => dayPasses.id),
    // A door check-in's place in the door-event sequence (KTD10). Empty for desk check-ins
    doorEventId: integer("door_event_id")
      .unique()
      .references(() => doorEvents.id),
    // The rejection a desk override overrode, so the report can show its reason (R28, R58)
    overriddenRejectionId: integer("overridden_rejection_id").references(() => rejections.id),
  },
  (table) => [
    recordChecks("check_ins"),
    check("check_ins_kind", sql`kind IN ('scan_using', 'override')`),
    check("check_ins_source", sql`source IN ('door', 'desk')`),
    check(
      "check_ins_member_or_pass",
      sql`(member_id IS NOT NULL AND day_pass_id IS NULL) OR (member_id IS NULL AND day_pass_id IS NOT NULL)`,
    ),
    // A door check-in is scan_using, has a door event, and has no account. A desk check-in has
    // an account and no door event
    check(
      "check_ins_door_or_desk",
      sql`(source = 'door' AND kind = 'scan_using' AND door_event_id IS NOT NULL AND entered_by_account_id IS NULL AND entered_by_name IS NULL) OR (source = 'desk' AND door_event_id IS NULL AND entered_by_account_id IS NOT NULL AND entered_by_name IS NOT NULL)`,
    ),
    // The door takes a pass once. Every desk check-in for a pass is a re-admission (R20)
    check(
      "check_ins_pass_desk_is_readmission",
      sql`day_pass_id IS NULL OR source = 'door' OR kind = 'override'`,
    ),
    check(
      "check_ins_rejection_only_on_override",
      sql`overridden_rejection_id IS NULL OR kind = 'override'`,
    ),
    // Once per day (R15, R57, KTD8): one non-voided scan_using check-in per member per Manila
    // date. When the door and the desk try at the same moment, the second insert fails (AE15).
    // Overrides don't count, and voiding the check-in frees the day's scan
    uniqueIndex("check_ins_member_once_per_day")
      .on(table.memberId, table.manilaDate)
      .where(sql`kind = 'scan_using' AND voided = 0`),
    // One door entry per day pass (R20, KTD8)
    uniqueIndex("check_ins_pass_once")
      .on(table.dayPassId)
      .where(sql`kind = 'scan_using' AND voided = 0`),
  ],
);
