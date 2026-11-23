// Owner settings, like the day-pass price and the closing time (KTD18). Built in U2c.
// Each module registers its keys in code, with a type and a default. A row exists only after the
// owner changes a setting, so a missing row means "use the default"
import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { accounts } from "./accounts.ts";

export const settings = sqliteTable(
  "settings",
  {
    // The module name, a dot, then the setting, like "walkins.dayPassPriceCentavos"
    key: text("key").primaryKey(),
    // The value as JSON, like 8000 or "21:00". The module's registered type checks it in code
    value: text("value").notNull(),
    // Who changed it last, and when, as UTC text (block 2). Past records copy the values they
    // used, like a day pass's price, so older values aren't kept
    updatedByAccountId: integer("updated_by_account_id")
      .notNull()
      .references(() => accounts.id),
    updatedAt: text("updated_at").notNull(),
  },
  () => [
    check("settings_key_has_module", sql`key GLOB '[a-z]*.[a-zA-Z]*'`),
    check("settings_value_json", sql`json_valid(value)`),
  ],
);
