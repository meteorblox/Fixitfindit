import {createHmac,timingSafeEqual} from 'node:crypto';
import {orders as defaultOrders} from './orders.mjs';

export function verifyStripeEvent(raw,header,secret,now=Date.now(),mode='sandbox') {
  if(!secret?.startsWith('whsec_') || typeof header!=='string') throw new Error('Invalid signature');
  const parts=header.split(',').map(p=>p.trim().split('='));
  const timestamps=parts.filter(([k])=>k==='t');
  const timestamp=timestamps[0]?.[1];
  if(timestamps.length!==1 || !/^\d+$/.test(timestamp||'') || Math.abs(now/1000-Number(timestamp))>300) throw new Error('Invalid timestamp');
  const expected=createHmac('sha256',secret).update(timestamp+'.').update(raw).digest();
  if(!parts.some(([k,v])=>k==='v1' && /^[a-f0-9]{64}$/i.test(v||'') && timingSafeEqual(expected,Buffer.from(v,'hex')))) throw new Error('Invalid signature');
  const event=JSON.parse(raw.toString('utf8'));
  if(!/^evt_[a-zA-Z0-9]+$/.test(event.id||'') || event.livemode!==(mode==='live') || !['sandbox','live'].includes(mode)) throw new Error('Only sandbox events are accepted');
  return event;
}

export function createWebhookRoute({orders=defaultOrders,secret=process.env.STRIPE_WEBHOOK_SECRET,resolveSession}={}) {
  return async(req,res,url)=>{
    if(url.pathname!=='/webhooks/stripe') return false;
    const send=code=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({received:code===200}));};
    if(req.method!=='POST') {send(405);return true;}
    if(!orders || !secret?.startsWith('whsec_')) {send(503);return true;}
    let event;
    try {
      const chunks=[];let size=0;
      for await(const chunk of req) {const b=Buffer.from(chunk);size+=b.length;if(size>262144){send(413);return true;}chunks.push(b);}
      event=verifyStripeEvent(Buffer.concat(chunks),req.headers['stripe-signature'],secret);
    } catch {send(400);return true;}
    const supported=['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired'];
    let session=event.data?.object;
    if(!supported.includes(event.type) || session?.metadata?.purpose!=='fixitfindit-product-sandbox' || !session.metadata.order_id) {send(200);return true;}
    try {if(session.metadata?.address_mode==='fixed'){if(!resolveSession)throw new Error('Session resolver unavailable');const resolved=await resolveSession(session.id);if(resolved.id!==session.id)throw new Error('Session mismatch');session=resolved;}orders.recordSession(session,event.id,event.type);send(200);}
    catch {send(503);} // Return a failure so Stripe retries instead of losing an order.
    return true;
  };
}
