// Members and their consent answers (R8, R9, R53, R62). Built in U4 and U8.
// Their personal details are in member-details.ts.
import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { recordChecks, recordColumns } from "./record-columns.ts";

// No personal data here: name, contact details, and photo are in member_details. After an erasure
// this row stays as the anonymous placeholder that payments and check-ins still point at (R62)
export const members = sqliteTable(
  "members",
  {
    id: integer("id").primaryKey(),
    // Who registered the member, and when
    ...recordColumns,
    // The random token in the QR code (R53). Stored as-is so staff can reprint or resend the
    // card (block 3). Replacing it overwrites the old one, so the door rejects the old card as an
    // invalid code (R9, R53). Empty only after an erasure
    code: text("code").unique(),
    // Who erased the member, when, and why go in the audit log, like a void (KTD9)
    erased: integer("erased", { mode: "boolean" }).notNull().default(false),
  },
  () => [
    recordChecks("members"),
    // A member has a code until erased, and an erased member has none
    check(
      "members_code_until_erased",
      sql`(erased = 0 AND code IS NOT NULL) OR (erased = 1 AND code IS NULL)`,
    ),
  ],
);

// A member's consent answers (R8). A change of mind adds a new row, and the newest row counts
export const consents = sqliteTable(
  "consents",
  {
    id: integer("id").primaryKey(),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id),
    // Which staff account recorded the answers, and when
    ...recordColumns,
    // The version of the consent text the member saw. The texts live in code (block 3)
    consentTextVersion: text("consent_text_version").notNull(),
    // Three separate answers (block 3). Storing data on the gym PC is required
    storeOnGymPc: integer("store_on_gym_pc", { mode: "boolean" }).notNull(),
    onlineBackup: integer("online_backup", { mode: "boolean" }).notNull(),
    reminders: integer("reminders", { mode: "boolean" }).notNull(),
  },
  () => [
    recordChecks("consents"),
    check("consents_store_on_gym_pc", sql`store_on_gym_pc = 1`),
    // Reminders are sent from the online copy, so they need the online backup (R8, R38)
    check("consents_reminders_need_backup", sql`reminders = 0 OR online_backup = 1`),
  ],
);
