import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    // Password hashing is slow on purpose (KTD5): about half a second per argon2id hash. The
    // sign-in, setup, and staff tests hash many times each while other test files run beside them,
    // so under coverage one can pass Vitest's 5-second default without anything being wrong
    testTimeout: 20_000,
    // The HTTPS test makes its throwaway certificate with OpenSSL in a beforeAll hook. On the
    // Windows CI runner, while other test files run beside it, that took over Vitest's 10-second
    // hook default and failed pull request 22 without anything being wrong
    hookTimeout: 30_000,
  },
});
