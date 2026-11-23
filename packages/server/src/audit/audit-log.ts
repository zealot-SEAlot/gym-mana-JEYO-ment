// The append-only audit log (KTD9, U2 plan step 7). The triggers in migration 0001_audit_triggers
// refuse every update and delete on the audit tables, except an erasure's redaction (R62).
import type Database from "better-sqlite3";

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
