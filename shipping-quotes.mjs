import {DatabaseSync} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {isAbsolute,dirname} from 'node:path';
import {mkdirSync} from 'node:fs';

const ownerHash=value=>createHash('sha256').update(value).digest('hex');
export function createQuoteStore(path,{now=Date.now}={}) {
  if(path!==':memory:' && !isAbsolute(path)) throw new Error('Quote storage requires an absolute database path.');
  if(path!==':memory:') mkdirSync(dirname(path),{recursive:true});
  const db=new DatabaseSync(path);
  db.exec(`PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS shipping_quotes(
    id TEXT PRIMARY KEY,owner_hash TEXT NOT NULL,item_json TEXT NOT NULL,expires_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS shipping_quotes_expiry ON shipping_quotes(expires_at);`);
  return {
    save(owner,item) {
      db.prepare('DELETE FROM shipping_quotes WHERE expires_at<=?').run(now());
      if(db.prepare('SELECT count(*) AS n FROM shipping_quotes').get().n>=10000) throw new Error('Shipping is busy. Try again shortly.');
      const id=randomUUID(),expiresAt=now()+10*60*1000;
      const snapshot={...item,quoteId:id};
      db.prepare('INSERT INTO shipping_quotes VALUES(?,?,?,?)').run(id,ownerHash(owner),JSON.stringify(snapshot),expiresAt);
      return {...snapshot,expiresAt};
    },
    get(owner,id) {
      const row=db.prepare('SELECT * FROM shipping_quotes WHERE id=? AND owner_hash=? AND expires_at>?').get(id,ownerHash(owner),now());
      if(!row) throw new Error('Shipping quote expired. Please get a new quote.');
      return JSON.parse(row.item_json);
    },
    close(){db.close();}
  };
}
export const shippingQuotes=process.env.ORDERS_DB_PATH?createQuoteStore(process.env.ORDERS_DB_PATH):null;

// Missing fee fields remain unknown, never silently become zero.
export function normalizeShipping(row,{origin,destination}={}) {
  const cents=value=>value===null||value===undefined||value===''?null:
    Number.isFinite(Number(value)) && Number(value)>=0 && Number.isSafeInteger(Math.round(Number(value)*100))?Math.round(Number(value)*100):null;
  const price=cents(row.logisticPrice),total=cents(row.totalPostageFee);
  const taxes=cents(row.taxesFee),clearance=cents(row.clearanceOperationFee);
  const sum=price!==null&&taxes!==null&&clearance!==null?price+taxes+clearance:null;
  const domestic=origin==='US'&&destination==='US';
  const omitted=v=>v===null||v===undefined||v==='';
  const domesticTotal=domestic&&price!==null&&omitted(row.totalPostageFee)&&[row.taxesFee,row.clearanceOperationFee].every(v=>omitted(v)||cents(v)!==null)?price+(taxes??0)+(clearance??0):null;
  const totalCents=total!==null&&price!==null&&total>=price&&(sum===null||total>=sum)?total:
    total===null?(sum??domesticTotal):null;
  return {name:String(row.logisticName||''),days:String(row.logisticAging||'Unavailable'),price,
    totalCents,taxesCents:taxes,clearanceCents:clearance,feesConfirmed:totalCents!==null};
}
