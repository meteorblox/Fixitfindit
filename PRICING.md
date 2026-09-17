# Included standard shipping — September 16, 2026

Owner accepted $23.50 for either single faucet attachment, $39.99 for all selected mushroom lamps, and $89.99 for the American Standard electric pan, conditional on protecting margin. The owner explicitly approved proceeding with the exact American Standard pan variant despite unverified electrical specifications; its checkout hold is removed. This approval is not supplier verification of voltage or frequency. Live payments remain disabled.

New checkout selects the lowest quoted eligible shipping method. Eligibility requires a confirmed total postage estimate and at least $5 modeled contribution after supplier product/freight, 5% affiliate commission, 5% returns allowance, domestic-card fees (2.9% + $0.30), and a provisional 0.5% tax-service allowance. Percentage service fees use a 10.5% sales-tax stress assumption; fulfillment uses the larger of that assumption or recorded tax. This is not a universal sales-tax rate. Public fee source: https://stripe.com/pricing. Account-specific fees, international cards, advertising, overhead, payout fees and losses beyond the allowance are not covered. This is not a guarantee of profit.

Supplier freight remains in the private order shipping snapshot as supplierCents; customer shipping cents is zero. supplierProductCents and pricingVersion also persist there. Stripe still gets a fixed shipping rate of zero. Snapshot supplier costs are not exposed as an additional checkout charge. Existing orders and their original shipping amounts are unchanged.

The route rejects old pricing quotes, rechecks price/stock, and checks the chosen carrier's current quote before opening Stripe. A new sandbox fulfillment submission checks current stock, product cost, the selected carrier's quote, and the margin before its irreversible claim. Unknown totals or insufficient margin stop the operation without silently increasing the customer charge or substituting variants. As before, only signed successful sandbox webhooks can enqueue fulfillment; address mismatches block it.

Supplier quotes are cached for up to one minute and product details for five minutes in the storefront. Quotes are ZIP estimates, not guaranteed full-address landed costs; final supplier charges, address changes, quote/session expiry alignment and production controls remain launch work. The budget floor protects the stated model only.

All 43 automated tests pass, including zero customer shipping with persisted supplier freight, signed payment-to-fulfillment, cost increases preventing supplier creation, owner-approved exact pan variant, unknown fee rejection, price tampering, and legacy paid-order verification. These tests use fixtures; a deployed checkout check follows publication.

## Automatic catalog pricing

Unpriced catalog variants can obtain a destination-specific delivered retail quote on their product page. The rule is 150% markup on verified supplier cost plus confirmed total freight, rounded upward to a whole dollar, raised further if necessary to leave $8 modeled contribution. Existing approved variants retain their exact prices and option restrictions. Unknown stock, missing fees, unsupported quantities, and invalid ZIPs return no price. Known CJ dispute-excluded shipping line families are filtered from automatic catalog quotes; this does not certify coverage for any remaining method.

This is catalog quote support, not production checkout enablement. General catalog variants now have server-verified sandbox checkout; supplier fulfillment remains restricted to the previously approved variants. No live credentials, real supplier payments, or live order submission have been enabled. Advertising, overhead, exceptional returns and final supplier charges can still reduce profit. Before live sales, complete full-address pricing, payment/quote expiry alignment, production payment and fulfillment integration, refund operations, customer-facing policies and the affiliate ledger.

Customer support contact supplied by the owner: fixitfindits@gmail.com. Published on Contact; mailbox delivery has not been tested.

Automatic pricing was raised from 100% to 150% markup, with an $8 modeled contribution floor, at the owner’s request for higher catalog prices. The three manual product prices retain their existing $5 margin guard. This is a pricing choice, not a market-validated optimum or a guarantee of profit. Stored automatic quotes are recalculated before session creation; old lower quotes require a fresh quote. Already-created Stripe sandbox sessions keep their original price.

## Upfront storefront prices

The deployed catalog wrapper builds one named, in-stock complete-product option per automatic product. It checks eligible total freight to 10001, 60601 and 90210, uses the highest cheapest eligible quote plus a 25% freight buffer, then applies the 150% markup and $8 modeled contribution floor. This is a sampled allowance, not a nationwide shipping guarantee. All three samples must succeed. No prices are invented for unknown stock/costs or missing shipping estimates.

Snapshots persist for 24 hours in storefront_prices in the existing Railway SQLite volume. Refresh runs serially in the background at startup and when catalog pages are visited. A first run takes time; pending/unavailable products show Temporarily unavailable. Failed attempts retry after one hour on a subsequent catalog request. One named option is initially offered per automatic product; complete-product stock and costs are still checked before checkout. Existing manual prices and variant choices remain intact.

Customer ZIP checks and sandbox checkout use the published price, never silently change it based on destination. Automatic orders must retain at least $8 modeled contribution using actual quoted freight; ineligible destinations are blocked. Expired snapshots require fresh prices. General catalog supplier fulfillment and real payments remain disabled.

## Cleaning and organization expansion — September 16, 2026

Both categories now scan up to three 24-item pages of verified US inventory, plus the established first-page query to retain existing products. Cleaning discovery uses the broader cleaning keyword. Results are deduplicated by supplier product ID; every published option still requires variant inventory and destination freight checks. The pricing queue alternates categories and tries up to three complete stocked variants when an earlier variant cannot ship. Customer collection grids and homepage rows omit products without retail prices; direct pages distinguish pending checks from unavailable prices.

CJ domestic US-to-US freight responses may include logisticPrice (including zero for free shipping) while customs/total-postage fields are null. These domestic quotes now use the documented USD shipping amount plus any explicitly returned fees. Cross-border quotes retain the full-fee requirement; malformed charges remain blocked. The 25% sampled freight buffer, 150% markup, and contribution floors are unchanged. Final order cost checks still apply; sampled freight is not a guarantee for every address.

Live verification after deployment: 11 priced Cleaning products and 9 Organization products, with the expanded queue still processing. Live customer payments remain disabled. All 66 automated tests passed, including pagination, option fallback, domestic versus imported freight, collection filtering, and category scheduling.
