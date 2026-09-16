import js from "@eslint/js";
import eslintReact from "@eslint-react/eslint-plugin";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

// KTD16 in the plan: the other @jeyos packages each package may import.
const allowedImports = {
  shared: [],
  domain: ["shared"],
  server: ["shared", "domain"],
  client: ["shared"],
  online: ["shared", "domain"],
};

const packageBoundaries = Object.entries(allowedImports).map(([name, allowed]) => ({
  files: [`packages/${name}/**`],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: Object.keys(allowedImports)
              .filter((other) => other !== name && !allowed.includes(other))
              .map((other) => `@jeyos/${other}`),
            message: `The plan (KTD16) lets @jeyos/${name} import only: ${allowed.join(", ") || "no other package"}.`,
          },
        ],
      },
    ],
  },
}));

export default defineConfig(
  globalIgnores(["**/dist/", "coverage/", "playwright-report/", "test-results/"]),
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // Type-aware rules, such as catching a forgotten await, read each package's tsconfig.json
        projectService: true,
      },
    },
  },
  {
    // Config files at the repo root belong to no package's tsconfig, so they skip type-aware rules
    files: ["*.{js,ts}"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ["packages/client/**/*.{ts,tsx}"],
    extends: [eslintReact.configs["recommended-type-checked"]],
    rules: {
      // Rendering raw HTML lets a stored member name or scanned code run as a script (plan: Risks)
      "@eslint-react/dom-no-dangerously-set-innerhtml": "error",
    },
  },
  packageBoundaries,
);
