export const pricingVersion='included-standard-v1';
// USD cents. Planning allowances, not a guarantee of net profit.
export function contribution(retail,supplier,freight,tax=Math.ceil(retail*.105)) {
  if(![retail,supplier,freight,tax].every(n=>Number.isSafeInteger(n)&&n>=0) || retail<1) throw new Error('Invalid pricing inputs.');
  const charge=retail+tax;
  const fees=Math.ceil(charge*.029)+30+Math.ceil(charge*.005);
  return retail-supplier-freight-fees-Math.ceil(retail*.05)-Math.ceil(retail*.05);
}
export function includedShipping(item,option,zip) {
  if(option?.feesConfirmed!==true || !Number.isSafeInteger(option.totalCents) || option.totalCents<0 || !option.name || !/^\d{5}$/.test(zip)) return null;
  if(contribution(item.retailCents,item.supplierCents,option.totalCents)<500) return null;
  return {...item,shipping:{name:option.name,days:option.days,cents:0,supplierCents:option.totalCents,supplierProductCents:item.supplierCents,zip,origin:item.origin,feesConfirmed:true,pricingVersion}};
}
export function requireIncludedMargin(item,tax) {
  const s=item.shipping;
  if(s?.pricingVersion!==pricingVersion || s.cents!==0 || s.feesConfirmed!==true || s.supplierProductCents!==item.supplierCents || contribution(item.retailCents,item.supplierCents,s.supplierCents,tax)<500) throw new Error('A new delivery quote is required.');
}
