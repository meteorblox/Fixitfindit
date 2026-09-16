import {selectedProducts} from './selected-products.mjs';

export function createFulfillmentWorker({orders,cj,catalog}) {
  const jobs=orders.fulfillment;
  function requireJob(id) {
    const order=orders.get(id),job=jobs.get(id);
    if(!order || order.status!=='paid_sandbox' || !/^cs_test_/.test(order.session_id||'') || !orders.hasWebhook(id) || !job?.payload_json || order.shipping_address_matches!==1) throw new Error('A verified sandbox order with matching shipping details is required.');
    return job;
  }
  async function sync(id) {
    const job=requireJob(id);
    if(['ready','blocked'].includes(job.state)) throw new Error('Submit this sandbox order first.');
    try {
      const detail=await cj.detail(job.cj_detail_order_id||job.cj_order_id||job.custom_order_id);
      return jobs.sync(id,detail);
    } catch {jobs.error(id,'reconciliation_required');throw new Error('Could not reconcile the CJ sandbox order. No duplicate order was submitted.');}
  }
  return {
    sync,
    async submit(id) {
      const job=requireJob(id);
      if(job.state!=='ready') return jobs.summary(id);
      if(!cj.enabled()) throw new Error('CJ sandbox fulfillment is not enabled.');
      const order=orders.get(id),payload=JSON.parse(job.payload_json);
      const product=selectedProducts.find(p=>p.lookup.pid===order.product_id);
      if(!product?.pricedVariants.some(v=>v.id===order.variant_id)) throw new Error('Product is no longer approved.');
      const current=await catalog.detail(product.category,order.product_id);
      const variant=current.variants.find(v=>v.id===order.variant_id);
      if(!Number.isSafeInteger(variant?.stock)||variant.stock<1) throw new Error('Supplier stock is unavailable.');
      // Persist the claim before any create call. An interrupted claim is never
      // automatically retried: sync uses the stable custom order number instead.
      if(!jobs.claim(id,'ready','creating')) return jobs.summary(id);
      try {jobs.created(id,await cj.create(payload));}
      catch {jobs.error(id,'creation_outcome_unknown');throw new Error('CJ submission outcome is uncertain. Run sync; do not create another order.');}
      return sync(id);
    },
    async simulatePayment(id) {
      await sync(id);
      let job=requireJob(id);
      if(job.state!=='created') return jobs.summary(id);
      if(['CREATED','IN_CART'].includes(job.supplier_status)) {
        if(!jobs.claim(id,'created','confirming')) return jobs.summary(id);
        try {await cj.confirm(job.cj_order_id);}
        catch {jobs.error(id,'confirmation_outcome_unknown');throw new Error('Sandbox confirmation outcome is uncertain. Run sync before any further action.');}
        await sync(id);job=requireJob(id);
      }
      if(job.state!=='created' || job.supplier_status!=='UNPAID') throw new Error('CJ must confirm the sandbox order is unpaid before simulated payment.');
      if(!jobs.claim(id,'created','paying')) return jobs.summary(id);
      try {await cj.simulatePayment(job.cj_order_id);}
      catch {jobs.error(id,'payment_outcome_unknown');throw new Error('Sandbox payment outcome is uncertain. Run sync before any further action.');}
      return sync(id);
    },
    async simulateTracking(id,number) {
      await sync(id);
      const job=requireJob(id);
      if(!['paid','shipped','delivered'].includes(job.state)) throw new Error('Sandbox payment must be confirmed first.');
      await cj.simulateTracking(job.cj_order_id,number);
      return sync(id);
    }
  };
}
