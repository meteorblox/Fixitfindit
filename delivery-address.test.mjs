import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {recipientFromForm,sameRecipient} from './delivery-address.mjs';
import {createCheckout} from './checkout.mjs';
import {createOrderStore} from './orders.mjs';
import {createQuoteStore} from './shipping-quotes.mjs';
import {createProductCheckoutRoute} from './product-checkout.mjs';
const recipient={name:'Test Buyer',address:{line1:'123 Test Street',line2:'Unit 2',city:'Chicago',state:'IL',postal_code:'60601',country:'US'}};
test('required address rejects missing and invalid fields and compares the full recipient',()=>{
 const form=new URLSearchParams({name:recipient.name,...recipient.address,zip:'60601'});
 assert.deepEqual(recipientFromForm(form),recipient);form.set('state','ZZ');assert.throws(()=>recipientFromForm(form));
 assert.equal(sameRecipient(recipient,{...recipient,address:{...recipient.address,line1:'124 Test Street'}}),false);
 assert.equal(sameRecipient(recipient,{...recipient,name:' TEST   BUYER '}),true);
});
test('fixed-address Stripe checkout uses saved shipping for tax and payment, has bounded expiry, and reuses its session',async()=>{
 const orders=createOrderStore(':memory:');const requests=[];let session;
 const checkout=createCheckout({key:'sk_test_fixture',orders,request:async(url,o)=>{requests.push({url,body:o.body&&new URLSearchParams(o.body)});if(url.endsWith('/customers'))return {ok:true,json:async()=>({id:'cus_fixture',livemode:false})};if(o.body){const b=new URLSearchParams(o.body);session={id:'cs_test_fixed',livemode:false,url:'https://checkout.stripe.com/test',client_reference_id:'owner',currency:'usd',status:'open',payment_status:'unpaid',amount_subtotal:2350,automatic_tax:{enabled:true,status:'requires_location_inputs'},metadata:Object.fromEntries([...b].filter(([k])=>k.startsWith('metadata[')).map(([k,v])=>[k.slice(9,-1),v]))};}return {ok:true,json:async()=>session};}});
 try{const item={productId:'1696373349800226816',variantId:'1696373349854752768',name:'Faucet',retailCents:2350,quoteId:'quote',shipping:{name:'USPS',zip:'60601',cents:0,recipient}};
 await checkout.startProduct('https://www.fixitfindit.com','owner',item);const b=requests[1].body;
 assert.equal(b.get('customer'),'cus_fixture');assert.equal(requests[0].body.get('shipping[address][line1]'),'123 Test Street');assert.equal(b.has('payment_intent_data[shipping][address][line1]'),false);assert.equal(b.has('shipping_address_collection[allowed_countries][0]'),false);assert.ok(Number(b.get('expires_at'))<=Date.now()/1000+1861);
 await checkout.startProduct('https://www.fixitfindit.com','owner',item);assert.equal(requests.filter(r=>r.body&&r.url.endsWith('/checkout/sessions')).length,1);
 session={...session,status:'complete',payment_status:'paid',amount_total:2538,automatic_tax:{enabled:true,status:'complete'},total_details:{amount_tax:188,amount_shipping:0,amount_discount:0},customer:{livemode:false,shipping:recipient}};
 assert.equal((await checkout.verifyProduct(session.id,'owner')).destinationMatches,true);
 session.customer.shipping={...recipient,address:{...recipient.address,line1:'Wrong street'}};
 assert.equal((await checkout.verifyProduct(session.id,'owner')).destinationMatches,false);
 assert.equal(orders.get(session.metadata.order_id).shipping_address_matches,0);
 }finally{orders.close();}
});
test('public quote route requires address and preserves it in the stored quote',async()=>{
 const quotes=createQuoteStore(':memory:');const vid='1696373349854752768';const route=createProductCheckoutRoute({quotes,checkout:{enabled:()=>true},catalog:{detail:async()=>({origin:'CN',variants:[{id:vid,price:190,stock:5}]}),shipping:async()=>[{name:'Carrier',totalCents:500,feesConfirmed:true}]}});
 const send=async fields=>{const req=Readable.from([new URLSearchParams(fields).toString()]);req.method='POST';req.headers={origin:'https://www.fixitfindit.com',cookie:'fit_product=12345678-1234-1234-1234-123456789abc','content-type':'application/x-www-form-urlencoded'};const res={writeHead(n){this.status=n},end(v){this.body=v}};await route(req,res,new URL('https://www.fixitfindit.com/checkout/products/quote'));return res;};
 try{assert.equal((await send({variant:vid,zip:'60601'})).status,400);const r=await send({variant:vid,zip:'60601',name:recipient.name,...recipient.address});assert.equal(r.status,200);const id=r.body.match(/name="quote" value="([^"]+)"/)[1];assert.deepEqual(quotes.get('12345678-1234-1234-1234-123456789abc',id).shipping.recipient,recipient);}finally{quotes.close();}
});
