# Payment integration

**Production status: NOT ACTIVATED.** MTN Mobile Money, Orange Money and card payments run
through development mock providers until merchant credentials and provider approval exist.
No endpoint, credential or behaviour of a real provider is assumed or invented here.

## Architecture

`@ridekmer/payments` defines `PaymentProvider`:

| Method                               | Purpose                                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `initiatePayment`                    | Start a payment; idempotent per `idempotencyKey`; returns provider reference, status, optional redirect/instruction |
| `getPaymentStatus`                   | Poll the provider                                                                                                   |
| `verifyTransaction`                  | Authoritative server-side check (status **and** amount) before confirming a booking                                 |
| `processWebhook`                     | Parse + verify a provider callback (signature, event id, status)                                                    |
| `initiateRefund` / `getRefundStatus` | Refunds, idempotent                                                                                                 |
| `reconcileTransaction`               | Compare provider state with RideKmer's record                                                                       |
| `initiatePayout` / `getPayoutStatus` | Owner payouts (Mobile Money / bank)                                                                                 |

`capabilities.supportsPreAuthorisation` is `false` for Mobile Money: deposits are **real
debits refunded after return**, never described as holds. Card holds are only enabled once a
card provider that supports them is integrated and the capability flag is set.

## Confirmation rules (apply to every provider)

1. A booking is never confirmed from a browser redirect. Confirmation happens only after
   `verifyTransaction` succeeds or a signature-valid webhook is processed and persisted.
2. Every webhook is stored in `PaymentWebhookEvent` with a unique `(provider, providerEventId)`;
   duplicates are ignored (`REPLAY_REJECTED`) and events outside
   `PAYMENT_WEBHOOK_REPLAY_WINDOW_SECONDS` are rejected.
3. `Payment.idempotencyKey` is unique; retries of the same checkout reuse the same payment.
4. Amounts are integer XAF; the provider amount must equal the expected amount exactly.
5. Payment statuses follow the brief: CREATED → PENDING / REQUIRES_CUSTOMER_ACTION →
   PROCESSING → SUCCESSFUL | FAILED | CANCELLED | EXPIRED, then PARTIALLY_REFUNDED / REFUNDED /
   CHARGEBACK.

## Providers

| Provider         | Env              | Status     | Next step                                                                                                                                                                                                |
| ---------------- | ---------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MTN Mobile Money | `MTN_MOMO_*`     | mock       | Obtain merchant/API credentials from MTN MoMo developer portal; implement `MtnMomoProvider` against the official collection, disbursement and callback documentation; sandbox test; production approval. |
| Orange Money     | `ORANGE_MONEY_*` | mock       | Obtain merchant credentials and API access from Orange Cameroon; implement `OrangeMoneyProvider`; sandbox test; production approval.                                                                     |
| Card             | `CARD_PAYMENT_*` | mock       | Select a card acquirer/PSP available in Cameroon; implement hosted-page redirect + webhook.                                                                                                              |
| Bank transfer    | —                | shell (M4) | Manual confirmation by finance (`payment.record_manual`) with reference and proof.                                                                                                                       |
| Cash             | —                | shell (M4) | Authorised recording only, audited.                                                                                                                                                                      |

Environment variables (`.env.example`): environment selector (`mock | sandbox | production`),
base URL, credentials and webhook secret per provider. Webhook URLs to register with providers
after the production domain exists: `https://<domain>/api/webhooks/payments/mtn-momo`,
`/orange-money`, `/card` (routes delivered in Milestone 4).

## Mock provider behaviour (development / tests)

- `initiatePayment` returns `REQUIRES_CUSTOMER_ACTION`; `simulateCustomerApproval()` or a signed
  mock webhook moves it to `SUCCESSFUL`.
- Payer numbers ending in `00` fail deterministically.
- Webhooks are signed with HMAC-SHA256 (`x-mock-signature`).
- Refunds cannot exceed the captured amount; repeated idempotency keys return the first result.

## Ledger linkage (M6)

Each successful payment creates ledger entries (platform cash ← customer; deposit liability;
commission revenue; owner payable). Refunds and payouts create reversing/settling entries. See
`docs/DATA_MODEL.md`.
