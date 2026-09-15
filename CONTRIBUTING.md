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

> Keep the clone outside OneDrive, Google Drive, or Dropbox folders if you can. Sync tools can lock or corrupt files while Git and SQLite write them.

## Everyday workflow

### 1. Start from the latest main

```bash
git switch main
```

```bash
git pull
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
git commit
```

## Rules

- Never push directly to `main`; always use a pull request.
- A teammate other than the author approves before merge.
- Tests and checks pass before you ask for review (the CI check arrives with U1).
- Never commit database files, member photos, certificates, keys, `.env` files, or other personal data. `.gitignore` blocks the common ones, so check `git status` before committing.
- If a change alters a decision in the plan, update the plan in the same pull request.
- Each pull request carries at most one database migration (KTD17 in the plan).
