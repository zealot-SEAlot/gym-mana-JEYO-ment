// A fresh gym database in memory for tests, migrated like the real file, with the owner account
// (id 1) that settings and audit rows must point at. Tests only; the server never imports this
import { fileURLToPath } from "node:url";

import type Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { openDatabase } from "./client.ts";

const GYM_MIGRATIONS = fileURLToPath(new URL("./migrations/gym", import.meta.url));

export function openTestDatabase(): { sqlite: Database.Database; db: BetterSQLite3Database } {
  const sqlite = openDatabase(":memory:");
  const db = drizzle({ client: sqlite });
  migrate(db, { migrationsFolder: GYM_MIGRATIONS });
  sqlite.exec(
    "INSERT INTO accounts (id, display_name, sign_in_name, role, password_hash, password_hash_method) VALUES (1, 'Jeyo', 'jeyo', 'owner', 'hash', 'argon2id')",
  );
  return { sqlite, db };
}
