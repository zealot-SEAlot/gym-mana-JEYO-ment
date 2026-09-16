# CLAUDE.md

Jeyo's Hardhit Fitness Center gym management system, a three-student capstone. The plan is [docs/plans/2026-09-15-0946-feat-jeyos-gym-management-system-plan.md](docs/plans/2026-09-15-0946-feat-jeyos-gym-management-system-plan.md). Its units run from U1 to U22, and IDs such as R15, KTD7, and AE3 point into it.

## Team rules

- **Pair in small steps.** Each unit has one owner. Write the unit in small steps and stop after each one so the owner can read the files, run the commands, and ask questions. Explain what each step does and why. The owner must be able to defend every line to the instructor.
- **Only the team uses Git and GitHub.** Never commit, push, open or merge pull requests, or change repository settings, and never run workflows that do those things on their own. Leave changes in the working tree and give the exact commands, one per `bash` block.
- **Never commit gym data:** database files, member photos, certificates, keys, or `.env` files.
- If a change alters a decision in the plan, update the plan in the same pull request.
- Each pull request carries at most one database migration (KTD17).

## Commands

| Command | What it does |
|---|---|
| `npm ci` | Install exactly the versions in `package-lock.json` |
| `npm run typecheck` | Type-check every package and `e2e/` |
| `npm run lint` | ESLint; any warning fails |
| `npm run format` | Format with Prettier (`format:check` only checks) |
| `npm test` | Vitest unit and component tests |
| `npm run test:coverage` | Tests, failing below 80% coverage |
| `npm run test:e2e` | Build the client and run the Playwright tests in Chromium |
| `npm run build` | Build every package that has a build step |
| `npm run dev --workspace @jeyos/client` | Vite development server |
| `npm run dev --workspace @jeyos/server` | Run the server with Node, restarting on save |

CI (`.github/workflows/ci.yml`) runs on every pull request: typecheck, lint, format check, coverage, build, the Playwright tests, and `npm audit` on Windows, plus a gitleaks secret scan and a check that blocks binary files outside `e2e/fixtures/`.

## Layout

Five npm workspaces (KTD16). ESLint enforces which may import which.

| Package | Holds | May import |
|---|---|---|
| `packages/shared` | Browser-safe code: request schemas, money, the Manila-day helper, role names | nothing |
| `packages/domain` | Drizzle table definitions and pure business rules | `shared` |
| `packages/server` | The Express app on the gym PC | `shared`, `domain` |
| `packages/client` | The React screens, built with Vite | `shared` |
| `packages/online` | The hosted read-only service for the extras | `shared`, and `domain`'s pure rules only |

`e2e/` holds the Playwright tests, which run against the built client.

## Conventions

- Every dependency version is exact (`.npmrc` sets `save-exact`). Check the npm registry for current versions instead of relying on memory.
- TypeScript is pinned to 6.0.3 because typescript-eslint 8.70 supports only TypeScript below 6.1. Move to TypeScript 7 once it does.
- Node 24 runs the server's `.ts` files by stripping the types, so `tsconfig.base.json` bans what it cannot strip: no `enum` or `namespace`, `import type` for type-only imports, and `.ts` extensions on relative imports (`./money.ts`).
- `shared` and `domain` get neither Node nor browser globals, so their code runs in both places.
- Tests sit next to the code as `*.test.ts` or `*.test.tsx`. Client tests run in jsdom (set in `packages/client/vite.config.ts`) and find elements by role.
- Coverage stays at or above 80%. The coverage exclude list in `vitest.config.ts` holds only entry files that start the program; keep it that way.
- React code never uses `dangerouslySetInnerHTML`; lint fails on it.
