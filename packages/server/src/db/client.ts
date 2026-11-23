// Opens the gym's SQLite database with the settings from the plan (KTD2).
import Database from "better-sqlite3";

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
  return db;
}
