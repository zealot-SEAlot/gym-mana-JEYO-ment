// Owner and staff accounts, their sessions, sign-in limits, and one-time codes (R3, R49, R50, R52,
// KTD5). Built in U3. The accounts table came in U2's foundation migration so every core table
// could point at it (KTD17); the other three come in U3a's own migration (schema session, block 7).
import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const ACCOUNT_ROLES = ["owner", "staff"] as const;

// KTD5: argon2id normally, bcrypt only if the argon2 native install fails
export const PASSWORD_HASH_METHODS = ["argon2id", "bcrypt"] as const;

export const accounts = sqliteTable(
  "accounts",
  {
    id: integer("id").primaryKey(),
    // The name shown on screens and copied onto every record the account enters (R50)
    displayName: text("display_name").notNull(),
    // Owner and staff sign in with this, not an email (schema session, block 2)
    signInName: text("sign_in_name").notNull(),
    role: text("role", { enum: ACCOUNT_ROLES }).notNull(),
    passwordHash: text("password_hash").notNull(),
    // Which method produced passwordHash, so sign-in knows how to check it (KTD5)
    passwordHashMethod: text("password_hash_method", { enum: PASSWORD_HASH_METHODS }).notNull(),
    // Accounts are disabled, never deleted, so past records keep pointing at them (R50)
    disabled: integer("disabled", { mode: "boolean" }).notNull().default(false),
  },
  (table) => [
    // Sign-in names ignore upper and lower case, so "Lee" and "lee" can't both exist (block 2).
    // Unique across disabled accounts too, so a new account can't take an old one's name (U3)
    uniqueIndex("accounts_sign_in_name").on(sql`lower(sign_in_name)`),
    // Exactly one owner account (schema session, block 2): a second row with role 'owner' is refused.
    // This index covers only owner rows, so any number of staff rows is fine
    uniqueIndex("accounts_one_owner")
      .on(table.role)
      .where(sql`role = 'owner'`),
    // SQLite does not enforce Drizzle's enum lists, so these checks make the database refuse other values
    check("accounts_role", sql`role IN ('owner', 'staff')`),
    check("accounts_password_hash_method", sql`password_hash_method IN ('argon2id', 'bcrypt')`),
  ],
);

// One row per signed-in browser (KTD5). The cookie holds a random token; only its SHA-256 hash is
// stored, so someone who copies the database file can't take over a session. Signing out, a
// password reset, or disabling the account deletes the rows, since a session leaves no record behind
export const sessions = sqliteTable(
  "sessions",
  {
    // The SHA-256 of the cookie's token, as 64 hex characters. The cookie's token itself is never stored
    tokenHash: text("token_hash").primaryKey(),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id),
    // The CSRF synchronizer token every cookie-authenticated write must send back (KTD5)
    csrfToken: text("csrf_token").notNull(),
    // UTC text, like every time in the database (schema session, block 1)
    createdAt: text("created_at").notNull(),
    // The last request the user started. The open desk feed and automatic reloads don't move it
    // (KTD10), so the idle timeout from settings (R52) counts from here
    lastActiveAt: text("last_active_at").notNull(),
  },
  () => [check("sessions_token_hash", sql`length(token_hash) = 64`)],
);

// Failed attempts counted per account, code, or device, so the sixth wrong password within 15
// minutes is refused even after a server restart (KTD5). rate-limit.ts counts each try before
// checking it, and a correct answer or an ended window deletes the row, so what stays counted
// is the wrong answers
export const rateLimits = sqliteTable(
  "rate_limits",
  {
    // What is being guessed: a kind, a colon, and who or what, like "sign-in:lee" or "code:recovery"
    key: text("key").primaryKey(),
    failedAttempts: integer("failed_attempts").notNull(),
    // When the first failure in the current 15-minute window happened, as UTC text
    windowStartedAt: text("window_started_at").notNull(),
  },
  () => [
    check("rate_limits_key_has_kind", sql`key GLOB '[a-z]*:?*'`),
    check("rate_limits_failed_attempts", sql`failed_attempts > 0`),
  ],
);

// U3c adds 'pairing' for the door tablet, with its own migration
export const ONE_TIME_CODE_PURPOSES = ["recovery"] as const;

// Random codes a person types in once (KTD5). Only the SHA-256 hash is stored, and a used code's
// row is deleted, so a second try finds nothing. Wrong guesses are counted in rate_limits, since a
// wrong code can't say which row it was aimed at
export const oneTimeCodes = sqliteTable(
  "one_time_codes",
  {
    id: integer("id").primaryKey(),
    purpose: text("purpose", { enum: ONE_TIME_CODE_PURPOSES }).notNull(),
    codeHash: text("code_hash").notNull().unique(),
    createdAt: text("created_at").notNull(),
    // Every code has an expiry (KTD5), as UTC text
    expiresAt: text("expires_at").notNull(),
  },
  (table) => [
    // The owner has one recovery code at a time: a new one replaces the old (R49)
    uniqueIndex("one_time_codes_one_recovery")
      .on(table.purpose)
      .where(sql`purpose = 'recovery'`),
    check("one_time_codes_purpose", sql`purpose IN ('recovery')`),
    check("one_time_codes_code_hash", sql`length(code_hash) = 64`),
  ],
);
