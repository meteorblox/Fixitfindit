import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogPage} from './catalog-pages.mjs';
const shell='<html><head><title>Shop</title></head><body><main id="top"></main></body></html>';
const category={slug:'kitchen',name:'Kitchen'};
const product={id:'test-product',name:'Kitchen tool',image:'https://example.com/tool.jpg',retailCents:1900};
const data={products:[product],updatedAt:'2026-10-12'};
test('public populated categories and products allow indexing with canonical URLs',()=>{
 for(const p of [undefined,product]){
  const html=catalogPage(shell,{category,data,product:p});
  assert.doesNotMatch(html,/noindex/);
  assert.ok(html.includes('href="https://www.fixitfindit.com/category/kitchen'+(p?'/product/test-product':'')+'"'));
 }
});
test('partner pages and unavailable categories remain excluded',()=>{
 for(const options of [{category,data,store:{slug:'home-helper'}},{category,data,error:'Unavailable'},{category,data:{products:[],updatedAt:''}},{category}]){
  assert.match(catalogPage(shell,options),/noindex,nofollow/);
 }
});
