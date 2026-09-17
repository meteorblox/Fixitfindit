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

## Private earnings dashboard and payout review

/partners/dashboard uses one-time access codes issued only through the private operator CLI for an approved partner: node partner-access-cli.mjs issue SLUG. Codes expire in 24 hours and are stored only as hashes. Issuing a new code revokes that partner's prior codes and sessions. node partner-access-cli.mjs revoke SLUG revokes access. Deliver codes only to the verified partner through an explicitly authorized channel; do not paste them into public links, logs or the repository. No automatic email delivery is configured. Login creates an eight-hour HttpOnly/Secure/SameSite=Strict cookie. Approval is checked on each request. Customer names, addresses, emails and payment identifiers are excluded. Dashboard HTML is private/no-store and cannot be framed.

Owner approved monthly payout review, $25 minimum, and a 30-day hold. The monthly review uses the first day of the selected month as its cutoff; younger balances carry forward. Run node payout-review-cli.mjs PARTNER_ID YYYY-MM sandbox (or live for a read-only live ledger review). Test/demo orders, refund holds and pending refunds are excluded. The report is not authorization or proof of payment, and cannot send money. All payable fields remain zero. Live settlement requires payment-method enrollment, prior-payout accounting, dispute/fulfillment checks and authorization before release. No partner dashboard should imply a review estimate is an available payout.

## Manual PayPal launch choice

Owner selected manual PayPal. Authenticated partners can save and confirm a PayPal email at /partners/dashboard. It is stored privately, is not sent to PayPal by the form, and is not proof of PayPal ownership. No PayPal API, password or bank details are collected. Payout details cannot change while a prepared payout is awaiting completion.

Private operator workflow: manual-payout-cli.mjs review SLUG YYYY-MM; prepare SLUG YYYY-MM; inspect PAYOUT_ID; record-paid PAYOUT_ID PAYPAL_REFERENCE AMOUNT_CENTS. Preparation and recording require MANUAL_PAYPAL_PAYOUTS=enabled, which is NOT configured. Commands never send money. Preparation freezes the recipient and amount and reserves that partner's balance; repeated preparation reuses the monthly record. Reviews subtract prior paid amounts, including the effect of subsequent refunds, before applying the $25 minimum. A unique PayPal reference prevents duplicate transaction recording. Record only after verifying the payment actually succeeded in PayPal; uncertain payments remain prepared and must not be sent again. Recheck current refunds, eligibility, recipient ownership and prior PayPal transactions immediately before sending. Use the appropriate business payout/payment flow and account fees; do not classify commissions as personal gifts.

If a prepared payment was definitely never sent, cancel-unsent PAYOUT_ID releases its reservation; that month's canceled record remains retained. A subsequent eligible monthly review can prepare a new payout. Do not cancel an uncertain or completed external payment. Live sales, payout preparation and payment recording remain disabled. The dashboard currently shows sandbox earnings only.

## Affiliate enrollment and branding — 2026-09-17

Applications are open at /partners with manual approval. Approved records are genuine partners rather than demo stores; live checkout still controls whether sales can begin. The home-helper demo remains a demo and is excluded from live referral resolution. The application page explicitly distinguishes open enrollment from closed customer checkout. Terms shown remain 5%, monthly manual PayPal, 30-day hold, $25 minimum, refund adjustments and no guaranteed earnings.

Current partner branding is a storefront name and initial-based mark, plus configured accent color and tagline. Uploaded custom logos and self-service brand editing are not implemented. The main site's favicon is a small vector version of its orange pin/navy wrench mark, served from /favicon.svg and linked from the storefront and owner/partner dashboards.

## Self-service logos — 2026-09-17

Approved partners can now upload, replace and remove their storefront logo under Partner dashboard > Storefront logo. Accepts PNG, JPEG and WebP up to 512 KB, stored persistently in SQLite. SVG and other formats are rejected. Access is scoped to the signed-in partner and POST requests require the site's Origin. Logos are served as fixed raster content types with nosniff and a restrictive CSP from /partner-logos/SLUG. Uploaded filenames and external URLs are never used. A versioned URL refreshes replacements; removing a logo restores the initial-based mark. Storefront header and footer show the logo alongside the storefront name. Demo stores cannot upload.

This supersedes the earlier note that custom logo uploads were unavailable. The main FixItFindIt logo and affiliate commission rules are unchanged.

## Owner affiliate management — 2026-09-17

The owner dashboard now links Orders and Affiliates under the same owner login. /owner/orders/affiliates privately lists applications and live earnings, recorded manual payouts, refund holds and saved PayPal destinations. Pending applications can be approved with a unique storefront slug using an owner-authenticated CSRF-protected form. Approval does not email access credentials, send money or change payout policy. Partner dashboard access codes and payout execution remain the existing operator/manual workflows. No real applications were approved during verification.

## Partner email sign-in — 2026-09-17

Approved partners request their own sign-in link at /partners/dashboard using their application email. This replaces the normal operator-issued code workflow. Uses existing RESEND_API_KEY and OWNER_EMAIL_FROM; no additional Railway variables are required. Pending and unknown addresses receive the same generic page response without email. Links are hashed in persistent SQLite, expire after 15 minutes, and are consumed once by a CSRF-protected confirmation POST. GET requests do not consume links. Successful sign-in rechecks approval and scopes the session to that partner. Requests are limited to one per minute and five per hour per partner. Existing operator codes remain a recovery path. No real applications were approved or affiliate emails sent during automated verification.
