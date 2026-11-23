// Every peso the gym takes: memberships, day passes, and sales (R27, KTD19). Built in U6.
import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { recordChecks, recordColumns } from "./record-columns.ts";

// What the payment was for. Coaching is sold as a menu item, so it is a sale (schema session, block 6)
export const PAYMENT_KINDS = ["membership", "day_pass", "sale"] as const;

// Cash, or an e-wallet: GCash or Maya (R27, block 4). The report's e-wallet total is every method but cash
export const PAYMENT_METHODS = ["cash", "gcash", "maya"] as const;

export const payments = sqliteTable(
  "payments",
  {
    id: integer("id").primaryKey(),
    // Who took the payment, and when
    ...recordColumns,
    kind: text("kind", { enum: PAYMENT_KINDS }).notNull(),
    // Whole centavos, never a decimal (KTD7)
    amountCentavos: integer("amount_centavos").notNull(),
    method: text("method", { enum: PAYMENT_METHODS }).notNull(),
    // The e-wallet reference number exactly as staff typed it. Empty for cash
    referenceNumber: text("reference_number"),
    // The reference with every space removed, in lower case, so "AB 12" and "ab12" give "ab12".
    // Virtual: SQLite works it out each time the row is read and never saves it, so the row still
    // stores only what staff typed (block 4). It exists because drizzle-kit 0.31.11 breaks an
    // index expression that contains commas, and an index on a plain column has none (block 8)
    referenceNumberKey: text("reference_number_key").generatedAlwaysAs(
      sql`lower(replace(reference_number, ' ', ''))`,
      { mode: "virtual" },
    ),
  },
  (table) => [
    recordChecks("payments"),
    // A reference number can't be on file twice, ignoring every space and upper and lower case
    // (U6, block 4). Voided payments don't count, so staff can void a mistyped payment and enter
    // the same transfer again (block 4). Cash rows have no reference, and a unique index never
    // counts two empty values as the same
    uniqueIndex("payments_reference_number")
      .on(table.referenceNumberKey)
      .where(sql`voided = 0`),
    // U6 refuses a zero or negative amount
    check("payments_amount", sql`amount_centavos > 0`),
    check("payments_kind", sql`kind IN ('membership', 'day_pass', 'sale')`),
    check("payments_method", sql`method IN ('cash', 'gcash', 'maya')`),
    // An e-wallet payment needs a reference number that isn't only spaces, and cash has none (R27).
    // The IS NOT NULL matters: a check whose answer is unknown (NULL) lets the row in
    check(
      "payments_reference_for_e_wallet",
      sql`(method = 'cash' AND reference_number IS NULL) OR (method IN ('gcash', 'maya') AND reference_number IS NOT NULL AND replace(reference_number, ' ', '') <> '')`,
    ),
  ],
);
