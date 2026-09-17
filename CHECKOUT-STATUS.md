# Product checkout status

## Production fulfillment backend — September 16, 2026

A separate production worker and signed Stripe live webhook are implemented, but remain disabled. Live checkout creation is still blocked. Automated coverage uses mocked supplier/payment responses; no real order, supplier payment, or customer charge was made for this release.

The worker stages only persisted, signed-webhook-confirmed live payments with a matching US recipient and exact variant. It rechecks stock, shipping method, and contribution before creating an unpaid CJ draft. Confirmation and payment are separate operator commands. Payment requires an explicit maximum in cents and checks the final CJ order amount against that limit and the contribution floor. Persistent claims prevent automatic retries after uncertain mutations; status reconciliation verifies supplier order identity and address before accepting tracking.

Private operator commands: node production-fulfillment-cli.mjs status|submit|sync ORDER_ID; node production-fulfillment-cli.mjs pay ORDER_ID MAX_CENTS. Persistent ORDERS_DB_PATH is required. CJ_PRODUCTION_FULFILLMENT=enabled permits real supplier operations; it has NOT been enabled. LIVE_ORDER_INTAKE=enabled and STRIPE_LIVE_WEBHOOK_SECRET permit /webhooks/stripe-live; these have NOT been configured. Intake alone never submits or pays CJ orders. Do not enable these gates until live checkout preparation and account validation are complete.

Remaining: live checkout with full-address pricing and coordinated quote/session expiry, real-account validation of CJ response fields and charges, refund handling, customer-facing live tracking, authenticated order administration, and the agreed 5% affiliate ledger. Tracking sync is currently manual. Existing sandbox functionality remains available.


Updated September 16, 2026. Repository capabilities below are not proof of deployment.

## Shipping checkout implementation

Product sandbox checkout now asks for a US ZIP, obtains CJ shipping options, and requires a server-stored quote before creating Stripe Checkout. Quotes expire after ten minutes, are bound to the checkout owner, and persist in `shipping_quotes` in the existing `ORDERS_DB_PATH` SQLite database. No new secret or dependency is required. Missing persistent storage disables shipping checkout.

The chosen quote snapshots the exact variant, product price, supplier unit cost, origin, ZIP, method, shipping amount and whether CJ returned enough fee information. Stripe receives one fixed shipping rate with exclusive sales tax. Product revenue, shipping and tax remain separate on the order. Browser-submitted prices are ignored; stock and product price are checked again before creating the session. Stripe payment totals must match the saved shipping amount. The paid address's country/ZIP match is stored separately; an address mismatch does not erase receipt of payment and must block future live fulfillment.

CJ `totalPostageFee` is used when valid; otherwise explicit base postage plus taxes/customs-clearance fees can form the estimate. If fees are missing, sandbox checkout explicitly labels the amount as base postage only. These estimates are not confirmation of final supplier charges. ZIP quotes are not full-address quotes. Stripe's hosted address can change after the quote: the implementation detects this after payment; a live flow must prevent or resolve this before fulfillment. The shipping quote expires for session creation, but the resulting Stripe session can remain open longer; live checkout needs quote/session expiry coordination and a final cost/stock check.

Validation: `npm test` passes 37 tests, including quote persistence/expiry/ownership, fee accounting, amount tampering, stock loss, Stripe shipping totals and address mismatches. All external CJ/Stripe responses in automated tests are fixtures. A deployed sandbox run against the configured accounts is still required.

Remaining step 1 work: verify account configuration and real supplier charges; full-address delivered pricing; authenticated order operations; production CJ submission/payment and tracking verification; refund handling; and a controlled end-to-end test. Live checkout and real supplier ordering remain disabled. Sandbox submission and tracking are implemented through a private operator CLI; see FULFILLMENT.md. Affiliate attribution and commissions are separate work; the agreed future commission is 5% of product subtotal after discounts, excluding shipping and tax.

## Deployed sandbox flow

`/checkout/products` selects an explicitly priced CJ variant, checks supplier stock, creates a Stripe test Checkout Session, collects a test US shipping address, and verifies the returned session's ownership, amount, currency, purpose and paid status on the server.

Approved prices: faucet single black/silver $17; mushroom lamp A–D in walnut/beech $40; baking pan American Standard $90. Exact supplier variant IDs are in `selected-products.mjs`. Multipacks and European baking pans are excluded from checkout.

A $17 silver faucet sandbox payment was completed in the browser on September 15 and the site displayed Stripe-confirmed success. No CJ order or commission was created. Product and variant identifiers are stored in Stripe session metadata. Automated tests cover invalid variants, unavailable stock, live-key rejection, amount/ownership validation and cross-origin posts.

## Required before live sales

- Persistent order storage and signed Stripe webhook support are implemented; verify the production mount and connect the sandbox Stripe endpoint as described below. Authenticated order administration is still required.
- Address-specific delivered costs including applicable supplier fees; agreed pricing and delivery limits. The repository now supports ZIP-based shipping estimates in sandbox checkout; final delivered costs are not verified.
- Stripe automatic-tax sandbox verification. The repository enables automatic tax in product sessions; dashboard configuration and a deployed test still need verification.
- Production CJ fulfillment, tracking verification and refunds. The optional operator CLI only creates CJ sandbox orders; the storefront and webhooks never call supplier mutation APIs.
- Confirm baking pan voltage and other unresolved product specifications before enabling real ordering.
- Partner attribution, commission rate, ledger and payouts. No partner checkout is enabled.

All payment creation rejects live credentials. Live purchases must remain disabled until these tasks are complete.

## Order storage and webhook configuration

Railway volume `fixitfindit-volume` is mounted at `/data`, and `ORDERS_DB_PATH=/data/orders.sqlite` is configured. A fresh $17 black faucet test payment successfully saved an application order on September 15. The Stripe webhook destination/signing secret has not yet been configured; background notifications are not operational until that step is finished. All 21 automated tests pass.

Attach a Railway volume at `/data` and set `ORDERS_DB_PATH=/data/orders.sqlite`. Keep one replica. The SQLite journal and database must stay together on the persistent volume. Node 22.13 or newer is required. The code never silently substitutes temporary storage. Existing test checkout remains available without a configured database, but does not claim application orders are saved.

In the **Stripe sandbox**, add a webhook destination `https://www.fixitfindit.com/webhooks/stripe` for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, and `checkout.session.expired`. Use snapshot events. Set the destination's signing secret in Railway as `STRIPE_WEBHOOK_SECRET` (keep it out of chat and the repository), then deploy.

Until both storage and the signing secret are configured, the webhook returns 503. Invalid signatures and live events are rejected. Authenticated but irrelevant events, including legacy tests without application order IDs, are ignored. Order and event updates commit together, duplicate event IDs are ignored, and delayed events cannot reverse a paid status. Storage errors return 503 for Stripe retries.

The database saves product/price snapshots, payment status and private test recipient details in the sandbox fulfillment queue. No card information is copied. Payment confirmation on return saves the order; only a signed successful-payment webhook can enqueue a sandbox fulfillment job. Queue insertion and payment/event records commit atomically. Recipient or ZIP problems produce a blocked job while preserving the paid record. A private operator CLI can submit, reconcile, simulate payment and refresh sandbox tracking after deployment and explicit sandbox configuration; there is no automatic supplier worker or public fulfillment endpoint.

## Automatic catalog checkout — September 16, 2026

The main storefront now links in-stock catalog variants to sandbox checkout. Product/category/variant membership is resolved on the server; approved products retain their exact approved options. Automatic prices use verified unit cost and eligible total freight, 100% markup and the modeled contribution floor. Client prices are ignored. Quotes are private to the checkout cookie and expire after ten minutes. Stock, supplier price, shipping method, shipping cost and retail price are rechecked before Stripe; a change requires a new quote. Reopening checkout preserves the existing owner cookie.

49 automated tests pass, including generic catalog quote-to-Stripe-to-paid-order recording, tampering, foreign quote owners and cost/stock changes. Payment and fulfillment remain sandbox-only. General catalog orders are recorded but are not approved for the existing selected-variant CJ fulfillment operator. Production payments, full-address price validation, Stripe session/quote expiry coordination, generic production fulfillment, refunds and affiliate attribution remain separate launch work. Partner storefront checkout links remain disabled until attribution is implemented.

## Address-bound checkout verification — September 16, 2026

Product sandbox checkout now requires recipient name, street, optional unit, city, state, and ZIP before quoting. The quote stores the recipient server-side and displays it for review. A per-order Stripe test Customer holds this shipping address for automatic tax; Checkout does not collect or update a different shipping destination. Signed fixed-address webhook events retrieve the Session with its expanded Customer through the authenticated Stripe API before recording payment. The full recipient is compared with the stored snapshot and mismatches block fulfillment. Legacy sessions retain their former ZIP-only verification.

Stripe rejected payment_intent_data.shipping with automatic tax during the account test; the deployed solution uses customer.shipping instead. Sessions expire about 31 minutes after order preparation (one minute accommodates Stripe's minimum 30-minute creation window). Repeated starts reuse an existing open Session. Unknown creation attempts reuse the same request deadline and idempotency key; after the retry window, a fresh quote is required.

Verified on the deployed site with synthetic details and a Stripe test card: faucet $23.50, included shipping $0.00, tax $2.47, total $25.97. The signed webhook was recorded and the sandbox fulfillment job became ready. No CJ purchase or real customer charge occurred. All 69 automated tests passed before the final Stripe configuration correction; targeted address tests passed after correction, followed by the real-account sandbox browser test.

This is not live activation. Stripe live keys remain rejected. CJ freight still uses the ZIP-based quote API; address-format validation is not postal deliverability verification. Live session creation/wiring, production account readiness, customer refunds/policies, and affiliate accounting remain launch work. Do not advertise the store as accepting purchases yet.

## Returns policy — September 16, 2026

Owner chose supplier-backed coverage without a voluntary change-of-mind program. The /returns page now provides support instructions, issue coverage, cancellation and return guidance, while clearly remaining a planned launch policy. Current CJ terms were reviewed; customer remedies and supplier recovery are separate. REFUND-OPERATIONS.md records the private support workflow and remaining refund reconciliation/fulfillment safeguards. No refund API or real payment was invoked. Publishing policy text does not finish the refund implementation.

## Sandbox refund tracking — September 16, 2026

Persistent order-linked refund ledger and private read-only sync/status CLI added. Signed refund notifications trigger an authenticated paginated Stripe refresh; amounts/mode/payment identity are checked, stale concurrent refreshes rejected, missing prior refunds rejected, and duplicate notifications do not double-count. Known refund activity holds further supplier submission/payment for review. Full and partial totals remain separate from original payment status; failed/canceled amounts are excluded from successful totals. This does not issue refunds, cancel CJ shipments, reconcile supplier reimbursements, or implement affiliate reversals. Live refund intake remains disabled/unwired. Configure sandbox webhook events refund.created, refund.updated and refund.failed before automatic delivery verification.

Deployed verification: the existing Stripe sandbox webhook destination now includes refund.created, refund.updated and refund.failed while retaining all checkout events. A read-only sync backfilled the saved $25.97 synthetic faucet order. A $5.00 test refund succeeded, and the real Stripe sandbox notification automatically persisted refundedCents=500, pendingCents=0 and fulfillmentHold=true without a manual sync. No real funds moved or CJ mutation occurred. All 74 automated tests pass. This verifies sandbox tracking, not live refund readiness.
