import {createCustomerTracking} from './customer-tracking.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {Readable} from 'node:stream';
import {createOrderStore} from './orders.mjs';
import {createProductionFulfillment} from './production-fulfillment.mjs';
import {createProductionWebhookRoute} from './production-webhook.mjs';
import {createProductionCj} from './production-cj.mjs';
function fixture({enabled=true}={}) {
 const orders=createOrderStore(':memory:',{mode:'live'});const o=orders.prepare('owner',{productId:'p1',variantId:'v1',name:'Brush',retailCents:4000,quoteId:'quote',automaticTax:true,shipping:{cents:0,zip:'60601',origin:'US',name:'USPS',category:'cleaning',feesConfirmed:true}});
 const session={id:'cs_live_fixture',livemode:true,currency:'usd',client_reference_id:'owner',status:'complete',payment_status:'paid',amount_subtotal:4000,amount_total:4320,automatic_tax:{enabled:true,status:'complete'},total_details:{amount_shipping:0,amount_tax:320,amount_discount:0},metadata:{tax_mode:'automatic',order_id:o.id,product_id:'p1',variant_id:'v1',retail_cents:'4000',shipping_cents:'0',quantity:'1',purpose:'fixitfindit-product-live',fulfillment:'production-review',store_id:'fixitfindit'},collected_information:{shipping_details:{name:'Test Buyer',address:{country:'US',postal_code:'60601',state:'IL',city:'Chicago',line1:'123 Test Street'}}}};
 let detail,creates=0,pays=0,failCreate=false,failPay=false;
 const cj={enabled:()=>true,create:async payload=>{creates++;detail={...payload,orderId:'child',orderNum:payload.orderNumber,productList:[{vid:'v1',quantity:1}],orderStatus:'CREATED',orderAmount:'10.00'};if(failCreate)throw new Error('lost response');return 'shipment';},detail:async()=>detail,confirm:async()=>{detail.orderStatus='UNPAID'},pay:async()=>{pays++;detail.orderStatus='UNSHIPPED';if(failPay)throw new Error('lost response')}};
 const catalog={detail:async()=>({origin:'US',variants:[{id:'v1',name:'Blue',price:500,stock:3}]}),shipping:async()=>[{name:'USPS',totalCents:500,feesConfirmed:true}]};
 const worker=createProductionFulfillment({path:':memory:',orders,catalog,cj,enabled});
 return {orders,o,session,worker,cj,catalog,getDetail:()=>detail,counts:()=>({creates,pays}),failCreate:()=>failCreate=true,failPay:()=>failPay=true,paid(){orders.recordSession(session,'evt_live','checkout.session.completed');worker.stage(o.id,session)},close(){worker.close();orders.close()}};
}
test('signed live intake stages once; unsigned/test events and browser-only confirmations cannot stage',async()=>{
 const f=fixture();try{
  f.orders.recordSession(f.session);assert.throws(()=>f.worker.stage(f.o.id,f.session));
  const secret='whsec_livefixture',route=createProductionWebhookRoute({orders:f.orders,worker:f.worker,secret,enabled:true});
  async function deliver(live=true,signed=true){const raw=JSON.stringify({id:'evt_live',livemode:live,type:'checkout.session.completed',data:{object:f.session}}),t=Math.floor(Date.now()/1000);const signature=createHmac('sha256',secret).update(t+'.'+raw).digest('hex');const req=Readable.from([raw]);req.method='POST';req.headers={'stripe-signature':signed?`t=${t},v1=${signature}`:'bad'};const res={writeHead(n){this.status=n},end(){}};await route(req,res,new URL('https://example.com/webhooks/stripe-live'));return res.status;}
  assert.equal(await deliver(true,false),400);assert.equal(await deliver(false),400);assert.equal(await deliver(),200);assert.equal(await deliver(),200);assert.equal(f.worker.summary(f.o.id).state,'ready');assert.deepEqual(f.counts(),{creates:0,pays:0});
 }finally{f.close()}
});
test('production order is created once, paid under a cap, and tracking never regresses',async()=>{
 const f=fixture();try{f.paid();await Promise.all([f.worker.submit(f.o.id),f.worker.submit(f.o.id)]);assert.equal(f.counts().creates,1);
  await assert.rejects(f.worker.pay(f.o.id,999),/budget/);assert.equal(f.counts().pays,0);
  const concurrent=await Promise.allSettled([f.worker.pay(f.o.id,1000),f.worker.pay(f.o.id,1000)]);assert.ok(concurrent.some(r=>r.status==='fulfilled'));await f.worker.pay(f.o.id,1000);assert.equal(f.counts().pays,1);
  f.getDetail().orderStatus='SHIPPED';f.getDetail().trackNumber='TRACK123';await f.worker.sync(f.o.id);assert.equal(f.worker.summary(f.o.id).trackingNumber,'TRACK123');
  f.getDetail().orderStatus='CREATED';f.getDetail().trackNumber=null;await f.worker.sync(f.o.id);assert.equal(f.worker.summary(f.o.id).state,'shipped');assert.equal(f.worker.summary(f.o.id).trackingNumber,'TRACK123');
 }finally{f.close()}
});
test('unknown creation and payment outcomes cannot be automatically repeated',async()=>{
 const f=fixture();try{f.paid();f.failCreate();await assert.rejects(f.worker.submit(f.o.id));await f.worker.submit(f.o.id);assert.equal(f.counts().creates,1);await f.worker.sync(f.o.id);await assert.rejects(f.worker.pay(f.o.id,1000));assert.equal(f.counts().pays,0);}finally{f.close()}
 const g=fixture();try{g.paid();await g.worker.submit(g.o.id);g.failPay();await assert.rejects(g.worker.pay(g.o.id,1000));await g.worker.pay(g.o.id,1000);assert.equal(g.counts().pays,1);}finally{g.close()}
});
test('disabled worker, changed recipient, missing total, and insufficient margin block mutations',async()=>{
 const f=fixture({enabled:false});try{f.paid();await assert.rejects(f.worker.submit(f.o.id));assert.equal(f.counts().creates,0);}finally{f.close()}
 const g=fixture();try{g.paid();await g.worker.submit(g.o.id);g.getDetail().shippingAddress='Different address';await assert.rejects(g.worker.pay(g.o.id,10000));assert.equal(g.counts().pays,0);g.getDetail().shippingAddress='123 Test Street';g.getDetail().orderAmount=null;await assert.rejects(g.worker.pay(g.o.id,10000));g.getDetail().orderAmount='35.00';await assert.rejects(g.worker.pay(g.o.id,10000));assert.equal(g.counts().pays,0);}finally{g.close()}
});
test('production CJ adapter is disabled by default and always creates unpaid live drafts',async()=>{
 const disabled=createProductionCj({apiKey:'test',request:()=>assert.fail('Network access while disabled')});await assert.rejects(disabled.detail('order'));
 const bodies=[];const cj=createProductionCj({apiKey:'test',enabled:true,interval:0,request:async(url,o)=>{const body=o.body?JSON.parse(o.body):null;bodies.push({url,body});return {ok:true,json:async()=>({result:true,data:url.includes('getAccessToken')?{accessToken:'test'}:{orderId:'shipment'}})}}});
 await assert.rejects(cj.create({isSandbox:1,payType:3}));await cj.create({isSandbox:0,payType:3,orderNumber:'FITLIVE-12345678-1234-1234-1234-123456789abc',products:[{vid:'v1',quantity:1}],unexpected:'ignored'});const sent=bodies.at(-1).body;assert.equal(sent.payType,3);assert.equal(sent.isSandbox,0);assert.equal(sent.unexpected,undefined);assert.ok(!bodies.some(x=>x.url.includes('payBalance')));
});
test('sandbox and live stored payments cannot cross modes',()=>{const f=fixture();try{const sandbox=createOrderStore(':memory:');try{assert.throws(()=>sandbox.recordSession(f.session));assert.throws(()=>f.orders.recordSession({...f.session,livemode:false,id:'cs_test_fixture'}));}finally{sandbox.close()}}finally{f.close()}});


test('manual supplier payment mode refuses wallet deductions without contacting CJ',async()=>{
 let calls=0;const cj=createProductionCj({enabled:true,apiKey:'fixture',request:()=>{calls++;throw Error('No network expected');}});
 await assert.rejects(cj.pay('shipment'),/Manual CJ payment required/);assert.equal(calls,0);
});

test('manual launch flow joins signed payment, owner queue, CJ sync, private tracking and refund hold',async()=>{
 const f=fixture();const tracking=createCustomerTracking({path:':memory:',orders:f.orders,worker:f.worker});
 try{
  assert.equal(tracking.link(f.o.id),null);
  const secret='whsec_flowtest',route=createProductionWebhookRoute({orders:f.orders,worker:f.worker,secret,enabled:true});
  const raw=JSON.stringify({id:'evt_flowtest',type:'checkout.session.completed',livemode:true,data:{object:{...f.session,payment_intent:'pi_flowtest'}}}),time=Math.floor(Date.now()/1000);
  const deliver=async()=>{const req=Readable.from([raw]);req.method='POST';req.headers={'stripe-signature':'t='+time+',v1='+createHmac('sha256',secret).update(time+'.'+raw).digest('hex')};const res={writeHead(s){this.status=s;},end(){}};await route(req,res,new URL('https://example.com/webhooks/stripe-live'));assert.equal(res.status,200);};
  await deliver();await deliver();assert.equal(f.orders.listPaid().length,1);assert.equal(f.worker.list().length,1);assert.deepEqual(f.counts(),{creates:0,pays:0});
  const url=new URL(tracking.link(f.o.id),'https://example.com');const read=()=>tracking.resolve(url.searchParams.get('order'),url.searchParams.get('key'));
  assert.equal(read().status,'Preparing your order');await f.worker.submit(f.o.id);await f.worker.submit(f.o.id);assert.deepEqual(f.counts(),{creates:1,pays:0});
  // Simulate owner payment in MyCJ; application never calls the payment endpoint.
  f.getDetail().orderStatus='UNSHIPPED';await f.worker.sync(f.o.id);assert.equal(read().status,'Preparing for shipment');
  f.getDetail().orderStatus='SHIPPED';f.getDetail().trackNumber='MANUALTRACK';f.getDetail().trackingProvider='USPS';await f.worker.sync(f.o.id);
  assert.equal(read().tracking,'MANUALTRACK');assert.equal(f.worker.list()[0].trackingNumber,'MANUALTRACK');assert.deepEqual(f.counts(),{creates:1,pays:0});
  const revision=f.orders.refunds.begin(f.o.id);f.orders.refunds.save(f.o.id,revision,[{id:'re_flowtest',payment_intent:'pi_flowtest',currency:'usd',amount:4320,status:'succeeded'}]);
  assert.equal(f.worker.list()[0].fulfillmentHold,true);assert.equal(read().review,true);assert.equal(read().status,'Shipped');await assert.rejects(f.worker.submit(f.o.id),/Refund/);
 }finally{tracking.close();f.close();}
});
