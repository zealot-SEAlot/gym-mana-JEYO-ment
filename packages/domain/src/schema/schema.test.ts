import { getTableConfig, integer, sqliteTable } from "drizzle-orm/sqlite-core";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";

import {
  accounts,
  addOns,
  auditLog,
  auditPersonalValues,
  carriedOverExpiries,
  checkIns,
  consents,
  dayPasses,
  doorEvents,
  memberDetails,
  members,
  payments,
  plans,
  products,
  recordChecks,
  recordColumns,
  rejections,
  renewals,
  saleLineAddOns,
  saleLines,
  sales,
  settings,
  stockMovements,
  systemState,
} from "./index.ts";

function isUnique(table: SQLiteTable, column: string) {
  return getTableConfig(table).columns.find((c) => c.name === column)?.isUnique;
}

// These tests read the table definitions and list the rules the database will enforce.
// The tests that insert rows into a real database file come with the first migration, in packages/server.
function rules(table: SQLiteTable) {
  const config = getTableConfig(table);
  return {
    uniqueIndexes: config.indexes
      .filter((index) => index.config.unique)
      .map((index) => index.config.name),
    checks: config.checks.map((check) => check.name),
    pointsAt: config.foreignKeys.map((key) => getTableConfig(key.reference().foreignTable).name),
  };
}

describe("database rules", () => {
  it("accounts: unique sign-in names ignoring case, one owner, known roles and hash methods", () => {
    expect(rules(accounts)).toEqual({
      uniqueIndexes: ["accounts_sign_in_name", "accounts_one_owner"],
      checks: ["accounts_role", "accounts_password_hash_method"],
      pointsAt: [],
    });
  });

  it("plans: unique active names, a price and length that make sense", () => {
    expect(rules(plans)).toEqual({
      uniqueIndexes: ["plans_active_name"],
      checks: ["plans_price", "plans_length", "plans_length_unit"],
      pointsAt: [],
    });
  });

  it("members: a code until erased, and the account that registered them", () => {
    expect(rules(members)).toEqual({
      uniqueIndexes: [],
      checks: ["members_entry_mode", "members_code_until_erased"],
      pointsAt: ["accounts"],
    });
    // Two members can't share a QR code
    expect(getTableConfig(members).columns.find((c) => c.name === "code")?.isUnique).toBe(true);
  });

  it("member_details: no foreign key, because the table also lives in the local-only file", () => {
    expect(rules(memberDetails)).toEqual({ uniqueIndexes: [], checks: [], pointsAt: [] });
  });

  it("consents: storing data is required, and reminders need the online backup", () => {
    expect(rules(consents)).toEqual({
      uniqueIndexes: [],
      checks: ["consents_entry_mode", "consents_store_on_gym_pc", "consents_reminders_need_backup"],
      pointsAt: ["members", "accounts"],
    });
  });

  it("payments: positive amounts, known kinds and methods, unused e-wallet references", () => {
    expect(rules(payments)).toEqual({
      uniqueIndexes: ["payments_reference_number"],
      checks: [
        "payments_entry_mode",
        "payments_amount",
        "payments_kind",
        "payments_method",
        "payments_reference_for_e_wallet",
      ],
      pointsAt: ["accounts"],
    });
  });

  it("carried_over_expiries: one non-voided entry per member", () => {
    expect(rules(carriedOverExpiries)).toEqual({
      uniqueIndexes: ["carried_over_expiries_one_per_member"],
      checks: ["carried_over_expiries_entry_mode"],
      pointsAt: ["members", "accounts"],
    });
  });

  it("renewals: plan copies that make sense, and one renewal per payment", () => {
    expect(rules(renewals)).toEqual({
      uniqueIndexes: [],
      checks: [
        "renewals_entry_mode",
        "renewals_plan_length",
        "renewals_plan_length_unit",
        "renewals_plan_price",
      ],
      pointsAt: ["members", "accounts", "plans", "payments"],
    });
    expect(getTableConfig(renewals).columns.find((c) => c.name === "payment_id")?.isUnique).toBe(
      true,
    );
  });

  it("door_events: one numbering that never hands out an ID twice", () => {
    expect(rules(doorEvents)).toEqual({ uniqueIndexes: [], checks: [], pointsAt: [] });
    expect(getTableConfig(doorEvents).columns.map((c) => c.name)).toEqual(["id"]);
  });

  it("rejections: a short scanned value, and a reason that matches who was scanned", () => {
    expect(rules(rejections)).toEqual({
      uniqueIndexes: [],
      checks: ["rejections_scanned_value_length", "rejections_reason_matches_scan"],
      pointsAt: ["door_events", "members", "day_passes"],
    });
    expect(isUnique(rejections, "door_event_id")).toBe(true);
  });

  it("check_ins: once per day per member, one door entry per pass, door and desk kept apart", () => {
    expect(rules(checkIns)).toEqual({
      uniqueIndexes: ["check_ins_member_once_per_day", "check_ins_pass_once"],
      checks: [
        "check_ins_entry_mode",
        "check_ins_kind",
        "check_ins_source",
        "check_ins_member_or_pass",
        "check_ins_door_or_desk",
        "check_ins_pass_desk_is_readmission",
        "check_ins_rejection_only_on_override",
      ],
      pointsAt: ["accounts", "members", "day_passes", "door_events", "rejections"],
    });
    expect(isUnique(checkIns, "door_event_id")).toBe(true);
    // The door tablet has no account, so these two may be empty here, unlike other records
    const columns = getTableConfig(checkIns).columns;
    expect(columns.find((c) => c.name === "entered_by_account_id")?.notNull).toBe(false);
    expect(columns.find((c) => c.name === "entered_by_name")?.notNull).toBe(false);
  });

  it("day_passes: a unique token, and one pass per payment", () => {
    expect(rules(dayPasses)).toEqual({
      uniqueIndexes: [],
      checks: ["day_passes_entry_mode"],
      pointsAt: ["accounts", "payments"],
    });
    expect(isUnique(dayPasses, "token")).toBe(true);
    expect(isUnique(dayPasses, "payment_id")).toBe(true);
  });

  it("products: unique active names, and stock only on sealed items", () => {
    expect(rules(products)).toEqual({
      uniqueIndexes: ["products_active_name"],
      checks: [
        "products_kind",
        "products_price",
        "products_low_stock_level",
        "products_sealed_or_menu",
      ],
      pointsAt: [],
    });
  });

  it("add_ons: unique active names and a price that makes sense", () => {
    expect(rules(addOns)).toEqual({
      uniqueIndexes: ["add_ons_active_name"],
      checks: ["add_ons_price"],
      pointsAt: [],
    });
  });

  it("sales: one sale per payment", () => {
    expect(rules(sales)).toEqual({
      uniqueIndexes: [],
      checks: ["sales_entry_mode"],
      pointsAt: ["accounts", "payments"],
    });
    expect(isUnique(sales, "payment_id")).toBe(true);
  });

  it("sale_lines and sale_line_add_ons: price snapshots and a positive quantity", () => {
    expect(rules(saleLines)).toEqual({
      uniqueIndexes: [],
      checks: ["sale_lines_quantity", "sale_lines_unit_price"],
      pointsAt: ["sales", "products", "members"],
    });
    expect(rules(saleLineAddOns)).toEqual({
      uniqueIndexes: [],
      checks: ["sale_line_add_ons_price"],
      pointsAt: ["sale_lines", "add_ons"],
    });
  });

  it("stock_movements: each kind fills its own columns, and a movement is undone only once", () => {
    expect(rules(stockMovements)).toEqual({
      uniqueIndexes: [],
      checks: [
        "stock_movements_entry_mode",
        "stock_movements_never_voided",
        "stock_movements_kind",
        "stock_movements_correction_reason",
        "stock_movements_quantity",
        "stock_movements_amount_paid",
        "stock_movements_kind_shape",
      ],
      pointsAt: ["accounts", "products", "sale_lines", "stock_movements"],
    });
    expect(isUnique(stockMovements, "voids_movement_id")).toBe(true);
    expect(isUnique(stockMovements, "sale_line_id")).toBe(true);
  });

  it("audit_log: known actions, a row unless refused, and valid JSON", () => {
    expect(rules(auditLog)).toEqual({
      uniqueIndexes: [],
      checks: [
        "audit_log_action",
        "audit_log_row_unless_refused",
        "audit_log_before_json",
        "audit_log_after_json",
      ],
      pointsAt: ["accounts"],
    });
  });

  it("audit_personal_values: tied to a member, and blank once redacted", () => {
    expect(rules(auditPersonalValues)).toEqual({
      uniqueIndexes: [],
      checks: ["audit_personal_values_redacted_blank"],
      pointsAt: ["audit_log", "members"],
    });
  });

  it("settings: keys named after their module, JSON values, and who changed them last", () => {
    expect(rules(settings)).toEqual({
      uniqueIndexes: [],
      checks: ["settings_key_has_module", "settings_value_json"],
      pointsAt: ["accounts"],
    });
  });

  it("system_state: one row, and a clock confirmation always names its account", () => {
    expect(rules(systemState)).toEqual({
      uniqueIndexes: [],
      checks: ["system_state_one_row", "system_state_confirmed_together"],
      pointsAt: ["accounts"],
    });
  });

  it("recordColumns: points at the entering account, with a check named after the table", () => {
    const example = sqliteTable(
      "examples",
      { id: integer("id").primaryKey(), ...recordColumns },
      () => [recordChecks("examples")],
    );
    expect(rules(example)).toEqual({
      uniqueIndexes: [],
      checks: ["examples_entry_mode"],
      pointsAt: ["accounts"],
    });
  });
});
