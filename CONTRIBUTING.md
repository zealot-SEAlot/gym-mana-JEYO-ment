# Contributing

Only the three team members commit, push, and merge to this repository. Every change, including plan updates, goes through a pull request that a teammate reviews.

## One-time setup (each teammate)

1. Install [Git](https://git-scm.com/), [Node.js 24 LTS](https://nodejs.org/), and the [GitHub CLI](https://cli.github.com/).
2. Sign in to GitHub from the terminal:

   ```bash
   gh auth login
   ```

3. Set the name and email that appear on your commits:

   ```bash
   git config --global user.name "Your Name"
   ```

   ```bash
   git config --global user.email "you@example.com"
   ```

4. Clone the repo and open the folder:

   ```bash
   git clone https://github.com/zealot-SEAlot/gym-mana-JEYO-ment.git
   ```

   ```bash
   cd gym-mana-JEYO-ment
   ```

5. Install the dependencies, then the browser that the Playwright tests use:

   ```bash
   npm ci
   ```

   ```bash
   npx playwright install chromium
   ```

> Keep the clone outside OneDrive, Google Drive, or Dropbox folders if you can. Sync tools can lock or corrupt files while Git and SQLite write them.

## Everyday workflow

### 1. Start from the latest main

```bash
git switch main
```

```bash
git pull
```

If the pull changed `package-lock.json`, a teammate added or updated a dependency. Reinstall so your `node_modules` matches:

```bash
npm ci
```

### 2. Create a branch for one piece of work

Name it `<type>/<unit>-<short-description>`:

```bash
git switch -c feat/u1-workspace-scaffold
```

| Type | Use it for |
|---|---|
| `feat` | A new feature or unit |
| `fix` | A bug fix |
| `docs` | README, plan, or guide changes |
| `test` | Tests only |
| `refactor` | Code changes that do not change behavior |
| `chore` | Tooling, dependencies, config |
| `ci` | GitHub Actions changes |

### 3. Commit your work

Check what changed, stage it, and commit with a message in the same `<type>: <description>` form:

```bash
git status
```

```bash
git add .
```

```bash
git commit -m "feat: add workspace scaffold (U1)"
```

Small commits are fine. The pull request is squashed into one commit when it merges.

### 4. Push the branch

The first push needs `-u`. Later pushes on the same branch are just `git push`.

```bash
git push -u origin feat/u1-workspace-scaffold
```

### 5. Open a pull request

```bash
gh pr create --fill
```

Then open it on GitHub and fill in the template: which unit it covers, which requirements, and how you tested it. Keep one unit per pull request where possible.

### 6. Review a teammate's pull request

List open pull requests, check one out locally to try it, then approve it or ask for changes:

```bash
gh pr list
```

```bash
gh pr checkout 12
```

```bash
gh pr review 12 --approve
```

```bash
gh pr review 12 --request-changes --body "The renewal test for AE3 fails on my machine."
```

Replace `12` with the pull request number.

GitHub does not let you approve your own pull request, so the reviewer is always a different teammate. Until everyone has repository access, merge your own pull request and write in it that nobody reviewed it.

### 7. Merge after approval

```bash
gh pr merge --squash --delete-branch
```

### 8. Update your main

```bash
git switch main
```

```bash
git pull
```

## When main changed while you worked

Bring the latest main into your branch before asking for review:

```bash
git switch main
```

```bash
git pull
```

```bash
git switch feat/u1-workspace-scaffold
```

```bash
git merge main
```

If Git reports a conflict, open the files it lists, keep the right lines, delete the `<<<<<<<`, `=======`, and `>>>>>>>` markers, then:

```bash
git add .
```

```bash
git commit --no-edit
```

`--no-edit` accepts Git's default merge message. Plain `git commit` opens a text editor instead, which on a fresh Windows install is Vim, and getting out of it needs `:q!`.

## How we use AI

Our instructor allows AI help, but every member must be able to explain and defend the code. We pair with Claude on each unit:

1. One teammate owns the unit and sits with Claude for it.
2. Claude writes the unit in small steps and stops after each one.
3. The owner reads the changed files, runs the commands or tests, and asks about anything unclear before the next step.
4. The owner commits as the steps land, then writes the pull request's "In my own words" section without copying.
5. The reviewer asks questions on the pull request until they could explain it too.

Claude never commits, pushes, or merges; the team does.

## Rules

- Never push directly to `main`; always use a pull request.
- A teammate other than the author approves before merge.
- Run `npm run typecheck`, `npm run lint`, and `npm test` before you ask for review. CI runs these and more on every pull request, and a red check means the pull request is not ready to merge.
- Never commit database files, member photos, certificates, keys, `.env` files, or other personal data. `.gitignore` blocks the common ones, so check `git status` before committing.
- If a change alters a decision in the plan, update the plan in the same pull request.
- Each pull request carries at most one database migration (KTD17 in the plan).
