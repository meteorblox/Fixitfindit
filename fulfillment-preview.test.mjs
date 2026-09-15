import {test} from 'node:test';
import assert from 'node:assert/strict';
import {previewFulfillment} from './fulfillment-preview.mjs';
const order={id:'test-order',status:'paid_sandbox',session_id:'cs_test_example',product_id:'1696373349800226816',variant_id:'1696373349854752768',quantity:1,retail_cents:1700,tax_cents:179,total_cents:1879};
const catalog={detail:async()=>({origin:'CN',variants:[{id:order.variant_id,stock:10,price:190}]}),shipping:async(...args)=>{assert.deepEqual(args,['kitchen',order.product_id,order.variant_id,'60601',1]);return [{name:'Test carrier',days:'5-11',price:657}];}};
test('fulfillment rehearsal preserves exact variant and separates tax from supplier costs',async()=>{
 const result=await previewFulfillment({order,hasWebhook:true,catalog,zip:'60601'});
 assert.equal(result.canSubmit,false);assert.equal(result.variantId,order.variant_id);
 assert.equal(result.shippingOptions[0].productPlusBaseShippingCents,847);
 assert.equal(result.taxCents,179);assert.equal(result.retailCents,1700);
});
test('unpaid, live, unsigned and unapproved orders cannot reach supplier lookup',async()=>{
 const never={detail:()=>{throw new Error('Supplier must not be called');}};
 for(const [patch,webhook] of [[{status:'pending'},true],[{session_id:'cs_live_example'},true],[{},false],[{variant_id:'unapproved'},true],[{quantity:2},true]]) {
  await assert.rejects(previewFulfillment({order:{...order,...patch},hasWebhook:webhook,catalog:never,zip:'60601'}),e=>!e.message.includes('Supplier must not'));
 }
});
test('sold-out variants cannot reach shipping lookup',async()=>{
 await assert.rejects(previewFulfillment({order,hasWebhook:true,zip:'60601',catalog:{detail:async()=>({variants:[{id:order.variant_id,stock:0,price:190}]}),shipping:()=>assert.fail('must not quote')}}),/stock/);
});
