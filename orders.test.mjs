import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHmac} from 'node:crypto';
import {Readable} from 'node:stream';
import {createOrderStore} from './orders.mjs';
import {createWebhookRoute,verifyStripeEvent} from './stripe-webhook.mjs';

const item={productId:'prod1',variantId:'var1',name:'Test item',retailCents:1700};
const session=row=>({id:'cs_test_example',livemode:false,client_reference_id:'owner',amount_total:1700,currency:'usd',status:'complete',payment_status:'paid',metadata:{purpose:'fixitfindit-product-sandbox',fulfillment:'sandbox-do-not-ship',store_id:'fixitfindit',order_id:row.id,product_id:'prod1',variant_id:'var1',retail_cents:'1700',quantity:'1'}});
test('orders survive a database reopen, preserve snapshots and deduplicate notifications',()=>{
  const path=join(mkdtempSync(join(tmpdir(),'fixit-orders-')),'test.sqlite');
  let db=createOrderStore(path);
  const row=db.prepare('owner',item);
  assert.equal(db.prepare('owner',item).id,row.id);
  assert.throws(()=>db.prepare('owner',{...item,retailCents:100}));
  db.recordSession(session(row),'evt_example');
  db.recordSession(session(row),'evt_example');
  db.close();db=createOrderStore(path);
  assert.equal(db.get(row.id).status,'paid_sandbox');
  db.recordSession({...session(row),status:'expired',payment_status:'unpaid'},'evt_late','checkout.session.expired');
  assert.equal(db.get(row.id).status,'paid_sandbox');
  assert.throws(()=>db.recordSession({...session(row),amount_total:1},'evt_bad'));
  assert.throws(()=>db.recordSession({...session(row),client_reference_id:'intruder'},'evt_bad'));
  assert.throws(()=>db.recordSession({...session(row),livemode:true},'evt_live'));
  db.close();
});
const secret='whsec_testonly';
const sign=(raw,t=Math.floor(Date.now()/1000))=>`t=${t},v1=${createHmac('sha256',secret).update(t+'.').update(raw).digest('hex')}`;
test('webhook signatures reject altered payloads, old timestamps and live events',()=>{
  const raw=Buffer.from(JSON.stringify({id:'evt_test',livemode:false}));
  assert.equal(verifyStripeEvent(raw,sign(raw),secret).id,'evt_test');
  assert.throws(()=>verifyStripeEvent(Buffer.concat([raw,Buffer.from(' ')]),sign(raw),secret));
  assert.throws(()=>verifyStripeEvent(raw,sign(raw,1),secret));
  const live=Buffer.from(JSON.stringify({id:'evt_live',livemode:true}));
  assert.throws(()=>verifyStripeEvent(live,sign(live),secret));
});
test('signed webhook records payment without a customer return and asks Stripe to retry storage failures',async()=>{
  const orders=createOrderStore(':memory:');
  const row=orders.prepare('owner',item);
  const raw=Buffer.from(JSON.stringify({id:'evt_offline',livemode:false,type:'checkout.session.completed',data:{object:session(row)}}));
  const run=async route=>{
    const req=Readable.from([raw]);req.method='POST';req.headers={'stripe-signature':sign(raw)};
    const res={writeHead(code){this.status=code;},end(){}};
    await route(req,res,new URL('https://www.fixitfindit.com/webhooks/stripe'));return res.status;
  };
  assert.equal(await run(createWebhookRoute({orders,secret})),200);
  assert.equal(orders.get(row.id).status,'paid_sandbox');
  assert.equal(await run(createWebhookRoute({orders:{recordSession(){throw new Error('disk unavailable');}},secret})),503);
  orders.close();
});
