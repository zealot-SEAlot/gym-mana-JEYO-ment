// Products, add-ons, and sales (R22 to R25). Built in U10.
import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { members } from "./members.ts";
import { payments } from "./payments.ts";
import { recordChecks, recordColumns } from "./record-columns.ts";

// sealed: an item on the shelf with a stock count, like an energy drink. menu: made or given at
// the desk with no stock count, like a shake or coaching (schema session, block 6)
export const PRODUCT_KINDS = ["sealed", "menu"] as const;

// The owner's product list (R22). Products are retired, never deleted, so old sale lines keep pointing at them
export const products = sqliteTable(
  "products",
  {
    id: integer("id").primaryKey(),
    name: text("name").notNull(),
    kind: text("kind", { enum: PRODUCT_KINDS }).notNull(),
    // Whole centavos (KTD7). A sale line copies this, so a price change leaves old sales as they were
    priceCentavos: integer("price_centavos").notNull(),
    // Sealed items only. Always equals the sum of the product's stock movements, because U10
    // updates both in one transaction. It can go below zero when an item at zero sells (R23)
    stockCount: integer("stock_count"),
    // Sealed items only. The sale screen warns when the count reaches this (R23, AE6)
    lowStockLevel: integer("low_stock_level"),
    // Menu items only. Shakes take add-ons; coaching doesn't. Any add-on fits any shake (block 6)
    takesAddOns: integer("takes_add_ons", { mode: "boolean" }).notNull().default(false),
    // Menu items only. A coaching sale line must name the member it is for (R24)
    needsMember: integer("needs_member", { mode: "boolean" }).notNull().default(false),
    retired: integer("retired", { mode: "boolean" }).notNull().default(false),
  },
  () => [
    // Same rule as plan names (block 3)
    uniqueIndex("products_active_name")
      .on(sql`lower(name)`)
      .where(sql`retired = 0`),
    check("products_kind", sql`kind IN ('sealed', 'menu')`),
    check("products_price", sql`price_centavos >= 0`),
    check("products_low_stock_level", sql`low_stock_level >= 0`),
    // A sealed item has a stock count and a low-stock level, and no menu options. A menu item has no stock
    check(
      "products_sealed_or_menu",
      sql`(kind = 'sealed' AND stock_count IS NOT NULL AND low_stock_level IS NOT NULL AND takes_add_ons = 0 AND needs_member = 0) OR (kind = 'menu' AND stock_count IS NULL AND low_stock_level IS NULL)`,
    ),
  ],
);

// Priced extras for shakes, like banana or egg (R24). They take nothing from stock (R25)
export const addOns = sqliteTable(
  "add_ons",
  {
    id: integer("id").primaryKey(),
    name: text("name").notNull(),
    priceCentavos: integer("price_centavos").notNull(),
    retired: integer("retired", { mode: "boolean" }).notNull().default(false),
  },
  () => [
    uniqueIndex("add_ons_active_name")
      .on(sql`lower(name)`)
      .where(sql`retired = 0`),
    check("add_ons_price", sql`price_centavos >= 0`),
  ],
);

// One sale at the desk, paid by one payment, like renewals and day passes (block 4).
// Voiding a sale voids its payment and returns its stock, all in one transaction (U12)
export const sales = sqliteTable(
  "sales",
  {
    id: integer("id").primaryKey(),
    // Who rang it up, and when
    ...recordColumns,
    paymentId: integer("payment_id")
      .notNull()
      .unique()
      .references(() => payments.id),
  },
  () => [recordChecks("sales")],
);

// One product on a sale. No total is stored: the line costs quantity × (unit price + its add-on
// prices), and U10 checks that the lines add up to the payment
export const saleLines = sqliteTable(
  "sale_lines",
  {
    id: integer("id").primaryKey(),
    saleId: integer("sale_id")
      .notNull()
      .references(() => sales.id),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id),
    quantity: integer("quantity").notNull(),
    // The product's price when sold (R24)
    unitPriceCentavos: integer("unit_price_centavos").notNull(),
    // The member a coaching line is for, so their online view lists it (R24, R43). U10 requires
    // it when the product needs a member
    memberId: integer("member_id").references(() => members.id),
  },
  () => [
    check("sale_lines_quantity", sql`quantity > 0`),
    check("sale_lines_unit_price", sql`unit_price_centavos >= 0`),
  ],
);

// The add-ons chosen for a line, each with its price when sold. They apply to every unit on the line
export const saleLineAddOns = sqliteTable(
  "sale_line_add_ons",
  {
    id: integer("id").primaryKey(),
    saleLineId: integer("sale_line_id")
      .notNull()
      .references(() => saleLines.id),
    addOnId: integer("add_on_id")
      .notNull()
      .references(() => addOns.id),
    priceCentavos: integer("price_centavos").notNull(),
  },
  () => [check("sale_line_add_ons_price", sql`price_centavos >= 0`)],
);
