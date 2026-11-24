// Membership plans the owner defines (R6, R7, R60). Built in U7.
import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { PLAN_LENGTH_UNITS } from "@jeyos/shared";

export const plans = sqliteTable(
  "plans",
  {
    id: integer("id").primaryKey(),
    name: text("name").notNull(),
    // Whole centavos, never a decimal (KTD7). A renewal copies this, so a later price change
    // leaves past payments as they were (R7)
    priceCentavos: integer("price_centavos").notNull(),
    // A plan lasts `length` days or months, like 3 months (R6)
    length: integer("length").notNull(),
    lengthUnit: text("length_unit", { enum: PLAN_LENGTH_UNITS }).notNull(),
    // Plans are retired, never deleted, so old renewals keep pointing at them (R60)
    retired: integer("retired", { mode: "boolean" }).notNull().default(false),
  },
  () => [
    // Two active plans can't share a name, ignoring upper and lower case, but a new "Monthly"
    // can replace a retired one (schema session, block 3)
    uniqueIndex("plans_active_name")
      .on(sql`lower(name)`)
      .where(sql`retired = 0`),
    check("plans_price", sql`price_centavos >= 0`),
    check("plans_length", sql`length > 0`),
    check("plans_length_unit", sql`length_unit IN ('day', 'month')`),
  ],
);
