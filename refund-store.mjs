export function refundStore(db,mode) {
 db.exec("CREATE TABLE IF NOT EXISTS refund_checks(order_id TEXT PRIMARY KEY,revision INTEGER NOT NULL DEFAULT 0,checked_at TEXT,hold INTEGER NOT NULL DEFAULT 0); CREATE TABLE IF NOT EXISTS refunds(id TEXT PRIMARY KEY,order_id TEXT NOT NULL,amount INTEGER NOT NULL,status TEXT NOT NULL,failure_reason TEXT,updated_at TEXT NOT NULL)");
 const get=id=>db.prepare('SELECT * FROM orders WHERE id=? AND mode=?').get(id,mode);
 function begin(id){if(!get(id))throw Error('Unknown order');db.prepare('INSERT OR IGNORE INTO refund_checks(order_id) VALUES (?)').run(id);db.prepare('UPDATE refund_checks SET revision=revision+1 WHERE order_id=?').run(id);return db.prepare('SELECT revision FROM refund_checks WHERE order_id=?').get(id).revision;}
 function summary(id){if(!get(id))throw Error('Unknown order');const check=db.prepare('SELECT * FROM refund_checks WHERE order_id=?').get(id);const rows=db.prepare('SELECT * FROM refunds WHERE order_id=? ORDER BY id').all(id);return {orderId:id,checkedAt:check?.checked_at||null,fulfillmentHold:Boolean(check?.hold),refundedCents:rows.filter(r=>r.status==='succeeded').reduce((n,r)=>n+r.amount,0),pendingCents:rows.filter(r=>['pending','requires_action'].includes(r.status)).reduce((n,r)=>n+r.amount,0),refunds:rows};}
 function save(id,revision,rows){
  const order=get(id);if(!order||!Array.isArray(rows))throw Error('Unknown refund order');
  const seen=new Set();let reserved=0;
  for(const r of rows){if(!/^re_[a-zA-Z0-9]+$/.test(r.id||'')||seen.has(r.id)||!Number.isSafeInteger(r.amount)||r.amount<1||r.currency!=='usd'||r.payment_intent!==order.payment_intent||!['pending','requires_action','succeeded','failed','canceled'].includes(r.status))throw Error('Invalid refund snapshot');seen.add(r.id);if(!['failed','canceled'].includes(r.status))reserved+=r.amount;}
  if(!Number.isSafeInteger(order.total_cents)||reserved>order.total_cents)throw Error('Refund exceeds paid amount');
  db.exec('BEGIN IMMEDIATE');try{
   const check=db.prepare('SELECT * FROM refund_checks WHERE order_id=?').get(id);if(check?.revision!==revision)throw Error('Newer refund check in progress; retry');
   const old=db.prepare('SELECT * FROM refunds WHERE order_id=?').all(id);if(old.some(r=>!seen.has(r.id)))throw Error('Incomplete refund history');
   for(const r of rows){const previous=db.prepare('SELECT * FROM refunds WHERE id=?').get(r.id);if(previous&&(previous.order_id!==id||previous.amount!==r.amount))throw Error('Refund identity changed');db.prepare('INSERT INTO refunds VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,failure_reason=excluded.failure_reason,updated_at=excluded.updated_at').run(r.id,id,r.amount,r.status,r.failure_reason||null,new Date().toISOString());}
   db.prepare('UPDATE refund_checks SET checked_at=?,hold=MAX(hold,?) WHERE order_id=?').run(new Date().toISOString(),rows.length?1:0,id);db.exec('COMMIT');return summary(id);
  }catch(e){db.exec('ROLLBACK');throw e;}
 }
 return {begin,save,summary,hold:id=>{begin(id);db.prepare('UPDATE refund_checks SET hold=1 WHERE order_id=?').run(id);},findPayment:pi=>db.prepare('SELECT id FROM orders WHERE payment_intent=? AND mode=?').get(pi,mode)?.id};
}
