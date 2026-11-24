// Opens the gym's SQLite database with the settings from the plan (KTD2).
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { registerErasureFlag } from "../audit/audit-log.ts";

/**
 * The database as services use it: Drizzle's queries, plus the connection under them ($client),
 * which tells writeAudit whether it is inside a transaction. drizzle({ client }) returns this
 */
export type GymDatabase = BetterSQLite3Database & { $client: Database.Database };

/** Opens the database file at filePath. The path comes from config and never points inside the repo. */
export function openDatabase(filePath: string): Database.Database {
  const db = new Database(filePath);
  // Writes go to a side log first, so readers don't wait for writers and a crash can't corrupt the file
  db.pragma("journal_mode = WAL");
  // Every commit waits until the disk confirms it, so a power cut can't lose a save the screen already showed
  db.pragma("synchronous = FULL");
  // A row can't point at a parent row that doesn't exist (already better-sqlite3's default; set anyway)
  db.pragma("foreign_keys = ON");
  // Deleted data is overwritten, so erased member details don't stay readable in the file
  db.pragma("secure_delete = ON");
  // Wait up to 5 seconds for another writer instead of failing (already better-sqlite3's default; set anyway)
  db.pragma("busy_timeout = 5000");
  // The audit triggers call this to tell an erasure's redaction from any other change (KTD9)
  registerErasureFlag(db);
  return db;
}

/**
 * The local-only file: personal details of members who declined the online backup (KTD13, R8).
 * Same shape as GymDatabase, so the same Drizzle queries work on either file
 */
export type LocalOnlyDatabase = GymDatabase;

const GYM_MIGRATIONS = fileURLToPath(new URL("./migrations/gym", import.meta.url));
const LOCAL_ONLY_MIGRATIONS = fileURLToPath(new URL("./migrations/local-only", import.meta.url));

/**
 * Opens the gym database and brings it up to the newest migration, for the server and the tests.
 * U20 adds the release checks around this: a copy first, and refusing a newer schema (KTD17).
 */
export function openGymDatabase(filePath: string): GymDatabase {
  const db = drizzle({ client: openDatabase(filePath) });
  migrate(db, { migrationsFolder: GYM_MIGRATIONS });
  return db;
}

/**
 * Opens the local-only file the same way: same settings, its own migrations (KTD17). Litestream
 * never copies this file, so these members' details stay off the online backup. A separate
 * connection, not SQLite's ATTACH, because Drizzle can't name an attached file's tables
 */
export function openLocalOnlyDatabase(filePath: string): LocalOnlyDatabase {
  const db = drizzle({ client: openDatabase(filePath) });
  migrate(db, { migrationsFolder: LOCAL_ONLY_MIGRATIONS });
  return db;
}
