# Authentication and authorisation

## Library

[Better Auth](https://www.better-auth.com) with the Prisma adapter (`src/server/auth/auth.ts`,
ADR-004). Tables: `User`, `Session`, `Account`, `Verification`, `TwoFactor`, `RateLimit`.

## Methods

| Method           | Who                                 | Notes                                                                                                                                                                                                                                       |
| ---------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Email + password | everyone                            | scrypt hashing (library default), min 10 chars, max 128. Verification email sent on sign-up (log provider in development).                                                                                                                  |
| Phone number OTP | customers                           | 6-digit code, 5-minute expiry, 5 attempts, SMS through `@ridekmer/notifications`. Creates the account on first verification with a placeholder email on `phone.ridekmer.invalid`. Raw OTPs are never stored by RideKmer or written to logs. |
| TOTP two-factor  | staff (required), anyone (optional) | Authenticator app + 10 backup codes. Enforced by `requireStaffMfa` for roles with `requiresMfa` when `AUTH_REQUIRE_STAFF_MFA=true` (default; `false` only in local development).                                                            |
| Password reset   | email users                         | Signed, expiring link; sessions revoked on reset.                                                                                                                                                                                           |

## Sessions

- Database sessions, 7-day lifetime, rotated every 24 h (`updateAge`), 5-minute cookie cache.
- Cookies prefixed `ridekmer`, `Secure` outside development, `HttpOnly`, `SameSite=Lax`.
- Suspended users (`User.status != ACTIVE`) cannot create sessions; suspension also deletes
  existing sessions.
- Users can revoke other devices from _Account → Security_.

## Rate limiting and brute force

Better Auth rate limiting with database storage (works across serverless instances):
100 req/min per IP globally, 20/min for sign-in, 10/min for sign-up, 5/min for OTP sending
and password-reset requests, 10/min for OTP and TOTP verification. Limits are per IP and
deliberately generous because many users in Cameroon share carrier-grade NAT addresses;
per-account lockout for password sign-in is an open item (Milestone 8). TOTP verification
locks after repeated failures (`TwoFactor.failedVerificationCount`, `lockedUntil`). Clients
receive HTTP 429 and show a localised "too many attempts" message. `AUTH_RATE_LIMIT_MULTIPLIER`
relaxes the limits for automated test runs and is refused in production.

## Roles and permissions

Defined in `src/server/auth/permissions.ts` and seeded into `Role` / `Permission` /
`RolePermission`. Users get roles through `UserRole` (optionally time-limited).

| Role                | Staff | MFA | Highlights                                                      |
| ------------------- | ----- | --- | --------------------------------------------------------------- |
| customer            | no    | no  | `booking.create`                                                |
| vehicle_owner       | no    | no  | `vehicle.create`, `payout.request`                              |
| chauffeur           | no    | no  | `booking.handover`                                              |
| delivery_agent      | yes   | no  | handover, inspections, current location                         |
| vehicle_inspector   | yes   | no  | inspections, incidents                                          |
| operations_agent    | yes   | yes | bookings, verification, documents, support                      |
| support_agent       | yes   | yes | support, refund requests                                        |
| fleet_manager       | yes   | yes | vehicle approval/suspension, maintenance, telematics, overrides |
| finance_officer     | yes   | yes | payments, refunds approval, payouts approval/processing, ledger |
| administrator       | yes   | yes | everything except `payout.process` (separation of duties)       |
| super_administrator | yes   | yes | everything                                                      |

Guards (`src/server/auth/session.ts`):

- `requireUser()` → redirect to login.
- `requirePermission(key)` → login/MFA/forbidden redirects for pages.
- `requirePermissionOrThrow(key)` → throws for actions and route handlers.
- `assertPermission(userId, key)` → service layer.

Changing roles or status is itself audited and cannot be done on one's own account.

## First administrator in production

Demo accounts are never created in production. Bootstrap procedure
(`docs/OPERATIONS_RUNBOOK.md` → "Create the first super administrator"): register normally,
then grant the role with a one-off SQL statement or the `scripts/grant-role.ts` helper
(Milestone 2), and enable TOTP before using the administration area.

## Legal note

Electronic acceptance (click-to-accept with evidence) is not a certified electronic
signature. See `docs/LEGAL_REVIEW_CHECKLIST.md`.
