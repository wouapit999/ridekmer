# API

RideKmer is primarily a server-rendered application. Mutations use **server actions** (typed,
CSRF-protected by Next.js, permission-checked on the server); a small set of **route handlers**
exists for authentication, health, cron jobs and provider webhooks. A public REST/JSON API for
future native apps is planned (see "Mobile readiness").

## Route handlers (Milestone 1)

| Method   | Path                                                   | Auth        | Purpose                                                                           |
| -------- | ------------------------------------------------------ | ----------- | --------------------------------------------------------------------------------- |
| GET/POST | `/api/auth/*`                                          | Better Auth | Sign-in/up, sessions, phone OTP, TOTP, password reset. Rate limited per endpoint. |
| GET      | `/api/health`                                          | none        | Liveness + database probe (`{ status, database, latencyMs }`).                    |
| GET      | `/manifest.webmanifest`, `/robots.txt`, `/sitemap.xml` | none        | PWA / SEO metadata.                                                               |

| GET | `/api/cron/document-expiry` | `Authorization: Bearer $CRON_SECRET` | Daily document-expiry job (Milestone 2). |
| GET | `/api/cron/expire-holds` | `Authorization: Bearer $CRON_SECRET` | Every 5 minutes: expire checkout holds and unpaid bookings (Milestone 3). |
| GET | `/api/cron/reconcile-payments` | `Authorization: Bearer $CRON_SECRET` | Every 15 minutes: expire stale payment requests, poll open payments, reconcile settled ones (Milestone 4). |
| GET | `/api/cron/operations` | `Authorization: Bearer $CRON_SECRET` | Hourly: pickup/return reminders, late-return detection, maintenance reminders (Milestone 5). |
| POST | `/api/webhooks/payments/{mtn-momo\|orange-money\|card}` | Provider signature (adapter-specific header, HMAC for the mock) | Payment callbacks. 200 processed/ignored/duplicate, 400 malformed, 401 bad signature, 404 unknown provider, 413 > 64 KB (Milestone 4). |
| GET | `/api/storage/local/<key>?expires&sig` | HMAC signature | Development-only download route for the local storage provider. |

Planned (later milestones): `/api/cron/*` for other jobs, `/api/webhooks/gps/<provider>`,
`/api/v1/*` (mobile).

## Server actions (Milestone 1)

| Action                  | File                              | Permission                     | Audit                             |
| ----------------------- | --------------------------------- | ------------------------------ | --------------------------------- |
| `submitContact`         | `src/features/contact/actions.ts` | public (honeypot + validation) | —                                 |
| `updateProfile`         | `src/features/account/actions.ts` | signed-in user                 | `user.profile.update`             |
| `activateOwnerSpace`    | `src/features/account/actions.ts` | signed-in user                 | `owner.space.activate`            |
| `saveUserRoles`         | `src/features/admin/actions.ts`   | `user.manage_roles`            | `user.roles.update`               |
| `setUserStatus`         | `src/features/admin/actions.ts`   | `user.suspend`                 | `user.suspend` / `user.reinstate` |
| `addCity`, `toggleCity` | `src/features/admin/actions.ts`   | `settings.manage`              | `city.create` / `city.toggle`     |
| `updateSetting`         | `src/features/admin/actions.ts`   | `settings.manage`              | `setting.update`                  |

Conventions for new actions:

1. `"use server"` file under `src/features/<domain>/actions.ts`.
2. First line: `await requirePermissionOrThrow("<permission>")` (or `getCurrentSession()` for
   self-service actions, with explicit ownership checks).
3. Validate input with Zod; never trust client-provided ids without an ownership check.
4. Wrap multi-row changes in `db.$transaction`.
5. `recordAudit()` with before/after for privileged or financial changes.
6. Return `{ ok, message?, errors? }` — never throw raw database errors to the client.

## Errors

- `UnauthorizedError` (401) and `ForbiddenError` (403) from `src/server/auth/rbac.ts`.
- Pages redirect to `/login?returnTo=` or `/account?forbidden=1`; actions return `ok: false`.

## Mobile readiness

Business logic lives in `src/features/*` and `src/server/*`, independent of rendering. A
versioned JSON API (`/api/v1`) can expose the same services with Better Auth bearer sessions
when native applications are added; the Zod schemas already describe every input.
