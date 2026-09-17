import {DatabaseSync} from 'node:sqlite';
import {paymentTotals} from './payment-totals.mjs';
import {contribution} from './pricing-policy.mjs';
import {eligibleMethod} from './automatic-pricing.mjs';
import {isReplacementPart} from './catalog-policy.mjs';
import {selectedProducts} from './selected-products.mjs';
const required=(v,max)=>{if(typeof v!=='string'||!v.trim()||v.length>max||/[\x00-\x1f]/.test(v))throw new Error('Invalid recipient');return v.trim();};
const cents=v=>{if(!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(String(v??'')))throw new Error('Unverified supplier amount');const n=Math.round(Number(v)*100);if(!Number.isSafeInteger(n))throw new Error('Invalid supplier amount');return n;};
const norm=v=>String(v??'').trim().replace(/\s+/g,' ').toLowerCase();
export function createProductionFulfillment({path,orders,catalog,cj,enabled=false}) {
 const db=new DatabaseSync(path);db.exec(`PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS production_jobs(id TEXT PRIMARY KEY,custom_id TEXT UNIQUE NOT NULL,state TEXT NOT NULL,payload TEXT NOT NULL,category TEXT NOT NULL,cj_id TEXT UNIQUE,detail_id TEXT,tracking TEXT,provider TEXT,error TEXT,updated TEXT NOT NULL)`);
 const get=id=>db.prepare('SELECT * FROM production_jobs WHERE id=?').get(id);
 const summary=id=>{const j=get(id);return j?{orderId:id,state:j.state,trackingNumber:j.tracking,trackingProvider:j.provider,lastError:j.error}:null;};
 const update=(id,state,error=null)=>db.prepare('UPDATE production_jobs SET state=?,error=?,updated=? WHERE id=?').run(state,error,new Date().toISOString(),id);
 const claim=(id,from,to)=>db.prepare('UPDATE production_jobs SET state=?,error=NULL,updated=? WHERE id=? AND state=?').run(to,new Date().toISOString(),id,from).changes===1;
 function verified(id){const o=orders.get(id);if(!o||o.status!=='paid_live'||!/^cs_live_/.test(o.session_id||'')||!orders.hasWebhook(id)||o.shipping_address_matches!==1||o.quantity!==1)throw new Error('Verified live payment and matching address required');return o;}
 function refundClear(id){if(orders.refunds?.summary(id).fulfillmentHold)throw Error('Refund review holds fulfillment');}
 function allowed(){if(!enabled||!cj.enabled())throw new Error('Production fulfillment is disabled');}
 function stage(id,session){
  const o=verified(id),m=session?.metadata||{};
  if(session.livemode!==true||session.id!==o.session_id||session.status!=='complete'||session.payment_status!=='paid'||session.currency!=='usd'||m.order_id!==id||m.product_id!==o.product_id||m.variant_id!==o.variant_id||m.quantity!=='1'||Number(m.retail_cents)!==o.retail_cents)throw new Error('Live session does not match order');
  paymentTotals(session,o.retail_cents,Boolean(o.automatic_tax),o.shipping_cents);
  const q=JSON.parse(o.shipping_snapshot||'null'),approved=selectedProducts.find(p=>p.lookup.pid===o.product_id);
  if(!q||q.cents!==0||o.shipping_cents!==0||q.feesConfirmed!==true||!['US','CN'].includes(q.origin))throw new Error('Invalid shipping snapshot');
  if(approved&&(approved.checkoutHold||!approved.pricedVariants.some(v=>v.id===o.variant_id)))throw new Error('Unapproved option');
  const category=approved?.category||q.category;if(!['kitchen','cleaning','organization','tools','home-improvement'].includes(category))throw new Error('Missing verified product category');
  const shipping=session.collected_information?.shipping_details||session.shipping_details,a=shipping?.address;
  if(a?.country!=='US'||!/^\d{5}(?:-\d{4})?$/.test(a.postal_code||'')||a.postal_code.slice(0,5)!==q.zip)throw new Error('Address differs from quote');
  const payload={orderNumber:'FITLIVE-'+id,isSandbox:0,payType:3,shippingCountryCode:'US',shippingCountry:'United States',shippingZip:a.postal_code,shippingProvince:required(a.state,50),shippingCity:required(a.city,50),shippingCustomerName:required(shipping.name,50),shippingAddress:required(a.line1,500),shippingAddress2:a.line2?required(a.line2,500):'',logisticName:required(q.name,50),fromCountryCode:q.origin,products:[{vid:o.variant_id,quantity:1,storeLineItemId:id}]};
  const old=get(id);if(old){if(old.payload!==JSON.stringify(payload))throw new Error('Recipient changed after staging');return summary(id);}
  db.prepare('INSERT INTO production_jobs(id,custom_id,state,payload,category,updated) VALUES(?,?,?,?,?,?)').run(id,payload.orderNumber,'ready',JSON.stringify(payload),category,new Date().toISOString());return summary(id);
 }
 function checkIdentity(job,d){const p=JSON.parse(job.payload);if(d?.isSandbox!==0||typeof d.orderId!=='string'||!d.orderId||(job.detail_id&&job.detail_id!==d.orderId)||![d.orderNum,d.platformOrderId].includes(job.custom_id)||d.shippingCountryCode!=='US'||!Array.isArray(d.productList)||d.productList.length!==1||d.productList[0].vid!==p.products[0].vid||d.productList[0].quantity!==1)throw new Error('Supplier order identity mismatch');
  for(const k of ['shippingZip','shippingProvince','shippingCity','shippingCustomerName','shippingAddress','shippingAddress2','logisticName','fromCountryCode'])if(norm(d[k])!==norm(p[k]))throw new Error('Supplier recipient or shipping method mismatch');
 }
 async function sync(id){allowed();verified(id);const j=get(id);if(!j||j.state==='ready')throw new Error('Submit order first');try{const d=await cj.detail(j.detail_id||j.cj_id||j.custom_id);checkIdentity(j,d);const states={CREATED:'created',IN_CART:'created',UNPAID:'confirmed',UNSHIPPED:'paid',PENDING:'paid',PROCESSING:'paid',SHIPPED:'shipped',DELIVERED:'delivered',CANCELLED:'cancelled',CLOSED:'cancelled'},rank={creating:0,created:1,confirming:2,confirmed:3,paying:4,paid:5,shipped:6,delivered:7,cancelled:8};const state=states[d.orderStatus];if(!state)throw new Error('Unknown supplier state');const advance=rank[state]>=rank[j.state];
  db.prepare('UPDATE production_jobs SET detail_id=?,state=?,tracking=?,provider=?,error=?,updated=? WHERE id=? AND state=?').run(d.orderId,advance?state:j.state,advance&&typeof d.trackNumber==='string'?d.trackNumber:j.tracking,advance&&typeof d.trackingProvider==='string'?d.trackingProvider:j.provider,advance?null:j.error,new Date().toISOString(),id,j.state);return {summary:summary(id),detail:d};
 }catch{db.prepare('UPDATE production_jobs SET error=? WHERE id=? AND state=?').run('reconciliation_required',id,j.state);throw new Error('Reconcile supplier state before further mutations');}}
 async function checkCosts(id){const o=verified(id),j=get(id),p=JSON.parse(j.payload),approved=selectedProducts.find(p=>p.lookup.pid===o.product_id);const details=await catalog.detail(j.category,o.product_id),v=details.variants.find(v=>v.id===o.variant_id);if(!v||isReplacementPart(v.name)||!Number.isSafeInteger(v.stock)||v.stock<1||!Number.isSafeInteger(v.price)||v.price<0||details.origin!==p.fromCountryCode||approved?.checkoutHold)throw new Error('Supplier option unavailable');const method=(await catalog.shipping(j.category,o.product_id,o.variant_id,p.shippingZip.slice(0,5),1)).find(m=>m.name===p.logisticName);const floor=approved?500:800;if(!eligibleMethod(method)||contribution(o.retail_cents,v.price,method.totalCents,Math.max(o.tax_cents||0,Math.ceil(o.retail_cents*.105)))<floor)throw new Error('Insufficient fulfillment margin');return {order:o,floor};}
 return {stage,summary,close:()=>db.close(),sync:async id=>(await sync(id)).summary,
  async submit(id){allowed();refundClear(id);verified(id);const j=get(id);if(!j)throw new Error('Stage verified order first');if(j.state!=='ready')return summary(id);await checkCosts(id);refundClear(id);if(!claim(id,'ready','creating'))return summary(id);try{const cjId=await cj.create(JSON.parse(j.payload));db.prepare("UPDATE production_jobs SET cj_id=?,state='created' WHERE id=? AND state='creating'").run(cjId,id);}catch{update(id,'creating','creation_outcome_unknown');throw new Error('Creation outcome unknown; sync without resubmitting');}return (await sync(id)).summary;},
  async pay(id,approvedMaximumCents){allowed();refundClear(id);if(!Number.isSafeInteger(approvedMaximumCents)||approvedMaximumCents<1)throw new Error('Explicit supplier payment limit required');let current=await sync(id),j=get(id);if(['paid','shipped','delivered'].includes(j.state))return summary(id);if(!['created','confirmed'].includes(j.state))throw new Error('Reconcile before payment');
   if(j.state==='created'){refundClear(id);if(!j.cj_id)throw new Error('Shipment identity requires reconciliation');if(!claim(id,'created','confirming'))return summary(id);try{await cj.confirm(j.cj_id);}catch{update(id,'confirming','confirmation_outcome_unknown');throw new Error('Confirmation uncertain; sync first');}current=await sync(id);j=get(id);}
   if(j.state!=='confirmed'||current.detail.orderStatus!=='UNPAID')throw new Error('Expected confirmed unpaid supplier order');const {order,floor}=await checkCosts(id);const total=cents(current.detail.orderAmount);if(total>approvedMaximumCents||contribution(order.retail_cents,total,0,Math.max(order.tax_cents||0,Math.ceil(order.retail_cents*.105)))<floor)throw new Error('Final supplier amount exceeds budget or margin');
   refundClear(id);if(!j.cj_id||!claim(id,'confirmed','paying'))throw new Error('Payment cannot be claimed');try{await cj.pay(j.cj_id);}catch{update(id,'paying','payment_outcome_unknown');throw new Error('Payment uncertain; sync without paying again');}return (await sync(id)).summary;
  }
 };
}
