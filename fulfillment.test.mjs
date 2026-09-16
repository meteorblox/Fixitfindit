import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createHmac} from 'node:crypto';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createOrderStore} from './orders.mjs';
import {createWebhookRoute} from './stripe-webhook.mjs';
import {createCjFulfillment} from './cj-fulfillment.mjs';
import {createFulfillmentWorker} from './fulfillment-worker.mjs';
import {createCheckout} from './checkout.mjs';
import {pricingVersion} from './pricing-policy.mjs';

const secret='whsec_fixture';
const item={productId:'1696373349800226816',variantId:'1696373349854752768',name:'Faucet',retailCents:1700,automaticTax:true,quoteId:'quote-fixture',
  shipping:{cents:650,zip:'60601',name:'Test carrier',origin:'CN',feesConfirmed:true}};
function fixture(path=':memory:',purchase=item) {
  const orders=createOrderStore(path),order=orders.prepare('owner',purchase);
  const session={id:'cs_test_fulfillment',livemode:false,client_reference_id:'owner',currency:'usd',status:'complete',payment_status:'paid',
    amount_subtotal:1700,amount_total:2538,total_details:{amount_tax:188,amount_shipping:650,amount_discount:0},automatic_tax:{enabled:true,status:'complete'},
    metadata:{purpose:'fixitfindit-product-sandbox',fulfillment:'sandbox-do-not-ship',store_id:'fixitfindit',order_id:order.id,product_id:item.productId,variant_id:item.variantId,retail_cents:'1700',shipping_cents:'650',shipping_zip:'60601',quantity:'1',tax_mode:'automatic'},
    collected_information:{shipping_details:{name:'Sandbox Recipient',address:{country:'US',postal_code:'60601',state:'IL',city:'Chicago',line1:'123 Test Street',line2:''}}}};
  session.amount_subtotal=purchase.retailCents;
  session.total_details.amount_shipping=purchase.shipping.cents;
  session.amount_total=purchase.retailCents+purchase.shipping.cents+188;
  session.metadata.retail_cents=String(purchase.retailCents);
  session.metadata.shipping_cents=String(purchase.shipping.cents);
  return {orders,order,session};
}
async function notify(orders,session,eventId='evt_fixture') {
  const raw=Buffer.from(JSON.stringify({id:eventId,livemode:false,type:'checkout.session.completed',data:{object:session}}));
  const t=Math.floor(Date.now()/1000),signature=createHmac('sha256',secret).update(t+'.').update(raw).digest('hex');
  const req=Readable.from([raw]);req.method='POST';req.headers={'stripe-signature':`t=${t},v1=${signature}`};
  const res={writeHead(status){this.status=status;},end(){}};
  await createWebhookRoute({orders,secret})(req,res,new URL('https://www.fixitfindit.com/webhooks/stripe'));
  return res.status;
}
function supplier({loseCreate=false,losePayment=false,loseConfirmation=false,shipmentId=false}={}) {
  let remote=null,creates=0,payments=0;
  const calls=[];
  const cj=createCjFulfillment({apiKey:'fixture-secret',mode:'sandbox',interval:0,request:async(url,options)=>{
    const path=new URL(url).pathname,body=options.body?JSON.parse(options.body):null;
    calls.push({path,body});
    let data;
    if(path.endsWith('/authentication/getAccessToken')) data={accessToken:'fixture-token',accessTokenExpiryDate:'2099-01-01'};
    else if(path.endsWith('/createOrderV2')) {
      creates++;
      assert.equal(body.isSandbox,1);assert.equal(body.payType,3);
      remote={orderId:'CJ-SANDBOX-1',orderNum:body.orderNumber,isSandbox:1,orderStatus:'CREATED',shippingCountryCode:'US',productList:[{vid:body.products[0].vid,quantity:1}],trackNumber:null};
      if(loseCreate) throw new Error('Connection lost after CJ accepted the order');
      data={orderId:shipmentId?'SD-FIXTURE':remote.orderId};
    } else if(path.endsWith('/getOrderDetail')) {
      const id=new URL(url).searchParams.get('orderId');
      assert.ok(remote && [remote.orderId,remote.orderNum,...(shipmentId?['SD-FIXTURE']:[])].includes(id));data={...remote};
    } else if(path.endsWith('/confirmOrder')) {
      assert.equal(options.method,'PATCH');assert.equal(body.orderId,shipmentId?'SD-FIXTURE':remote.orderId);
      remote.orderStatus='UNPAID';
      if(loseConfirmation) throw new Error('Lost confirmation response');data=true;
    } else if(path.endsWith('/sandbox/simulatePay')) {
      assert.equal(body.orderId,shipmentId?'SD-FIXTURE':remote.orderId);assert.equal(remote.orderStatus,'UNPAID');payments++;remote.orderStatus='UNSHIPPED';
      if(losePayment) throw new Error('Connection lost after simulated payment');
      data=true;
    } else if(path.endsWith('/sandbox/updateTrackNumber')) {assert.equal(body.orderId,shipmentId?'SD-FIXTURE':remote.orderId);remote.trackNumber=body.trackNumber;remote.trackingProvider='Fixture carrier';data=true;}
    else assert.fail('Unexpected supplier operation: '+path);
    return {ok:true,json:async()=>({result:true,data})};
  }});
  return {cj,calls,get remote(){return remote;},get creates(){return creates;},get payments(){return payments;}};
}
const catalog={detail:async()=>({variants:[{id:item.variantId,stock:5,price:190}]})};

test('included shipping survives webhook and supplier cost increases block creation',async()=>{
  const purchase={...item,retailCents:2299,shipping:{...item.shipping,cents:0,supplierCents:650,supplierProductCents:190,pricingVersion}};
  const {orders,order,session}=fixture(':memory:',purchase);await notify(orders,session);
  assert.equal(orders.fulfillment.get(order.id).state,'ready');
  let price=2000,freight=650;
  const current={detail:async()=>({origin:'CN',variants:[{id:item.variantId,stock:5,price}]}),shipping:async()=>[{name:'Test carrier',totalCents:freight,feesConfirmed:true}]};
  const mock=supplier(),worker=createFulfillmentWorker({orders,cj:mock.cj,catalog:current});
  await assert.rejects(worker.submit(order.id),/minimum margin/);
  assert.equal(mock.creates,0);assert.equal(orders.fulfillment.get(order.id).state,'ready');
  price=190;freight=2000;
  await assert.rejects(worker.submit(order.id),/minimum margin/);assert.equal(mock.creates,0);
  freight=650;await worker.submit(order.id);assert.equal(mock.creates,1);
  assert.equal(orders.get(order.id).shipping_cents,0);
  assert.equal(JSON.parse(orders.get(order.id).shipping_snapshot).supplierCents,650);orders.close();
});

test('CJ shipment code is preserved for mutations while child order identity stays pinned',async()=>{
  const {orders,order,session}=fixture();await notify(orders,session);
  const mock=supplier({shipmentId:true}),worker=createFulfillmentWorker({orders,cj:mock.cj,catalog});
  await worker.submit(order.id);
  assert.equal(orders.fulfillment.get(order.id).cj_order_id,'SD-FIXTURE');
  assert.equal(orders.fulfillment.get(order.id).cj_detail_order_id,'CJ-SANDBOX-1');
  await worker.simulatePayment(order.id);await worker.simulateTracking(order.id,'SBX-MAPPING');
  assert.equal(orders.fulfillment.get(order.id).track_number,'SBX-MAPPING');
  assert.throws(()=>orders.fulfillment.sync(order.id,{...mock.remote,orderId:'different-child'}),/identity mismatch/);
  assert.equal(mock.creates,1);assert.equal(mock.payments,1);orders.close();
});

test('lost confirmation response reconciles before one simulated payment',async()=>{
  const {orders,order,session}=fixture();await notify(orders,session);
  const mock=supplier({loseConfirmation:true}),worker=createFulfillmentWorker({orders,cj:mock.cj,catalog});
  await worker.submit(order.id);
  await assert.rejects(worker.simulatePayment(order.id),/confirmation outcome/);
  assert.equal(orders.fulfillment.get(order.id).state,'confirming');assert.equal(mock.payments,0);
  await worker.simulatePayment(order.id);
  assert.equal(mock.calls.filter(c=>c.path.endsWith('/confirmOrder')).length,1);
  assert.equal(mock.payments,1);orders.close();
});

test('signed payment enqueues once; sandbox submission, payment and tracking return to the owning checkout',async()=>{
  const {orders,order,session}=fixture();
  orders.recordSession(session); // Returning browser alone cannot enqueue fulfillment.
  assert.equal(orders.fulfillment.get(order.id),undefined);
  assert.equal(await notify(orders,session),200);
  assert.equal(await notify(orders,session),200);
  assert.equal(await notify(orders,session,'evt_duplicatepaid'),200);
  assert.equal(orders.fulfillment.list().length,1);
  assert.equal(orders.fulfillment.get(order.id).state,'ready');
  const mock=supplier(),worker=createFulfillmentWorker({orders,cj:mock.cj,catalog});
  await Promise.all([worker.submit(order.id),worker.submit(order.id)]);
  assert.equal(mock.creates,1);
  assert.equal(orders.fulfillment.get(order.id).state,'created');
  await worker.simulatePayment(order.id);await worker.simulatePayment(order.id);
  assert.equal(mock.payments,1);
  await worker.simulateTracking(order.id,'SBX-TEST123');
  mock.remote.orderStatus='SHIPPED';await worker.sync(order.id);
  const checkout=createCheckout({key:'sk_test_fixture',orders,request:async()=>({ok:true,json:async()=>session})});
  const result=await checkout.verifyProduct(session.id,'owner');
  assert.deepEqual(result.fulfillment,{mode:'sandbox',state:'shipped',supplierStatus:'SHIPPED',trackingNumber:'SBX-TEST123',trackingProvider:'Fixture carrier'});
  await assert.rejects(checkout.verifyProduct(session.id,'another-owner'));
  assert.ok(!JSON.stringify(result.fulfillment).includes('Test Street'));
  assert.ok(!JSON.stringify(orders.fulfillment.list()).includes('Test Street'));
  mock.remote.orderStatus='DELIVERED';await worker.sync(order.id);
  mock.remote.orderStatus='UNSHIPPED';mock.remote.trackNumber=null;await worker.sync(order.id);
  assert.equal(orders.fulfillment.get(order.id).state,'delivered');
  assert.equal(orders.fulfillment.get(order.id).track_number,'SBX-TEST123');
  orders.close();
});

test('uncertain creation survives restart and reconciles by custom order number without another create',async()=>{
  const path=join(mkdtempSync(join(tmpdir(),'fit-fulfillment-')),'orders.sqlite');
  const f=fixture(path);let orders=f.orders;
  await notify(orders,f.session);
  const mock=supplier({loseCreate:true});
  await assert.rejects(createFulfillmentWorker({orders,cj:mock.cj,catalog}).submit(f.order.id),/uncertain/);
  assert.equal(orders.fulfillment.get(f.order.id).state,'creating');
  orders.close();orders=createOrderStore(path);
  const worker=createFulfillmentWorker({orders,cj:mock.cj,catalog});
  await worker.submit(f.order.id);assert.equal(mock.creates,1);
  await worker.sync(f.order.id);
  assert.equal(orders.fulfillment.get(f.order.id).cj_order_id,'CJ-SANDBOX-1');
  assert.equal(orders.fulfillment.get(f.order.id).state,'created');
  orders.close();
});

test('uncertain simulated payment reconciles without duplicate payment',async()=>{
  const {orders,order,session}=fixture();await notify(orders,session);
  const mock=supplier({losePayment:true}),worker=createFulfillmentWorker({orders,cj:mock.cj,catalog});
  await worker.submit(order.id);
  await assert.rejects(worker.simulatePayment(order.id),/uncertain/);
  assert.equal(orders.fulfillment.get(order.id).state,'paying');
  await worker.simulatePayment(order.id);assert.equal(mock.payments,1);
  assert.equal(orders.fulfillment.get(order.id).state,'paid');orders.close();
});

test('missing or mismatched recipient blocks fulfillment but preserves paid state',async()=>{
  for(const change of [s=>s.collected_information.shipping_details.address.postal_code='90210',s=>delete s.collected_information,s=>s.collected_information.shipping_details.name='']) {
    const {orders,order,session}=fixture();change(session);
    assert.equal(await notify(orders,session),200);
    assert.equal(orders.get(order.id).status,'paid_sandbox');
    assert.equal(orders.fulfillment.get(order.id).state,'blocked');
    const mock=supplier();
    await assert.rejects(createFulfillmentWorker({orders,cj:mock.cj,catalog}).submit(order.id));
    assert.equal(mock.calls.length,0);orders.close();
  }
});

test('queue storage failure rolls back payment/event together so Stripe can retry',async()=>{
  const path=join(mkdtempSync(join(tmpdir(),'fit-atomic-')),'orders.sqlite');
  const {orders,order,session}=fixture(path),db=new DatabaseSync(path);
  db.exec("CREATE TRIGGER fail_queue BEFORE INSERT ON fulfillment_jobs BEGIN SELECT RAISE(ABORT,'simulated disk failure'); END;");
  assert.equal(await notify(orders,session),503);
  assert.equal(orders.get(order.id).status,'pending');assert.equal(orders.hasWebhook(order.id),false);
  db.exec('DROP TRIGGER fail_queue');assert.equal(await notify(orders,session),200);
  assert.equal(orders.fulfillment.get(order.id).state,'ready');db.close();orders.close();
});

test('disabled/live modes and unverified CJ orders cannot reach simulated mutations',async()=>{
  for(const mode of [undefined,'live','production']) {
    const cj=createCjFulfillment({apiKey:'fixture',mode,request:()=>assert.fail('must not contact CJ')});
    await assert.rejects(cj.detail('some-id'));
  }
  const {orders,order,session}=fixture();await notify(orders,session);
  const mock=supplier(),worker=createFulfillmentWorker({orders,cj:mock.cj,catalog});
  await worker.submit(order.id);
  mock.remote.isSandbox=0;await assert.rejects(worker.simulatePayment(order.id));
  assert.equal(mock.payments,0);
  mock.remote.isSandbox=1;mock.remote.orderNum='someone-elses-order';
  await assert.rejects(worker.sync(order.id));assert.equal(mock.payments,0);
  await assert.rejects(mock.cj.create({isSandbox:0,payType:2}));
  orders.close();
});

test('stock loss prevents submission before the irreversible claim',async()=>{
  const {orders,order,session}=fixture();await notify(orders,session);
  const mock=supplier();
  await assert.rejects(createFulfillmentWorker({orders,cj:mock.cj,catalog:{detail:async()=>({variants:[{id:item.variantId,stock:0}]})}}).submit(order.id),/stock/);
  assert.equal(mock.creates,0);assert.equal(orders.fulfillment.get(order.id).state,'ready');orders.close();
});
