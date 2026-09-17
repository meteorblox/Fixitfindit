// Read-only Stripe integration. Never creates refunds or moves money.
export function createRefundTracking({orders,key=process.env.STRIPE_SECRET_KEY,request=fetch,resolveSession,mode="sandbox"}){
 if(!['sandbox','live'].includes(mode))throw Error('Invalid refund mode');
 const live=mode==='live',pattern=live?/^cs_live_[a-zA-Z0-9]+$/:/^cs_test_[a-zA-Z0-9]+$/;
 async function get(path){if(!key?.startsWith(live?'sk_live_':'sk_test_'))throw Error('Refund tracking requires a Stripe test key');const response=await request('https://api.stripe.com/v1/'+path,{headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Stripe refund lookup failed; retry reconciliation');return response.json();}
 async function sync(id){
  let order=orders.get(id);if(!order||order.mode!==mode||order.status!==('paid_'+mode)||!pattern.test(order.session_id||''))throw Error('Paid sandbox order required');
  if(!order.payment_intent){if(!resolveSession)throw Error('Session resolver required for historical order');orders.recordSession(await resolveSession(order.session_id));order=orders.get(id);}
  if(!/^pi_[a-zA-Z0-9]+$/.test(order.payment_intent||''))throw Error('Payment identity unavailable');
  const revision=orders.refunds.begin(id),pi=await get('payment_intents/'+order.payment_intent);
  if(pi.id!==order.payment_intent||pi.livemode!==live||pi.currency!=='usd'||pi.amount_received!==order.total_cents)throw Error('Stripe payment does not match order');
  const rows=[];let cursor='';const cursors=new Set();
  for(let page=0;page<100;page++){
   const result=await get('refunds?payment_intent='+order.payment_intent+'&limit=100'+(cursor?'&starting_after='+cursor:''));
   if(result.object!=='list'||!Array.isArray(result.data)||typeof result.has_more!=='boolean')throw Error('Invalid refund list');rows.push(...result.data);
   if(!result.has_more)return orders.refunds.save(id,revision,rows);
   cursor=result.data.at(-1)?.id;if(!/^re_[a-zA-Z0-9]+$/.test(cursor||'')||cursors.has(cursor))throw Error('Incomplete refund pagination');cursors.add(cursor);
  }throw Error('Refund history exceeds reconciliation limit');
 }
 async function event(e){if(e.livemode!==undefined&&e.livemode!==live)throw Error("Refund event mode mismatch");const r=e.data?.object,pi=typeof r?.payment_intent==='string'?r.payment_intent:r?.payment_intent?.id;if(!/^pi_[a-zA-Z0-9]+$/.test(pi||''))throw Error('Refund payment identity missing');let id=orders.refunds.findPayment(pi);
  if(!id){const sessions=await get('checkout/sessions?payment_intent='+pi+'&limit=100');if(sessions.object!=='list'||!Array.isArray(sessions.data)||sessions.has_more!==false)throw Error('Cannot resolve refund order');for(const session of sessions.data){const candidate=orders.get(session.metadata?.order_id||'');if(candidate&&candidate.mode===mode&&(!candidate.session_id||candidate.session_id===session.id)&&session.metadata?.purpose===('fixitfindit-product-'+mode)){if(!resolveSession)throw Error('Session resolver required');orders.recordSession(await resolveSession(session.id));id=orders.refunds.findPayment(pi);break;}}if(!id)return {ignored:true};}
  orders.refunds.hold(id);return sync(id);}
 return {sync,event};
}
