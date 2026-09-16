import {includedShipping} from './pricing-policy.mjs';
import {createQuoteStore} from './shipping-quotes.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCheckout} from './checkout.mjs';
import {checkoutItem,createProductCheckoutRoute} from './product-checkout.mjs';
import {Readable} from 'node:stream';
import {createCatalog} from './catalog.mjs';

const vid='1696373349854752768';
const catalog={detail:async()=>({variants:[{id:vid,price:190,stock:10}]}),shipping:async()=>[{name:'Standard',totalCents:650,feesConfirmed:true}]};
test('approved variant lookup works independently of category search',async()=>{
  const supplier=createCatalog({apiKey:'test',interval:0,request:async(url)=>{
    assert.ok(!url.includes('/listV2'));
    const data=url.includes('getAccessToken')?{accessToken:'test'}:url.includes('getInventoryByPid')?{variantInventories:[{vid,inventory:[{countryCode:'CN',totalInventory:5}]}]}:{variants:[{vid,variantKey:'Black-1PC',variantSellPrice:1.90}]};
    return {ok:true,json:async()=>({result:true,data})};
  }});
  assert.equal((await checkoutItem(supplier,vid)).retailCents,2299);
});
test('only approved exact single variants with stock can enter checkout',async()=>{
  const item=await checkoutItem(catalog,vid);
  assert.equal(item.retailCents,2299);
  await assert.rejects(checkoutItem(catalog,'1732944160014995456'));
  await assert.rejects(checkoutItem({detail:async()=>({variants:[{id:vid,price:190,stock:null}]})},vid));
});
test('product sessions use fixed pricing, supplier identifiers and sandbox guard',async()=>{
  const item=await checkoutItem(catalog,vid);
  let submitted;
  const checkout=createCheckout({key:'sk_test_example',request:async(u,o)=>{
    submitted=new URLSearchParams(o.body);
    return {ok:true,json:async()=>({livemode:false,url:'https://checkout.stripe.com/c/pay/test'})};
  }});
  await checkout.startProduct('https://www.fixitfindit.com','ref',item);
  assert.equal(submitted.get('line_items[0][price_data][unit_amount]'),'2299');
  assert.equal(submitted.get('metadata[variant_id]'),vid);
  assert.equal(submitted.get('metadata[fulfillment]'),'sandbox-do-not-ship');
  await assert.rejects(createCheckout({key:'sk_live_example',request:()=>assert.fail('Live request attempted')}).startProduct('https://www.fixitfindit.com','ref',item));
});
test('confirmation requires matching owner, amount, currency, sandbox and paid status',async()=>{
  const session={livemode:false,client_reference_id:'ref',amount_total:1700,currency:'usd',status:'complete',payment_status:'paid',metadata:{purpose:'fixitfindit-product-sandbox',fulfillment:'sandbox-do-not-ship',product_id:'1696373349800226816',variant_id:vid,retail_cents:'1700',quantity:'1'}};
  const checkout=createCheckout({key:'sk_test_example',request:async()=>({ok:true,json:async()=>session})});
  assert.equal((await checkout.verifyProduct('cs_test_abc','ref')).paid,true);
  await assert.rejects(checkout.verifyProduct('cs_test_abc','another'));
  session.amount_total=100;
  await assert.rejects(checkout.verifyProduct('cs_test_abc','ref'));
  session.amount_total=1700;session.payment_status='unpaid';
  assert.equal((await checkout.verifyProduct('cs_test_abc','ref')).paid,false);
  session.livemode=true;
  await assert.rejects(checkout.verifyProduct('cs_test_abc','ref'));
});
test('route rejects cross-origin posts and ignores client supplied prices',async()=>{
  let captured;
  const quotes=createQuoteStore(':memory:');
  const quote=quotes.save('12345678-1234-1234-1234-123456789abc',includedShipping(await checkoutItem(catalog,vid),{name:'Standard',totalCents:650,feesConfirmed:true},'60601'));
  const route=createProductCheckoutRoute({catalog,quotes,checkout:{enabled:()=>true,startProduct:async(o,r,item)=>{captured=item;return 'https://checkout.stripe.com/test';}}});
  const run=async(origin)=>{
    const req=Readable.from([`quote=${quote.quoteId}&variant=${vid}&retailCents=1&shippingCents=1&quantity=100`]);
    req.method='POST';req.headers={origin,cookie:'fit_product=12345678-1234-1234-1234-123456789abc','content-type':'application/x-www-form-urlencoded'};
    const res={writeHead(code){this.status=code;},end(){}};
    await route(req,res,new URL('https://www.fixitfindit.com/checkout/products/start'));
    return res.status;
  };
  assert.equal(await run('https://attacker.example'),403);
  assert.equal(captured,undefined);
  assert.equal(await run('https://www.fixitfindit.com'),303);
  assert.equal(captured.retailCents,2299);
  quotes.close();
});
