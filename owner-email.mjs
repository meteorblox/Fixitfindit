import {DatabaseSync} from 'node:sqlite';
import {randomBytes,createHash} from 'node:crypto';
const hash=s=>createHash('sha256').update(s).digest('hex');
const normalize=s=>String(s||'').trim().toLowerCase();
export function createOwnerEmailLogin({path,email=process.env.OWNER_LOGIN_EMAIL,key=process.env.RESEND_API_KEY,from=process.env.OWNER_EMAIL_FROM,request=fetch,now=Date.now}){
 const recipient=normalize(email);
 const enabled=()=>Boolean(key&&from&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient));
 const db=new DatabaseSync(path===':memory:'?path:path+'.owner-email');
 db.exec('PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS links(hash TEXT PRIMARY KEY,email TEXT NOT NULL,expires INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS limits(bucket TEXT PRIMARY KEY,expires INTEGER NOT NULL)');
 return {enabled,close:()=>db.close(),
 async send(input){
  if(!enabled())throw Error('Email sign-in is not configured');
  if(normalize(input)!==recipient)return;
  db.prepare('DELETE FROM links WHERE expires<=?').run(now());db.prepare('DELETE FROM limits WHERE expires<=?').run(now());
  if(!db.prepare('INSERT OR IGNORE INTO limits VALUES(?,?)').run('send',now()+60000).changes)return;
  const token=randomBytes(32).toString('hex'),digest=hash(token);
  // Keep existing links valid until expiry; anonymous requests must not revoke sessions.
  db.prepare('INSERT INTO links VALUES(?,?,?)').run(digest,recipient,now()+15*60000);
  try{
   const response=await request('https://api.resend.com/emails',{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','Idempotency-Key':'owner-login-'+digest},body:JSON.stringify({from,to:[recipient],subject:'Sign in to your FixItFindIt Orders page',text:'Open this one-time link, then select Sign in. It expires in 15 minutes.\n\nhttps://www.fixitfindit.com/owner/orders/email?token='+token+'\n\nIf you did not request this, ignore this email.'})});
   if(!response.ok||!(await response.json()).id)throw Error('Delivery failed');
  }catch{db.prepare('DELETE FROM links WHERE hash=?').run(digest);throw Error('Email delivery unavailable');}
 },
 consume(token){if(!enabled()||! /^[a-f0-9]{64}$/.test(token||''))return false;return Boolean(db.prepare('DELETE FROM links WHERE hash=? AND email=? AND expires>? RETURNING hash').get(hash(token),recipient,now()));}
 };
}
