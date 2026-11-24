import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { GymDatabase } from "../db/client.ts";
import { openTestDatabase } from "../db/test-database.ts";
import { inErasureTransaction, writeAudit } from "./audit-log.ts";
import type { AuditEntry } from "./audit-log.ts";

// The owner changed member 1's phone number, written the way the member edit service (U8) will
const phoneChange: AuditEntry = {
  tableName: "member_details",
  rowId: 1,
  action: "member_edit",
  account: { id: 1, displayName: "Jeyo" },
  recordManilaDate: "2026-11-23",
  personalValues: [{ memberId: 1, field: "phone", before: "09171234567", after: "09181234567" }],
};

describe("writeAudit", () => {
  let sqlite: Database.Database;
  let db: GymDatabase;

  beforeEach(() => {
    ({ sqlite, db } = openTestDatabase());
    sqlite.exec(`
      INSERT INTO members (id, occurred_at, entered_at, manila_date, entry_mode,
        entered_by_account_id, entered_by_name, code)
      VALUES (1, '2026-11-23T02:00:00.000Z', '2026-11-23T02:00:00.000Z', '2026-11-23', 'normal',
        1, 'Jeyo', 'member-code')
    `);
  });

  afterEach(() => {
    sqlite.close();
  });

  const count = (table: string) =>
    sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).pluck().get();

  it("saves the audit row with the account's name, and its personal values apart", () => {
    sqlite.transaction(() =>
      writeAudit(db, {
        tableName: "payments",
        rowId: 12,
        action: "void",
        account: { id: 1, displayName: "Jeyo" },
        recordManilaDate: "2026-11-22",
        reason: "Wrong amount",
        before: { amountCentavos: 8000, voided: false },
        after: { amountCentavos: 8000, voided: true },
      }),
    )();
    sqlite.transaction(() => writeAudit(db, phoneChange))();

    expect(
      sqlite
        .prepare(
          "SELECT table_name, row_id, action, account_name, record_manila_date, reason, before_json, after_json FROM audit_log ORDER BY id",
        )
        .all(),
    ).toEqual([
      {
        table_name: "payments",
        row_id: 12,
        action: "void",
        account_name: "Jeyo",
        record_manila_date: "2026-11-22",
        reason: "Wrong amount",
        before_json: '{"amountCentavos":8000,"voided":false}',
        after_json: '{"amountCentavos":8000,"voided":true}',
      },
      {
        table_name: "member_details",
        row_id: 1,
        action: "member_edit",
        account_name: "Jeyo",
        record_manila_date: "2026-11-23",
        reason: null,
        before_json: null,
        after_json: null,
      },
    ]);
    expect(
      sqlite
        .prepare("SELECT audit_log_id, member_id, field, before, after FROM audit_personal_values")
        .all(),
    ).toEqual([
      {
        audit_log_id: 2,
        member_id: 1,
        field: "phone",
        before: "09171234567",
        after: "09181234567",
      },
    ]);
  });

  it("refuses to write outside a transaction", () => {
    expect(() => writeAudit(db, phoneChange)).toThrow(
      "writeAudit must run inside the transaction of the change it records",
    );
    expect(count("audit_log")).toBe(0);
  });

  it("disappears with the change it records when the transaction rolls back", () => {
    expect(() =>
      sqlite.transaction(() => {
        writeAudit(db, phoneChange);
        throw new Error("the member edit failed after its audit row was written");
      })(),
    ).toThrow("the member edit failed");

    expect(count("audit_log")).toBe(0);
    expect(count("audit_personal_values")).toBe(0);
  });
});

// A member edit that changed a phone number: one audit row and one personal value (R59)
function addMemberEdit(sqlite: Database.Database): void {
  sqlite.exec(`
    INSERT INTO members (id, occurred_at, entered_at, manila_date, entry_mode,
      entered_by_account_id, entered_by_name, code)
    VALUES (1, '2026-11-23T02:00:00.000Z', '2026-11-23T02:00:00.000Z', '2026-11-23', 'normal',
      1, 'Jeyo', 'member-code');
    INSERT INTO audit_log (id, table_name, row_id, action, account_id, account_name, acted_at,
      record_manila_date)
    VALUES (1, 'member_details', 1, 'member_edit', 1, 'Jeyo', '2026-11-23T03:00:00.000Z',
      '2026-11-23');
    INSERT INTO audit_personal_values (id, audit_log_id, member_id, field, before, after)
    VALUES (1, 1, 1, 'phone', '09171234567', '09181234567');
  `);
}

const REDACT = "UPDATE audit_personal_values SET before = NULL, after = NULL, redacted = 1";

describe("audit log triggers", () => {
  let sqlite: Database.Database;

  beforeEach(() => {
    ({ sqlite } = openTestDatabase());
    addMemberEdit(sqlite);
  });

  afterEach(() => {
    sqlite.close();
  });

  function personalValue() {
    return sqlite.prepare("SELECT before, after, redacted FROM audit_personal_values").get();
  }

  it("refuses to change or delete an audit row", () => {
    expect(() => sqlite.exec("UPDATE audit_log SET reason = 'oops'")).toThrow(
      "audit_log rows cannot be changed",
    );
    expect(() => sqlite.exec("DELETE FROM audit_log")).toThrow("audit_log rows cannot be deleted");
  });

  it("refuses to delete a personal value, even during an erasure", () => {
    expect(() =>
      inErasureTransaction(sqlite, () => sqlite.exec("DELETE FROM audit_personal_values")),
    ).toThrow("audit_personal_values rows cannot be deleted");
  });

  it("refuses a redaction outside an erasure", () => {
    expect(() => sqlite.exec(REDACT)).toThrow(
      "audit_personal_values rows can only be redacted by an erasure",
    );
    expect(personalValue()).toEqual({ before: "09171234567", after: "09181234567", redacted: 0 });
  });

  it("lets an erasure redact a personal value", () => {
    inErasureTransaction(sqlite, () => sqlite.exec(REDACT));

    expect(personalValue()).toEqual({ before: null, after: null, redacted: 1 });
  });

  it("refuses any change other than a redaction, even during an erasure", () => {
    expect(() =>
      inErasureTransaction(sqlite, () =>
        sqlite.exec("UPDATE audit_personal_values SET after = '09990000000'"),
      ),
    ).toThrow("can only be redacted by an erasure");
    expect(() =>
      inErasureTransaction(sqlite, () => sqlite.exec(`${REDACT}, field = 'email'`)),
    ).toThrow("can only be redacted by an erasure");
  });

  it("rolls back the redaction when the erasure fails, and switches the exception off after", () => {
    expect(() =>
      inErasureTransaction(sqlite, () => {
        sqlite.exec(REDACT);
        throw new Error("erasure failed halfway");
      }),
    ).toThrow("erasure failed halfway");
    expect(personalValue()).toEqual({ before: "09171234567", after: "09181234567", redacted: 0 });

    inErasureTransaction(sqlite, () => undefined);
    expect(() => sqlite.exec(REDACT)).toThrow("can only be redacted by an erasure");
  });

  it("refuses a redaction from a connection the server didn't open, such as a database viewer", () => {
    // A plain connection: no openDatabase, so no erasure_in_progress() function
    const viewer = new Database(":memory:");
    migrate(drizzle({ client: viewer }), {
      migrationsFolder: fileURLToPath(new URL("../db/migrations/gym", import.meta.url)),
    });

    expect(() => viewer.exec(REDACT)).toThrow("no such function: erasure_in_progress");
    viewer.close();
  });
});
