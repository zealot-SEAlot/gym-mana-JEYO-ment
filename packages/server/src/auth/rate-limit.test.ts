import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { GymDatabase } from "../db/client.ts";
import { openTestDatabase } from "../db/test-database.ts";
import { clearTries, takeTry } from "./rate-limit.ts";

const START = new Date("2026-11-23T01:00:00.000Z");
const minutesLater = (minutes: number) => new Date(START.getTime() + minutes * 60_000);

describe("rate limits", () => {
  let sqlite: Database.Database;
  let db: GymDatabase;

  beforeEach(() => {
    ({ sqlite, db } = openTestDatabase());
  });

  afterEach(() => {
    sqlite.close();
  });

  function takeFive(key: string) {
    for (let minute = 0; minute < 5; minute += 1) {
      expect(takeTry(db, key, minutesLater(minute))).toBe(0);
    }
  }

  it("allows five tries, then refuses the sixth until 15 minutes after the first", () => {
    takeFive("sign-in:lee");

    // The window opened at minute 0, so at minute 5 there are 10 minutes left
    expect(takeTry(db, "sign-in:lee", minutesLater(5))).toBe(600);
    expect(takeTry(db, "sign-in:lee", minutesLater(14.5))).toBe(30);
    expect(takeTry(db, "sign-in:lee", minutesLater(15))).toBe(0);
  });

  it("doesn't let refused tries push the window further out", () => {
    takeFive("sign-in:lee");
    for (let minute = 5; minute < 15; minute += 1) {
      takeTry(db, "sign-in:lee", minutesLater(minute));
    }

    expect(takeTry(db, "sign-in:lee", minutesLater(15))).toBe(0);
  });

  it("keeps each key's count apart", () => {
    takeFive("sign-in:lee");

    expect(takeTry(db, "sign-in:ana", minutesLater(5))).toBe(0);
  });

  it("starts over after a correct answer", () => {
    takeFive("sign-in:lee");
    clearTries(db, "sign-in:lee");

    takeFive("sign-in:lee");
  });

  it("deletes ended windows, so made-up names don't pile up rows", () => {
    for (let n = 0; n < 50; n += 1) {
      takeTry(db, `sign-in:made-up-${n}`, START);
    }

    takeTry(db, "sign-in:lee", minutesLater(15));

    expect(sqlite.prepare("SELECT key FROM rate_limits").pluck().all()).toEqual(["sign-in:lee"]);
  });
});
