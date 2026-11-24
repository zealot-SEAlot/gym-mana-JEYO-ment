// A fresh gym database in memory for tests, migrated like the real file, with the owner account
// (id 1) that settings and audit rows must point at, plus an empty local-only file in memory.
// Tests only; the server never imports this
import type Database from "better-sqlite3";

import { openGymDatabase, openLocalOnlyDatabase } from "./client.ts";
import type { GymDatabase, LocalOnlyDatabase } from "./client.ts";

export function openTestDatabase(): {
  sqlite: Database.Database;
  db: GymDatabase;
  localOnlyDb: LocalOnlyDatabase;
} {
  const db = openGymDatabase(":memory:");
  db.$client.exec(
    "INSERT INTO accounts (id, display_name, sign_in_name, role, password_hash, password_hash_method) VALUES (1, 'Jeyo', 'jeyo', 'owner', 'hash', 'argon2id')",
  );
  return { sqlite: db.$client, db, localOnlyDb: openLocalOnlyDatabase(":memory:") };
}
