// Owner and staff accounts (R3, R49, R50, KTD5). Built in U3; the table is created here so U2's
// foundation migration holds every core table (KTD17).
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
