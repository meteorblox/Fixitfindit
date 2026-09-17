# Partner storefront foundation

Run `npm start`, then visit `/shop/home-helper` for a clearly marked demo. Main `/` retains its retailer links. All storefronts render the single `index.html` catalog. Edit `stores.json` to add demo names, slugs, taglines and accent colors. Stable store IDs are reserved for future order attribution. This version uses a text brand mark; uploaded logos and custom domains are not implemented.

This is a preview, not an operational affiliate program. Demo outbound purchase links are disabled. No sales, referral cookies, orders, commissions or payouts are recorded yet. No CJ credentials are read or exposed by this server. Only explicitly listed public assets can be served.

Before enabling partners:

- Integrate CJ product selection, variants, stock and US shipping quotes.
- Add central checkout and a database. Resolve the active storefront on the server and persist its immutable store ID on the order before payment. Never calculate commission from browser-supplied rates or trust a return-page success message.
- Process authenticated payment webhooks idempotently; record commission against the paid order, with refunds and chargebacks reversing it. Snapshot the applicable rate on each order.
- Agree product-level commission rates, return window, payout rules and who handles customer service. Partners must only access their own sales records.
- Add authenticated partner onboarding, approved logo uploads, brand settings, dashboard and payout administration.
- Verify custom domains individually before routing them to a partner.

Railway can use `npm start`; server listens on `PORT` (default 8080). Health endpoint: `/health`. Tests: `npm test`.

## Sandbox attribution and commissions

Approved partner storefronts and the explicit home-helper demo can test attribution. GET visits set an opaque HttpOnly/Secure/SameSite=Lax 30-day cookie. Only its hashed token and partner reference are stored; unsigned partner IDs in forms are ignored. Most recent storefront visit wins until a shipping quote freezes attribution. Partner approval is rechecked when resolving the cookie; visiting the main store does not clear it. Blocking cookies or using another browser prevents attribution.

The order and Stripe metadata retain the partner ID. A signed successful payment event accrues one 500-basis-point commission record per order. Product subtotal is the basis; sales tax and separately charged shipping are excluded. Fractional cents round down. Refund-adjusted earnings are computed from the persisted refund ledger, allocating a refund proportionally across the original total paid. Pending refunds are flagged for review. Duplicate events cannot add another commission. Sandbox amounts are simulations and every payable amount remains zero; payouts are not implemented.

Private operator commands: node affiliate-cli.mjs order ORDER_ID or node affiliate-cli.mjs partner PARTNER_ID. Neither is exposed as a public endpoint. No historical orders receive retroactive attribution. Partner dashboards, payout schedules, payout authorization, chargeback adjustments and production eligibility/review remain launch work.
