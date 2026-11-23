// The owner's staff account forms (R50, U3 plan step 3), shared so the Staff screen and the server
// agree. The name rules are also used by owner setup (setup.ts).
import { z } from "zod";

import { passwordSchema } from "./password.ts";

// Shown on screens and copied onto every record the account enters (R50)
export const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a name")
  .max(60, "Use at most 60 characters");

// Unique across every account, disabled ones too, ignoring upper and lower case. The database
// checks that part, since only it can see every account at the moment of saving
export const signInNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a sign-in name")
  .max(40, "Use at most 40 characters");

// There is no role field: every account this form makes is staff, so no request can make a
// second owner (schema session, block 2)
export const addStaffSchema = z.object({
  displayName: displayNameSchema,
  signInName: signInNameSchema,
  password: passwordSchema,
});

// Rename, disable, or enable. Fields the schema doesn't list, like role, are dropped before the
// server sees them, so a request with only those changes nothing and is refused
export const updateStaffSchema = z
  .object({
    displayName: displayNameSchema,
    disabled: z.boolean(),
  })
  .partial()
  .refine((change) => Object.keys(change).length > 0, "Change at least one thing");

// The owner sets a new password for a staff member who forgot theirs
export const resetStaffPasswordSchema = z.object({
  newPassword: passwordSchema,
});
