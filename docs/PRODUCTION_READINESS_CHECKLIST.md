# Production readiness checklist

Milestone 1 status is shown; the list is re-evaluated at every milestone. ✅ done · ⬜ open ·
🔜 later milestone.

## Code and quality

- ✅ `pnpm check` green (format, lint, typecheck, unit tests, build)
- ✅ Integration tests against PostgreSQL (RBAC, constraints, search)
- ✅ Playwright smoke tests (public site, auth, authorisation)
- ✅ Git working tree clean at commit; no secrets committed (`.gitignore`, review)
- 🔜 Full test matrix from the brief (pricing, bookings, payments, payouts, inspections)

## Security

- ✅ Secure headers, CSP, HSTS
- ✅ Staff MFA enforcement, rate limiting, session revocation
- ✅ Field encryption, log redaction, append-only audit
- ⬜ CSP nonces, external error monitoring, WAF (account owner)
- ⬜ Independent security review before launch

## Data and operations

- ✅ Migrations committed; deploy procedure documented
- ✅ Demo data impossible in production (guard + env assertion)
- ⬜ Production database with PITR; backup job and restore test
- ⬜ Secrets stored in a password manager; key custody for `APP_ENCRYPTION_KEY`

## Integrations (accurate status)

- ⬜ MTN Mobile Money — **mock**; pending merchant credentials and approval
- ⬜ Orange Money — **mock**; pending merchant credentials and approval
- ⬜ Card provider — **mock**; provider not selected
- ⬜ SMS / email / WhatsApp — **log providers**; vendors not selected
- ⬜ GPS — **mock**; telematics provider not contracted
- ⬜ Object storage — Vercel Blob / S3 adapters implemented, pending verification against a live store

## Product

- ✅ French and English interfaces, XAF formatting, Africa/Douala time zone
- ✅ Mobile-first layout, keyboard-accessible forms, visible focus, skip link
- ✅ Owner onboarding, vehicle onboarding, document lifecycle, vehicle approval (M2)
- 🔜 Booking, payments, contracts, inspections, ledger, telematics (M3–M7)
- 🔜 Service worker, offline page, update notification (M8)

## Legal

- ⬜ All items in `docs/LEGAL_REVIEW_CHECKLIST.md` remain open and visibly flagged in the UI
- ⬜ Licence decision

## Deployment

- ⬜ Repository `wouapit999/ridekmer` created and connected to Vercel
- ⬜ Environment variables set per `docs/VERCEL_SETUP.md`
- ⬜ Custom domain, webhook URLs, cron secret configured
