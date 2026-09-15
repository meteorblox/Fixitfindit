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
