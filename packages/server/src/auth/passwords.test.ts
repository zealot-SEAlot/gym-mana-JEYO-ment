import { afterEach, describe, expect, it, vi } from "vitest";

import { hashMethod, hashPassword, verifyPassword } from "./passwords.ts";

const PASSWORD = "correct horse battery";

describe("passwords with argon2 installed", () => {
  it("hashes with argon2id and checks the password against the hash", async () => {
    const { passwordHash, passwordHashMethod } = await hashPassword(PASSWORD);

    expect(hashMethod).toBe("argon2id");
    expect(passwordHashMethod).toBe("argon2id");
    expect(passwordHash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(PASSWORD, passwordHash, "argon2id")).toBe(true);
    expect(await verifyPassword("wrong horse battery", passwordHash, "argon2id")).toBe(false);
  });

  it("gives the same password a different hash each time, so equal passwords don't show", async () => {
    const first = await hashPassword(PASSWORD);
    const second = await hashPassword(PASSWORD);

    expect(first.passwordHash).not.toBe(second.passwordHash);
  });

  it("refuses a password the shared rule doesn't allow", async () => {
    await expect(hashPassword("too short")).rejects.toThrow("Use at least 12 characters");
  });
});

describe("passwords when argon2 can't load", () => {
  afterEach(() => {
    vi.doUnmock("argon2");
    vi.resetModules();
  });

  // Loads a fresh copy of passwords.ts that sees argon2 fail, like a gym PC where its install broke
  async function withoutArgon2() {
    vi.resetModules();
    vi.doMock("argon2", () => {
      throw new Error("The native argon2 file failed to load");
    });
    return import("./passwords.ts");
  }

  it("falls back to bcrypt, and still checks bcrypt hashes", async () => {
    const passwords = await withoutArgon2();
    const { passwordHash, passwordHashMethod } = await passwords.hashPassword(PASSWORD);

    expect(passwords.hashMethod).toBe("bcrypt");
    expect(passwordHashMethod).toBe("bcrypt");
    expect(await passwords.verifyPassword(PASSWORD, passwordHash, "bcrypt")).toBe(true);
    expect(await passwords.verifyPassword("wrong horse battery", passwordHash, "bcrypt")).toBe(
      false,
    );
  });

  it("refuses loudly to check an argon2id hash, instead of calling the password wrong", async () => {
    const { passwordHash } = await hashPassword(PASSWORD);
    const passwords = await withoutArgon2();

    await expect(passwords.verifyPassword(PASSWORD, passwordHash, "argon2id")).rejects.toThrow(
      "hashed with argon2id, but argon2 isn't installed",
    );
  });
});
