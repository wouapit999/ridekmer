# Privacy and data protection

Nothing here is legal advice. Cameroon's data-protection framework (including Law No.
2024/017 on personal data protection, as applicable) must be assessed by qualified counsel —
see `docs/LEGAL_REVIEW_CHECKLIST.md`.

## Principles implemented

1. **Minimisation** — only data needed for rentals, KYC and safety is collected. Mobile Money
   PINs, full card numbers, CVVs and raw OTP values are never stored.
2. **Purpose limitation** — GPS data is used for vehicle security, recovery and incident
   handling; never for profiling customers.
3. **Transparency** — the privacy notice and rental agreement disclose tracker usage, document
   processing and retention (public pages are placeholders pending legal validation).
4. **Access control** — identity documents and location data require specific permissions;
   every location access is written to `TrackingAccessLog`; document access events are
   audited (M2).
5. **Retention** — configurable via `SystemSetting` (`tracking.location_retention_days`,
   `privacy.customer_document_retention_days`, `privacy.notification_retention_days`,
   `privacy.webhook_event_retention_days`, `privacy.hold_retention_days`); the
   `tracking-retention` and `housekeeping` cron jobs enforce them (ADR-032).
6. **Rights** — self-service under Account → Privacy: a JSON export of the person's data
   (audited, rate limited, encrypted identifiers excluded) and a deletion request with a
   grace period (`privacy.account_deletion_grace_days`, 30 days) during which the person can
   cancel. Deletion is anonymisation of the `User` row (name, e-mail, phone replaced; identity
   numbers, payout details, documents, sessions, credentials, push subscriptions and
   addresses removed) rather than physical deletion: audit, ledger, booking, payment and
   contract rows are kept for statutory retention without identifying the person. Requests
   are refused while a booking is in flight, an owner balance is outstanding or a vehicle is
   still listed. Staff process early or reject requests under Administration → Data
   requests (`user.suspend`).
7. **Security** — see `docs/SECURITY.md` (encryption, redaction, signed URLs).

## Processing inventory (initial)

| Data                                              | Subject                                         | Purpose                           | Storage                                          | Retention (placeholder)     |
| ------------------------------------------------- | ----------------------------------------------- | --------------------------------- | ------------------------------------------------ | --------------------------- |
| Name, email, phone                                | all users                                       | account, notifications            | PostgreSQL                                       | account lifetime + 1 year   |
| Identity document, driving licence                | customers, owners, chauffeurs                   | eligibility, fraud prevention     | private object storage (encrypted numbers in DB) | 3 years after last booking  |
| Company documents                                 | corporate owners                                | KYB                               | private object storage                           | contract lifetime + 5 years |
| Payment references                                | customers, owners                               | payments, payouts, reconciliation | PostgreSQL                                       | 10 years (accounting)       |
| Contracts and signature evidence (IP, user agent) | signatories                                     | proof of acceptance               | PostgreSQL / storage                             | 10 years                    |
| Inspection photos                                 | vehicles (may show people incidentally)         | condition evidence                | private storage                                  | booking + 2 years           |
| GPS location, trips                               | vehicles (during rentals, linked to a customer) | security, recovery, incidents     | PostgreSQL                                       | 90 days (configurable)      |
| Audit logs                                        | staff and users                                 | accountability                    | PostgreSQL (append-only)                         | 5 years                     |

## Sub-processors (to be confirmed)

Vercel (hosting), managed PostgreSQL provider, Upstash (Redis), object-storage provider,
email/SMS/WhatsApp providers, MTN MoMo and Orange Money, card provider, telematics provider.
Each needs a data-processing agreement before production.

## Third-party trackers on the site

None. No analytics or advertising scripts are loaded in Milestone 1.
