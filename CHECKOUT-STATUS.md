# Product checkout status

Updated September 15, 2026.

## Deployed sandbox flow

`/checkout/products` selects an explicitly priced CJ variant, checks supplier stock, creates a Stripe test Checkout Session, collects a test US shipping address, and verifies the returned session's ownership, amount, currency, purpose and paid status on the server.

Approved prices: faucet single black/silver $17; mushroom lamp A–D in walnut/beech $40; baking pan American Standard $90. Exact supplier variant IDs are in `selected-products.mjs`. Multipacks and European baking pans are excluded from checkout.

A $17 silver faucet sandbox payment was completed in the browser on September 15 and the site displayed Stripe-confirmed success. No CJ order or commission was created. Product and variant identifiers are stored in Stripe session metadata. Automated tests cover invalid variants, unavailable stock, live-key rejection, amount/ownership validation and cross-origin posts.

## Required before live sales

- Persistent order storage and signed Stripe webhook support are implemented; verify the production mount and connect the sandbox Stripe endpoint as described below. Authenticated order administration is still required.
- Address-specific delivered costs including applicable supplier fees; agreed pricing and delivery limits. The current product simulation charges $0 shipping and does not calculate tax.
- Stripe automatic-tax integration and sandbox verification. Dashboard setup alone does not enable tax in these sessions.
- CJ fulfillment workflow, tracking and refunds; no supplier order API is called by this code.
- Confirm baking pan voltage and other unresolved product specifications before enabling real ordering.
- Partner attribution, commission rate, ledger and payouts. No partner checkout is enabled.

All payment creation rejects live credentials. Live purchases must remain disabled until these tasks are complete.

## Order storage and webhook configuration

Railway volume `fixitfindit-volume` is mounted at `/data`, and `ORDERS_DB_PATH=/data/orders.sqlite` is configured. A fresh $17 black faucet test payment successfully saved an application order on September 15. The Stripe webhook destination/signing secret has not yet been configured; background notifications are not operational until that step is finished. All 21 automated tests pass.

Attach a Railway volume at `/data` and set `ORDERS_DB_PATH=/data/orders.sqlite`. Keep one replica. The SQLite journal and database must stay together on the persistent volume. Node 22.13 or newer is required. The code never silently substitutes temporary storage. Existing test checkout remains available without a configured database, but does not claim application orders are saved.

In the **Stripe sandbox**, add a webhook destination `https://www.fixitfindit.com/webhooks/stripe` for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, and `checkout.session.expired`. Use snapshot events. Set the destination's signing secret in Railway as `STRIPE_WEBHOOK_SECRET` (keep it out of chat and the repository), then deploy.

Until both storage and the signing secret are configured, the webhook returns 503. Invalid signatures and live events are rejected. Authenticated but irrelevant events, including legacy tests without application order IDs, are ignored. Order and event updates commit together, duplicate event IDs are ignored, and delayed events cannot reverse a paid status. Storage errors return 503 for Stripe retries.

The current database saves product/price snapshots and payment status only; it does not copy contact details or card information. Shipping information remains in Stripe. Payment confirmation on return also saves the order, but webhooks must be connected to handle customers who never return. No paid state triggers fulfillment yet.
