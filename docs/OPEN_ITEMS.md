# Open items

Unresolved requirements, decisions and external dependencies. Owner: product owner unless
stated. Update when resolved (move to `docs/DECISIONS.md` if it became a decision).

## Decisions needed from the owner

| #   | Item                                                                         | Impact              | Default assumed                                                              |
| --- | ---------------------------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------- |
| 1   | Create `wouapit999/ridekmer` and import the code (`docs/GITHUB_WORKFLOW.md`) | blocks Vercel setup | code lives on `wouapit999/wouapit999` branch `claude/clever-hamilton-yn2ghh` |
| 2   | Software licence (`LICENSE`)                                                 | legal               | all rights reserved placeholder                                              |
| 3   | Commission rates per ownership model                                         | pricing             | 20 % managed, 15 % self-managed                                              |
| 4   | Service fee, tax (VAT) treatment, late/cleaning fees                         | pricing             | placeholders in `SystemSetting`                                              |
| 5   | Dual-approval threshold                                                      | finance             | 200 000 XAF                                                                  |
| 6   | Cancellation windows and fees                                                | policy              | 48 h free, 30 % late fee                                                     |
| 7   | Minimum licence seniority and age for self-drive                             | eligibility         | 2 years (FAQ placeholder)                                                    |
| 8   | Retention periods (documents, location, audit)                               | privacy             | 3 years / 90 days / 5 years                                                  |
| 9   | Branch addresses and opening hours for Douala and Yaoundé                    | content             | placeholders                                                                 |
| 10  | Brand assets (final logo, photography licence)                               | design              | original placeholder mark; no vehicle photos                                 |

## External credentials / contracts (block real integrations)

| #   | Provider                                       | Needed                                                  | Status                     |
| --- | ---------------------------------------------- | ------------------------------------------------------- | -------------------------- |
| 11  | MTN Mobile Money                               | merchant onboarding, API credentials, callback approval | not started — mock         |
| 12  | Orange Money                                   | merchant onboarding, API credentials                    | not started — mock         |
| 13  | Card PSP                                       | provider selection + contract                           | not started — mock         |
| 14  | SMS aggregator (Cameroon)                      | sender id, API key                                      | not started — log provider |
| 15  | Email provider (Resend/SMTP)                   | domain verification, API key                            | not started — log provider |
| 16  | WhatsApp Business (Meta Cloud API or BSP)      | business verification, templates approval               | not started — log provider |
| 17  | Telematics provider                            | contract, device purchase, API access                   | not started — mock         |
| 18  | Managed PostgreSQL, Upstash Redis, Vercel Blob | accounts                                                | not started                |
| 19  | Error monitoring (Sentry)                      | account + DSN                                           | optional                   |
| 20  | Certified e-signature provider                 | only if legal review requires it                        | pending review             |

## Technical follow-ups

| #   | Item                                                                                                                                                                                                      | Milestone |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 21  | CSP nonces for scripts (remove `'unsafe-inline'`)                                                                                                                                                         | 8         |
| 22  | Vercel Blob / S3 storage adapters + signed access route                                                                                                                                                   | 2         |
| 23  | Email verification enforcement before booking                                                                                                                                                             | 3         |
| 24  | Phone verification flow in the account area (number added at sign-up is unverified)                                                                                                                       | 2         |
| 25  | Admin UI for document-type editing (read-only table today)                                                                                                                                                | 2         |
| 26  | Vehicle images: upload pipeline and optimisation                                                                                                                                                          | 2         |
| 27  | Generic REST GPS adapter, webhook receiver, fleet map                                                                                                                                                     | 7         |
| 28  | Key-rotation script for field encryption                                                                                                                                                                  | 8         |
| 29  | Public JSON API (`/api/v1`) for native apps                                                                                                                                                               | post-v1   |
| 30  | Static rendering of public pages (currently dynamic because the layout reads the session)                                                                                                                 | 8         |
| 36  | Implement `MtnMomoProvider` from the official MTN MoMo API docs once merchant credentials exist (collections, disbursements, callbacks); sandbox test                                                     | owner     |
| 37  | Implement `OrangeMoneyProvider` from Orange Cameroon merchant API docs; sandbox test                                                                                                                      | owner     |
| 38  | Select a card PSP available in Cameroon and implement `CardProvider` (hosted page + webhook); decide whether genuine card holds are offered                                                               | owner     |
| 39  | Bank transfer: real bank details for `payment.bank_transfer_instructions_*` settings; a pending transfer blocks the vehicle for `payment.bank_transfer_expiry_hours` (24 h placeholder)                   | owner     |
| 40  | Refund payouts for manual methods (cash/bank) are recorded by finance, not executed; decide the operational process and proof required                                                                    | owner     |
| 41  | Card chargebacks: no `CHARGEBACK` ingestion until a PSP is selected                                                                                                                                       | 4+        |
| 42  | Partial payments / payment plans for long-term leases (today the full amount is due at checkout)                                                                                                          | post-v1   |
| 43  | Deposit release after the return inspection: built (settlement → refund request); confirm the one-hour late grace and whether fuel is charged (`pricing.fuel_adjustment_xaf_per_percent` is 0 by default) | owner     |
| 44  | Contract wording (customer rental agreement, owner agreement) must be validated by Cameroonian counsel before launch; OTP-confirmed or certified signature provider to be decided                         | legal     |
| 45  | Inspection photos are uploaded through server actions (4 MB default on Vercel); direct-to-storage uploads for large photo sets                                                                            | 8         |
| 46  | Customer-disputed inspections and incidents are handled manually by staff; a formal dispute workflow with deadlines is not built                                                                          | post-v1   |
| 47  | Maintenance expenses are recorded as PENDING and flow into the ledger/statements in Milestone 6                                                                                                           | 6         |
| 48  | Reminder notifications go by SMS when a number exists, otherwise in-app only (no email variant for reminder templates); confirm channel policy                                                            | owner     |
| 49  | Confirm the retention policy: damage and return charges credited to the owner net of commission (ADR-025); alternative is full pass-through                                                               | owner     |
| 50  | Tax: `pricing.tax_bps` is 0; confirm VAT treatment of commission vs rental and who files it before enabling `tax_payable` postings                                                                        | legal     |
| 51  | Payout execution for Mobile Money uses the mock provider until MTN/Orange disbursement APIs are implemented; bank payouts are manual                                                                      | owner     |
| 52  | Owner statements are CSV + in-app; a PDF rendering with the RideKmer letterhead is not built                                                                                                              | post-v1   |
| 53  | Ledger `payout_clearing` and `fees_receivable` accounts are seeded but unused by the v1 rules (direct cash postings)                                                                                      | 6+        |

## Legal

All items in `docs/LEGAL_REVIEW_CHECKLIST.md` are open.
