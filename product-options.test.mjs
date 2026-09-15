import test from 'node:test';
import assert from 'node:assert/strict';
import {createCatalog,money,usStock} from './catalog.mjs';
import {productOptions} from './product-options.mjs';
test('variant quotes require catalog membership and US stock; use authoritative variant',async()=>{
 let sent, calls=0;
 const catalog=createCatalog({apiKey:'test',interval:0,request:async(url,opts)=>{
  calls++;
  const data=url.includes('getAccessToken')?{accessToken:'test',accessTokenExpiryDate:'2099-01-01'}:url.includes('listV2')?{content:[{productList:[{id:'p1',nameEn:'Brush'}]}]}:url.includes('/product/query')?{variants:[{vid:'v1',variantKey:'Blue',variantSellPrice:'4.25',inventories:[{countryCode:'US',totalInventory:2}]},{vid:'v2',variantSellPrice:2,inventories:[{countryCode:'CN',totalInventory:30}]}]}:url.includes('getInventoryByPid')?{variantInventories:[{vid:'v1',inventory:[{countryCode:'US',totalInventory:2}]},{vid:'v2',inventory:[{countryCode:'CN',totalInventory:30}]}]}:(sent=JSON.parse(opts.body),[{logisticName:'USPS',logisticPrice:3.21,logisticAging:'2-5'}]);
  return {ok:true,json:async()=>(url.includes('getInventoryByPid')?{success:true,code:200,data}:{result:true,data})};
 }});
 await assert.rejects(catalog.detail('cleaning','other'),/Unknown/);
 await assert.rejects(catalog.shipping('cleaning','p1','v2','90210',1),/stock/);
 await assert.rejects(catalog.shipping('cleaning','p1','v1','90210',3),/stock/);
 const result=await catalog.shipping('cleaning','p1','v1','90210',2);
 assert.equal(result[0].price,321);
 assert.deepEqual(sent,{startCountryCode:'US',endCountryCode:'US',zip:'90210',products:[{vid:'v1',quantity:2}]});
 const count=calls; await catalog.shipping('cleaning','p1','v1','90210',2); assert.equal(calls,count);
 assert.equal(money(''),null); assert.equal(money('bad'),null);
});
test('product options escape supplier values and do not offer unstocked options',()=>{
 const html=productOptions({details:{variants:[{id:'v1',name:'<script>',price:123,stock:2},{id:'v2',name:'sold out',price:100,stock:0}]}});
 assert.ok(html.includes('&lt;script&gt;')); assert.ok(!html.includes('sold out'));
});

test('missing inventory stays unknown and product totals are never assigned to variants',()=>{
 assert.equal(usStock([], 'a'),null);
 assert.equal(usStock([{vid:'a',inventory:[{countryCode:'US'}]}], 'a'),null);
 assert.equal(usStock([{vid:'a',inventory:[{countryCode:'CN',totalInventory:100}]}], 'a'),0);
 assert.equal(usStock([{vid:'a',inventory:[{countryCode:'US',totalInventory:7}]}], 'a'),7);
});
