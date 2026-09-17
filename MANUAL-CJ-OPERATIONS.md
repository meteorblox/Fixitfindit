# Manual CJ payment workflow

Owner selected manual CJ supplier payment for launch on 2026-09-17. This is separate from manual PayPal partner payouts.

CJ_PAYMENT_MODE defaults to manual. The production CLI blocks pay before confirmation or deduction, and the CJ adapter independently refuses wallet deductions unless explicitly configured for wallet mode. Draft creation continues to use payType=3 (unpaid). No supplier funds are spent by this configuration.

Private operator workflow (Railway console):
1. Run node production-fulfillment-cli.mjs list to see paid customer orders staged for review, supplier reference, refund holds and tracking status.
2. After live fulfillment has been enabled and an actual paid order exists, submit that order with node production-fulfillment-cli.mjs submit ORDER_ID. This rechecks stock, shipping and margin and creates an unpaid CJ order. Check the returned CJ order ID and FITLIVE reference.
3. In MyCJ, review the matching order, exact variant, recipient, shipping and final supplier amount. Check FixItFindIt for refund holds before paying. The owner pays directly in CJ. Do not create a duplicate order when submission is uncertain; reconcile first.
4. Run node production-fulfillment-cli.mjs sync ORDER_ID to retrieve supplier state and tracking after payment and shipment. Sync remains manual. If identity validation fails, inspect the supplier record before proceeding.

Launch remains closed. Production draft submission has not been exercised against a real customer order. The private owner screen at /owner/orders lists paid live orders, holds, CJ references and saved tracking; customers receive a private tracking link on their verified live payment confirmation page. Supplier actions still use the private CLI. Manual payment is not automatic order submission, and no background polling or notifications are configured by this change.

## Owner access

In the Railway service console run `node owner-access-cli.mjs issue`, then enter the one-time code at https://www.fixitfindit.com/owner/orders. Do not share the code. Codes expire in 24 hours and sessions after eight hours. Issuing a new code revokes prior owner sessions. `node owner-access-cli.mjs revoke` revokes access. Owner credentials are stored hashed in a separate persistent database beside ORDERS_DB_PATH; partner codes cannot sign in as owner. The page is read-only and does not submit or pay CJ orders. Saved status requires the existing manual sync command.

## Customer tracking

The live payment return page issues an order-bound signed tracking link only after customer ownership and a signed payment webhook are verified. Links work beyond the checkout cookie lifetime; anyone holding a link can see limited product/shipment status, so customers should keep it private. No address, email, supplier cost, or CJ order identifier is exposed. Tracking uses saved CJ state and updates after the operator runs sync; no carrier polling or email delivery is added. The signing key is stored in the persistent order database. Customer tracking remains readable if new checkout is disabled.

## Missing CJ address fields

Read-only checks of the actual CJ sandbox order and the owner-created unpaid production draft on 2026-09-17 confirmed that getOrderDetail omits shippingZip and shippingAddress2. Missing fields now set an explicit address-review flag without treating the draft as a failed creation. All returned recipient, order, variant, method and origin fields still must match; a mismatch blocks reconciliation and invalidates prior manual review.

Before paying a flagged order in MyCJ:
1. Run `node production-fulfillment-cli.mjs address ORDER_ID` in the private Railway console. This displays the expected recipient and full address; do not share its output.
2. Open the exact CJ order ID, compare the recipient, street, apartment/unit, city, state, ZIP and country. Correct CJ fields if needed.
3. Run `node production-fulfillment-cli.mjs verify-address ORDER_ID CJ_ORDER_ID` only after comparison. This records an operator attestation bound to that order and the current returned address. It performs read-only CJ queries, never edits the address or pays. A returned mismatch or refund hold cannot be overridden.
4. Check the final supplier amount and refund status again before manual payment. Sync afterward as usual.

CJ does not return all address fields, so changes to omitted fields cannot be detected automatically. The owner must review them in CJ immediately before each manual payment. Wallet payment remains disabled by default.

The separate manual draft FIT-CJ-CHECK-001 is not a paid customer order in FixItFindIt and is not inserted into the live order ledger by these checks. Its API status was CREATED, isSandbox=0, one approved silver variant, product $4.59 plus $6.57 postage. The owner subsequently reported correcting a duplicated street address and missing ZIP; that correction has not been independently verified.

## Tracking update — 2026-09-17

The owner Orders page now provides Sync tracking on submitted orders. It requires an authenticated owner session and CSRF token. Active submitted orders are checked automatically every 15 minutes, up to 20 per cycle from the latest 200 supplier jobs; larger queues can take additional cycles. Delivered and cancelled orders stop automatic checks. Concurrent refreshes share a request and repeated manual refreshes are throttled. The separate tracking client exposes only CJ detail reads and cannot create, confirm or pay orders. This supersedes the earlier manual-only sync instructions. Supplier submission, address review and payment remain manual. No email notifications were added.

The API-created unpaid diagnostic SD2609170810460650100 was verified with one silver attachment, $4.59 product plus $6.57 postage ($11.16 total), isSandbox=0 and CREATED with no payment date. The owner confirmed the address and ZIP in CJ. It is separate from the paid customer ledger.

## Owner email sign-in setup

Email sign-in is prepared but stays hidden until all three Railway variables are configured: OWNER_LOGIN_EMAIL (private owner recipient), RESEND_API_KEY (secret sending key), and OWNER_EMAIL_FROM (verified Resend sender). Set these in Railway Variables; never commit keys or the private recipient. The existing recovery-code login remains available.

Email requests are restricted to the configured owner, throttled to one per minute, and do not revoke existing sessions. Tokens are stored hashed in a separate persistent owner-email database, expire after 15 minutes and are consumed once by a CSRF-protected POST. Merely opening the link does not consume it, so mail scanners cannot sign in. Successful email sign-in replaces earlier owner sessions and uses the existing eight-hour secure owner cookie. Changing OWNER_LOGIN_EMAIL invalidates links for the previous recipient. Email delivery failures remove the pending token. No customer email service or checkout activation is included.

To activate: verify a sender domain with Resend, add its sending-only API key and sender address in Railway, set the approved owner recipient, deploy, and request a link from /owner/orders. The owner should open that email privately to confirm delivery and login. Resend documentation: https://resend.com/docs/api-reference/emails/send-email
