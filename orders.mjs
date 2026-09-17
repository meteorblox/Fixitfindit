import {affiliateStore} from './affiliate-store.mjs';
import {refundStore} from './refund-store.mjs';
import {sameRecipient} from './delivery-address.mjs';
import {DatabaseSync} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {dirname,isAbsolute} from 'node:path';
import {paymentTotals} from './payment-totals.mjs';
import {fulfillmentStore} from './fulfillment-store.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
export function createOrderStore(path,{mode='sandbox'}={}) {
  if(!['sandbox','live'].includes(mode)) throw new Error('Invalid order mode');
  const paidStatus=mode==='live'?'paid_live':'paid_sandbox';
  if(path!==':memory:' && !isAbsolute(path)) throw new Error('Order database needs an absolute path on persistent storage.');
  if(path!==':memory:') mkdirSync(dirname(path),{recursive:true});
  const db=new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY, checkout_key TEXT NOT NULL UNIQUE, owner_hash TEXT NOT NULL,
      product_id TEXT NOT NULL, variant_id TEXT NOT NULL, product_name TEXT NOT NULL,
      retail_cents INTEGER NOT NULL CHECK(retail_cents>0), quantity INTEGER NOT NULL DEFAULT 1,
      session_id TEXT UNIQUE, status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS stripe_events (id TEXT PRIMARY KEY, order_id TEXT NOT NULL, received_at TEXT NOT NULL);`);
  const columns=new Set(db.prepare('PRAGMA table_info(orders)').all().map(c=>c.name));
  const fulfillment=fulfillmentStore(db);
  for(const [name,type] of [['partner_id','TEXT'],['payment_intent','TEXT'],['mode',"TEXT NOT NULL DEFAULT 'sandbox'"],['automatic_tax','INTEGER NOT NULL DEFAULT 0'],['tax_cents','INTEGER'],['total_cents','INTEGER'],['shipping_cents','INTEGER NOT NULL DEFAULT 0'],['shipping_snapshot','TEXT'],['shipping_address_matches','INTEGER']]) if(!columns.has(name)) db.exec(`ALTER TABLE orders ADD COLUMN ${name} ${type}`);
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS order_payment_intent ON orders(payment_intent) WHERE payment_intent IS NOT NULL');
  const refunds=refundStore(db,mode);
  const affiliates=affiliateStore(db,mode);
  function prepare(reference,item) {
    if(!reference || !item.productId || !item.variantId || !Number.isSafeInteger(item.retailCents) || item.retailCents<1) throw new Error('Invalid order.');
    const partner=item.partner?.id||null;
    if(partner&&(!/^[a-zA-Z0-9-]{1,100}$/.test(partner)||(mode==='live'&&partner.startsWith('demo-'))))throw Error('Invalid partner');
    const shipping=item.shipping;
    if(shipping && (!Number.isSafeInteger(shipping.cents)||shipping.cents<0||!/^\d{5}$/.test(shipping.zip)||!shipping.name||!item.quoteId)) throw new Error('Invalid shipping snapshot.');
    const key=hash((mode==='live'?'live:':'')+reference+':'+item.variantId+(item.quoteId?':'+item.quoteId:'')+(partner?':partner:'+partner:''));
    const now=new Date().toISOString();
    db.prepare('INSERT OR IGNORE INTO orders(id,checkout_key,owner_hash,product_id,variant_id,product_name,retail_cents,created_at,updated_at,automatic_tax,shipping_cents,shipping_snapshot,mode,partner_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(randomUUID(),key,hash(reference),item.productId,item.variantId,item.name,item.retailCents,now,now,item.automaticTax?1:0,shipping?.cents??0,shipping?JSON.stringify(shipping):null,mode,partner);
    const row=db.prepare('SELECT * FROM orders WHERE checkout_key=?').get(key);
    if(row.partner_id!==partner || row.mode!==mode || row.retail_cents!==item.retailCents || row.product_id!==item.productId || row.automatic_tax!==(item.automaticTax?1:0) || row.shipping_cents!==(shipping?.cents??0) || row.shipping_snapshot!==(shipping?JSON.stringify(shipping):null)) throw new Error('Price changed. Start a fresh checkout.');
    return row;
  }
  function recordSession(s,eventId=null,eventType='') {
    const m=s.metadata||{};
    if(s.livemode!==(mode==='live') || !(mode==='live'?/^cs_live_[a-zA-Z0-9]+$/:/^cs_test_[a-zA-Z0-9]+$/).test(s.id||'') || m.purpose!==(mode==='live'?'fixitfindit-product-live':'fixitfindit-product-sandbox') || m.fulfillment!==(mode==='live'?'production-review':'sandbox-do-not-ship') || m.store_id!=='fixitfindit') throw new Error('Invalid sandbox order session.');
    db.exec('BEGIN IMMEDIATE');
    try {
      if(eventId && db.prepare('SELECT id FROM stripe_events WHERE id=?').get(eventId)) {db.exec('COMMIT');return;}
      const row=db.prepare('SELECT * FROM orders WHERE id=?').get(m.order_id||'');
      if(!row || row.mode!==mode || row.owner_hash!==hash(s.client_reference_id||'') || row.product_id!==m.product_id || row.variant_id!==m.variant_id || m.quantity!=='1' || String(row.retail_cents)!==m.retail_cents || s.currency!=='usd' || (row.session_id && row.session_id!==s.id)) throw new Error('Order snapshot mismatch.');
      if((row.partner_id||'')!==(m.partner_id||''))throw Error('Partner attribution mismatch');
      if(row.shipping_snapshot && m.shipping_cents!==String(row.shipping_cents)) throw new Error('Shipping snapshot mismatch.');
      const pi=typeof s.payment_intent==='string'?s.payment_intent:s.payment_intent?.id;
      if(pi){if(!/^pi_[a-zA-Z0-9]+$/.test(pi)||(row.payment_intent&&row.payment_intent!==pi))throw Error('Payment identity mismatch');db.prepare('UPDATE orders SET payment_intent=? WHERE id=?').run(pi,row.id);}
      const totals=paymentTotals(s,row.retail_cents,Boolean(row.automatic_tax),row.shipping_cents);
      const status=row.status===paidStatus || (s.status==='complete' && s.payment_status==='paid')?paidStatus:eventType==='checkout.session.expired'?'expired':eventType==='checkout.session.async_payment_failed'?'failed':row.status;
      db.prepare('UPDATE orders SET session_id=?,status=?,updated_at=? WHERE id=?').run(s.id,status,new Date().toISOString(),row.id);
      if(s.status==='complete' && s.payment_status==='paid' && row.shipping_snapshot) {
        const expected=JSON.parse(row.shipping_snapshot);
        const address=s.collected_information?.shipping_details?.address||s.shipping_details?.address;
        const matches=expected.recipient?sameRecipient(expected.recipient,s.collected_information?.shipping_details||s.shipping_details):address?.country==='US' && address?.postal_code?.slice(0,5)===expected.zip;
        db.prepare('UPDATE orders SET shipping_address_matches=? WHERE id=?').run(matches?1:0,row.id);
      }
      if(row.status!==paidStatus) db.prepare('UPDATE orders SET tax_cents=COALESCE(?,tax_cents),total_cents=COALESCE(?,total_cents) WHERE id=?').run(totals.taxCents,totals.totalCents,row.id);
      if(eventId) db.prepare('INSERT INTO stripe_events VALUES (?,?,?)').run(eventId,row.id,new Date().toISOString());
      if(mode==='sandbox' && eventId && ['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(eventType) && s.status==='complete' && s.payment_status==='paid') {
        fulfillment.enqueue({...row,status},s);
      }
      if(eventId&&['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(eventType)&&s.status==='complete'&&s.payment_status==='paid')affiliates.accrue({...row,status});
      db.exec('COMMIT');
      return {id:row.id,status};
    } catch(error) {db.exec('ROLLBACK');throw error;}
  }
  return {mode,prepare,recordSession,fulfillment,refunds,affiliates,listPaid:()=>db.prepare('SELECT id,product_name,retail_cents,tax_cents,total_cents,created_at FROM orders WHERE mode=? AND status=? ORDER BY created_at DESC LIMIT 200').all(mode,paidStatus),get:id=>db.prepare('SELECT * FROM orders WHERE id=?').get(id),hasWebhook:id=>Boolean(db.prepare('SELECT id FROM stripe_events WHERE order_id=? LIMIT 1').get(id)),close:()=>db.close()};
}

// No temporary disk fallback: without a configured mount, existing sandbox
// checkout still works but application order storage is explicitly unavailable.
export const orders=process.env.ORDERS_DB_PATH?createOrderStore(process.env.ORDERS_DB_PATH):null;
