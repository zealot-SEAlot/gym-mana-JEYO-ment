// Walk-in day passes (R19, R20, R53). Built in U9.
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { payments } from "./payments.ts";
import { recordChecks, recordColumns } from "./record-columns.ts";

export const dayPasses = sqliteTable(
  "day_passes",
  {
    id: integer("id").primaryKey(),
    // Who sold the pass, and when. manilaDate is the one day the pass is valid (R20), so no
    // separate valid-on column. voided is set together with the payment's void (U12, R47)
    ...recordColumns,
    // The random 128-bit token in the pass's QR code (R53, U9)
    token: text("token").notNull().unique(),
    // The day-pass payment. One payment pays for one pass, like renewals (block 4)
    paymentId: integer("payment_id")
      .notNull()
      .unique()
      .references(() => payments.id),
  },
  () => [recordChecks("day_passes")],
);
