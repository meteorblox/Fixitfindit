import {selectedProducts} from './selected-products.mjs';

// Read-only rehearsal. This module deliberately has no supplier order/payment API.
export async function previewFulfillment({order,hasWebhook,catalog,zip}) {
  if(!order || order.status!=='paid_sandbox' || !/^cs_test_/.test(order.session_id||'')) throw new Error('A paid sandbox order is required.');
  if(!hasWebhook) throw new Error('A recorded Stripe webhook is required.');
  if(!/^\d{5}$/.test(zip||'')) throw new Error('A five-digit US test ZIP is required.');
  if(order.quantity!==1) throw new Error('Unsupported order quantity.');
  const product=selectedProducts.find(p=>p.lookup.pid===order.product_id);
  const variant=product?.pricedVariants.find(v=>v.id===order.variant_id);
  if(!variant) throw new Error('The order variant is not approved.');
  const detail=await catalog.detail(product.category,order.product_id);
  const actual=detail.variants.find(v=>v.id===order.variant_id);
  if(!actual || !Number.isSafeInteger(actual.stock) || actual.stock<1 || !Number.isSafeInteger(actual.price) || actual.price<0) throw new Error('Supplier stock or price is unavailable.');
  const options=await catalog.shipping(product.category,order.product_id,order.variant_id,zip,order.quantity);
  return {
    mode:'sandbox-preview-only',canSubmit:false,orderId:order.id,
    productId:order.product_id,variantId:order.variant_id,variantName:variant.name,
    quantity:order.quantity,origin:detail.origin,destination:{country:'US',zip},
    retailCents:order.retail_cents,taxCents:order.tax_cents,totalCents:order.total_cents,
    supplierUnitCents:actual.price,stock:actual.stock,
    shippingOptions:options.map(o=>({...o,productPlusBaseShippingCents:actual.price+o.price})),
    blockers:['Sandbox orders must never ship.','Shipping figures exclude unverified supplier fees and are not final delivered costs.','Recipient address, supplier order submission, tracking and refund handling are not implemented.']
  };
}
