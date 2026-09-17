import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {Readable} from 'node:stream';
import {createCheckout} from './checkout.mjs';
import {createOrderStore} from './orders.mjs';
import {createRefundTracking} from './refund-tracking.mjs';
import {createProductionWebhookRoute} from './production-webhook.mjs';
import {productCheckoutPage,createProductCheckoutRoute} from './product-checkout.mjs';
const recipient={name:'Test Buyer',address:{country:'US',postal_code:'60601',state:'IL',city:'Chicago',line1:'123 Test Street',line2:''}};
test('live checkout is separately gated and cannot use sandbox credentials or store',async()=>{
 for(const opts of [{key:'sk_live_fixture'},{key:'sk_test_fixture',allowLive:true},{key:'sk_live_fixture',allowLive:true,orders:{mode:'sandbox'}}]){
 const c=createCheckout({mode:'live',orders:{mode:'live'},request:()=>{throw Error('No network allowed');},...opts});assert.equal(c.enabled(),false);await assert.rejects(c.startProduct('https://www.fixitfindit.com','owner',{}));}
 const c=createCheckout({key:'sk_live_fixture',mode:'live',allowLive:true,orders:{mode:'live'}});await assert.rejects(c.start('https://www.fixitfindit.com','owner'));await assert.rejects(c.retrieve('cs_test_fixture'));
});
test('live payment verifies fixed address, signed intake and refunds while checkout is closed',async()=>{
 const orders=createOrderStore(':memory:',{mode:'live'});let session,refunded=false,stageCount=0;
 const request=async(url,opts)=>{
 if(url.endsWith('/customers'))return {ok:true,json:async()=>({id:'cus_fixture',livemode:true})};
 if(url.endsWith('/checkout/sessions')){const p=opts.body;const metadata={};for(const [k,v]of p)if(k.startsWith('metadata['))metadata[k.slice(9,-1)]=v;
 assert.equal(p.get('line_items[0][price_data][unit_amount]'),'12700');assert.equal(p.get('metadata[purpose]'),'fixitfindit-product-live');assert.ok(!p.get('line_items[0][price_data][product_data][name]').includes('SANDBOX'));assert.ok(p.get('success_url').includes('/checkout/live/result'));
 session={id:'cs_live_fixture',livemode:true,url:'https://checkout.stripe.com/c/pay/cs_live_fixture',metadata,client_reference_id:'owner',currency:'usd',status:'open',payment_status:'unpaid',amount_subtotal:12700,amount_total:14034,total_details:{amount_tax:1334,amount_discount:0,amount_shipping:0},automatic_tax:{enabled:true,status:'complete'}};return {ok:true,json:async()=>session};}
 if(url.includes('/checkout/sessions/cs_live_fixture'))return {ok:true,json:async()=>({...session,customer:{livemode:true,shipping:recipient}})};
 if(url.includes('/payment_intents/'))return {ok:true,json:async()=>({id:'pi_fixture',livemode:true,currency:'usd',amount_received:14034})};
 if(url.includes('/refunds?'))return {ok:true,json:async()=>({object:'list',has_more:false,data:refunded?[{id:'re_fixture',amount:14034,currency:'usd',payment_intent:'pi_fixture',status:'succeeded'}]:[]})};throw Error('Unexpected request');};
 try{
 const c=createCheckout({mode:'live',allowLive:true,key:'sk_live_fixture',orders,request});await c.startProduct('https://www.fixitfindit.com','owner',{productId:'p1',variantId:'v1',name:'Faucet',retailCents:12700,quoteId:'q1',partner:{id:'partner-one'},shipping:{name:'UPS',cents:0,zip:'60601',recipient}});
 session={...session,status:'complete',payment_status:'paid',payment_intent:'pi_fixture'};
 const closed=createCheckout({mode:'live',allowLive:false,key:'sk_live_fixture',orders,request});assert.equal(closed.enabled(),false);
 const refunds=createRefundTracking({mode:'live',key:'sk_live_fixture',orders,request,resolveSession:closed.retrieve});
 const secret='whsec_fixture';const route=createProductionWebhookRoute({enabled:true,secret,orders,worker:{stage(){stageCount++;}},resolveSession:closed.retrieve,refundTracking:refunds});
 async function deliver(type,object,id){const raw=JSON.stringify({id,type,livemode:true,data:{object}}),t=Math.floor(Date.now()/1000);const req=Readable.from([raw]);req.method='POST';req.headers={'stripe-signature':`t=${t},v1=${createHmac('sha256',secret).update(t+'.'+raw).digest('hex')}`};const res={writeHead(c){this.status=c},end(){}};await route(req,res,new URL('https://example.com/webhooks/stripe-live'));return res.status;}
 assert.equal(await deliver('checkout.session.completed',session,'evt_paid'),200);const id=session.metadata.order_id;assert.equal(orders.get(id).shipping_address_matches,1);assert.equal(stageCount,1);assert.equal(orders.affiliates.summary(id).netCommissionCents,635);
 refunded=true;assert.equal(await deliver('refund.created',{payment_intent:'pi_fixture'},'evt_refund'),200);assert.equal(orders.affiliates.summary(id).netCommissionCents,0);assert.equal(orders.refunds.summary(id).fulfillmentHold,true);
 }finally{orders.close();}
});
test('live page uses real-payment copy and stays closed without activation',async()=>{
 const html=productCheckoutPage({mode:'live',enabled:true});assert.ok(html.includes('/checkout/live/quote'));assert.ok(!html.includes('4242'));assert.ok(!html.includes('SANDBOX'));assert.ok(!html.includes('No money moves'));
 const route=createProductCheckoutRoute({mode:'live',catalog:{},checkout:{enabled:()=>false}});const req={method:'GET',headers:{}};const res={writeHead(n){this.code=n},end(s){this.body=s}};await route(req,res,new URL('https://www.fixitfindit.com/checkout/live'));assert.equal(res.code,503);assert.ok(res.body.includes('not open yet'));
});
