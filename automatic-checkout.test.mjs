import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {checkoutItem,createProductCheckoutRoute} from './product-checkout.mjs';
import {createQuoteStore} from './shipping-quotes.mjs';
import {createCheckout} from './checkout.mjs';
import {createOrderStore} from './orders.mjs';
const owner='12345678-1234-1234-1234-123456789abc';
const origin='https://www.fixitfindit.com';
function fixture(){let freight=500,stock=2;return {setFreight:n=>freight=n,setStock:n=>stock=n,catalog:{list:async()=>({products:[{id:'p1',name:'Test brush'}]}),detail:async()=>({origin:'US',variants:[{id:'v1',name:'Blue',price:500,stock}]}),shipping:async()=>[{name:'USPS',totalCents:freight,feesConfirmed:true,days:'3-7'}]}};}
async function run(route,path,body='',cookie=owner){const req=Readable.from(body?[body]:[]);req.method=body?'POST':'GET';req.headers={origin,cookie:'fit_product='+cookie,'content-type':'application/x-www-form-urlencoded'};const res={headers:{},setHeader(k,v){this.headers[k]=v},writeHead(status,headers){this.status=status;Object.assign(this.headers,headers)},end(html){this.html=html}};await route(req,res,new URL(origin+'/checkout/products'+path));return res;}
test('automatic catalog checkout carries trusted price through Stripe and a paid stored order',async()=>{
 const f=fixture(),quotes=createQuoteStore(':memory:'),orders=createOrderStore(':memory:');let submitted,session;
 try {
 const checkout=createCheckout({key:'sk_test_fixture',orders,request:async(url,options)=>{
  if(options.body){submitted=new URLSearchParams(options.body);const metadata={};for(const [k,v]of submitted)if(k.startsWith('metadata['))metadata[k.slice(9,-1)]=v;session={id:'cs_test_auto',livemode:false,url:'https://checkout.stripe.com/test',client_reference_id:owner,currency:'usd',status:'open',payment_status:'unpaid',amount_subtotal:2500,automatic_tax:{enabled:true,status:'requires_location_inputs'},metadata};}
  return {ok:true,json:async()=>session};
 }});
 const route=createProductCheckoutRoute({requireAddress:false,catalog:f.catalog,quotes,checkout,resolvePartner:()=>({id:'demo-home-helper',slug:'home-helper'})});
 const page=await run(route,'?product=p1&category=cleaning&variant=v1&zip=60601');assert.equal(page.status,200);assert.match(page.html,/Test brush/);assert.match(page.html,/name="product" value="p1"/);assert.match(page.headers['Set-Cookie'],new RegExp(owner));
 const quote=await run(route,'/quote','product=p1&category=cleaning&variant=v1&zip=60601&retailCents=1');assert.equal(quote.status,200);assert.match(quote.html,/\$25.00/);const id=quote.html.match(/name="quote" value="([^"]+)"/)[1];
 const started=await run(route,'/start','quote='+id+'&retailCents=1&product=other');assert.equal(started.status,303);assert.equal(submitted.get('line_items[0][price_data][unit_amount]'),'2500');assert.equal(submitted.get('metadata[partner_id]'),'demo-home-helper');assert.equal(submitted.get('metadata[product_id]'),'p1');assert.equal(submitted.get('metadata[variant_id]'),'v1');
 session={...session,status:'complete',payment_status:'paid',amount_total:2700,total_details:{amount_shipping:0,amount_tax:200,amount_discount:0},automatic_tax:{enabled:true,status:'complete'},collected_information:{shipping_details:{address:{country:'US',postal_code:'60601'}}}};
 orders.recordSession(session,'evt_auto','checkout.session.completed');const paid=await checkout.verifyProduct(session.id,owner);assert.equal(paid.paid,true);assert.equal(paid.retailCents,2500);assert.equal(orders.get(session.metadata.order_id).status,'paid_sandbox');assert.equal(orders.affiliates.summary(session.metadata.order_id).gross_cents,125);
 } finally {quotes.close();orders.close();}
});
test('automatic checkout rejects unknown membership, stale costs, stock loss and foreign quote owners',async()=>{
 const f=fixture();await assert.rejects(checkoutItem(f.catalog,'v1',{category:'cleaning',productId:'missing'}));await assert.rejects(checkoutItem(f.catalog,'wrong',{category:'cleaning',productId:'p1'}));await assert.rejects(checkoutItem(f.catalog,'v1',{category:'unknown',productId:'p1'}));await assert.rejects(checkoutItem(f.catalog,'v1',{category:'kitchen',productId:'1696373349800226816'}));
 const quotes=createQuoteStore(':memory:');let calls=0;const route=createProductCheckoutRoute({requireAddress:false,catalog:f.catalog,quotes,checkout:{enabled:()=>true,startProduct:async()=>{calls++;return 'https://checkout.stripe.com/test'}}});
 try {const page=await run(route,'/quote','product=p1&category=cleaning&variant=v1&zip=60601');const id=page.html.match(/name="quote" value="([^"]+)"/)[1];
 assert.equal((await run(route,'/start','quote='+id,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')).status,409);
 f.setFreight(501);assert.equal((await run(route,'/start','quote='+id)).status,409);
 f.setFreight(500);f.setStock(0);assert.equal((await run(route,'/start','quote='+id)).status,503);assert.equal(calls,0);
 }finally{quotes.close();}
});
