import {includedShipping} from './pricing-policy.mjs';
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const usd=c=>'$'+(c/100).toFixed(2);
export function productOptions({product,details,detailError,shipping,shippingError,vid='',zip='',quantity=1}) {
  if(!product?.pricedVariants?.length) return '<p>Price and available options coming soon.</p>';
  if(detailError) return `<p role="status">${esc(detailError)}</p>`;
  if(!details) return '';
  const variants=product.pricedVariants.map(v=>({...v,actual:details.variants.find(a=>a.id===v.id)})).filter(v=>v.actual?.stock>0 && v.actual.price!==null);
  if(!variants.length) return '<p>No options are currently available. Please check back.</p>';
  const selected=variants.find(v=>v.id===vid)||variants[0];
  let delivery='';
  if(shippingError) delivery='<p role="status">Delivery availability could not be checked. Please try again.</p>';
  else if(shipping) {
    const method=quantity===1 && (!vid || selected.id===vid)?shipping.slice().sort((a,b)=>a.totalCents-b.totalCents).find(o=>includedShipping({retailCents:selected.retailCents,supplierCents:selected.actual.price,origin:details.origin},o,zip)):null;
    delivery=method?`<p role="status"><strong>Standard shipping included.</strong><br>Estimated transit: ${esc(method.days)} days, plus processing time. Total before sales tax: ${usd(selected.retailCents)}.</p>`:'<p role="status">Included standard shipping is not available for this selection and ZIP.</p>';
  }
  return `<section class="product-options"><h3>Options &amp; delivery</h3><form method="get"><label>Product option<select name="variant" required>${variants.map(v=>`<option value="${esc(v.id)}" ${selected.id===v.id?'selected':''}>${esc(v.name)} · ${usd(v.retailCents)}</option>`).join('')}</select></label><div class="shipping-fields"><label>US ZIP code<input name="zip" inputmode="numeric" pattern="[0-9]{5}" maxlength="5" value="${esc(zip)}" placeholder="12345" required></label></div><button type="submit">Check delivery</button></form><p class="catalog-note">Quantity: 1. Standard shipping included where available. Sales tax is calculated at checkout.</p>${delivery}</section>`;
}
