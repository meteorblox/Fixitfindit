import {selectedProducts} from './selected-products.mjs';

const timestamp=()=>new Date().toISOString();
const required=(value,max)=>{
  if(typeof value!=='string' || !value.trim() || value.length>max || /[\x00-\x1f]/.test(value)) throw new Error('invalid_recipient');
  return value.trim();
};
export function sandboxPayload(order,session) {
  if(order.status!=='paid_sandbox' || session.livemode!==false || session.status!=='complete' || session.payment_status!=='paid') throw new Error('payment_not_verified');
  const product=selectedProducts.find(p=>p.lookup.pid===order.product_id);
  if(order.quantity!==1 || !product?.pricedVariants.some(v=>v.id===order.variant_id)) throw new Error('unapproved_variant');
  if(!order.shipping_snapshot) throw new Error('missing_shipping_quote');
  const quote=JSON.parse(order.shipping_snapshot);
  const shipping=session.collected_information?.shipping_details||session.shipping_details;
  const address=shipping?.address;
  if(address?.country!=='US' || !/^\d{5}(?:-\d{4})?$/.test(address?.postal_code||'') || address.postal_code.slice(0,5)!==quote.zip) throw new Error('shipping_address_mismatch');
  if(quote.origin!==product.origin || !Number.isSafeInteger(quote.cents) || quote.cents!==order.shipping_cents) throw new Error('invalid_shipping_quote');
  return {
    orderNumber:'FITTEST-'+order.id,isSandbox:1,payType:3,orderFlow:1,shopLogisticsType:2,
    shippingCountryCode:'US',shippingCountry:'United States',shippingZip:address.postal_code,
    shippingProvince:required(address.state,50),shippingCity:required(address.city,50),
    shippingCustomerName:required(shipping.name,50),shippingAddress:required(address.line1,500),
    shippingAddress2:address.line2?required(address.line2,500):'',
    logisticName:required(quote.name,50),fromCountryCode:quote.origin,
    products:[{vid:order.variant_id,quantity:1,storeLineItemId:order.id}],
    remark:'FixItFindIt sandbox test. No real payment or shipment.'
  };
}

// Called with the order database, so payment, webhook receipt and queue insertion
// commit together. No external API runs in the webhook transaction.
export function fulfillmentStore(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS fulfillment_jobs(
    order_id TEXT PRIMARY KEY,custom_order_id TEXT NOT NULL UNIQUE,
    state TEXT NOT NULL,payload_json TEXT,cj_order_id TEXT UNIQUE,
    supplier_status TEXT,track_number TEXT,tracking_provider TEXT,
    last_error TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);`);
  if(!db.prepare('PRAGMA table_info(fulfillment_jobs)').all().some(c=>c.name==='cj_detail_order_id')) db.exec('ALTER TABLE fulfillment_jobs ADD COLUMN cj_detail_order_id TEXT');
  const get=id=>db.prepare('SELECT * FROM fulfillment_jobs WHERE order_id=?').get(id);
  const summary=id=>{
    const job=get(id);
    return job?{mode:'sandbox',state:job.state,supplierStatus:job.supplier_status,
      trackingNumber:job.track_number,trackingProvider:job.tracking_provider}:null;
  };
  function enqueue(order,session) {
    if(get(order.id)) return;
    let payload=null,error=null;
    try {payload=sandboxPayload(order,session);} catch(e) {
      error=['payment_not_verified','unapproved_variant','missing_shipping_quote','shipping_address_mismatch','invalid_shipping_quote','invalid_recipient'].includes(e.message)?e.message:'invalid_order_snapshot';
    }
    db.prepare('INSERT INTO fulfillment_jobs(order_id,custom_order_id,state,payload_json,last_error,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
      .run(order.id,'FITTEST-'+order.id,error?'blocked':'ready',payload?JSON.stringify(payload):null,error,timestamp(),timestamp());
  }
  function claim(id,from,to) {
    return db.prepare('UPDATE fulfillment_jobs SET state=?,last_error=NULL,updated_at=? WHERE order_id=? AND state=?').run(to,timestamp(),id,from).changes===1;
  }
  function created(id,cjId) {
    if(!db.prepare("UPDATE fulfillment_jobs SET cj_order_id=?,state='created',last_error=NULL,updated_at=? WHERE order_id=? AND state='creating'").run(cjId,timestamp(),id).changes) throw new Error('Fulfillment changed during submission.');
  }
  function sync(id,detail) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const job=get(id);
      if(!job || ['ready','blocked'].includes(job.state)) throw new Error('Order has not been submitted.');
      const payload=JSON.parse(job.payload_json);
      if(detail?.isSandbox!==1 || typeof detail.orderId!=='string' || !detail.orderId ||
        (job.cj_detail_order_id && job.cj_detail_order_id!==detail.orderId) ||
        ![detail.orderNum,detail.platformOrderId].includes(job.custom_order_id) ||
        detail.shippingCountryCode!=='US' || !Array.isArray(detail.productList) || detail.productList.length!==1 ||
        detail.productList[0].vid!==payload.products[0].vid || detail.productList[0].quantity!==1) throw new Error('CJ sandbox order identity mismatch.');
      const states={CREATED:'created',IN_CART:'created',UNPAID:'created',UNSHIPPED:'paid',PENDING:'paid',PROCESSING:'paid',SHIPPED:'shipped',DELIVERED:'delivered',CANCELLED:'cancelled',CLOSED:'cancelled'};
      const next=states[detail.orderStatus];
      if(!next) throw new Error('Unrecognized CJ order status.');
      const rank={creating:0,created:1,confirming:1.5,paying:2,paid:3,shipped:4,delivered:5,cancelled:6};
      const advances=rank[next]>=rank[job.state] || (job.state==='confirming' && detail.orderStatus==='UNPAID');
      // Ignore stale status/tracking responses instead of reverting delivered orders.
      const state=advances?next:job.state;
      const track=advances && typeof detail.trackNumber==='string' && detail.trackNumber.length<=200?detail.trackNumber:job.track_number;
      const provider=advances && typeof detail.trackingProvider==='string' && detail.trackingProvider.length<=200?detail.trackingProvider:job.tracking_provider;
      // Creation returns a shipment code; detail returns the child order ID.
      // Bind that ID only after the custom order, sandbox and item checks above.
      db.prepare('UPDATE fulfillment_jobs SET cj_order_id=COALESCE(cj_order_id,?),cj_detail_order_id=?,state=?,supplier_status=?,track_number=?,tracking_provider=?,last_error=?,updated_at=? WHERE order_id=?')
        .run(detail.orderId,detail.orderId,state,advances?detail.orderStatus:job.supplier_status,track||job.track_number||null,provider||job.tracking_provider||null,advances?null:job.last_error,timestamp(),id);
      db.exec('COMMIT');return summary(id);
    } catch(e) {db.exec('ROLLBACK');throw e;}
  }
  return {get,summary,enqueue,claim,created,sync,
    error(id,code){db.prepare('UPDATE fulfillment_jobs SET last_error=?,updated_at=? WHERE order_id=?').run(code,timestamp(),id);},
    list(){return db.prepare('SELECT order_id,custom_order_id,state,cj_order_id,supplier_status,last_error,updated_at FROM fulfillment_jobs ORDER BY created_at DESC LIMIT 100').all();}
  };
}
