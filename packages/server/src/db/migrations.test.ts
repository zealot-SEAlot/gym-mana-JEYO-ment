// Runs both migrations on real database files, so a rule that drizzle-kit writes wrongly fails
// here instead of on the gym PC. The domain tests only list each rule's name (schema session, block 8)
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import * as schema from "@jeyos/domain";
import type Database from "better-sqlite3";
import { is } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getTableConfig, SQLiteTable } from "drizzle-orm/sqlite-core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openDatabase } from "./client.ts";

const GYM_MIGRATIONS = fileURLToPath(new URL("./migrations/gym", import.meta.url));
const LOCAL_ONLY_MIGRATIONS = fileURLToPath(new URL("./migrations/local-only", import.meta.url));

// Every table the domain package defines, read from its exports
const tables = Object.values(schema)
  .filter((value) => is(value, SQLiteTable))
  .map((table) => getTableConfig(table));

describe("migrations", () => {
  let folder: string;
  let connections: Database.Database[];

  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), "jeyos-migrations-test-"));
    connections = [];
  });

  afterEach(() => {
    // Windows cannot delete a database file that is still open
    for (const connection of connections) {
      connection.close();
    }
    rmSync(folder, { recursive: true, force: true });
  });

  function migrated(fileName: string, migrationsFolder: string): Database.Database {
    const db = openDatabase(join(folder, fileName));
    connections.push(db);
    migrate(drizzle({ client: db }), { migrationsFolder });
    return db;
  }

  // Tables and indexes in the file, leaving out SQLite's own and drizzle's migration record
  function namesOf(db: Database.Database, type: "table" | "index"): string[] {
    return db
      .prepare<[string], { name: string }>(
        "SELECT name FROM sqlite_master WHERE type = ? AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' ORDER BY name",
      )
      .all(type)
      .map((row) => row.name);
  }

  function addStaffAccount(db: Database.Database, signInName: string) {
    db.prepare(
      "INSERT INTO accounts (display_name, sign_in_name, role, password_hash, password_hash_method) VALUES (?, ?, 'staff', 'hash', 'argon2id')",
    ).run(signInName, signInName);
  }

  function addPayment(db: Database.Database, referenceNumber: string, voided = false) {
    db.prepare(
      `INSERT INTO payments (occurred_at, entered_at, manila_date, entry_mode, voided,
         entered_by_account_id, entered_by_name, kind, amount_centavos, method, reference_number)
       VALUES ('2026-11-23T02:00:00.000Z', '2026-11-23T02:00:00.000Z', '2026-11-23', 'normal', ?,
         1, 'Lee', 'sale', 8000, 'gcash', ?)`,
    ).run(voided ? 1 : 0, referenceNumber);
  }

  describe("gym database", () => {
    it("creates every table and index the domain package defines, and nothing else", () => {
      const db = migrated("gym.db", GYM_MIGRATIONS);

      expect(namesOf(db, "table")).toEqual(tables.map((table) => table.name).sort());
      // Named unique indexes, plus the ones drizzle-kit names after a .unique() column
      const indexes = tables.flatMap((table) => [
        ...table.indexes.map((index) => index.config.name),
        ...table.columns.filter((column) => column.isUnique).map((column) => column.uniqueName),
      ]);
      expect(namesOf(db, "index")).toEqual(indexes.sort());
    });

    it("holds the one system state row, and refuses a second", () => {
      const db = migrated("gym.db", GYM_MIGRATIONS);

      expect(db.prepare("SELECT id FROM system_state").all()).toEqual([{ id: 1 }]);
      expect(() => db.exec("INSERT INTO system_state (id) VALUES (2)")).toThrow(
        "CHECK constraint failed: system_state_one_row",
      );
    });

    it("refuses a sign-in name that differs from another only in upper and lower case", () => {
      const db = migrated("gym.db", GYM_MIGRATIONS);
      addStaffAccount(db, "Lee");

      expect(() => addStaffAccount(db, "lee")).toThrow("UNIQUE constraint failed");
    });

    it("refuses an e-wallet reference already on file, ignoring spaces and case, unless voided", () => {
      const db = migrated("gym.db", GYM_MIGRATIONS);
      addStaffAccount(db, "Lee");
      addPayment(db, "AB 12");

      expect(() => addPayment(db, "ab12")).toThrow(
        "UNIQUE constraint failed: payments.reference_number_key",
      );
      // Staff void the mistyped payment and enter the same transfer again (block 4)
      addPayment(db, "ab12", true);
      db.exec("UPDATE payments SET voided = 1 WHERE reference_number = 'AB 12'");
      expect(() => addPayment(db, "ab12")).not.toThrow();
    });
  });

  describe("local-only file", () => {
    it("holds only member_details, so no other gym data stays off the online backup", () => {
      const db = migrated("local-only.db", LOCAL_ONLY_MIGRATIONS);

      expect(namesOf(db, "table")).toEqual(["member_details"]);
    });
  });
});
