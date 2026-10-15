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
   `privacy.customer_document_retention_days`); purge jobs run from Vercel Cron (M7/M8).
6. **Rights** — `DataRequest` records export and deletion requests; a self-service form is
   delivered in M8. Deletion respects statutory retention of contracts, invoices and incident
   records (pseudonymisation instead of physical deletion where required).
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
