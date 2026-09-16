import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Each folder in packages/ is its own test project, named from its package.json
    projects: ["packages/*"],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.{ts,tsx}"],
      // Entry files only start the program; the end-to-end test (U22) covers them
      exclude: ["packages/server/src/index.ts"],
      reporter: ["text", "html"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
