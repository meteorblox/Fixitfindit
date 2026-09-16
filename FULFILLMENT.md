# CJ sandbox fulfillment

This implements the next part of checkout testing. It does not enable live sales, spend the CJ balance, send customer emails, or ship goods. Deployment and a real-account sandbox run are still outstanding.

## Flow

1. Sandbox Stripe checkout completes with a quoted shipping method and test US recipient details.
2. The signed successful-payment webhook verifies the saved order and inserts one fulfillment job in the same SQLite transaction as the payment/event record. Browser return alone cannot enqueue a job. Duplicate events and different paid events for the same order cannot enqueue duplicates.
3. Missing recipient details, ZIP/country mismatch, missing quotes or unapproved variants create a blocked job. Payment remains recorded. Use a new test checkout with corrected test data; this version has no editor for blocked jobs.
4. An operator runs the CLI in the deployed service environment. `submit` rechecks stock, atomically claims the job, and sends Create Order V2 with fixed `isSandbox=1`, `payType=3`, `orderFlow=1`, and `shopLogisticsType=2`. No live payment endpoint exists in the adapter.
5. `sync` queries the saved CJ ID, or the stable `FITTEST-<application-order-id>` identifier when creation is uncertain. It verifies sandbox mode, custom order identity, destination country, variant and quantity before accepting state or tracking. An unknown or mismatched response requires review.
6. `simulate-payment` uses CJ's sandbox payment endpoint only after checking identity. `simulate-tracking` sets an SBX-prefixed fake tracking number. The operator refreshes state using `sync`; this release does not schedule polling.
7. The owning browser can refresh its Stripe result page to see sandbox status and simulated tracking. It cannot see recipient details or other customers' orders.

## Configuration and commands

Use the existing persistent `ORDERS_DB_PATH`, `CJ_API_KEY`, Stripe test credentials and configured signed Stripe webhook. Set `CJ_FULFILLMENT_MODE=sandbox` only when ready to run the sandbox integration test. Any other value disables CJ fulfillment API access. Keep keys in Railway variables, not command arguments, source code or chat. Node 22.13+ is required.

Run these in the private server environment (not a public HTTP endpoint):

```sh
node fulfillment-cli.mjs list
node fulfillment-cli.mjs submit APPLICATION_ORDER_ID
node fulfillment-cli.mjs sync APPLICATION_ORDER_ID
node fulfillment-cli.mjs simulate-payment APPLICATION_ORDER_ID
node fulfillment-cli.mjs simulate-tracking APPLICATION_ORDER_ID SBX-TEST123
node fulfillment-cli.mjs sync APPLICATION_ORDER_ID
```

CLI output excludes recipient names/addresses and credentials. The private database's `payload_json` does contain the test recipient name/address required by CJ; use synthetic test data only. Database access must remain limited to server operators. These modules and the database are not in the server's public asset allowlist. Retention policy and authenticated live-order administration remain launch requirements.

## Interrupted operations

The `creating` and `paying` states are written before remote mutations. If the connection fails or the process stops, the next command must reconcile using `sync`. `submit` never recreates a claimed job, even across restarts or simultaneous operator runs. Simulated payment is also claimed once.

If reconciliation cannot prove the result, the job stays held with `last_error`; do not delete it, clear its state or create a replacement supplier order. Inspect the matching custom order number in MyCJ. This release does not implement an administrative retry/reset for a definitively rejected request. Use a new sandbox checkout for a new test after reviewing the old job. Tracking/status regressions are ignored; cancellation remains terminal. No claim of exactly-once delivery across a remote system is made.

## Verification and limits

`npm test` passes 37 tests. The new tests exercise signed payment-to-queue-to-CJ-to-tracking using in-memory API fixtures, restart recovery, concurrency, lost creation/payment responses, address validation, database rollback and live-mode rejection. These are not real CJ account calls.

The sandbox adapter is based on CJ's [sandbox documentation](https://developers.cjdropshipping.com/en/api/start/sandbox.html) and [shopping API](https://developers.cjdropshipping.com/en/api/api2/api/shopping.html). A deployed test must confirm account permissions, current response shapes, custom-ID lookup and sandbox payment behavior. If CJ omits `isSandbox` or the expected identity fields, the adapter stops instead of guessing.

Still required before live sales: final full-address supplier costs and product specifications, checkout quote/session expiry coordination, confirmed stock/cost limits at fulfillment, live order approval/payment policy, refunds and chargebacks, customer support, authenticated order administration, and retention rules. The 5% affiliate commission will be implemented separately against product subtotal after discounts, excluding shipping and tax.
