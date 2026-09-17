import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPricedCatalog} from './storefront-pricing.mjs';
import {checkoutItem,quoteItem} from './product-checkout.mjs';
import {deliveredPrice} from './automatic-pricing.mjs';
import {homeProducts} from './home-products.mjs';
function supplier(){let calls=0;return {count:()=>calls,list:async()=>({products:[{id:'brush',name:'Brush',image:'https://example.com/brush.png'}]}),detail:async()=>({origin:'US',variants:[{id:'part',name:'Replacement head',price:1,stock:4},{id:'blue',name:'Blue',price:500,stock:2}]}),shipping:async(c,p,v,zip)=>{calls++;assert.equal(v,'blue');return [{name:'USPS',totalCents:zip==='90210'?800:500,feesConfirmed:true,days:'3-7'}];}};}
test('upfront prices use all sampled destinations plus buffer, persist, expire, and name the actual option',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'storefront-prices-'));const path=join(dir,'prices.sqlite');let now=1000;const raw=supplier();let catalog=createPricedCatalog(raw,{path,now:()=>now});
 try {
  const first=await catalog.list('cleaning');assert.equal(first.products[0].pricingPending,true);
  await catalog.list('cleaning');await catalog.settled();assert.equal(raw.count(),3);
  const product=(await catalog.list('cleaning')).products[0];assert.equal(product.retailCents,3800);assert.equal(product.storefrontVariants[0].id,'blue');assert.equal(catalog.storefrontPrice('brush','part'),null);
  const html=await homeProducts(catalog);assert.match(html,/\$38.00/);assert.match(html,/Option: Blue/);assert.doesNotMatch(html,/Replacement head/);
  catalog.close();catalog=createPricedCatalog(raw,{path,now:()=>now});assert.equal(catalog.storefrontPrice('brush','blue').retailCents,3800);assert.equal(raw.count(),3);
  now+=24*3600000;assert.equal(catalog.storefrontPrice('brush','blue'),null);
 }finally{await catalog.settled();catalog.close();rmSync(dir,{recursive:true,force:true});}
});
test('actual destination keeps published price or blocks; unpriced variants cannot use automatic checkout',async()=>{
 const raw=supplier(),catalog=createPricedCatalog(raw);
 try {
  await catalog.list('cleaning');await catalog.settled();
  const item=await checkoutItem(catalog,'blue',{productId:'brush',category:'cleaning'});assert.equal(item.retailCents,3800);assert.equal(item.fixedRetail,true);
  const product=(await catalog.list('cleaning')).products[0],details=await catalog.detail('cleaning','brush');
  for(const freight of [200,800,1800]) {
   const method={name:'USPS',totalCents:freight,feesConfirmed:true};assert.equal(quoteItem(item,method,'60601').retailCents,3800);assert.equal(deliveredPrice({product,details,vid:'blue',zip:'60601',shipping:[method]}).retailCents,3800);
  }
  const high={name:'USPS',totalCents:2500,feesConfirmed:true};assert.equal(quoteItem(item,high,'60601'),null);assert.equal(deliveredPrice({product,details,vid:'blue',zip:'60601',shipping:[high]}),null);
  await assert.rejects(checkoutItem(catalog,'part',{productId:'brush',category:'cleaning'}));
 }finally{await catalog.settled();catalog.close();}
});
test('missing destination quotes and unknown stock never produce upfront prices; approved prices remain untouched',async()=>{
 for(const unknownStock of [false,true]) {
  let calls=0;const raw=supplier();raw.shipping=async()=>{calls++;return []};if(unknownStock)raw.detail=async()=>({origin:'US',variants:[{id:'blue',name:'Blue',price:500,stock:null}]});
  const catalog=createPricedCatalog(raw);try{await catalog.list('cleaning');await catalog.settled();assert.equal((await catalog.list('cleaning')).products[0].retailCents,undefined);assert.equal(catalog.storefrontPrice('brush','blue'),null);if(unknownStock)assert.equal(calls,0);}finally{await catalog.settled();catalog.close();}
 }
 const approved={id:'approved',retailCents:2350,pricedVariants:[{id:'silver',retailCents:2350}]};const catalog=createPricedCatalog({list:async()=>({products:[approved]}),detail:()=>assert.fail('Approved pricing must not be regenerated')});try{assert.deepEqual((await catalog.list('kitchen')).products[0],approved);await catalog.settled();}finally{catalog.close();}
});
