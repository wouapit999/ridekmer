## Summary

<!-- What does this change do and why? Link the issue or milestone. -->

## Type of change

- [ ] Feature
- [ ] Bug fix
- [ ] Refactor / tech debt
- [ ] Documentation
- [ ] Database migration (describe rollback below)

## Checklist

- [ ] `pnpm check` passes locally (format, lint, typecheck, unit tests, build)
- [ ] Integration / e2e tests added or updated where behaviour changed
- [ ] Translations added for **both** `fr` and `en`
- [ ] Server-side permission checks added for any new privileged operation
- [ ] Audit log entries added for sensitive changes
- [ ] No secrets, credentials or real personal data committed
- [ ] Money handled as integer XAF; dates computed in Africa/Douala
- [ ] Documentation updated (`docs/`) when architecture, env vars or operations change

## Database migration

<!-- If this PR adds a migration: is it backwards compatible? How is it rolled back? -->

## Screenshots (mobile + desktop)

<!-- For UI changes. -->

## Deployment notes

<!-- New environment variables, cron jobs, webhooks, manual steps. -->
