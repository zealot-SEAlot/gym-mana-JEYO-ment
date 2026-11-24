import { isActiveOn } from "@jeyos/domain";
import { CONSENT_TEXT, registerMemberSchema } from "@jeyos/shared";
import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { GymDatabase } from "../db/client.ts";
import { openTestDatabase } from "../db/test-database.ts";
import { registerMember } from "../members/members.service.ts";
import { carryOverExpiry, expiryOf } from "./ledger.ts";

const NOW = new Date("2026-11-24T02:00:00.000Z");
// The owner account openTestDatabase adds
const OWNER = { accountId: 1, displayName: "Jeyo" };

describe("carried-over expiry", () => {
  let sqlite: Database.Database;
  let gym: GymDatabase;
  let memberId: number;

  beforeEach(() => {
    const opened = openTestDatabase();
    ({ sqlite, db: gym } = opened);
    const form = registerMemberSchema.parse({
      name: "Ana Cruz",
      phone: "09171234567",
      email: "",
      consentTextVersion: CONSENT_TEXT.version,
      storeOnGymPc: true,
      onlineBackup: true,
      reminders: false,
    });
    memberId = registerMember(gym, opened.localOnlyDb, form, OWNER, NOW).id;
  });

  afterEach(() => {
    sqlite.close();
  });

  const count = (table: string) =>
    (sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;

  it("makes the member active through October 30, with an audit row and no income", () => {
    expect(carryOverExpiry(gym, memberId, "2026-10-30", OWNER, NOW)).toBe("saved");

    expect(expiryOf(gym, memberId)).toBe("2026-10-30");
    expect(isActiveOn(expiryOf(gym, memberId), "2026-10-30")).toBe(true);
    expect(isActiveOn(expiryOf(gym, memberId), "2026-10-31")).toBe(false);
    expect(
      sqlite
        .prepare(
          "SELECT table_name, row_id, action, account_name, record_manila_date, after_json FROM audit_log",
        )
        .all(),
    ).toEqual([
      {
        table_name: "carried_over_expiries",
        row_id: 1,
        action: "carry_over",
        account_name: "Jeyo",
        record_manila_date: "2026-11-24",
        after_json: JSON.stringify({ memberId, expiresOn: "2026-10-30" }),
      },
    ]);
    // Carried over, not paid for: the daily report (U11) adds up payments, and there are none
    expect(count("payments")).toBe(0);
  });

  it("gives a member with no carried-over date no expiry", () => {
    expect(expiryOf(gym, memberId)).toBeNull();
  });

  it("refuses a second carried-over date for the same member", () => {
    carryOverExpiry(gym, memberId, "2026-10-30", OWNER, NOW);

    expect(carryOverExpiry(gym, memberId, "2026-12-31", OWNER, NOW)).toBe("already_carried_over");
    expect(expiryOf(gym, memberId)).toBe("2026-10-30");
    // The refused entry left no audit row behind either
    expect(count("audit_log")).toBe(1);
  });

  it("takes a new date once the wrong one is voided", () => {
    carryOverExpiry(gym, memberId, "2026-01-30", OWNER, NOW);
    // What the owner's void (U12) will do
    sqlite.exec("UPDATE carried_over_expiries SET voided = 1");

    expect(carryOverExpiry(gym, memberId, "2026-10-30", OWNER, NOW)).toBe("saved");
    expect(expiryOf(gym, memberId)).toBe("2026-10-30");
  });

  it("refuses a member who doesn't exist or was erased", () => {
    expect(carryOverExpiry(gym, 999, "2026-10-30", OWNER, NOW)).toBe("member_not_found");
    sqlite.exec("UPDATE members SET erased = 1, code = NULL");
    expect(carryOverExpiry(gym, memberId, "2026-10-30", OWNER, NOW)).toBe("member_not_found");
    expect(count("carried_over_expiries")).toBe(0);
  });

  it("saves neither the entry nor its audit row when the clock guard refuses it", () => {
    const anHourEarlier = new Date(NOW.getTime() - 60 * 60 * 1000);

    expect(() => carryOverExpiry(gym, memberId, "2026-10-30", OWNER, anHourEarlier)).toThrow(
      "clock_behind",
    );
    expect(count("carried_over_expiries")).toBe(0);
    expect(count("audit_log")).toBe(0);
  });
});
