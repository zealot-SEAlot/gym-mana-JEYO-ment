// How drizzle-kit writes the local-only file's migrations (KTD17, schema session block 8).
// That file holds the personal details of members who declined the online backup, so Litestream
// never copies them. It has only the member_details table
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "../domain/src/schema/member-details.ts",
  out: "src/db/migrations/local-only",
});
