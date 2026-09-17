# Checkout and launch status

Updated 2026-09-17. Live purchases remain CLOSED. This document replaces earlier milestone notes that no longer reflected deployed behavior.

## Verified and implemented

- Separate sandbox and live Checkout credentials/routes, fixed recipient validation, server-side product and shipping prices, exclusive automatic tax, persistent orders and signed webhook intake.
- Live Stripe account and Texas tax registration were verified earlier in this session. A real live diagnostic session was expired without payment, and its Stripe webhook delivered successfully. This was not a live purchase test.
- Earlier deployed sandbox browser test: partner referral, $127 product, $0 shipping, $13.34 sandbox tax, $140.34 payment. Signed notification recorded the order and $6.35 test commission. Full sandbox refund reversed the commission and held fulfillment.
- Owner dashboard is deployed at /owner/orders; the owner successfully signed in. One-time codes and sessions are separate from partner access.
- Customer tracking links are issued only after checkout ownership and signed live payment confirmation. Saved CJ state supplies tracking; no automatic CJ polling or transactional email delivery is configured.
- CJ payments default to manual. The production adapter creates unpaid drafts with payType=3 and cannot deduct wallet funds in manual mode. Private CLI submission and sync remain gated.
- CJ documentation specifies default API store routing when storeName is omitted; the adapter omits it. The owner identified the prior FITTEST sandbox order in that default store and reported correcting the name and deactivating the duplicate. Production routing has not yet been verified using a real order.

## Latest verification

103 automated tests passed. Added an integrated test covering signed payment -> owner queue -> single unpaid CJ draft -> simulated manual supplier payment -> CJ shipment sync -> private customer tracking -> refund fulfillment hold. Repeated Stripe notifications and submit calls do not duplicate the order. Supplier and payment responses in this automated run were fixtures. No external order was created and no funds moved.

The public /checkout/live page was checked and still reports that checkout is not open.

## Remaining before opening sales

1. Storefront links and launch copy now follow the live checkout readiness gate; both LIVE_CHECKOUT and CJ_PRODUCTION_FULFILLMENT must be enabled, alongside valid live intake/Stripe configuration. Demo storefronts stay in sandbox. Partner dashboards show live commissions and recorded manual payouts separately from optional test activity. These presentation changes do not enable checkout or payouts.
2. Verify current supplier stock/freight availability and the production CJ create/detail response contract, manual payment workflow, and shipment identity matching. Automated fixtures and the earlier CJ sandbox order do not prove real supplier fulfillment.
3. Coordinate production fulfillment enablement with checkout activation and operator readiness. Do not open checkout merely because tests pass. The owner must monitor paid orders, submit reviewed drafts, pay CJ manually, and sync status.

## Operating configuration

Persistent database: ORDERS_DB_PATH on /data, one replica. LIVE_ORDER_INTAKE is enabled with separate STRIPE_LIVE_SECRET_KEY and STRIPE_LIVE_WEBHOOK_SECRET. LIVE_CHECKOUT and CJ_PRODUCTION_FULFILLMENT remain disabled; this verification did not change them. Existing sandbox keys remain intact. No real supplier payment or affiliate payout has been made by these checks.

Partner policy: 5% of eligible product subtotal, excluding tax and separately charged shipping; monthly manual PayPal payouts after a 30-day hold, $25 minimum, refund adjustments and review. Live partner presentation and payout activation remain separate launch work.

See MANUAL-CJ-OPERATIONS.md for owner access, submission, payment and sync instructions. Customer support: fixitfindits@gmail.com.

## CJ response compatibility update

Actual read-only queries confirmed the corrected default store and an unpaid manual production draft. Missing ZIP/address2 response fields now require a recorded manual address comparison. Returned mismatches still block progress. See MANUAL-CJ-OPERATIONS.md. This does not verify API production creation end to end: the inspected production draft was created by the owner in CJ. Checkout and production fulfillment flags remain disabled.
