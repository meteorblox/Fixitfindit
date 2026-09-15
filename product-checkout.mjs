import {randomUUID} from 'node:crypto';
import {createCheckout} from './checkout.mjs';
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
  if(!actual || actual.stock<1 || actual.stock===null || actual.price===null) throw new Error('This option does not currently have confirmed stock.');
  return {productId:product.lookup.pid,variantId,name:product.name+' · '+variant.name,retailCents:variant.retailCents};
}

export function productCheckoutPage({message='',enabled=false,chosen=''}={}) {
  const products=selectedProducts.filter(p=>p.pricedVariants?.length);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Product checkout test · FixItFindIt</title><style>body{margin:0;background:#f7f5ef;color:#173c35;font:17px/1.6 system-ui}main{max-width:650px;margin:6vh auto;padding:32px;background:white;border-radius:22px}h1{line-height:1.15}a{color:#216653}label{display:block}select,button{box-sizing:border-box;width:100%;font:inherit;padding:14px;border-radius:8px;margin:10px 0}button{background:#216653;color:white;border:0;cursor:pointer}.status{padding:16px;background:#eef4ef;border-radius:8px}.note{font-size:14px}</style></head><body><main><a href="/">FixItFindIt</a><p>PRODUCT CHECKOUT · SANDBOX</p><h1>Try a product purchase.</h1><p>Test the selected product and price with Stripe. No money moves, no products ship, and no partner commission is earned.</p>${message?`<p class="status" role="status">${esc(message)}</p>`:''}${enabled?`<form method="post" action="/checkout/products/start"><label>Product and option<select name="variant" required>${products.map(p=>`<optgroup label="${esc(p.name)}">${p.pricedVariants.map(v=>`<option value="${esc(v.id)}" ${v.id===chosen?'selected':''}>${esc(v.name)} · ${usd(v.retailCents)}</option>`).join('')}</optgroup>`).join('')}</select></label><p>Quantity: 1 · Shipping charge: $0 in this simulation. Applicable tax is added at Stripe checkout.</p><button>Continue to Stripe test checkout →</button></form>`:''}<p class="note">Use test card <b>4242 4242 4242 4242</b>, any future expiry and any three-digit CVC. Use test contact details.</p><p class="note">Stripe calculates applicable tax using the shipping address and sandbox tax settings. This test does not reserve inventory. Delivery costs and fulfillment must be completed before live sales.</p><a href="/checkout/products">Start another product test</a></main></body></html>`;
}

export function createProductCheckoutRoute({catalog,checkout=createCheckout()}={}) {
  return async (req,res,url)=>{
    if(!url.pathname.startsWith('/checkout/products')) return false;
    const page=(status,message='',enabled=false)=>{
      res.writeHead(status,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'same-origin','X-Content-Type-Options':'nosniff'});
      res.end(req.method==='HEAD'?undefined:productCheckoutPage({message,enabled,chosen:url.searchParams.get('variant')}));
    };
    const cookie=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('fit_product='))?.slice(12);
    const reference=/^[a-f0-9-]{36}$/.test(cookie||'')?cookie:null;
    try {
      if(url.pathname==='/checkout/products' && ['GET','HEAD'].includes(req.method)) {
        res.setHeader('Set-Cookie',`fit_product=${randomUUID()}; Path=/checkout/products; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`);
        page(200,checkout.enabled()?(url.searchParams.has('cancelled')?'Checkout cancelled. No payment was made.':''):'Product sandbox checkout is not configured.',checkout.enabled());
      } else if(url.pathname==='/checkout/products/start' && req.method==='POST') {
        if(!reference || !origins.has(req.headers.origin)) {page(403,'Open the product test page before starting checkout.');return true;}
        if(!req.headers['content-type']?.startsWith('application/x-www-form-urlencoded')) {page(415,'Unsupported form format.');return true;}
        let body='';
        for await(const chunk of req) {body+=chunk.toString();if(Buffer.byteLength(body)>4096) {page(413,'Form too large.');return true;}}
        const item=await checkoutItem(catalog,new URLSearchParams(body).get('variant'));
        const destination=await checkout.startProduct(req.headers.origin,reference,item);
        res.writeHead(303,{Location:destination,'Cache-Control':'no-store'});res.end();
      } else if(url.pathname==='/checkout/products/result' && req.method==='GET') {
        if(!reference) {page(400,'Test cookie missing. Start another product test.');return true;}
        const result=await checkout.verifyProduct(url.searchParams.get('session_id'),reference);
        page(200,result.paid?`Stripe confirmed the ${usd(result.totalCents??result.retailCents)} product test payment. Product: ${usd(result.retailCents)}; tax: ${usd(result.taxCents??0)}. ${result.orderId?'Order '+result.orderId+' is saved in FixItFindIt.':'The exact product and variant are recorded in Stripe.'} ${result.webhookReceived?'Automatic Stripe notification received and recorded.':'Automatic notification has not been recorded yet; refresh to check.'} Nothing will ship.`:'Payment is not confirmed yet. Refresh to check again.');
      } else page(405,'This checkout action is unavailable.');
    } catch {page(503,'The product test could not be started or verified. Please start another test.');}
    return true;
  };
}
