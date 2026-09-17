# Manual CJ payment workflow

Owner selected manual CJ supplier payment for launch on 2026-09-17. This is separate from manual PayPal partner payouts.

CJ_PAYMENT_MODE defaults to manual. The production CLI blocks pay before confirmation or deduction, and the CJ adapter independently refuses wallet deductions unless explicitly configured for wallet mode. Draft creation continues to use payType=3 (unpaid). No supplier funds are spent by this configuration.

Private operator workflow (Railway console):
1. Run node production-fulfillment-cli.mjs list to see paid customer orders staged for review, supplier reference, refund holds and tracking status.
2. After live fulfillment has been enabled and an actual paid order exists, submit that order with node production-fulfillment-cli.mjs submit ORDER_ID. This rechecks stock, shipping and margin and creates an unpaid CJ order. Check the returned CJ order ID and FITLIVE reference.
3. In MyCJ, review the matching order, exact variant, recipient, shipping and final supplier amount. Check FixItFindIt for refund holds before paying. The owner pays directly in CJ. Do not create a duplicate order when submission is uncertain; reconcile first.
4. Run node production-fulfillment-cli.mjs sync ORDER_ID to retrieve supplier state and tracking after payment and shipment. Sync remains manual. If identity validation fails, inspect the supplier record before proceeding.

Launch remains closed. Production draft submission has not been exercised against a real customer order. An authenticated owner-facing order screen and customer tracking presentation are still outstanding; the private CLI is the current operator interface. Manual payment is not automatic order submission, and no background polling or notifications are configured by this change.
