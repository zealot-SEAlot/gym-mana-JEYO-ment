import { CONSENT_TEXT, registerMemberSchema } from "@jeyos/shared";
import type { RegisterMember } from "@jeyos/shared";
import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { GymDatabase, LocalOnlyDatabase } from "../db/client.ts";
import { openTestDatabase } from "../db/test-database.ts";
import { findMember, registerMember } from "./members.service.ts";

const NOW = new Date("2026-11-24T02:00:00.000Z");
// The owner account openTestDatabase adds, signed in at the desk
const DESK = { accountId: 1, displayName: "Jeyo" };

// The form as the server receives it after validateBody, with each test's changes
function form(changes: Partial<Record<keyof RegisterMember, unknown>> = {}): RegisterMember {
  return registerMemberSchema.parse({
    name: "Ana Cruz",
    phone: "0917 123 4567",
    email: "ana@example.com",
    consentTextVersion: CONSENT_TEXT.version,
    storeOnGymPc: true,
    onlineBackup: true,
    reminders: false,
    ...changes,
  });
}

describe("members service", () => {
  let sqlite: Database.Database;
  let gym: GymDatabase;
  let localOnly: LocalOnlyDatabase;

  beforeEach(() => {
    ({ sqlite, db: gym, localOnlyDb: localOnly } = openTestDatabase());
  });

  afterEach(() => {
    sqlite.close();
    if (localOnly.$client.open) {
      localOnly.$client.close();
    }
  });

  function detailsIn(db: GymDatabase) {
    return db.$client.prepare("SELECT member_id, name, phone, email FROM member_details").all();
  }

  it("registers a member with a code, their consent answers, and details in the gym database", () => {
    const { id, code } = registerMember(gym, localOnly, form(), DESK, NOW);

    expect(code).toMatch(/^[0-9A-F]{32}$/);
    expect(findMember(gym, localOnly, id)).toEqual({
      id,
      code,
      name: "Ana Cruz",
      phone: "09171234567",
      email: "ana@example.com",
      hasPhoto: false,
    });
    expect(
      sqlite
        .prepare(
          "SELECT consent_text_version, store_on_gym_pc, online_backup, reminders, entered_by_name, manila_date FROM consents",
        )
        .all(),
    ).toEqual([
      {
        consent_text_version: CONSENT_TEXT.version,
        store_on_gym_pc: 1,
        online_backup: 1,
        reminders: 0,
        entered_by_name: "Jeyo",
        manila_date: "2026-11-24",
      },
    ]);
    expect(detailsIn(localOnly)).toEqual([]);
  });

  it("keeps a member who declines the online backup in the local-only file only, and still finds them", () => {
    const { id } = registerMember(
      gym,
      localOnly,
      form({ onlineBackup: false, reminders: false }),
      DESK,
      NOW,
    );

    expect(detailsIn(gym)).toEqual([]);
    expect(detailsIn(localOnly)).toEqual([
      { member_id: id, name: "Ana Cruz", phone: "09171234567", email: "ana@example.com" },
    ]);
    expect(findMember(gym, localOnly, id)?.name).toBe("Ana Cruz");
  });

  it("gives every member a different code", () => {
    const first = registerMember(gym, localOnly, form(), DESK, NOW);
    const second = registerMember(gym, localOnly, form({ name: "Ben Reyes" }), DESK, NOW);

    expect(first.code).not.toBe(second.code);
  });

  it("saves nothing when the local-only file can't take the details", () => {
    localOnly.$client.close();

    expect(() => registerMember(gym, localOnly, form({ onlineBackup: false }), DESK, NOW)).toThrow(
      "The database connection is not open",
    );
    expect(sqlite.prepare("SELECT count(*) AS n FROM members").get()).toEqual({ n: 0 });
    expect(sqlite.prepare("SELECT count(*) AS n FROM consents").get()).toEqual({ n: 0 });
  });

  it("saves nothing in either file when the clock guard refuses the member", () => {
    registerMember(gym, localOnly, form(), DESK, NOW);
    const anHourEarlier = new Date(NOW.getTime() - 60 * 60 * 1000);

    expect(() =>
      registerMember(gym, localOnly, form({ onlineBackup: false }), DESK, anHourEarlier),
    ).toThrow("clock_behind");
    expect(sqlite.prepare("SELECT count(*) AS n FROM members").get()).toEqual({ n: 1 });
    expect(detailsIn(localOnly)).toEqual([]);
  });

  it("overwrites a leftover local-only row with the same id instead of refusing the member", () => {
    // What a failed gym save after the details were written would leave behind
    localOnly.$client.exec("INSERT INTO member_details (member_id, name) VALUES (1, 'Leftover')");

    const { id } = registerMember(gym, localOnly, form({ onlineBackup: false }), DESK, NOW);

    expect(id).toBe(1);
    expect(findMember(gym, localOnly, id)?.name).toBe("Ana Cruz");
  });

  it("finds nobody for an id that doesn't exist, or a member whose details are gone", () => {
    const { id } = registerMember(gym, localOnly, form(), DESK, NOW);
    sqlite.exec("DELETE FROM member_details");

    expect(findMember(gym, localOnly, 999)).toBeNull();
    expect(findMember(gym, localOnly, id)).toBeNull();
  });
});
