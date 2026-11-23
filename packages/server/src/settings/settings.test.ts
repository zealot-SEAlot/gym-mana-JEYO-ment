import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { openTestDatabase } from "../db/test-database.ts";
import { readSetting, registerSetting, writeSetting } from "./settings.ts";
import type { Setting } from "./settings.ts";

// Registered once for the whole file, the way a module registers its keys when it loads
const dayPassPrice = registerSetting(
  "walkins.dayPassPriceCentavos",
  z.number().int().positive(),
  8000,
);

describe("settings", () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database;

  beforeEach(() => {
    ({ sqlite, db } = openTestDatabase());
  });

  afterEach(() => {
    sqlite.close();
  });

  it("gives the default until the owner changes a setting", () => {
    expect(readSetting(db, dayPassPrice)).toBe(8000);
  });

  it("gives the owner's value after a change, and keeps one row per key", () => {
    writeSetting(db, dayPassPrice, 9000, 1);
    writeSetting(db, dayPassPrice, 10000, 1);

    expect(readSetting(db, dayPassPrice)).toBe(10000);
    expect(sqlite.prepare("SELECT key, value, updated_by_account_id FROM settings").all()).toEqual([
      { key: "walkins.dayPassPriceCentavos", value: "10000", updated_by_account_id: 1 },
    ]);
  });

  it("refuses a value its registered type doesn't allow, and saves nothing", () => {
    expect(() => writeSetting(db, dayPassPrice, -5, 1)).toThrow();
    expect(readSetting(db, dayPassPrice)).toBe(8000);
  });

  it("refuses to read or write an unregistered key", () => {
    const madeUp: Setting<number> = {
      key: "walkins.notRegistered",
      schema: z.number(),
      defaultValue: 0,
    };

    expect(() => readSetting(db, madeUp)).toThrow(
      "Setting walkins.notRegistered is not registered",
    );
    expect(() => writeSetting(db, madeUp, 1, 1)).toThrow("is not registered");
  });

  it("refuses a stored value of the wrong type, such as a row edited outside the app", () => {
    sqlite.exec(
      `INSERT INTO settings (key, value, updated_by_account_id, updated_at)
       VALUES ('walkins.dayPassPriceCentavos', '"eighty pesos"', 1, '2026-11-23T02:00:00.000Z')`,
    );

    expect(() => readSetting(db, dayPassPrice)).toThrow();
  });

  it("refuses a key registered twice, a key without its module, and a default of the wrong type", () => {
    expect(() => registerSetting("walkins.dayPassPriceCentavos", z.number(), 1)).toThrow(
      "already registered",
    );
    expect(() => registerSetting("dayPassPrice", z.number(), 1)).toThrow("module.name");
    expect(() => registerSetting("walkins.badDefault", z.number().positive(), -1)).toThrow();
  });
});
