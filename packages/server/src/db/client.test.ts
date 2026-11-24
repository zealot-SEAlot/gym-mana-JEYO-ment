import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openDatabase, openLocalOnlyDatabase } from "./client.ts";

describe("openDatabase", () => {
  let folder: string;
  let connections: Database.Database[];

  // Each test gets its own database file in a temporary folder, deleted afterwards
  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), "jeyos-db-test-"));
    connections = [];
  });

  afterEach(() => {
    // Windows cannot delete a database file that is still open
    for (const connection of connections) {
      connection.close();
    }
    rmSync(folder, { recursive: true, force: true });
  });

  // The gym PC reopens the same file after every restart, and SQLite picks some settings
  // differently for a file that already exists, so every test checks a second connection
  function reopen(): Database.Database {
    const filePath = join(folder, "gym.db");
    const first = openDatabase(filePath);
    const second = openDatabase(filePath);
    connections.push(first, second);
    return second;
  }

  it("turns on write-ahead logging (WAL)", () => {
    expect(reopen().pragma("journal_mode", { simple: true })).toBe("wal");
  });

  it("waits for a full save to disk on every commit, so a power cut keeps saved records", () => {
    // 2 means FULL. Without the setting, SQLite uses 1 (NORMAL) for a reopened WAL file
    expect(reopen().pragma("synchronous", { simple: true })).toBe(2);
  });

  it("overwrites deleted data, so erased member details don't stay readable in the file", () => {
    expect(reopen().pragma("secure_delete", { simple: true })).toBe(1);
  });

  it("waits up to 5 seconds when another connection is writing, instead of failing at once", () => {
    expect(reopen().pragma("busy_timeout", { simple: true })).toBe(5000);
  });

  it("refuses a row that points at a parent row that doesn't exist", () => {
    const db = reopen();
    db.exec("CREATE TABLE plans (id INTEGER PRIMARY KEY)");
    db.exec(
      "CREATE TABLE payments (id INTEGER PRIMARY KEY, plan_id INTEGER REFERENCES plans (id))",
    );

    expect(() => db.exec("INSERT INTO payments (plan_id) VALUES (99)")).toThrow(
      "FOREIGN KEY constraint failed",
    );
  });

  describe("openLocalOnlyDatabase", () => {
    // Opened twice, like after a restart: the second open must not run the migration again
    function reopenLocalOnly(): Database.Database {
      const filePath = join(folder, "local-only.db");
      const first = openLocalOnlyDatabase(filePath).$client;
      const second = openLocalOnlyDatabase(filePath).$client;
      connections.push(first, second);
      return second;
    }

    it("creates member_details, and keeps a row across a restart", () => {
      const db = reopenLocalOnly();
      db.exec("INSERT INTO member_details (member_id, name) VALUES (7, 'Ana Cruz')");
      const again = openLocalOnlyDatabase(join(folder, "local-only.db")).$client;
      connections.push(again);

      expect(again.prepare("SELECT name FROM member_details").all()).toEqual([
        { name: "Ana Cruz" },
      ]);
    });

    it("uses the gym database's settings, so erased details don't stay readable here either", () => {
      const db = reopenLocalOnly();

      expect(db.pragma("journal_mode", { simple: true })).toBe("wal");
      expect(db.pragma("synchronous", { simple: true })).toBe(2);
      expect(db.pragma("secure_delete", { simple: true })).toBe(1);
    });
  });
});
