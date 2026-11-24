// The desk's member registration form (R8, U4), shared so the Register screen and the server agree.
import { z } from "zod";

/**
 * What the member reads before answering (R8, Republic Act No. 10173). A consent row stores only
 * the version, so change the version whenever the wording changes; the old answers keep pointing
 * at the text the member actually saw. Draft wording: the owner reviews it before go-live (U21)
 */
export const CONSENT_TEXT = {
  version: "2026-11-24",
  storeOnGymPc:
    "Jeyo's Hardhit Fitness Center keeps your name, phone number, email, and photo on the gym's own computer to run your membership and check you in. This is required to register.",
  onlineBackup:
    "A copy of your details is also kept in an online backup, so they survive if the gym computer breaks, and so you can sign in from home later. Optional.",
  reminders:
    "The gym sends you a text or email before your membership expires. Optional, and needs the online backup, because reminders are sent from it.",
} as const;

// Shown at the desk and the door, and printed on the card. Only the owner can change it later (R59)
export const memberNameSchema = z
  .string()
  .trim()
  .min(1, "Enter the member's name")
  .max(80, "Use at most 80 characters");

// A Philippine mobile number, typed any common way: 0917 123 4567, 0917-123-4567, +63 917 123 4567.
// Stored one way, 09171234567, so the same number always looks the same. Required: expiry reminders
// go by text (U19), and the desk needs a way to reach the member
export const memberPhoneSchema = z
  .string()
  .transform((typed) => typed.replace(/[\s-]/g, "").replace(/^\+?63/, "0"))
  .pipe(z.string().regex(/^09\d{9}$/, "Enter a mobile number like 0917 123 4567"));

// Optional. The form sends "" for a blank box, which is stored as no email
export const memberEmailSchema = z
  .string()
  .trim()
  .transform((typed) => (typed === "" ? null : typed.toLowerCase()))
  .pipe(z.email("Enter an email like ana@example.com, or leave it blank").nullable());

// The three consent answers are separate fields, not one object, so a refused answer is named on
// its own checkbox (validate.ts lists only top-level fields)
export const registerMemberSchema = z
  .object({
    name: memberNameSchema,
    phone: memberPhoneSchema,
    email: memberEmailSchema,
    // The version of CONSENT_TEXT the screen showed. A desk page left open across an update shows
    // the old text, so the server refuses it instead of recording the wrong version
    consentTextVersion: z.literal(
      CONSENT_TEXT.version,
      "Reload the page to see the current consent text",
    ),
    storeOnGymPc: z.literal(true, "The member must agree to this to register"),
    onlineBackup: z.boolean(),
    reminders: z.boolean(),
  })
  // The database refuses this too (consents_reminders_need_backup); this names the checkbox
  .refine((form) => !form.reminders || form.onlineBackup, {
    path: ["reminders"],
    message: "Reminders need the online backup",
  });

export type RegisterMember = z.infer<typeof registerMemberSchema>;

// The owner copies an existing member's expiry date from the logbook or wall list (R44). Any real
// calendar day: a past one just means the member has already expired. The desk's date box sends
// YYYY-MM-DD, the form every Manila date takes (R55)
export const carryOverExpirySchema = z.object({
  expiresOn: z.iso.date("Enter a date like 2026-10-30"),
});
