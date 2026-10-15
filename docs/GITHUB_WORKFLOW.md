# GitHub workflow

## Current state (important)

The code was developed in a Claude Code cloud session whose GitHub access was limited to the
profile repository `wouapit999/wouapit999`, branch `claude/clever-hamilton-yn2ghh`. The
intended repository **`wouapit999/ridekmer` does not exist yet** and could not be created from
the session (invalid CLI token, repository scope). Nothing was fabricated: the commands below
create it.

## Moving the code into `wouapit999/ridekmer`

Run on your machine (requires `gh auth login` with the `wouapit999` account):

```bash
# 1. Get the code
git clone --branch claude/clever-hamilton-yn2ghh https://github.com/wouapit999/wouapit999 ridekmer
cd ridekmer

# 2. Start a clean history for the new repository (keeps the files, drops the profile-repo commit)
git checkout --orphan main
git add -A
git commit -m "RideKmer: Milestone 1 foundation"

# 3. Create the private repository and push main
gh repo create wouapit999/ridekmer --private --source=. --remote=origin --push

# 4. Integration branch
git checkout -b develop && git push -u origin develop

# 5. (Optional) clean up the profile repository branch once the import is verified
git push https://github.com/wouapit999/wouapit999 --delete claude/clever-hamilton-yn2ghh
```

Then in GitHub → Settings → Branches add protection rules for `main` and `develop` (require
the `CI / quality` check, require a pull request, no force pushes), enable Dependabot alerts
and secret scanning, and review `.github/CODEOWNERS`.

## Branch model

| Branch           | Role                                                           | Deploys to                  |
| ---------------- | -------------------------------------------------------------- | --------------------------- |
| `main`           | production; only merges from `develop` (release) or `hotfix/*` | Vercel production           |
| `develop`        | integration; feature PRs merge here                            | Vercel preview (branch URL) |
| `feature/<name>` | one feature per branch                                         | Vercel preview per PR       |
| `hotfix/<name>`  | urgent production fix → `main`, then back-merge into `develop` | preview, then production    |

## Pull requests

- Use the template (`.github/pull_request_template.md`); link the milestone.
- CI (`.github/workflows/ci.yml`) runs format, lint, typecheck, unit tests, migration check,
  integration tests and a production build; e2e runs after quality passes.
- Squash-merge features; merge-commit releases from `develop` to `main` to keep history.

## Releases and migrations

1. Merge `develop` → `main` through a PR titled `Release YYYY-MM-DD`.
2. Vercel builds and deploys production. Migrations are applied **before** promoting traffic
   (`docs/DEPLOYMENT.md`).
3. Tag: `git tag -a vX.Y.Z -m "..." && git push --tags`.
