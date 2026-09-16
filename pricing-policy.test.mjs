import test from 'node:test';
import assert from 'node:assert/strict';
import {contribution,includedShipping,requireIncludedMargin} from './pricing-policy.mjs';
import {checkoutItem} from './product-checkout.mjs';
test('approved included prices clear the floor at highest sampled costs',()=>{
  assert.equal(contribution(2299,459,728),765);
  assert.equal(contribution(2299,190,728),1034);
  assert.equal(contribution(3999,1129,1150),1138);
  assert.equal(contribution(8999,1095,2908),3727);
});
test('unconfirmed fees and below-floor quotes cannot become free shipping',()=>{
  const item={retailCents:2299,supplierCents:459,origin:'CN'};
  assert.equal(includedShipping(item,{name:'Carrier',totalCents:728},'60601'),null);
  assert.equal(includedShipping(item,{name:'Carrier',totalCents:9999,feesConfirmed:true},'60601'),null);
  const good=includedShipping(item,{name:'Carrier',totalCents:728,feesConfirmed:true},'60601');
  assert.equal(good.shipping.cents,0);assert.equal(good.shipping.supplierCents,728);
  assert.doesNotThrow(()=>requireIncludedMargin(good));
  assert.throws(()=>requireIncludedMargin({...good,shipping:{...good.shipping,supplierCents:9999}}));
  assert.throws(()=>requireIncludedMargin({...good,shipping:{...good.shipping,pricingVersion:undefined}}));
});
test('electric pan is held even if supplier stock exists',async()=>{
  await assert.rejects(checkoutItem({detail:()=>assert.fail('held product reached supplier')},'2502240123311602500'));
});
