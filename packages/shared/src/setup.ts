// The owner setup form's request (R49, KTD5), shared so the setup screen and the server agree.
import { z } from "zod";

import { passwordSchema } from "./password.ts";

export const setupSchema = z.object({
  // The secret the install script wrote to the data folder, proving the person is at the gym PC
  setupSecret: z.string().trim().min(1, "Enter the setup secret"),
  // Shown on screens and copied onto every record the owner enters (R50)
  displayName: z.string().trim().min(1, "Enter your name").max(60, "Use at most 60 characters"),
  signInName: z.string().trim().min(1, "Enter a sign-in name").max(40, "Use at most 40 characters"),
  password: passwordSchema,
});

// The forgotten-password form on the gym PC: the printed recovery code and a new password (R49)
export const recoverySchema = z.object({
  recoveryCode: z.string().trim().min(1, "Enter the recovery code"),
  newPassword: passwordSchema,
});
