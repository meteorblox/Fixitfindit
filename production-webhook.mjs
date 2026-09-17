import {verifyStripeEvent} from './stripe-webhook.mjs';
export function createProductionWebhookRoute({orders,worker,secret,enabled=false}={}) {
 return async(req,res,url)=>{
  if(url.pathname!=='/webhooks/stripe-live')return false;
  const send=code=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({received:code===200}));};
  if(req.method!=='POST'){send(405);return true;}
  if(!enabled||!orders||!worker||!secret?.startsWith('whsec_')){send(503);return true;}
  let event;
  try{const chunks=[];let size=0;for await(const chunk of req){const b=Buffer.from(chunk);size+=b.length;if(size>262144){send(413);return true;}chunks.push(b);}event=verifyStripeEvent(Buffer.concat(chunks),req.headers['stripe-signature'],secret,Date.now(),'live');}catch{send(400);return true;}
  const session=event.data?.object;
  if(!['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired'].includes(event.type)||session?.metadata?.purpose!=='fixitfindit-product-live'){send(200);return true;}
  try{orders.recordSession(session,event.id,event.type);if(session.status==='complete'&&session.payment_status==='paid')worker.stage(session.metadata.order_id,session);send(200);}catch{send(503);}
  return true;
 };
}
