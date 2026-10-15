# Security policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Report privately through GitHub Security Advisories for `wouapit999/ridekmer`
(Security → Advisories → "Report a vulnerability") or by contacting the repository owner
directly. Include reproduction steps, impact and any proof of concept. Do not include real
customer data.

We aim to acknowledge reports within 3 working days and to ship a fix for confirmed high or
critical issues within 14 days.

## Scope

- The RideKmer web application and API routes
- Payment, notification, storage and tracking provider adapters in `packages/`
- Infrastructure configuration committed to this repository

Out of scope: third-party providers (MTN, Orange, Vercel, etc.), social engineering, denial of
service, and reports that require physical access to a device.

## Handling sensitive data

- Never commit `.env*` files (except `.env.example`), credentials, certificates, private keys,
  customer documents or logs containing personal data.
- Identity numbers, VINs and bank details are stored encrypted (`src/lib/crypto.ts`).
- Mobile Money PINs, full card numbers, CVVs and raw OTP codes are never stored or logged.
- Logs are redacted (`src/lib/logger.ts`); do not log request bodies from auth or payments.

See `docs/SECURITY.md` for the full security architecture and `docs/PRIVACY.md` for the
data-protection approach.
