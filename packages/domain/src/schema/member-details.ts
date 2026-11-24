// A member's personal details (R8, R59, R62). Built in U4.
// This file holds only this table because the local-only file's migration reads it on its own
// (schema session, block 8). Anything added here also lands in the local-only file
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// One row per member. It lives in the gym database for a member who agreed to the online backup,
// and in the local-only file for one who declined, so Litestream never copies it (block 3).
// No foreign key to members: the local-only file has no members table, so the service checks the ID
export const memberDetails = sqliteTable("member_details", {
  memberId: integer("member_id").primaryKey(),
  // Only the owner can change the name (R59)
  name: text("name").notNull(),
  // Which contact details are required is still open with the owner (decision log, "Still open"),
  // so both may be empty for now and U4's form decides
  phone: text("phone"),
  email: text("email"),
  // The server-generated file name in the photos folder. Empty when the member declined a photo (R8)
  photoFileName: text("photo_file_name"),
});
