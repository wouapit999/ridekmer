# Assumptions

Assumptions made while building RideKmer. Each one should be confirmed or corrected by the
product owner; corrections are tracked in `docs/OPEN_ITEMS.md`.

## Business

1. **RideKmer is the merchant of record** for customer payments. Owners are paid out by
   RideKmer after commission and deductions, under the owner agreement.
2. **Default commission** on marketplace and managed vehicles is a configurable percentage
   stored in `SystemSetting` (seeded at 20 % for managed, 15 % for self-managed; placeholder
   values to be confirmed).
3. **Security deposits** collected by Mobile Money are real debits that are refunded after
   the return inspection, because MTN MoMo and Orange Money do not expose a hold/pre-
   authorisation operation that RideKmer can rely on. Card deposits may use a hold only once
   a card provider that supports it is integrated.
4. **Minimum rental unit is one day**; hourly rentals are out of scope for v1. Partial days
   round up to a full day, computed in `Africa/Douala`.
5. **Customers must be verified** (identity document + driving licence reviewed) before a
   self-drive booking can be confirmed. Chauffeur-driven bookings require identity only.
6. **Initial cities** are Douala and Yaoundé, seeded as data; any city can be added later by
   an administrator.
7. **Pricing is quoted in XAF** inclusive of configured taxes; the tax configuration is a
   placeholder until the accountant confirms VAT treatment.
8. **Dual approval threshold** for refunds and payouts defaults to 200 000 XAF (configurable).

## Technical

1. The repository root is the Next.js application and the Vercel "root directory".
2. Production database is a managed PostgreSQL (Neon, Supabase or equivalent) reachable from
   Vercel. A pooled connection string is used at runtime and a direct connection string for
   migrations.
3. Background work runs through Vercel Cron Jobs hitting authenticated route handlers, plus
   provider webhooks. No always-on worker is assumed (see `docs/BACKGROUND_JOBS.md`).
4. Private files are stored in Vercel Blob (private access) or S3-compatible storage; the
   local filesystem is never used for uploads in production.
5. Redis (Upstash) is optional in development (in-memory fallback) and required in
   production for rate limiting and short-lived locks.
6. Email, SMS, WhatsApp, GPS and payment providers are all behind interfaces. Until
   credentials exist, the **mock/dev-log providers** are used and are labelled as such.
7. Electronic signatures are **click-to-accept with evidence capture**, not certified
   signatures, until a certified provider is integrated and legal review confirms the need.
8. Demo data is only seeded when `NODE_ENV !== "production"` **and** `ALLOW_DEMO_SEED=true`.
9. The default UI language is French (`fr`); English (`en`) is fully supported.
10. Phone numbers are stored in E.164; Cameroon numbers are validated with
    `libphonenumber-js`; international numbers are accepted when flagged as such.

## Legal / compliance (require professional validation)

All items listed in `docs/LEGAL_REVIEW_CHECKLIST.md` are assumed **unvalidated**. Nothing in
this repository is legal advice.
