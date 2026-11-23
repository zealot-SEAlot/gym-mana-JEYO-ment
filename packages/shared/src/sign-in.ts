// The sign-in form's request (KTD5), shared so the sign-in screen and the server agree.
import { z } from "zod";

export const signInSchema = z.object({
  signInName: z.string().trim().min(1, "Enter your sign-in name"),
  // Not passwordSchema: sign-in only compares, and a wrong length is just a wrong password.
  // The cap stops a huge body from keeping the hash function busy
  password: z.string().min(1, "Enter your password").max(1000),
});
