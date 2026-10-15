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

## Known gaps (tracked in OPEN_ITEMS)

- CSP nonces instead of `'unsafe-inline'` for scripts.
- External error monitoring (Sentry) not wired.
- Malware scanning provider not selected.
- Production WAF / bot protection (Vercel Firewall) to be enabled by the account owner.
