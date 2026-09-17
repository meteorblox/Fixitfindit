import test from 'node:test';
import assert from 'node:assert/strict';
import {isReplacementPart} from './catalog-policy.mjs';
import {checkoutItem} from './product-checkout.mjs';
import {productOptions} from './product-options.mjs';
import {deliveredPrice} from './automatic-pricing.mjs';
import {createCatalog} from './catalog.mjs';

test('parts are excluded without hiding faucet attachments or complete brush bundles',()=>{
 for(const name of ['Sheath-Black-Q1pc','Red Replacement head','Spare mop pads','Replacement brush heads','Filter only','Refill']) assert.equal(isReplacementPart(name),true,name);
 for(const name of ['Blue','Rotating Waterfall Faucet Attachment','Electric brush with 8 replacement heads','Electric brush with replaceable heads']) assert.equal(isReplacementPart(name),false,name);
});
test('replacement variants cannot be priced or submitted through direct checkout',async()=>{
 const actual={id:'part',name:'Red Replacement head',price:400,stock:4};
 const details={origin:'US',variants:[actual]};
 const catalog={list:async()=>({products:[{id:'brush',name:'Brush'}]}),detail:async()=>details};
 await assert.rejects(checkoutItem(catalog,'part',{productId:'brush',category:'cleaning'}));
 const html=productOptions({product:{id:'brush'},details});assert.ok(!html.includes('<select'));assert.ok(!html.includes('Replacement head'));
 assert.equal(deliveredPrice({product:{id:'brush'},details,vid:'part',zip:'60601',shipping:[{name:'USPS',totalCents:500,feesConfirmed:true}]}),null);
});
test('CJ catalog filters parts listings and variants while preserving complete options',async()=>{
 const service=createCatalog({apiKey:'test',interval:0,request:async(url)=>{
  const data=url.includes('getAccessToken')?{accessToken:'test'}:url.includes('listV2')?{content:[{productList:[{id:'brush',nameEn:'Brush'},{id:'parts',nameEn:'Replacement brush head'}]}]}:url.includes('getInventoryByPid')?{variantInventories:[]}:{variants:[{vid:'whole',variantKey:'Blue',variantSellPrice:5},{vid:'part',variantKey:'Red',variantNameEn:'Replacement head',variantSellPrice:2}]};
  return {ok:true,json:async()=>({result:true,data})};
 }});
 assert.deepEqual((await service.list('cleaning')).products.map(p=>p.id),['brush']);
 assert.deepEqual((await service.detail('cleaning','brush')).variants.map(v=>v.id),['whole']);
});
