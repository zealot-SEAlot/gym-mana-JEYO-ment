// Every change to a sealed item's stock count (R23, R26, R63). Built in U10.
// A product's stock count always equals the sum of its movements' quantity changes, and stock on
// an earlier day is the sum of the movements up to that Manila date (U10, U11)
import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";

import { recordChecks, recordColumns } from "./record-columns.ts";
import { products, saleLines } from "./sales.ts";

// restock: the owner adds stock. sale: a sale line takes it. void: undoes one earlier movement.
// correction: the owner sets the count to what is on the shelf (R63)
export const STOCK_MOVEMENT_KINDS = ["restock", "sale", "void", "correction"] as const;

export const CORRECTION_REASONS = ["breakage", "spoiled", "miscount", "other"] as const;

export const stockMovements = sqliteTable(
  "stock_movements",
  {
    id: integer("id").primaryKey(),
    // Who made the change, and when. Its Manila date places it on the right day for U11
    ...recordColumns,
    productId: integer("product_id")
      .notNull()
      .references(() => products.id),
    kind: text("kind", { enum: STOCK_MOVEMENT_KINDS }).notNull(),
    // How much the count went up (positive) or down (negative)
    quantityChange: integer("quantity_change").notNull(),
    // sale only: the line that took the stock. One movement per line
    saleLineId: integer("sale_line_id")
      .unique()
      .references(() => saleLines.id),
    // void only: the movement it undoes. Unique, so a repeated void can't return stock twice
    voidsMovementId: integer("voids_movement_id")
      .unique()
      .references((): AnySQLiteColumn => stockMovements.id),
    // correction only (R63)
    correctionReason: text("correction_reason", { enum: CORRECTION_REASONS }),
    // restock only, and optional: what the gym paid for this restock (R26, block 6)
    amountPaidCentavos: integer("amount_paid_centavos"),
  },
  () => [
    recordChecks("stock_movements"),
    // A movement is undone by a void movement, never by setting voided. Then the count stays the
    // sum of every movement, and each day keeps the stock it really had
    check("stock_movements_never_voided", sql`voided = 0`),
    check("stock_movements_kind", sql`kind IN ('restock', 'sale', 'void', 'correction')`),
    check(
      "stock_movements_correction_reason",
      sql`correction_reason IN ('breakage', 'spoiled', 'miscount', 'other')`,
    ),
    check("stock_movements_quantity", sql`quantity_change <> 0`),
    check("stock_movements_amount_paid", sql`amount_paid_centavos >= 0`),
    // Each kind fills only its own columns. A restock adds and a sale takes away
    check(
      "stock_movements_kind_shape",
      sql`(kind = 'restock' AND quantity_change > 0 AND sale_line_id IS NULL AND voids_movement_id IS NULL AND correction_reason IS NULL) OR (kind = 'sale' AND quantity_change < 0 AND sale_line_id IS NOT NULL AND voids_movement_id IS NULL AND correction_reason IS NULL AND amount_paid_centavos IS NULL) OR (kind = 'void' AND sale_line_id IS NULL AND voids_movement_id IS NOT NULL AND correction_reason IS NULL AND amount_paid_centavos IS NULL) OR (kind = 'correction' AND sale_line_id IS NULL AND voids_movement_id IS NULL AND correction_reason IS NOT NULL AND amount_paid_centavos IS NULL)`,
    ),
  ],
);
