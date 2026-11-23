// Owner settings, like the day-pass price and the closing time (KTD18, U2 plan step 3).
// Each module registers its own keys here, with a type and a default, so no track waits on
// another for a setting. A row exists only once the owner changes a setting (schema session, block 2)
import { settings } from "@jeyos/domain";
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { z } from "zod";

/** One registered setting. Only registerSetting makes these, so a typo in a key can't reach the database. */
export interface Setting<T> {
  readonly key: string;
  readonly schema: z.ZodType<T>;
  readonly defaultValue: T;
}

// The same rule as the settings_key_has_module check: the module, a dot, then the setting
const KEY = /^[a-z][a-zA-Z]*\.[a-zA-Z]+$/;

const registered = new Map<string, Setting<unknown>>();

/**
 * Registers a setting once, when its module loads, for example
 * registerSetting("walkins.dayPassPriceCentavos", z.number().int().positive(), 8000).
 */
export function registerSetting<T>(key: string, schema: z.ZodType<T>, defaultValue: T): Setting<T> {
  if (!KEY.test(key)) {
    throw new Error(`Setting key must be module.name, got ${key}`);
  }
  if (registered.has(key)) {
    throw new Error(`Setting ${key} is already registered`);
  }
  // A default the type refuses would break every screen that reads it, so fail at startup instead
  schema.parse(defaultValue);
  const setting: Setting<T> = { key, schema, defaultValue };
  registered.set(key, setting);
  return setting;
}

// A setting object built by hand, not by registerSetting, is refused like an unknown key
function assertRegistered(setting: Setting<unknown>): void {
  if (registered.get(setting.key) !== setting) {
    throw new Error(`Setting ${setting.key} is not registered`);
  }
}

/** The owner's value for a setting, or its default when the owner never changed it. */
export function readSetting<T>(db: BetterSQLite3Database, setting: Setting<T>): T {
  assertRegistered(setting);
  const row = db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, setting.key))
    .get();
  if (row === undefined) {
    return setting.defaultValue;
  }
  // The stored JSON is checked again, so a row edited outside the app can't hand a screen a wrong type
  return setting.schema.parse(JSON.parse(row.value));
}

/** Saves the owner's new value, recording which account changed it and when. */
export function writeSetting<T>(
  db: BetterSQLite3Database,
  setting: Setting<T>,
  value: T,
  accountId: number,
): void {
  assertRegistered(setting);
  const row = {
    value: JSON.stringify(setting.schema.parse(value)),
    updatedByAccountId: accountId,
    updatedAt: new Date().toISOString(),
  };
  db.insert(settings)
    .values({ key: setting.key, ...row })
    .onConflictDoUpdate({ target: settings.key, set: row })
    .run();
}
