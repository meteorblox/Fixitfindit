# Refund handling before launch

Owner decision: use supplier-backed issue resolution; no voluntary change-of-mind return program. Customer-facing draft is /returns. Current supplier source reviewed September 16, 2026: https://www.cjdropshipping.com/dispute-policy.html.

Live sales remain disabled. Publishing this draft does not enable refunds or complete launch readiness.

## Support workflow

1. Receive the request at fixitfindits@gmail.com. Identify the application order and its Stripe Session. Collect only the evidence needed for the complaint. Preserve the original complaint date and order snapshot privately; never put customer details in this repository.
2. Check paid amount, prior refunds, fulfillment stage, delivery tracking, the applicable product and shipping-method terms, and customer rights. Do not promise reimbursement solely because the product came from CJ. A customer's remedy must not depend entirely on recovery from the supplier.
3. Open the appropriate CJ dispute through the authorized merchant account with supporting evidence. Record its reference and outcome separately from the customer refund. Cancellation requires checking that fulfillment has actually stopped; a payment refund alone does not cancel a CJ shipment.
4. Agree the customer remedy and exact amount in writing. Confirm any return destination, deadline and who pays shipping before requesting shipment. Do not instruct customers to use a parcel's sender address or promise a prepaid label without arranging it.
5. For sandbox verification, use only Stripe test mode and the matching synthetic order. Refund through the Stripe Dashboard against the verified payment, then record refund ID, amount, currency and final status. Check existing refunds before retrying; a pending refund is not a failure. Never submit a second refund to resolve an uncertain first attempt.
6. Reconcile customer refund and supplier recovery independently. Reverse or exclude the refunded portion from affiliate earnings when the commission ledger is implemented. Do not count pending refunds as successfully returned funds.

## Remaining launch work

The application does not yet persist a refund ledger, consume refund lifecycle events or stop fulfillment automatically on refund. Its existing paid status is not proof that a payment remains unrefunded. Refund reconciliation and fulfillment holds must be implemented and sandbox-tested before live activation. Real refunds need exact order/amount authorization; this workflow grants no real-money authorization.
