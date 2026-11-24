import type Database from "better-sqlite3";
import type { Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GymDatabase } from "../db/client.ts";
import { openTestDatabase } from "../db/test-database.ts";
import { confirmClock } from "./clock-guard.ts";
import { errorHandler } from "./errors.ts";

describe("clock guard", () => {
  let sqlite: Database.Database;
  let db: GymDatabase;

  beforeEach(() => {
    ({ sqlite, db } = openTestDatabase());
  });

  afterEach(() => {
    sqlite.close();
  });

  // A day-pass sale typed in at enteredAt, the way U9 will save one
  function addPayment(enteredAt: string): void {
    sqlite
      .prepare(
        `INSERT INTO payments (occurred_at, entered_at, manila_date, entry_mode,
           entered_by_account_id, entered_by_name, kind, amount_centavos, method)
         VALUES (?, ?, '2026-11-23', 'normal', 1, 'Jeyo', 'day_pass', 8000, 'cash')`,
      )
      .run(enteredAt, enteredAt);
  }

  const latestEnteredAt = () =>
    sqlite.prepare("SELECT latest_entered_at FROM system_state").pluck().get();

  it("guards every table with the shared record columns, including ones added later", () => {
    const recordTables = sqlite
      .prepare(
        "SELECT m.name FROM sqlite_master m, pragma_table_info(m.name) c WHERE m.type = 'table' AND c.name = 'entered_at' ORDER BY m.name",
      )
      .pluck()
      .all();
    const guarded = sqlite
      .prepare(
        "SELECT tbl_name FROM sqlite_master WHERE type = 'trigger' AND name LIKE '%_clock_guard' ORDER BY tbl_name",
      )
      .pluck()
      .all();

    expect(recordTables.length).toBeGreaterThan(0);
    expect(guarded).toEqual(recordTables);
  });

  it("moves the latest entry time forward with each new record", () => {
    addPayment("2026-11-23T02:00:00.000Z");
    addPayment("2026-11-23T03:00:00.000Z");

    expect(latestEnteredAt()).toBe("2026-11-23T03:00:00.000Z");
  });

  it("refuses a record typed in earlier than the latest one, while reads still work", () => {
    // Saved while the clock was right, on November 23
    addPayment("2026-11-23T03:00:00.000Z");

    // A power cut reset the clock to January 1
    expect(() => addPayment("2026-01-01T00:00:00.000Z")).toThrow("clock_behind");
    expect(sqlite.prepare("SELECT count(*) FROM payments").pluck().get()).toBe(1);
    expect(latestEnteredAt()).toBe("2026-11-23T03:00:00.000Z");
  });

  it("accepts new records again once the owner confirms the clock, and records who did", () => {
    // Saved while the clock ran a day fast; the owner set it back to the right time
    addPayment("2026-11-24T03:00:00.000Z");
    expect(() => addPayment("2026-11-23T03:00:00.000Z")).toThrow("clock_behind");

    confirmClock(db, 1, new Date("2026-11-23T03:00:00.000Z"));
    addPayment("2026-11-23T03:05:00.000Z");

    expect(
      sqlite
        .prepare(
          "SELECT latest_entered_at, clock_confirmed_at, clock_confirmed_by_account_id FROM system_state",
        )
        .get(),
    ).toEqual({
      latest_entered_at: "2026-11-23T03:05:00.000Z",
      clock_confirmed_at: "2026-11-23T03:00:00.000Z",
      clock_confirmed_by_account_id: 1,
    });
  });

  it("answers a refused record with 409 clock_behind, so the screen can ask to fix the clock", () => {
    addPayment("2026-11-23T03:00:00.000Z");
    let refusal: unknown;
    try {
      addPayment("2026-01-01T00:00:00.000Z");
    } catch (error) {
      refusal = error;
    }
    const response = { status: vi.fn().mockReturnThis(), json: vi.fn() };

    errorHandler(refusal, {} as Request, response as unknown as Response, () => undefined);

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith({ error: "clock_behind" });
  });
});
