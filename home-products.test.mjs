import {test} from 'node:test';
import assert from 'node:assert/strict';
import {homeProducts,shortTitle} from './home-products.mjs';
test('product rows preserve partner links, escape titles and deduplicate',async()=>{
  const html=await homeProducts({list:async()=>({products:[{id:'one',image:'https://example.com/p.png',name:'<img onerror=bad>',supplierPrice:'2.00'}]})},'/shop/home-helper');
  assert.equal((html.match(/class="home-product-card"/g)||[]).length,1);
  assert.ok(html.includes('/shop/home-helper/category/cleaning/product/one'));
  assert.ok(!html.includes('<img onerror'));
  assert.ok(html.includes('Price coming soon'));
  assert.ok(!html.includes('2.00'));assert.ok(!html.includes('CJ supplier price'));
});
test('unavailable categories show honest fallback',async()=>{
  const html=await homeProducts({list:async()=>{throw Error('secret');}});
  assert.ok(html.includes('temporarily unavailable'));
  assert.ok(!html.includes('secret'));
  assert.ok(shortTitle('word '.repeat(40)).length<=85);
});
