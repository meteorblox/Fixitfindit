import {isReplacementPart} from './catalog-policy.mjs';
import {deliveredPrice} from './automatic-pricing.mjs';
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const usd=c=>'$'+(c/100).toFixed(2);
export function productOptions({product,details,detailError,shipping,shippingError,vid='',zip='',quantity=1}) {
  if(product?.pricingPending) return '<p>Pricing or availability is being verified. Please check back.</p>';
  if(product?.checkoutHold) return '<p>This product is not currently available.</p>';
  if(detailError) return `<p role="status">${esc(detailError)}</p>`;
  if(!details) return '';
  const variants=(product?.pricedVariants || product?.storefrontVariants || details.variants).map(v=>({...v,actual:details.variants.find(a=>a.id===v.id)})).filter(v=>!isReplacementPart(v.name) && !isReplacementPart(v.actual?.name) && Number.isSafeInteger(v.actual?.stock) && v.actual.stock>0 && Number.isSafeInteger(v.actual.price) && v.actual.price>=0);
  if(!variants.length) return '<p>No options are currently available. Please check back.</p>';
  const selected=variants.find(v=>v.id===vid)||variants[0];
  let delivery='';
  if(shippingError) delivery='<p role="status">Delivery availability could not be checked. Please try again.</p>';
  else if(shipping) {
    const quote=deliveredPrice({product,details,vid:vid||selected.id,zip,shipping,quantity});
    delivery=quote?`<p role="status"><strong>Standard shipping included.</strong><br>Total before sales tax: <strong>${usd(quote.retailCents)}</strong>.<br>Estimated transit: ${esc(quote.shipping.days)} days, plus processing time. Price quoted for ZIP ${esc(zip)}; availability and price are checked again before purchase.</p>`:'<p role="status">A delivered price is unavailable for this selection and ZIP. Please try another option or check back.</p>';
  }
  return `<section class="product-options"><h3>Options &amp; delivery</h3><form method="get"><label>Product option<select name="variant" required>${variants.map(v=>`<option value="${esc(v.id)}" ${selected.id===v.id?'selected':''}>${esc(v.name)} · ${Number.isSafeInteger(v.retailCents)?usd(v.retailCents):'Check delivered price'}</option>`).join('')}</select></label><div class="shipping-fields"><label>US ZIP code<input name="zip" inputmode="numeric" pattern="[0-9]{5}" maxlength="5" value="${esc(zip)}" placeholder="12345" required></label></div><button type="submit">${product?.pricedVariants?'Check delivery':'Get delivered price'}</button></form><p class="catalog-note">Quantity: 1. Standard shipping included where available. Sales tax is calculated at checkout.</p>${delivery}</section>`;
}
