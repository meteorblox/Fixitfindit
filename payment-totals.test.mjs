import test from 'node:test';
import assert from 'node:assert/strict';
import {paymentTotals} from './payment-totals.mjs';
import {createOrderStore} from './orders.mjs';

const taxed=()=>({id:'cs_test_tax',livemode:false,client_reference_id:'owner',currency:'usd',amount_subtotal:1700,amount_total:1836,total_details:{amount_tax:136,amount_shipping:0,amount_discount:0},automatic_tax:{enabled:true,status:'complete'},status:'complete',payment_status:'paid',metadata:{tax_mode:'automatic',purpose:'fixitfindit-product-sandbox',fulfillment:'sandbox-do-not-ship',store_id:'fixitfindit',product_id:'p',variant_id:'v',retail_cents:'1700',quantity:'1'}});
test('tax is separate from product revenue and incomplete or mismatched calculations are rejected',()=>{
  const s=taxed();assert.deepEqual(paymentTotals(s,1700,true),{taxCents:136,totalCents:1836});
  assert.throws(()=>paymentTotals({...s,amount_total:1700},1700,true));
  assert.throws(()=>paymentTotals({...s,amount_subtotal:1},1700,true));
  assert.throws(()=>paymentTotals({...s,automatic_tax:{enabled:true,status:'requires_location_inputs'}},1700,true));
  assert.throws(()=>paymentTotals(s,1700,false));
  assert.deepEqual(paymentTotals({...s,amount_total:1700,total_details:{amount_tax:0,amount_shipping:0,amount_discount:0}},1700,true),{taxCents:0,totalCents:1700});
});
test('order snapshots accept pending tax then store the signed paid tax amount',()=>{
  const db=createOrderStore(':memory:');
  const row=db.prepare('owner',{productId:'p',variantId:'v',name:'test',retailCents:1700,automaticTax:true});
  const s=taxed();s.metadata.order_id=row.id;
  db.recordSession({...s,status:'open',payment_status:'unpaid',automatic_tax:{enabled:true,status:'requires_location_inputs'}});
  assert.equal(db.get(row.id).tax_cents,null);
  db.recordSession(s,'evt_tax','checkout.session.completed');
  assert.equal(db.get(row.id).tax_cents,136);assert.equal(db.get(row.id).total_cents,1836);assert.equal(db.get(row.id).retail_cents,1700);
  assert.equal(db.get(row.id).status,'paid_sandbox');db.close();
});
