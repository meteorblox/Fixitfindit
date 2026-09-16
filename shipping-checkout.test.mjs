import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createQuoteStore,normalizeShipping} from './shipping-quotes.mjs';
import {createOrderStore} from './orders.mjs';
import {createCheckout} from './checkout.mjs';
import {createProductCheckoutRoute} from './product-checkout.mjs';

const owner='12345678-1234-1234-1234-123456789abc';
const vid='1696373349854752768';
test('CJ postage includes returned fees without inventing zero fees or double-counting totals',()=>{
  const row={logisticName:'Carrier',logisticPrice:5,logisticAging:'5-10'};
  assert.equal(normalizeShipping(row).feesConfirmed,false);
  assert.equal(normalizeShipping({...row,taxesFee:1,clearanceOperationFee:0.5}).totalCents,650);
  assert.equal(normalizeShipping({...row,taxesFee:1,clearanceOperationFee:0.5,totalPostageFee:6.5}).totalCents,650);
  assert.equal(normalizeShipping({...row,totalPostageFee:4}).feesConfirmed,false);
  assert.equal(normalizeShipping({...row,totalPostageFee:5,taxesFee:1,clearanceOperationFee:0.5}).feesConfirmed,false);
});

test('shipping quotes survive restart, reject other customers, and expire',()=>{
  const path=join(mkdtempSync(join(tmpdir(),'fit-quotes-')),'orders.sqlite');
  let time=1000,quotes=createQuoteStore(path,{now:()=>time});
  const q=quotes.save(owner,{retailCents:1700,shipping:{cents:650,zip:'60601'}});
  quotes.close();quotes=createQuoteStore(path,{now:()=>time});
  assert.equal(quotes.get(owner,q.quoteId).shipping.cents,650);
  assert.throws(()=>quotes.get('another-owner',q.quoteId));
  time+=600001;
  assert.throws(()=>quotes.get(owner,q.quoteId));
  quotes.close();
});

test('quote to Stripe to paid order preserves shipping, ignores browser amounts and flags changed destinations',async()=>{
  const quotes=createQuoteStore(':memory:');
  const orders=createOrderStore(':memory:');
  let submitted,session,stock=5;
  const catalog={
    detail:async()=>({origin:'CN',variants:[{id:vid,stock,price:190}]}),
    shipping:async(c,p,v,zip)=>{assert.equal(zip,'60601');return [{name:'Test <carrier>',days:'5-10',price:500,totalCents:650,feesConfirmed:true}];}
  };
  const checkout=createCheckout({key:'sk_test_example',orders,request:async(url,options)=>{
    if(options.body) {
      submitted=new URLSearchParams(options.body);
      const metadata=Object.fromEntries([...submitted].filter(([k])=>k.startsWith('metadata[')).map(([k,v])=>[k.slice(9,-1),v]));
      session={id:'cs_test_shipping',livemode:false,url:'https://checkout.stripe.com/test',currency:'usd',client_reference_id:owner,
        status:'open',payment_status:'unpaid',metadata,amount_subtotal:2299,automatic_tax:{enabled:true,status:'requires_location_inputs'}};
    }
    return {ok:true,json:async()=>session};
  }});
  const route=createProductCheckoutRoute({catalog,quotes,checkout});
  const post=async(path,body,cookie=owner)=>{
    const req=Readable.from([body]);req.method='POST';req.headers={origin:'https://www.fixitfindit.com',cookie:'fit_product='+cookie,'content-type':'application/x-www-form-urlencoded'};
    const res={writeHead(status,headers){this.status=status;this.headers=headers;},end(html){this.html=html;}};
    await route(req,res,new URL('https://www.fixitfindit.com/checkout/products/'+path));return res;
  };
  assert.equal((await post('quote',`variant=${vid}&zip=bad`)).status,400);
  const page=await post('quote',`variant=${vid}&zip=60601&shippingCents=1`);
  assert.equal(page.status,200);
  assert.ok(page.html.includes('Test &lt;carrier&gt;'));
  assert.ok(page.html.includes('$22.99'));
  const quoteId=page.html.match(/name="quote" value="([^"]+)"/)[1];
  assert.equal((await post('start','quote='+quoteId,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')).status,409);
  assert.equal((await post('start','variant='+vid)).status,409);
  stock=0;
  assert.equal((await post('start','quote='+quoteId)).status,503);
  stock=5;
  assert.equal((await post('start',`quote=${quoteId}&shippingCents=1&retailCents=1`)).status,303);
  assert.equal(submitted.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'),'0');
  assert.equal(submitted.get('line_items[0][price_data][unit_amount]'),'2299');
  const orderId=session.metadata.order_id;
  assert.equal(orders.get(orderId).shipping_cents,0);
  assert.equal(JSON.parse(orders.get(orderId).shipping_snapshot).supplierCents,650);
  assert.equal(orders.get(orderId).retail_cents,2299);
  session={...session,status:'complete',payment_status:'paid',amount_total:2487,
    total_details:{amount_shipping:0,amount_tax:188,amount_discount:0},automatic_tax:{enabled:true,status:'complete'},
    collected_information:{shipping_details:{address:{country:'US',postal_code:'60601-1234'}}}};
  orders.recordSession(session,'evt_shipping','checkout.session.completed');
  orders.recordSession(session,'evt_shipping','checkout.session.completed');
  assert.equal(orders.get(orderId).status,'paid_sandbox');
  assert.equal(orders.get(orderId).total_cents,2487);
  assert.equal(orders.get(orderId).shipping_address_matches,1);
  assert.equal((await checkout.verifyProduct(session.id,owner)).destinationMatches,true);
  assert.throws(()=>orders.recordSession({...session,total_details:{...session.total_details,amount_shipping:1}},'evt_tampered'));
  session.collected_information.shipping_details.address.postal_code='90210';
  assert.equal((await checkout.verifyProduct(session.id,owner)).destinationMatches,false);
  assert.equal(orders.get(orderId).shipping_address_matches,0);
  assert.equal(orders.get(orderId).status,'paid_sandbox');
  orders.close();quotes.close();
});
