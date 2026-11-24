import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { GymDatabase } from "../db/client.ts";
import { openTestDatabase } from "../db/test-database.ts";
import { writeSetting } from "../settings/settings.ts";
import { endSession, findSession, sessionIdleMinutes, startSession } from "./sessions.ts";

// A Manila morning, and the same morning some minutes later
const START = new Date("2026-11-23T01:00:00.000Z");
const minutesLater = (minutes: number) => new Date(START.getTime() + minutes * 60_000);

describe("sessions", () => {
  let sqlite: Database.Database;
  let db: GymDatabase;

  beforeEach(() => {
    // Account 1 is the owner, Jeyo
    ({ sqlite, db } = openTestDatabase());
  });

  afterEach(() => {
    sqlite.close();
  });

  it("finds the account behind a new session's token, and stores only the token's hash", () => {
    const { token, csrfToken } = startSession(db, 1, START);

    expect(findSession(db, token, START, true)).toEqual({
      accountId: 1,
      role: "owner",
      displayName: "Jeyo",
      csrfToken,
    });
    const stored = sqlite.prepare("SELECT token_hash FROM sessions").pluck().get();
    expect(stored).toHaveLength(64);
    expect(stored).not.toBe(token);
  });

  it("refuses a made-up token", () => {
    startSession(db, 1, START);

    expect(findSession(db, "made-up", START, true)).toBeNull();
  });

  it("signs out after 30 idle minutes by default, and the old cookie never works again", () => {
    const { token } = startSession(db, 1, START);

    expect(findSession(db, token, minutesLater(30), false)).not.toBeNull();
    expect(findSession(db, token, minutesLater(31), true)).toBeNull();
    // Raising the timeout afterwards doesn't bring the session back
    writeSetting(db, sessionIdleMinutes, 120, 1);
    expect(findSession(db, token, minutesLater(32), true)).toBeNull();
  });

  it("restarts the idle clock on requests the user starts", () => {
    const { token } = startSession(db, 1, START);

    findSession(db, token, minutesLater(20), true);

    expect(findSession(db, token, minutesLater(45), true)).not.toBeNull();
  });

  it("still signs out a desk whose open feed and reloads keep asking (KTD10)", () => {
    const { token } = startSession(db, 1, START);

    for (let minute = 5; minute <= 30; minute += 5) {
      expect(findSession(db, token, minutesLater(minute), false)).not.toBeNull();
    }

    expect(findSession(db, token, minutesLater(31), false)).toBeNull();
  });

  it("uses the owner's timeout from settings", () => {
    writeSetting(db, sessionIdleMinutes, 10, 1);
    const { token } = startSession(db, 1, START);

    expect(findSession(db, token, minutesLater(11), true)).toBeNull();
  });

  it("ends the session of an account the owner disables", () => {
    sqlite.exec(
      "INSERT INTO accounts (id, display_name, sign_in_name, role, password_hash, password_hash_method) VALUES (2, 'Lee', 'lee', 'staff', 'hash', 'argon2id')",
    );
    const { token } = startSession(db, 2, START);
    sqlite.exec("UPDATE accounts SET disabled = 1 WHERE id = 2");

    expect(findSession(db, token, START, true)).toBeNull();
    expect(sqlite.prepare("SELECT count(*) FROM sessions").pluck().get()).toBe(0);
  });

  it("signs out one browser without touching another", () => {
    const desk = startSession(db, 1, START);
    const phone = startSession(db, 1, START);

    endSession(db, desk.token);

    expect(findSession(db, desk.token, START, true)).toBeNull();
    expect(findSession(db, phone.token, START, true)).not.toBeNull();
  });
});
