import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    // Password hashing is slow on purpose (KTD5): about half a second per argon2id hash. The
    // sign-in, setup, and staff tests hash many times each while other test files run beside them,
    // so under coverage one can pass Vitest's 5-second default without anything being wrong
    testTimeout: 20_000,
  },
});
