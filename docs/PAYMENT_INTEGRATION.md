# Payment integration

**Production status: NOT ACTIVATED for Mobile Money and cards.** MTN Mobile Money, Orange
Money and card payments run through a clearly labelled development mock in development and
preview; in production these methods are simply unavailable until merchant credentials and
provider approval exist and the adapters are implemented from the providers' official
documentation. Nothing about a real provider's endpoints, payloads or behaviour is assumed or
invented in this code base. Bank transfer and cash are production-ready **manual** methods.

## Architecture

`@ridekmer/payments` defines `PaymentProvider`:

| Method                               | Purpose                                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `initiatePayment`                    | Start a payment; idempotent per `idempotencyKey`; returns provider reference, status, optional redirect/instruction |
| `getPaymentStatus`                   | Poll the provider                                                                                                   |
| `verifyTransaction`                  | Authoritative server-side check (status **and** amount) before confirming a booking                                 |
| `processWebhook`                     | Parse + verify a provider callback (signature, event id, status, amount)                                            |
| `initiateRefund` / `getRefundStatus` | Refunds, idempotent                                                                                                 |
| `reconcileTransaction`               | Compare provider state with RideKmer's record                                                                       |
| `initiatePayout` / `getPayoutStatus` | Owner payouts (Mobile Money / bank) — used from Milestone 6                                                         |

Implementations:

| Class                   | Environment            | Role                                                                                                      |
| ----------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------- |
| `MockPaymentProvider`   | `mock`                 | In-memory simulation for development, preview and tests. Signed HMAC webhooks, deterministic failures.    |
| `ManualPaymentProvider` | `production`           | Bank transfer and cash. Records intent only; finance confirms receipt. No webhooks, no automatic refunds. |
| `MtnMomoProvider`       | `sandbox`/`production` | **Shell.** Validates `MTN_MOMO_*` configuration, then refuses every call with `NOT_IMPLEMENTED`.          |
| `OrangeMoneyProvider`   | `sandbox`/`production` | **Shell.** Same contract for `ORANGE_MONEY_*`.                                                            |
| `CardProvider`          | `sandbox`/`production` | **Shell.** Hosted-page model (card data never touches RideKmer); PSP to be selected (OPEN_ITEMS #38).     |

`src/server/payments/registry.ts` picks the implementation per method from the environment:
`*_ENVIRONMENT=mock` → mock (refused in production: the method becomes unavailable),
`sandbox|production` → the shell (which throws `NOT_CONFIGURED` when credentials are missing).
Mock state is cached per process so the server action that initiates a payment and the route
that receives its mock webhook share it; a signed webhook for an unseen reference is
materialised, so a cold start between the two does not break the simulation.

`capabilities.supportsPreAuthorisation` is `false` for Mobile Money: deposits are **real debits
refunded after return**, never described as holds (ADR-017). Card holds appear only once a PSP
that supports them is integrated and the capability flag is set.

## Admin configuration (`/admin/settings/payments`)

Everything the payment layer needs is configurable by a `settings.manage` holder without a
redeploy:

- **Methods and rules**: `payment.bank_transfer_enabled`, `payment.cash_enabled`, bank-transfer
  instructions (FR/EN), Mobile Money expiry, bank-transfer expiry, `finance.dual_approval_threshold_xaf`,
  `booking.payment_timeout_minutes` (typed controls, audited `setting.update`).
- **Providers** (`PaymentProviderConfig`, one row per provider): enabled flag, environment
  (`mock | sandbox | production`), base URL, card PSP identifier, and credentials. Credentials are
  encrypted at rest (AES-256-GCM with `APP_ENCRYPTION_KEY`), stored as one blob, and never returned
  to the browser: the page only shows which fields are set and whether they come from the admin
  configuration or from environment variables. The audit log records field **names** only.
- **Resolution order**: an admin row wins for enabled/environment/base URL; credentials merge field
  by field over the `MTN_MOMO_*`, `ORANGE_MONEY_*`, `CARD_PAYMENT_*` environment variables, so a
  secret kept in Vercel still applies when the admin leaves the field empty. The registry re-reads
  the configuration within 15 seconds (immediately in the process that saved it).
- **Validate configuration** checks completeness without any network call (`OK_MOCK`, `OK_SHELL`,
  `NOT_CONFIGURED`, `DISABLED`, `MOCK_IN_PRODUCTION`). A real connectivity test only becomes
  possible once an adapter is implemented.
- The webhook URL to register with each provider is displayed on the card.

## Checkout flow (`src/features/payments/service.ts`)

1. `initiatePaymentForBooking` — booking must be `PAYMENT_PENDING` and belong to the caller;
   the method must be available; Mobile Money needs a valid Cameroon number (stored masked).
   The booking row is locked; an open payment with the same method is reused (idempotent
   re-entry), a different method supersedes it, a fully paid booking is refused. Amount =
   rental total + deposit from the latest price snapshot (`Payment.depositXaf` keeps the
   split). The provider is then called with `idempotencyKey = pay_<booking>_RENTAL_<n>`; a
   `PaymentAttempt` records the result. A pending bank transfer extends
   `Booking.paymentDueAt` to the transfer expiry.
2. Customer waits on `/account/bookings/<id>/pay`; the page polls `refreshPaymentStatus`
   (server-side provider poll) every 6 s. In non-production with a mock provider the page
   shows **Simulate approval / decline** buttons that build a signed mock webhook and push it
   through the real ingestion path.
3. `ingestPaymentWebhook` (ADR-018): adapter parses + verifies the signature → event stored in
   `PaymentWebhookEvent` (unique `(provider, providerEventId)`; duplicates →
   `REPLAY_REJECTED`, 200) → invalid signature → `IGNORED`, 401 → outside
   `PAYMENT_WEBHOOK_REPLAY_WINDOW_SECONDS` → `REPLAY_REJECTED`, 200 → payment looked up by
   provider + reference → `verifyTransaction(reference, amount)` → only an exact match reaches
   `applySuccessfulPayment`.
4. `applySuccessfulPayment` (the only confirmation path) locks the payment, marks it
   `SUCCESSFUL`, audits, confirms the booking through `confirmBookingAfterPayment` when the
   paid total covers the amount due, and sends `payment_successful` + `booking_confirmed`.
5. Failures: `FAILED | CANCELLED | EXPIRED` close the payment; the customer can retry, which
   creates a new payment with a new idempotency key. `/api/cron/expire-holds` still cancels the
   booking at `paymentDueAt`.

## Manual methods

- Bank transfer (customer-selectable when `payment.bank_transfer_enabled`): instructions come
  from `payment.bank_transfer_instructions_fr|en`; finance confirms with
  `confirmManualPayment` (`payment.record_manual`) and the reference of the transfer.
- Cash (staff only when `payment.cash_enabled`): `recordManualPayment` on the admin booking
  page for the **exact** amount due, with a receipt reference and note; audited.

## Refunds (ADR-020)

`requestRefund` (`refund.request`) → `PENDING_APPROVAL` → `decideRefund` by one approver
(`refund.approve`, not the requester) or two distinct approvers when the amount ≥
`finance.dual_approval_threshold_xaf` → `executeRefund` calls `initiateRefund`; mock refunds
complete immediately, manual ones stay `PROCESSING` until finance records the payout reference
(`completeRefund`). `Payment.refundedXaf` and `PARTIALLY_REFUNDED | REFUNDED` follow. Cancelling
a paid booking opens the request automatically (net of the cancellation fee).

## Reconciliation (`/api/cron/reconcile-payments`, every 15 min)

Expires open payments past `expiresAt`, polls open provider payments (same verification gate),
and calls `reconcileTransaction` for settled payments not reconciled in the last 24 h (45-day
window). Mismatches are audited as `payment.reconcile.discrepancy` and listed in the admin
payment detail.

## Providers

| Provider         | Env              | Status                       | Next step                                                                                                                                                                 |
| ---------------- | ---------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MTN Mobile Money | `MTN_MOMO_*`     | mock (dev) / shell (prod)    | Obtain merchant/API credentials; implement `MtnMomoProvider` against the official collection, disbursement and callback documentation; sandbox test; production approval. |
| Orange Money     | `ORANGE_MONEY_*` | mock (dev) / shell (prod)    | Obtain merchant credentials; implement `OrangeMoneyProvider`; sandbox test; production approval.                                                                          |
| Card             | `CARD_PAYMENT_*` | mock (dev) / shell (prod)    | Select a PSP available in Cameroon; implement hosted-page redirect + webhook; decide on genuine holds.                                                                    |
| Bank transfer    | settings         | **manual, production-ready** | Enter real bank details in settings; define the finance confirmation routine.                                                                                             |
| Cash             | settings         | **manual, production-ready** | Define receipt numbering at branches.                                                                                                                                     |

Webhook URLs to register once the production domain exists:
`https://<domain>/api/webhooks/payments/mtn-momo`, `/orange-money`, `/card`, each with the
matching `*_WEBHOOK_SECRET`. The same slug is used in mock and real mode, so switching
environments never changes a registered URL.

## Mock provider behaviour (development / tests)

- `initiatePayment` returns `REQUIRES_CUSTOMER_ACTION`; a signed mock webhook (built by
  `buildWebhook`) or `simulateCustomerApproval()` moves it to `SUCCESSFUL`.
- Payer numbers ending in `00` fail deterministically.
- Webhooks are signed with HMAC-SHA256 in `x-mock-signature`; the amount in the signed event
  becomes the provider's settled amount, which is how amount-mismatch handling is tested.
- Unknown references report `PENDING` (never a false failure after a restart).
- Refunds cannot exceed the captured amount; repeated idempotency keys return the first result.

## Security notes

- No Mobile Money PIN, card number, CVV or raw OTP is ever accepted, logged or stored. Payer
  numbers are stored masked (`+237 *** 456`).
- Provider secrets live only in server environment variables; nothing is exposed via
  `NEXT_PUBLIC_*`.
- Webhook bodies are limited to 64 KB, stored with a SHA-256 hash, and never echoed back.
- Every state change is audited (`payment.*`, `refund.*`); finance actions require MFA.

## Ledger linkage (built in Milestone 6)

`applySuccessfulPayment`, `completeRefund`, `settleReturnDeposit`, expense allocation and
payout payment each post double-entry lines through `src/features/finance/ledger.ts`
(ADR-024). A successful rental payment debits `platform_cash` and credits
`customer_deposits_held` (deposit), `owner_payable:<owner>` (owner share), `tax_payable` and
`platform_revenue`. Refunds reverse the deposit first and then share the rental part
proportionally (ADR-025). The reconciliation and statements crons post any missing entries.
