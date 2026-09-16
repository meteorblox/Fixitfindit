import {randomUUID} from 'node:crypto';
import {createCheckout} from './checkout.mjs';
import {shippingQuotes} from './shipping-quotes.mjs';
import {selectedProducts} from './selected-products.mjs';

const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const usd=c=>'$'+(c/100).toFixed(2);
const origins=new Set(['https://www.fixitfindit.com','https://fixitfindit.com','https://fixitfindit-production.up.railway.app']);

// Only exact, explicitly priced supplier variants can enter product checkout.
// Multipacks and every unreviewed variant fail closed.
export async function checkoutItem(catalog, variantId) {
  const product=selectedProducts.find(p=>p.pricedVariants?.some(v=>v.id===variantId));
  const variant=product?.pricedVariants.find(v=>v.id===variantId);
  if(!variant || !product.lookup.pid) throw new Error('This option does not have approved checkout pricing.');
  const details=await catalog.detail(product.category,product.lookup.pid);
  const actual=details.variants.find(v=>v.id===variantId);
  if(!actual || !Number.isSafeInteger(actual.stock) || actual.stock<1 || !Number.isSafeInteger(actual.price) || actual.price<0) throw new Error('This option does not currently have confirmed stock.');
  return {productId:product.lookup.pid,variantId,name:product.name+' · '+variant.name,retailCents:variant.retailCents,supplierCents:actual.price,category:product.category,origin:details.origin||product.origin};
}

export function productCheckoutPage({message='',enabled=false,chosen='',quotes=[]}={}) {
  const products=selectedProducts.filter(p=>p.pricedVariants?.length);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Product checkout test · FixItFindIt</title><style>body{margin:0;background:#f7f5ef;color:#173c35;font:17px/1.6 system-ui}main{max-width:650px;margin:6vh auto;padding:32px;background:white;border-radius:22px}h1{line-height:1.15}a{color:#216653}label{display:block}input,select,button{box-sizing:border-box;width:100%;font:inherit;padding:14px;border-radius:8px;margin:10px 0}button{background:#216653;color:white;border:0;cursor:pointer}.status{padding:16px;background:#eef4ef;border-radius:8px}.note{font-size:14px}</style></head><body><main><a href="/">FixItFindIt</a><p>PRODUCT CHECKOUT · SANDBOX</p><h1>Try a product purchase.</h1><p>Test the selected product and price with Stripe. No money moves, no products ship, and no partner commission is earned.</p>${message?`<p class="status" role="status">${esc(message)}</p>`:''}${quotes.length?`<section><h2>Choose shipping</h2><p><strong>${esc(quotes[0].name)}</strong></p><p>Quoted for ZIP ${esc(quotes[0].shipping.zip)}. Use this ZIP in Stripe. Quotes expire after 10 minutes.</p>${quotes.map(q=>`<form method="post" action="/checkout/products/start"><input type="hidden" name="quote" value="${esc(q.quoteId)}"><h3>${esc(q.shipping.name)}</h3><p>Estimated transit: ${esc(q.shipping.days)} days. Product: ${usd(q.retailCents)}; shipping: ${usd(q.shipping.cents)}; total before sales tax: ${usd(q.retailCents+q.shipping.cents)}.</p><p>${q.shipping.feesConfirmed?'CJ returned a total postage estimate. Final supplier charges still require verification.':'Base postage estimate only: additional supplier fees are unconfirmed.'}</p><button>Continue with this shipping · test only →</button></form>`).join('')}</section>`:''}${enabled?`<form method="post" action="/checkout/products/quote"><label>Product and option<select name="variant" required>${products.map(p=>`<optgroup label="${esc(p.name)}">${p.pricedVariants.map(v=>`<option value="${esc(v.id)}" ${v.id===chosen?'selected':''}>${esc(v.name)} · ${usd(v.retailCents)}</option>`).join('')}</optgroup>`).join('')}</select></label><label>US delivery ZIP code<input name="zip" required pattern="[0-9]{5}" maxlength="5" inputmode="numeric" autocomplete="postal-code"></label><p>Quantity: 1. Choose shipping before continuing. Applicable sales tax is added at Stripe checkout.</p><button>Get shipping options →</button></form>`:''}<p class="note">Use test card <b>4242 4242 4242 4242</b>, any future expiry and any three-digit CVC. Use test contact details.</p><p class="note">Stripe calculates applicable tax using the shipping address and sandbox tax settings. This test does not reserve inventory. Delivery costs and fulfillment must be completed before live sales.</p><a href="/checkout/products">Start another product test</a></main></body></html>`;
}

export function createProductCheckoutRoute({catalog,checkout=createCheckout(),quotes=shippingQuotes}={}) {
  return async (req,res,url)=>{
    if(!url.pathname.startsWith('/checkout/products')) return false;
    const page=(status,message='',enabled=false,options=[])=>{
      res.writeHead(status,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'same-origin','X-Content-Type-Options':'nosniff'});
      res.end(req.method==='HEAD'?undefined:productCheckoutPage({message,enabled,chosen:options[0]?.variantId||url.searchParams.get('variant'),quotes:options}));
    };
    const cookie=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('fit_product='))?.slice(12);
    const reference=/^[a-f0-9-]{36}$/.test(cookie||'')?cookie:null;
    try {
      if(url.pathname==='/checkout/products' && ['GET','HEAD'].includes(req.method)) {
        res.setHeader('Set-Cookie',`fit_product=${randomUUID()}; Path=/checkout/products; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`);
        page(200,checkout.enabled()?(url.searchParams.has('cancelled')?'Checkout cancelled. No payment was made.':''):'Product sandbox checkout is not configured.',checkout.enabled());
      } else if(['/checkout/products/quote','/checkout/products/start'].includes(url.pathname) && req.method==='POST') {
        if(!reference || !origins.has(req.headers.origin)) {page(403,'Open the product test page before starting checkout.');return true;}
        if(!req.headers['content-type']?.startsWith('application/x-www-form-urlencoded')) {page(415,'Unsupported form format.');return true;}
        let body='';
        for await(const chunk of req) {body+=chunk.toString();if(Buffer.byteLength(body)>4096) {page(413,'Form too large.');return true;}}
        if(!quotes) {page(503,'Shipping checkout requires configured persistent order storage.');return true;}
        const form=new URLSearchParams(body);
        if(url.pathname==='/checkout/products/quote') {
          const zip=form.get('zip')||'';
          if(!/^\d{5}$/.test(zip)) {page(400,'Enter a five-digit US ZIP code.',true);return true;}
          const item=await checkoutItem(catalog,form.get('variant'));
          const options=await catalog.shipping(item.category,item.productId,item.variantId,zip,1);
          const saved=options.filter(o=>o.name && Number.isSafeInteger(o.price) && o.price>=0).slice(0,12).map(o=>quotes.save(reference,{
            ...item,shipping:{name:o.name,days:o.days,cents:o.totalCents??o.price,zip,origin:item.origin,feesConfirmed:o.feesConfirmed===true}
          }));
          page(200,saved.length?'Choose a shipping option below.':'No shipping options are available for this product and ZIP.',true,saved);return true;
        }
        let item;
        try {item=quotes.get(reference,form.get('quote')||'');} catch {page(409,'Shipping quote expired or unavailable. Get a fresh quote.',true);return true;}
        const current=await checkoutItem(catalog,item.variantId);
        if(current.retailCents!==item.retailCents || current.supplierCents!==item.supplierCents) {page(409,'Product price changed. Get a fresh shipping quote.',true);return true;}
        const destination=await checkout.startProduct(req.headers.origin,reference,item);
        res.writeHead(303,{Location:destination,'Cache-Control':'no-store'});res.end();
      } else if(url.pathname==='/checkout/products/result' && req.method==='GET') {
        if(!reference) {page(400,'Test cookie missing. Start another product test.');return true;}
        const result=await checkout.verifyProduct(url.searchParams.get('session_id'),reference);
        page(200,result.paid?`Stripe confirmed the ${usd(result.totalCents??result.retailCents)} product test payment. Product: ${usd(result.retailCents)}; shipping: ${usd(result.shippingCents??0)}; tax: ${usd(result.taxCents??0)}. ${result.orderId?'Order '+result.orderId+' is saved in FixItFindIt.':'The exact product and variant are recorded in Stripe.'} ${result.webhookReceived?'Automatic Stripe notification received and recorded.':'Automatic notification has not been recorded yet; refresh to check.'} ${result.destinationMatches===false?'The Stripe address differs from the shipping quote. A new quote would be required before fulfillment.':''} ${result.fulfillment?'CJ sandbox status: '+result.fulfillment.state+'. '+(result.fulfillment.trackingNumber?'Simulated tracking: '+result.fulfillment.trackingNumber+'. ':''):''}Nothing will ship.`:'Payment is not confirmed yet. Refresh to check again.');
      } else page(405,'This checkout action is unavailable.');
    } catch {page(503,'The product test could not be started or verified. Please start another test.');}
    return true;
  };
}
