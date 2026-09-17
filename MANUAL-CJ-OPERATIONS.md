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
