// How drizzle-kit writes the gym database's migrations from the table definitions (KTD17).
// The local-only file has its own config: drizzle.local-only.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  // Every table, from the domain package. drizzle-kit runs in packages/server, so the path starts there
  schema: "../domain/src/schema/index.ts",
  // Each database file keeps its migrations in its own folder (schema session, block 8)
  out: "src/db/migrations/gym",
});
