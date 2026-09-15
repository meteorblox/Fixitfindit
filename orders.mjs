import {DatabaseSync} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {dirname,isAbsolute} from 'node:path';
import {paymentTotals} from './payment-totals.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
export function createOrderStore(path) {
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
  for(const [name,type] of [['automatic_tax','INTEGER NOT NULL DEFAULT 0'],['tax_cents','INTEGER'],['total_cents','INTEGER']]) if(!columns.has(name)) db.exec(`ALTER TABLE orders ADD COLUMN ${name} ${type}`);
  function prepare(reference,item) {
    if(!reference || !item.productId || !item.variantId || !Number.isSafeInteger(item.retailCents) || item.retailCents<1) throw new Error('Invalid order.');
    const key=hash(reference+':'+item.variantId);
    const now=new Date().toISOString();
    db.prepare('INSERT OR IGNORE INTO orders(id,checkout_key,owner_hash,product_id,variant_id,product_name,retail_cents,created_at,updated_at,automatic_tax) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(randomUUID(),key,hash(reference),item.productId,item.variantId,item.name,item.retailCents,now,now,item.automaticTax?1:0);
    const row=db.prepare('SELECT * FROM orders WHERE checkout_key=?').get(key);
    if(row.retail_cents!==item.retailCents || row.product_id!==item.productId || row.automatic_tax!==(item.automaticTax?1:0)) throw new Error('Price changed. Start a fresh checkout.');
    return row;
  }
  function recordSession(s,eventId=null,eventType='') {
    const m=s.metadata||{};
    if(s.livemode!==false || !/^cs_test_[a-zA-Z0-9]+$/.test(s.id||'') || m.purpose!=='fixitfindit-product-sandbox' || m.fulfillment!=='sandbox-do-not-ship' || m.store_id!=='fixitfindit') throw new Error('Invalid sandbox order session.');
    db.exec('BEGIN IMMEDIATE');
    try {
      if(eventId && db.prepare('SELECT id FROM stripe_events WHERE id=?').get(eventId)) {db.exec('COMMIT');return;}
      const row=db.prepare('SELECT * FROM orders WHERE id=?').get(m.order_id||'');
      if(!row || row.owner_hash!==hash(s.client_reference_id||'') || row.product_id!==m.product_id || row.variant_id!==m.variant_id || m.quantity!=='1' || String(row.retail_cents)!==m.retail_cents || s.currency!=='usd' || (row.session_id && row.session_id!==s.id)) throw new Error('Order snapshot mismatch.');
      const totals=paymentTotals(s,row.retail_cents,Boolean(row.automatic_tax));
      const status=row.status==='paid_sandbox' || (s.status==='complete' && s.payment_status==='paid')?'paid_sandbox':eventType==='checkout.session.expired'?'expired':eventType==='checkout.session.async_payment_failed'?'failed':row.status;
      db.prepare('UPDATE orders SET session_id=?,status=?,updated_at=? WHERE id=?').run(s.id,status,new Date().toISOString(),row.id);
      if(row.status!=='paid_sandbox') db.prepare('UPDATE orders SET tax_cents=COALESCE(?,tax_cents),total_cents=COALESCE(?,total_cents) WHERE id=?').run(totals.taxCents,totals.totalCents,row.id);
      if(eventId) db.prepare('INSERT INTO stripe_events VALUES (?,?,?)').run(eventId,row.id,new Date().toISOString());
      db.exec('COMMIT');
      return {id:row.id,status};
    } catch(error) {db.exec('ROLLBACK');throw error;}
  }
  return {prepare,recordSession,get:id=>db.prepare('SELECT * FROM orders WHERE id=?').get(id),hasWebhook:id=>Boolean(db.prepare('SELECT id FROM stripe_events WHERE order_id=? LIMIT 1').get(id)),close:()=>db.close()};
}

// No temporary disk fallback: without a configured mount, existing sandbox
// checkout still works but application order storage is explicitly unavailable.
export const orders=process.env.ORDERS_DB_PATH?createOrderStore(process.env.ORDERS_DB_PATH):null;
