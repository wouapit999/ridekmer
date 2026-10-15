# Architecture

## Overview

RideKmer is a **modular monolith**: one Next.js 16 application (App Router) deployed to Netlify (or Vercel),
backed by a managed PostgreSQL database, with provider-agnostic packages for everything that
talks to the outside world. See `docs/DECISIONS.md` for the reasoning behind each choice.

```
Browser / PWA ──► Edge (proxy.ts: locale routing)
                 └─► Next.js server components, server actions, route handlers
                        ├─ src/server/auth      Better Auth (sessions, OTP, TOTP MFA)
                        ├─ src/server/auth/rbac Roles + granular permissions (server-enforced)
                        ├─ src/server/audit     Append-only audit log
                        ├─ src/server/db        Prisma 7 + pg driver adapter (pooled URL)
                        └─ packages/*           payments · notifications · storage · tracking · contracts
                                │
                 Managed PostgreSQL (Neon/Supabase/…)   Upstash Redis   Vercel Blob / S3
                 Scheduled functions / Cron → /api/cron/*   Provider webhooks → /api/webhooks/*
```

## Layers

| Layer       | Location                                                           | Rules                                                                                                                 |
| ----------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Routes      | `src/app/[locale]/(site)`, `src/app/[locale]/admin`, `src/app/api` | Thin: parse params, call feature code, render.                                                                        |
| Features    | `src/features/<domain>`                                            | Server actions (`"use server"`), queries, client forms. Every action validates with Zod and calls a permission guard. |
| Server core | `src/server`                                                       | Database, auth, RBAC, audit, notification dispatch. No React.                                                         |
| Libraries   | `src/lib`                                                          | Pure helpers (money, dates, phone, crypto, logger, env). Unit-tested.                                                 |
| Packages    | `packages/*`                                                       | Interfaces + adapters for external providers. No knowledge of Prisma or Next.js.                                      |

Dependencies point downwards only: routes → features → server/lib → packages.

## Key cross-cutting rules

1. **Money**: integer XAF everywhere (`Int` columns, `Xaf` type). Percentages in basis points.
   Database `CHECK` constraints reject negative or nonsensical amounts.
2. **Time**: stored UTC (`timestamp(3)`), business logic in `Africa/Douala` (`src/lib/dates.ts`).
3. **Authorisation**: `requirePermission` (pages), `requirePermissionOrThrow` (actions / route
   handlers), `assertPermission` (services). UI only hides what the server already forbids.
4. **Audit**: `recordAudit()` for privileged/financial mutations; `AuditLog`, `LedgerEntry`,
   `BookingPriceSnapshot` and `SignatureEvidence` are append-only via database triggers.
5. **Concurrency**: database exclusion constraints prevent overlapping bookings/holds; `version`
   columns exist on `Vehicle` and `Booking` for optimistic concurrency in later milestones.
6. **Localisation**: `fr` default, `en`; `src/messages/*.json` kept in parity by a unit test.
7. **Secrets**: only read through `getEnv()`; never exposed via `NEXT_PUBLIC_*`.

## Request lifecycle (example: admin suspends a user)

1. `/[locale]/admin/users/[id]` renders after `requirePermission("user.view_all")`.
2. The client form posts to the server action `setUserStatus` (`src/features/admin/actions.ts`).
3. The action calls `requirePermissionOrThrow("user.suspend")`, validates input with Zod,
   refuses self-modification, updates the user and revokes their sessions in one transaction.
4. `recordAudit()` stores before/after state, the reason, IP and user agent.
5. `revalidatePath` refreshes the page.

## Runtime model on serverless hosts (Netlify, Vercel)

- Serverless functions (Node.js runtime) for pages, actions and route handlers. No in-memory
  state is shared between requests; rate limiting uses the database (Better Auth) or Upstash.
- `proxy.ts` runs at the edge for locale negotiation only.
- Scheduled work: Netlify scheduled functions or Vercel Cron → authenticated route handlers (`docs/BACKGROUND_JOBS.md`).
- Files: private object storage with short-lived signed URLs (`packages/storage`).
- Migrations: run explicitly with `prisma migrate deploy` using the direct connection, never
  from function code (`docs/DEPLOYMENT.md`).

## Packages

| Package                   | Interfaces                                                                              | Implementations today                                                                                                                                              |
| ------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@ridekmer/payments`      | `PaymentProvider` (initiate, status, verify, webhook, refund, reconcile, payout)        | `MockPaymentProvider` (dev/preview), `ManualPaymentProvider` (bank transfer, cash), shells for MTN MoMo / Orange Money / card that refuse to run until implemented |
| `@ridekmer/notifications` | `EmailProvider`, `SmsProvider`, `WhatsAppProvider`, `PushProvider`, bilingual templates | `LogNotificationProvider` (dev), `MemoryNotificationProvider` (tests), `GenericHttpSmsProvider` (shell)                                                            |
| `@ridekmer/storage`       | `StorageProvider`, `MalwareScanner`, file validation                                    | `LocalDiskStorageProvider` (dev only), `MemoryStorageProvider` (tests); Vercel Blob / S3 in Milestone 2                                                            |
| `@ridekmer/tracking`      | `TrackingProvider`, `ImmobilisationProvider` (future, interface only)                   | `MockTrackingProvider`                                                                                                                                             |
| `@ridekmer/contracts`     | `renderContract`, checksums                                                             | dependency-free template engine                                                                                                                                    |

## Milestone status

Milestone 1 delivered the foundation above plus the public shell, authentication, RBAC,
administration basics and CI. Later milestones add the booking engine, payments, contracts,
inspections, ledger and telematics on top of the same structure (`docs/IMPLEMENTATION_PLAN.md`).
