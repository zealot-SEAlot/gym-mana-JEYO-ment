import { describe, expect, it } from "vitest";
import { z } from "zod";

import { CONSENT_TEXT, registerMemberSchema } from "./members.ts";

// A filled-in form that passes; each test changes one thing
const form = {
  name: "Ana Cruz",
  phone: "0917 123 4567",
  email: "",
  consentTextVersion: CONSENT_TEXT.version,
  storeOnGymPc: true,
  onlineBackup: true,
  reminders: true,
};

// The messages validate.ts sends back, by field
function errorsFor(changes: Record<string, unknown>) {
  const result = registerMemberSchema.safeParse({ ...form, ...changes });
  return result.success ? {} : z.flattenError(result.error).fieldErrors;
}

describe("registerMemberSchema", () => {
  it.each([
    ["0917 123 4567"],
    ["0917-123-4567"],
    ["09171234567"],
    ["+63 917 123 4567"],
    ["639171234567"],
  ])("stores the mobile number %s as 09171234567", (phone) => {
    expect(registerMemberSchema.parse({ ...form, phone }).phone).toBe("09171234567");
  });

  it.each([["0917 123 456"], ["0817 123 4567"], ["(032) 123 4567"], [""]])(
    "refuses %j as a mobile number",
    (phone) => {
      expect(errorsFor({ phone })).toEqual({
        phone: ["Enter a mobile number like 0917 123 4567"],
      });
    },
  );

  it("stores a blank email as none, and a typed one in lower case", () => {
    expect(registerMemberSchema.parse(form).email).toBeNull();
    expect(registerMemberSchema.parse({ ...form, email: " Ana@Example.com " }).email).toBe(
      "ana@example.com",
    );
    expect(errorsFor({ email: "ana@" })).toEqual({
      email: ["Enter an email like ana@example.com, or leave it blank"],
    });
  });

  it("refuses a member who doesn't agree to storing data on the gym PC", () => {
    expect(errorsFor({ storeOnGymPc: false })).toEqual({
      storeOnGymPc: ["The member must agree to this to register"],
    });
  });

  it("accepts a member who declines the online backup and reminders", () => {
    expect(errorsFor({ onlineBackup: false, reminders: false })).toEqual({});
  });

  it("refuses reminders without the online backup", () => {
    expect(errorsFor({ onlineBackup: false, reminders: true })).toEqual({
      reminders: ["Reminders need the online backup"],
    });
  });

  it("refuses a form that showed an older consent text", () => {
    expect(errorsFor({ consentTextVersion: "2020-01-01" })).toEqual({
      consentTextVersion: ["Reload the page to see the current consent text"],
    });
  });
});
