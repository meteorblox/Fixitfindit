import test from 'node:test';
import assert from 'node:assert/strict';
import {automaticRetail,deliveredPrice} from './automatic-pricing.mjs';
import {contribution} from './pricing-policy.mjs';
import {productOptions} from './product-options.mjs';
import {selectedProducts} from './selected-products.mjs';

const method={name:'USPS',totalCents:500,feesConfirmed:true,days:'3-7'};
const input={product:{id:'p1'},details:{origin:'US',variants:[{id:'v1',name:'Blue',price:500,stock:3}]},vid:'v1',zip:'60601',shipping:[method]};
test('automatic prices apply 150% markup and satisfy the floor even on cheap products',()=>{
 assert.equal(automaticRetail(500,500),2500);
 for(const cost of [0,1,99,200,500,1000,10001,99999]) {
  const price=automaticRetail(cost,333);
  assert.ok(price>=2.5*(cost+333));
  assert.ok(contribution(price,cost,333)>=800);
  assert.equal(price%100,0);
 }
 for(const cost of [null,undefined,NaN,-1,1.1,Infinity,Number.MAX_SAFE_INTEGER]) assert.throws(()=>automaticRetail(cost,500));
});
test('quotes reject unknown fees, stock, foreign ZIPs and excluded methods',()=>{
 assert.equal(deliveredPrice(input).retailCents,2500);
 for(const shipping of [[{...method,feesConfirmed:false}],[{...method,totalCents:null}],[{...method,name:'CJPacket Postal Route'}],[{...method,name:'Electric PostNL'}],[]]) assert.equal(deliveredPrice({...input,shipping}),null);
 for(const stock of [null,undefined,0,-1,1.5]) assert.equal(deliveredPrice({...input,details:{...input.details,variants:[{...input.details.variants[0],stock}]}}),null);
 assert.equal(deliveredPrice({...input,zip:'SW1A 1AA'}),null);
 assert.equal(deliveredPrice({...input,vid:'unrelated'}),null);
 assert.equal(deliveredPrice({...input,quantity:2}),null);
 assert.equal(deliveredPrice({...input,product:{checkoutHold:true}}),null);
});
test('all manually approved variants retain exact prices and disallow other variants',()=>{
 for(const product of selectedProducts) for(const variant of product.pricedVariants) {
  const quote=deliveredPrice({...input,product,vid:variant.id,details:{origin:product.origin,variants:[{id:variant.id,price:100,stock:2}]}});
  assert.equal(quote.retailCents,variant.retailCents);assert.equal(quote.automatic,false);
 }
 assert.equal(deliveredPrice({...input,product:selectedProducts[1]}),null);
 assert.equal(deliveredPrice({...input,product:{pricedVariants:[{id:'v1',retailCents:100}]}}),null);
});
test('catalog quote renders delivered retail only, escapes names, and changes with shipping',()=>{
 const html=productOptions(input);
 assert.ok(html.includes('$25.00'));assert.ok(!html.includes('$5.00'));
 const higher=productOptions({...input,shipping:[{...method,totalCents:1000}]});
 assert.ok(higher.includes('$38.00'));
 const unknown=productOptions({...input,shipping:undefined});assert.ok(!unknown.includes('$25.00'));assert.ok(unknown.includes('Get delivered price'));
 const escaped=productOptions({...input,details:{...input.details,variants:[{...input.details.variants[0],name:'<script>x</script>'}]}});assert.ok(!escaped.includes('<script>'));assert.ok(escaped.includes('&lt;script&gt;'));
});
