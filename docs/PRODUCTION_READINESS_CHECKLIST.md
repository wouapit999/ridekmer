# Production readiness checklist

Re-evaluated at the end of Milestone 8 (2026-10-15). ✅ done · ⬜ open (account owner,
vendor or counsel) · ⚠️ built but unverified against a live service.

## Code and quality

- ✅ `pnpm check` green (format, lint, typecheck, unit tests, build)
- ✅ Integration tests against PostgreSQL (RBAC, constraints, search, bookings, payments,
  provider configuration, handover, finance, tracking, privacy and housekeeping)
- ✅ Playwright end-to-end flows (public site, auth, owner onboarding, customer booking with
  mock payment, handover, finance, fleet, privacy, PWA, accessibility)
- ✅ `pnpm audit --prod --audit-level=high` green; overrides documented (ADR-035); CI gate
- ✅ Coverage report produced in CI (`pnpm test:coverage`)
- ✅ Git working tree clean at commit; no secrets committed (`.gitignore`, review)

## Security

- ✅ Secure headers, CSP (worker/manifest allowed, framing denied), HSTS
- ✅ Staff MFA enforcement, auth rate limiting, application rate limits (ADR-031), session
  revocation
- ✅ Field encryption with key rotation procedure and script; log redaction; append-only audit
- ✅ Deep health check behind the cron secret; boot-time environment validation; unhandled
  errors logged with redaction
- ⬜ Error-monitoring SDK installed and alert routing decided (OPEN_ITEMS 59)
- ⬜ CSP nonces (OPEN_ITEMS 60), Vercel Firewall / bot protection (account owner)
- ⬜ Independent penetration test and load test before launch (OPEN_ITEMS 64)

## Data, privacy and operations

- ✅ Migrations committed (11); deploy procedure documented; `migrate status` in CI
- ✅ Demo data impossible in production (guard + env assertion)
- ✅ Retention purges (location history, housekeeping) and account anonymisation with grace
  period; self-service export; admin data-requests page (ADR-032)
- ✅ Runbook: daily checks, first super administrator, secret and key rotation, data-subject
  requests, incident response
- ⬜ Retention periods and anonymisation scope validated by counsel (OPEN_ITEMS 61)
- ⬜ Production database with PITR; backup job and restore test (`docs/BACKUP_AND_RECOVERY.md`)
- ⬜ Secrets in a password manager; key custody for `APP_ENCRYPTION_KEY`
- ⬜ Upstash Redis provisioned (required by `getEnv()` in production for rate limits)

## Integrations (accurate status)

- ⬜ MTN Mobile Money — **mock**; shell provider refuses to run; admin configuration page
  ready for credentials; implementation pending merchant onboarding (OPEN_ITEMS 36)
- ⬜ Orange Money — **mock**; same as above (OPEN_ITEMS 37)
- ⬜ Card provider — **mock**; provider not selected (OPEN_ITEMS 38)
- ⬜ SMS / e-mail / WhatsApp — **log providers**; generic HTTP SMS adapter exists; vendors not
  selected
- ⬜ GPS — **mock**; generic REST shell refuses to pull; push contract documented; vendor not
  contracted (OPEN_ITEMS 54); immobilisation has no provider by design (ADR-029)
- ⚠️ Object storage — Vercel Blob / S3 adapters implemented and unit-tested; health check
  probes the configured store; not yet verified against a live bucket
- ⬜ Map tiles — OpenStreetMap public tiles by default; commercial provider needed
  (OPEN_ITEMS 55)

## Product

- ✅ French and English interfaces (parity-tested), XAF formatting, Africa/Douala time zone
- ✅ Mobile-first layout, keyboard-accessible forms, visible focus, skip link, axe-core
  WCAG 2.1 A/AA scans without serious or critical violations on public, customer and admin
  pages
- ✅ Public marketing and legal pages prerendered per locale (ADR-033); home page on demand
- ✅ PWA: manifest, icons, service worker with offline pages and update prompt (ADR-034)
- ✅ Owner onboarding, vehicle onboarding, documents, catalogue, pricing, bookings, payments
  (mock), contracts, inspections, deposits, incidents, maintenance, ledger, statements,
  payouts, telematics abstraction, fleet map, geofences, immobilisation workflow
- ⬜ Manual accessibility audit with assistive technology (OPEN_ITEMS 62)
- ⬜ Web push notifications (OPEN_ITEMS 65)

## Legal

- ⬜ All items in `docs/LEGAL_REVIEW_CHECKLIST.md` remain open and visibly flagged in the UI
  (contract wording, deposit wording, signature method, tracker disclosure, retention,
  immobilisation conditions, tax treatment)
- ⬜ Licence decision

## Deployment

- ⬜ Repository `wouapit999/ridekmer` created and connected to Vercel
  (`docs/GITHUB_WORKFLOW.md`)
- ⬜ Environment variables set per `docs/VERCEL_SETUP.md` (including `CRON_SECRET`,
  Upstash, storage, `MAP_TILE_URL_TEMPLATE`)
- ⬜ Custom domain, provider webhook URLs, cron schedules verified in Vercel → Cron Jobs
- ⬜ First production deployment smoke test: `/api/health` with the cron secret reports every
  check `ok`
