const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const usd=c=>'$'+(c/100).toFixed(2);
export function productOptions({details,detailError,shipping,shippingError,vid='',zip='',quantity=1}) {
  if(detailError) return `<p role="status">${esc(detailError)}</p>`;
  if(!details) return '';
  const variants=details.variants.filter(v=>v.stock>0 && v.price!==null);
  if(!variants.length) return '<p>No options with confirmed US stock are currently available. Please check back.</p>';
  return `<section class="product-options"><h3>Options &amp; shipping estimate</h3><form method="get"><label>Product option<select name="variant" required>${variants.map(v=>`<option value="${esc(v.id)}" ${vid===v.id?'selected':''}>${esc(v.name)} · supplier ${usd(v.price)} · US stock ${v.stock}</option>`).join('')}</select></label><div class="shipping-fields"><label>US ZIP code<input name="zip" inputmode="numeric" pattern="[0-9]{5}" maxlength="5" value="${esc(zip)}" placeholder="12345" required></label><label>Quantity<input name="quantity" type="number" min="1" max="10" value="${esc(quantity)}" required></label></div><button type="submit">Check shipping</button></form><p class="catalog-note">Your ZIP code is sent to CJ to estimate shipping. Stock and rates can change; these are supplier costs, not the final checkout total.</p>${shippingError?`<p role="status">${esc(shippingError)}</p>`:''}${shipping?`<div role="status"><h4>US shipping estimate</h4>${shipping.length?shipping.map(r=>`<p><strong>${esc(r.name)} · ${usd(r.price)}</strong><br>Carrier estimate: ${esc(r.days)} days. Processing time and tax are not included.</p>`).join(''):'<p>No shipping methods were returned for this option and ZIP code.</p>'}</div>`:''}</section>`;
}
