// The append-only audit log (KTD9, U2 plan step 7). The triggers in migration 0001_audit_triggers
// refuse every update and delete on the audit tables, except an erasure's redaction (R62).
import { auditLog, auditPersonalValues } from "@jeyos/domain";
import type { AUDIT_ACTIONS } from "@jeyos/domain";
import type Database from "better-sqlite3";

import type { GymDatabase } from "../db/client.ts";

/** One change to record, such as a voided payment. See KTD9 for which changes need one. */
export interface AuditEntry {
  // The record it describes, like ("payments", 12). Empty only for a refused back-entry
  tableName: string;
  rowId: number | null;
  action: (typeof AUDIT_ACTIONS)[number];
  // Who acted. Their name is copied, so a later rename leaves the row as it was (R50)
  account: { id: number; displayName: string };
  // The Manila date of the record that changed, for U11's changed-after-closing marker
  recordManilaDate: string;
  reason?: string;
  // The record's values before and after, with personal values left out (R41)
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  // Each changed personal value, like a member's old and new phone, kept apart for erasure (R62)
  personalValues?: {
    memberId: number;
    field: string;
    before: string | null;
    after: string | null;
  }[];
}

/**
 * Writes the audit row and its personal values. Call it inside the same transaction as the change
 * it records, so both are saved or neither is (KTD9). Outside a transaction it refuses, because a
 * crash between the change and its audit row would leave a change nobody can trace.
 */
export function writeAudit(db: GymDatabase, entry: AuditEntry): void {
  if (!db.$client.inTransaction) {
    throw new Error("writeAudit must run inside the transaction of the change it records");
  }
  const { id } = db
    .insert(auditLog)
    .values({
      tableName: entry.tableName,
      rowId: entry.rowId,
      action: entry.action,
      accountId: entry.account.id,
      accountName: entry.account.displayName,
      actedAt: new Date().toISOString(),
      recordManilaDate: entry.recordManilaDate,
      reason: entry.reason ?? null,
      beforeJson: entry.before === undefined ? null : JSON.stringify(entry.before),
      afterJson: entry.after === undefined ? null : JSON.stringify(entry.after),
    })
    .returning({ id: auditLog.id })
    .get();
  for (const value of entry.personalValues ?? []) {
    db.insert(auditPersonalValues)
      .values({ auditLogId: id, ...value })
      .run();
  }
}

// Connections that are inside an erasure transaction right now. Kept in server memory, never in
// the database, so a crash or a forgotten reset can't leave the exception switched on
const erasing = new WeakSet<Database.Database>();

/** Adds erasure_in_progress() to a connection, for the redaction trigger to call. openDatabase does this. */
export function registerErasureFlag(db: Database.Database): void {
  db.function("erasure_in_progress", () => (erasing.has(db) ? 1 : 0));
}

/**
 * Runs work in one transaction in which the trigger lets audit_personal_values be redacted.
 * Only the erasure service (U8) calls this. If work throws, the transaction rolls back and every
 * redaction with it, and the exception switches off either way.
 */
export function inErasureTransaction<T>(db: Database.Database, work: () => T): T {
  return db.transaction(() => {
    erasing.add(db);
    try {
      return work();
    } finally {
      erasing.delete(db);
    }
  })();
}
