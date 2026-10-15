# GitHub workflow

## Current state (2026-10-15)

- **`wouapit999/ridekmer` (private)** is the canonical repository. `main` and `develop` both
  hold the full milestone history (Milestone 1 → 8) imported from the development branch.
- **`wouapit999/Ridekmer_main` (public)** is the renamed profile repository where the code was
  first developed (branch `claude/clever-hamilton-yn2ghh`, plus an earlier one-commit
  `develop`). It is public: keep it free of anything sensitive, and archive or delete the
  RideKmer branches there once Vercel is connected to `wouapit999/ridekmer`.

### Remaining owner actions on GitHub

1. Settings → Branches: protect `main` and `develop` (require a pull request, require the
   `CI / quality` check, no force pushes).
2. Settings → Code security: enable Dependabot alerts and secret scanning (push protection).
3. Review `.github/CODEOWNERS` and the issue / pull-request templates.
4. Optional clean-up of the public repository:

   ```bash
   git push https://github.com/wouapit999/Ridekmer_main --delete claude/clever-hamilton-yn2ghh develop
   ```

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
