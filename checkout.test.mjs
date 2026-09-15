import test from 'node:test';
import assert from 'node:assert/strict';
import {createCheckout} from './checkout.mjs';
test('checkout refuses live credentials before contacting Stripe',async()=>{
  const checkout=createCheckout({key:'sk_live_example',request:()=>{throw new Error('must not call');}});
  assert.equal(checkout.enabled(),false);
  await assert.rejects(checkout.start('https://www.fixitfindit.com','ref'),/not configured/);
});
test('sandbox session fixes amount server-side and verifies paid status and ownership',async()=>{
  let payload;
  let session={livemode:false,url:'https://checkout.stripe.com/c/pay/cs_test_example',client_reference_id:'ref',metadata:{purpose:'fixitfindit-sandbox-check'},amount_total:100,currency:'usd',status:'complete',payment_status:'paid'};
  const checkout=createCheckout({key:'sk_test_example',request:async(url,options)=>{payload=options.body;return {ok:true,json:async()=>session};}});
  await checkout.start('https://www.fixitfindit.com','ref');
  assert.equal(payload.get('line_items[0][price_data][unit_amount]'),'100');
  assert.equal(await checkout.verify('cs_test_example','ref'),true);
  await assert.rejects(checkout.verify('cs_test_example','other'),/verified/);
  session={...session,payment_status:'unpaid'};
  assert.equal(await checkout.verify('cs_test_example','ref'),false);
  session={...session,livemode:true};
  await assert.rejects(checkout.verify('cs_test_example','ref'),/sandbox/);
});
