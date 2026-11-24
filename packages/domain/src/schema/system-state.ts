// What the clock guard needs to remember (KTD7, R56). Used in U2c.
// The guard refuses new records while the PC's clock reads earlier than the latest record,
// until the owner confirms the time. The foundation migration inserts the one row, and the
// clock guard triggers in migration 0001_triggers keep latestEnteredAt up to date
import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { accounts } from "./accounts.ts";

export const systemState = sqliteTable(
  "system_state",
  {
    // Always 1, so the table can never hold a second row
    id: integer("id").primaryKey(),
    // The latest entry time of any saved record, as UTC text, so the guard reads one value instead
    // of every table. Each new record's trigger moves it forward. Confirming the clock sets it to
    // the confirmed time, leaving behind the records the wrong clock dated in the future. Empty
    // until the first record
    latestEnteredAt: text("latest_entered_at"),
    // When the owner last confirmed the PC's clock, and which account did it. Empty until then
    clockConfirmedAt: text("clock_confirmed_at"),
    clockConfirmedByAccountId: integer("clock_confirmed_by_account_id").references(
      () => accounts.id,
    ),
  },
  () => [
    check("system_state_one_row", sql`id = 1`),
    check(
      "system_state_confirmed_together",
      sql`(clock_confirmed_at IS NULL) = (clock_confirmed_by_account_id IS NULL)`,
    ),
  ],
);
