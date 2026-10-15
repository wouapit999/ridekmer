# Security architecture

Companion to the root `SECURITY.md` (reporting policy). Status column: ✅ implemented in
Milestone 1 · 🔜 planned milestone.

| Control                                                     | Status                                   | Where                                                                                  |
| ----------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------- |
| Password hashing (scrypt), min length 10                    | ✅                                       | Better Auth config                                                                     |
| MFA (TOTP + backup codes) for staff, enforced server-side   | ✅                                       | `requireStaffMfa`                                                                      |
| Session rotation, revocation on suspension / password reset | ✅                                       | Better Auth + `setUserStatus`                                                          |
| Rate limiting (DB-backed, per endpoint)                     | ✅                                       | Better Auth `rateLimit`; Upstash for app-level limits 🔜 M3                            |
| CSRF                                                        | ✅                                       | Server actions (Next.js origin checks), Better Auth origin validation, `SameSite=Lax`  |
| Input validation                                            | ✅                                       | Zod on every action and search parameter                                               |
| File validation (size, MIME, magic bytes), safe object keys | ✅                                       | `@ridekmer/storage`                                                                    |
| Malware scanning interface                                  | ✅ interface, 🔜 provider                | `MalwareScanner`                                                                       |
| Secure headers + CSP                                        | ✅                                       | `src/server/security/headers.ts`                                                       |
| Brute-force protection                                      | ✅                                       | rate limits + TOTP lockout                                                             |
| Object-level access control                                 | ✅ pattern, 🔜 per feature               | ownership checks in actions                                                            |
| Server-side permission checks                               | ✅                                       | `src/server/auth/rbac.ts`, `session.ts`                                                |
| Audit logging (append-only)                                 | ✅                                       | `recordAudit`, DB trigger                                                              |
| Secret redaction / PII redaction in logs                    | ✅                                       | `src/lib/logger.ts`                                                                    |
| Account suspension                                          | ✅                                       | admin action + session hook                                                            |
| Data retention configuration                                | ✅ settings, 🔜 jobs                     | `SystemSetting` `privacy.*`, `tracking.*`                                              |
| Data export / deletion requests                             | ✅ model, 🔜 UI (M8)                     | `DataRequest`                                                                          |
| Field-level encryption (AES-256-GCM, key id for rotation)   | ✅                                       | `src/lib/crypto.ts`                                                                    |
| Short-lived signed file URLs with access checks             | ✅ interface, 🔜 M2                      | `StorageProvider.getSignedReadUrl`                                                     |
| Webhook signature validation + replay protection            | ✅ routes + replay window (M4)           | `@ridekmer/payments/webhook-security`, `PaymentWebhookEvent`                           |
| Idempotent financial operations                             | ✅ payments/refunds (M4), 🔜 ledger (M6) | `Payment.idempotencyKey`, `IdempotencyKey`                                             |
| CSV formula-injection protection                            | ✅                                       | `src/lib/csv.ts`                                                                       |
| Dual approval above threshold                               | ✅ schema (`Approval`), 🔜 M6            |                                                                                        |
| Production configuration guard                              | ✅                                       | `getEnv()` refuses local storage, demo seed, localhost DB, missing Redis in production |

## Content Security Policy

`default-src 'self'`; scripts `'self' 'unsafe-inline'` (required by Next.js hydration; a nonce
strategy is tracked in `docs/OPEN_ITEMS.md`), styles `'self' 'unsafe-inline'`, images
`'self' data: blob: https:`, `frame-ancestors 'none'`, `object-src 'none'`,
`form-action 'self'`, `upgrade-insecure-requests`. `connect-src` lists Vercel insights and
Upstash; add the payment and GPS provider hosts when they are configured.

## Secrets

- Read only through `getEnv()`; missing or malformed values fail fast at startup.
- `.env*` ignored by git except `.env.example`. CI uses throw-away placeholder values.
- Field-encryption key (`APP_ENCRYPTION_KEY`) is separate from the auth secret; rotate by
  introducing `APP_ENCRYPTION_KEY_ID=v2` and re-encrypting (runbook to be written in M8).

## Data classification

| Class        | Examples                                                                               | Handling                                                                 |
| ------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Restricted   | identity numbers, licence numbers, bank details, VIN, tracker serials, OTPs, passwords | encrypted at rest or hashed; never logged; OTPs never stored by RideKmer |
| Confidential | documents (scans), contracts, inspection photos, location data                         | private storage, signed URLs, access audited                             |
| Internal     | bookings, payments metadata, audit logs                                                | staff access by permission                                               |
| Public       | approved vehicle listings, prices, public pages                                        | cacheable                                                                |

## Application rate limits (Milestone 8)

Better Auth limits its own endpoints (database-backed). Other sensitive operations use
`src/server/security/rate-limit.ts` (ADR-031): Upstash sliding windows in production, an
in-memory window in development and tests, keyed per user id when signed in, otherwise per
client IP. Rules live in `RATE_LIMIT_RULES` (contact form, payment initiation, booking
confirmation, incident reports, data export, deletion requests). A Redis outage fails open
and is logged so that a cache incident never blocks payments.

## Health, boot checks and error reporting

- `/api/health`: anonymous liveness; readiness details only with the `CRON_SECRET` bearer.
- `src/instrumentation.ts`: validates the environment at boot (fail fast) and logs every
  unhandled request error through the redacting logger. `MONITORING_PROVIDER=sentry` is a
  hook for the SDK the account owner installs; nothing is sent anywhere by default.
- CI runs `pnpm audit --prod --audit-level=high`; transitive advisories in packages that
  never run (Prisma CLI's MySQL driver) are pinned through `pnpm.overrides` (ADR-035).

## Field-encryption key rotation

`APP_ENCRYPTION_KEY_PREVIOUS` + `APP_ENCRYPTION_KEY_PREVIOUS_ID` keep the previous key
readable while `pnpm db:rotate-key` (`scripts/rotate-encryption-key.ts`) re-encrypts every
`*Enc` column and recomputes lookup hashes, in batches and idempotently. Remove the previous
key once the script reports zero remaining rows. Procedure in `docs/OPERATIONS_RUNBOOK.md`.

## Known gaps (tracked in OPEN_ITEMS)

- CSP nonces instead of `'unsafe-inline'` for scripts.
- External error monitoring SDK not installed (hook only).
- Malware scanning provider not selected.
- Production WAF / bot protection (Vercel Firewall) to be enabled by the account owner.
- Independent penetration test before launch.
