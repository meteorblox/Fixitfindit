import {contribution,includedShipping} from './pricing-policy.mjs';

export const markupPercent=150;
export const minimumContributionCents=800;
// CJ excludes these lines from dispute coverage for certain destinations.
// Excluding them here is conservative; other carriers are not guaranteed coverage.
export function eligibleMethod(method) {
  const name=String(method?.name||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  return Boolean(name) && !/postnl|cjpacketeub|cjpacketpostal|cjpacketrailwayeconomy/.test(name)
    && method.feesConfirmed===true && Number.isSafeInteger(method.totalCents) && method.totalCents>=0;
}
export function automaticRetail(supplierCents,freightCents) {
  if(![supplierCents,freightCents].every(n=>Number.isSafeInteger(n)&&n>=0)) throw new Error('Verified costs required');
  const landed=supplierCents+freightCents;
  // Cap supported inputs rather than risking overflow or unbounded calculation.
  if(landed>10000000) throw new Error('Cost exceeds automatic pricing limit');
  let price=Math.max(100,Math.ceil(landed*(1+markupPercent/100)/100)*100);
  while(contribution(price,supplierCents,freightCents)<minimumContributionCents) price+=100;
  return price;
}
export function deliveredPrice({product,details,vid,zip,shipping,quantity=1}) {
  if(quantity!==1 || product?.checkoutHold || !/^\d{5}$/.test(zip||'')) return null;
  const actual=details?.variants.find(v=>v.id===vid);
  if(!actual || !Number.isSafeInteger(actual.stock) || actual.stock<1 || !Number.isSafeInteger(actual.price) || actual.price<0) return null;
  const approved=product?.pricedVariants?.find(v=>v.id===vid);
  // Manual products retain their exact approved options, including multipack exclusions.
  if(product?.pricedVariants && !approved) return null;
  for(const method of (shipping||[]).filter(eligibleMethod).sort((a,b)=>a.totalCents-b.totalCents)) {
    if(actual.price+method.totalCents>10000000) continue;
    const retailCents=approved?.retailCents ?? automaticRetail(actual.price,method.totalCents);
    const quote=includedShipping({retailCents,supplierCents:actual.price,origin:details.origin},method,zip);
    if(quote) return {...quote,variantId:vid,automatic:!approved};
  }
  return null;
}
