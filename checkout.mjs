import { randomUUID } from 'node:crypto';
import {orders as defaultOrders} from './orders.mjs';
import {paymentTotals} from './payment-totals.mjs';

export function createCheckout({key = process.env.STRIPE_SECRET_KEY, request = fetch,orders=defaultOrders} = {}) {
  const enabled = () => typeof key === 'string' && key.startsWith('sk_test_');
  async function call(path, body, idempotency) {
    if (!enabled()) throw new Error('Sandbox checkout is not configured.');
    const response = await request('https://api.stripe.com/v1/checkout/sessions' + path, {
      method: body ? 'POST' : 'GET',
      headers: {Authorization: `Bearer ${key}`, ...(body ? {'Content-Type':'application/x-www-form-urlencoded', 'Idempotency-Key':idempotency} : {})},
      ...(body ? {body:new URLSearchParams(body)} : {}), signal:AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error('Stripe could not complete this sandbox request. Please try again.');
    const session = await response.json();
    if (session.livemode !== false) throw new Error('Only sandbox sessions are allowed.');
    return session;
  }
  return {
    enabled,
    async startProduct(origin, reference, item) {
      if(!enabled()) throw new Error('Sandbox checkout is not configured.');
      if (!Number.isInteger(item.retailCents) || item.retailCents < 1 || !item.variantId || !item.productId) throw new Error('Invalid product selection.');
      if(item.shipping && (!orders || !Number.isSafeInteger(item.shipping.cents)||item.shipping.cents<0||!item.shipping.name||!/^\d{5}$/.test(item.shipping.zip)||!item.quoteId)) throw new Error('Shipping checkout requires a valid quote and order storage.');
      const order=orders?.prepare(reference,{...item,automaticTax:true});
      const session = await call('', {
        mode:'payment','payment_method_types[0]':'card',
        'line_items[0][price_data][currency]':'usd',
        'line_items[0][price_data][unit_amount]':String(item.retailCents),
        'line_items[0][price_data][tax_behavior]':'exclusive',
        'line_items[0][price_data][product_data][tax_code]':'txcd_99999999',
        'automatic_tax[enabled]':'true',
        'metadata[tax_mode]':'automatic',
        ...(item.shipping?{
          'shipping_options[0][shipping_rate_data][type]':'fixed_amount',
          'shipping_options[0][shipping_rate_data][fixed_amount][amount]':String(item.shipping.cents),
          'shipping_options[0][shipping_rate_data][fixed_amount][currency]':'usd',
          'shipping_options[0][shipping_rate_data][display_name]':item.shipping.name,
          'shipping_options[0][shipping_rate_data][tax_behavior]':'exclusive',
          'shipping_options[0][shipping_rate_data][tax_code]':'txcd_92010001',
          'metadata[shipping_cents]':String(item.shipping.cents),
          'metadata[shipping_zip]':item.shipping.zip,
          'metadata[quote_id]':item.quoteId
        }:{}),
        'line_items[0][price_data][product_data][name]':item.name+' — SANDBOX, no shipment',
        'line_items[0][quantity]':'1',
        'shipping_address_collection[allowed_countries][0]':'US',
        'metadata[purpose]':'fixitfindit-product-sandbox',
        'metadata[product_id]':item.productId,'metadata[variant_id]':item.variantId,
        'metadata[retail_cents]':String(item.retailCents),'metadata[quantity]':'1',
        'metadata[store_id]':'fixitfindit','metadata[fulfillment]':'sandbox-do-not-ship',
        ...(order?{'metadata[order_id]':order.id}:{}),
        'custom_text[submit][message]':'Test only. No shipment or commission. Applicable tax is calculated from the shipping address.',
        client_reference_id:reference,
        success_url:origin+'/checkout/products/result?session_id={CHECKOUT_SESSION_ID}',
        cancel_url:origin+'/checkout/products?cancelled=1'
      },order?.id || reference+':'+item.variantId);
      if (!session.url?.startsWith('https://checkout.stripe.com/')) throw new Error('Invalid checkout destination.');
      if(order) orders.recordSession(session);
      return session.url;
    },
    async verifyProduct(id, reference) {
      if (!/^cs_test_[a-zA-Z0-9]+$/.test(id || '')) throw new Error('Invalid test session.');
      const s=await call('/'+id);
      const m=s.metadata||{};
      if(s.client_reference_id!==reference || m.purpose!=='fixitfindit-product-sandbox' || m.fulfillment!=='sandbox-do-not-ship' || m.quantity!=='1' || !m.product_id || !m.variant_id || !/^\d+$/.test(m.retail_cents||'') || Number(m.retail_cents)<1 || s.currency!=='usd') throw new Error('Product payment could not be verified.');
      const shippingCents=m.shipping_cents===undefined?0:/^\d+$/.test(m.shipping_cents)?Number(m.shipping_cents):NaN;
      const totals=paymentTotals(s,Number(m.retail_cents),m.tax_mode==='automatic',shippingCents);
      const address=s.collected_information?.shipping_details?.address||s.shipping_details?.address;
      const destinationMatches=!m.shipping_zip || (address?.country==='US' && address?.postal_code?.slice(0,5)===m.shipping_zip);
      if(m.order_id) {if(!orders) throw new Error('Order storage unavailable');orders.recordSession(s);}
      return {shippingCents,destinationMatches,paid:s.status==='complete' && s.payment_status==='paid',productId:m.product_id,variantId:m.variant_id,retailCents:Number(m.retail_cents),...totals,orderId:m.order_id||null,webhookReceived:Boolean(m.order_id && orders?.hasWebhook(m.order_id))};
    },
    async start(origin, reference) {
      const session = await call('', {
        mode:'payment', 'payment_method_types[0]':'card',
        'line_items[0][price_data][currency]':'usd',
        'line_items[0][price_data][unit_amount]':'100',
        'line_items[0][price_data][product_data][name]':'FixItFindIt sandbox test — no shipment',
        'line_items[0][quantity]':'1',
        'metadata[purpose]':'fixitfindit-sandbox-check',
        client_reference_id:reference,
        success_url:origin+'/checkout/test/result?session_id={CHECKOUT_SESSION_ID}',
        cancel_url:origin+'/checkout/test?cancelled=1'
      },reference);
      if (!session.url?.startsWith('https://checkout.stripe.com/')) throw new Error('Invalid checkout destination.');
      return session.url;
    },
    async verify(id, reference) {
      if (!/^cs_test_[a-zA-Z0-9]+$/.test(id || '')) throw new Error('Invalid test session.');
      const session = await call('/'+id);
      if (session.client_reference_id !== reference || session.metadata?.purpose !== 'fixitfindit-sandbox-check' || session.amount_total !== 100 || session.currency !== 'usd') throw new Error('This test session could not be verified.');
      return session.status === 'complete' && session.payment_status === 'paid';
    }
  };
}

export function testPage(message = '', enabled = true) {
  const safe = message.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Test checkout · FixItFindIt</title><style>body{margin:0;background:#f7f5ef;color:#173c35;font:17px/1.6 system-ui}main{max-width:560px;margin:8vh auto;padding:32px;background:white;border-radius:22px}h1{line-height:1.2}button{background:#216653;color:white;padding:15px 24px;border:0;border-radius:9px;font:inherit;cursor:pointer}a{color:#216653}.status{padding:14px;background:#eef4ef;border-radius:8px}</style></head><body><main><a href="/">FixItFindIt</a><p>STRIPE SANDBOX</p><h1>Let’s test checkout.</h1><p>This is a simulated <strong>$1.00 USD</strong> payment. No money moves, no products ship, and no partner commission is earned.</p>${safe ? `<p class="status">${safe}</p>` : ''}<p>Use test card <strong>4242 4242 4242 4242</strong>, any future expiry date and any three-digit CVC. Use test details, not a real card.</p>${enabled ? '<form method="post" action="/checkout/test/start"><button type="submit">Open test checkout →</button></form>' : ''}<p><a href="https://www.fixitfindit.com/checkout/test">Start a fresh test</a></p><p><small>Product ordering will be enabled separately after pricing, shipping and order handling are ready.</small></p></main></body></html>`;
}

const checkout = createCheckout();
const allowedOrigins = new Set(['https://www.fixitfindit.com','https://fixitfindit.com','https://fixitfindit-production.up.railway.app']);
export async function checkoutRoute(req, res, url) {
  if (!url.pathname.startsWith('/checkout/test')) return false;
  const page = (code, message, enabled = checkout.enabled()) => {
    res.writeHead(code, {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'same-origin','X-Content-Type-Options':'nosniff'});
    res.end(req.method === 'HEAD' ? undefined : testPage(message, enabled));
  };
  const cookie = req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('fit_test='))?.slice(9);
  const reference = /^[a-f0-9-]{36}$/.test(cookie || '') ? cookie : undefined;
  try {
    if (url.pathname === '/checkout/test' && ['GET','HEAD'].includes(req.method)) {
      res.setHeader('Set-Cookie',`fit_test=${randomUUID()}; Path=/checkout/test; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`);
      page(200,checkout.enabled() ? (url.searchParams.has('cancelled') ? 'Test checkout cancelled. You can try again.' : '') : 'The sandbox key is not configured. Check the Railway variable STRIPE_SECRET_KEY.',checkout.enabled());
    } else if (url.pathname === '/checkout/test/start' && req.method === 'POST') {
      if (!reference || !allowedOrigins.has(req.headers.origin)) { page(403,'Open the test page before starting checkout.',false); return true; }
      const destination = await checkout.start(req.headers.origin,reference);
      res.writeHead(303, {Location:destination,'Cache-Control':'no-store'}); res.end();
    } else if (url.pathname === '/checkout/test/result' && req.method === 'GET') {
      if (!reference) { page(400,'Test session cookie missing. Start a new test.',false); return true; }
      const paid = await checkout.verify(url.searchParams.get('session_id'),reference);
      page(200,paid ? 'Test payment confirmed by Stripe. Nothing will be shipped.' : 'Payment is not confirmed yet. Refresh to check again.',false);
    } else page(405,'This test checkout action is unavailable.',false);
  } catch { page(503,'Unable to verify or start the test payment. Check the sandbox key and try again.',false); }
  return true;
}

