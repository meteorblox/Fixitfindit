# Product checkout status

Updated September 15, 2026.

## Deployed sandbox flow

`/checkout/products` selects an explicitly priced CJ variant, checks supplier stock, creates a Stripe test Checkout Session, collects a test US shipping address, and verifies the returned session's ownership, amount, currency, purpose and paid status on the server.

Approved prices: faucet single black/silver $17; mushroom lamp A–D in walnut/beech $40; baking pan American Standard $90. Exact supplier variant IDs are in `selected-products.mjs`. Multipacks and European baking pans are excluded from checkout.

A $17 silver faucet sandbox payment was completed in the browser on September 15 and the site displayed Stripe-confirmed success. No CJ order or commission was created. Product and variant identifiers are stored in Stripe session metadata. Automated tests cover invalid variants, unavailable stock, live-key rejection, amount/ownership validation and cross-origin posts.

## Required before live sales

- Persistent application order storage and authenticated order administration. Stripe metadata is not an application order database.
- Signed Stripe webhooks with idempotent order updates, including payments where the customer never returns to the website.
- Address-specific delivered costs including applicable supplier fees; agreed pricing and delivery limits. The current product simulation charges $0 shipping and does not calculate tax.
- Stripe automatic-tax integration and sandbox verification. Dashboard setup alone does not enable tax in these sessions.
- CJ fulfillment workflow, tracking and refunds; no supplier order API is called by this code.
- Confirm baking pan voltage and other unresolved product specifications before enabling real ordering.
- Partner attribution, commission rate, ledger and payouts. No partner checkout is enabled.

All payment creation rejects live credentials. Live purchases must remain disabled until these tasks are complete.
