# Backup and recovery

## What must be protected

| Asset                                        | Where                              | Backup                                                                                                                                               |
| -------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL database                          | managed provider                   | provider point-in-time recovery (PITR) + daily logical dump                                                                                          |
| Private files (documents, photos, contracts) | Vercel Blob / S3                   | versioning or scheduled copy to a second bucket                                                                                                      |
| Secrets                                      | Vercel env vars + password manager | `APP_ENCRYPTION_KEY` and `BETTER_AUTH_SECRET` stored in the company password manager; losing the encryption key makes encrypted fields unrecoverable |
| Code                                         | GitHub                             | repository itself; protected branches                                                                                                                |

## PostgreSQL

1. Enable the provider's PITR/branching (Neon: history retention ≥ 7 days; Supabase: PITR
   add-on) — set by the account owner.
2. Daily logical dump kept 30 days (run from a scheduled job on a machine with the direct URL):

   ```bash
   pg_dump "$DIRECT_DATABASE_URL" --format=custom --no-owner --file "ridekmer-$(date +%F).dump"
   ```

   Store the dump encrypted (the dump contains personal data) in a private bucket.

3. Restore test (quarterly): restore into a fresh database and run
   `pnpm db:migrate:status` + the integration suite against it.

## Before any risky migration

```bash
pg_dump "$DIRECT_DATABASE_URL" -Fc -f pre-migration-$(date +%F-%H%M).dump
pnpm db:migrate:status
```

Keep the dump until the release is validated.

## Recovery procedures

| Scenario                              | Steps                                                                                                                                                                                                                                                           |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bad deployment, no migration          | Vercel → promote previous deployment                                                                                                                                                                                                                            |
| Bad deployment with migration         | Promote previous deployment; if the migration is incompatible, restore the pre-migration dump (`pg_restore --clean --if-exists -d "$DIRECT_DATABASE_URL" file.dump`) during a maintenance window; replay payments/webhooks received since (they are idempotent) |
| Data corruption / accidental deletion | PITR to the minute before the incident into a new branch/database; copy the affected rows back                                                                                                                                                                  |
| Lost encryption key                   | No recovery for encrypted fields; users must resubmit documents. Prevent by storing the key in two secure places.                                                                                                                                               |
| Object storage loss                   | Restore from the secondary bucket/version; `checksumSha256` columns verify integrity                                                                                                                                                                            |

## RPO / RTO targets (to confirm with the business)

RPO 15 minutes (PITR), RTO 2 hours for the database, 15 minutes for code rollback.
