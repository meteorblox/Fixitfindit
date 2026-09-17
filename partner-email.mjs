import {DatabaseSync} from 'node:sqlite';
import {randomBytes,createHash} from 'node:crypto';
const hash=s=>createHash('sha256').update(s).digest('hex');
const normalize=s=>String(s||'').trim().toLowerCase();
export function createPartnerEmailLogin({path,partners,key=process.env.RESEND_API_KEY,from=process.env.OWNER_EMAIL_FROM,request=fetch,now=Date.now}){

 const enabled=()=>Boolean(key&&from&&partners);
 const db=new DatabaseSync(path===':memory:'?path:path+'.partner-email');
 db.exec('PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS links(hash TEXT PRIMARY KEY,email TEXT NOT NULL,partner_id TEXT NOT NULL,expires INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS limits(bucket TEXT PRIMARY KEY,expires INTEGER NOT NULL)');
 return {enabled,close:()=>db.close(),
 async send(input){
  if(!enabled())throw Error('Email sign-in is not configured');
  const partner=partners.approvedEmail(normalize(input));if(!partner)return;
  const recipient=partner.email;
  db.prepare('DELETE FROM links WHERE expires<=?').run(now());db.prepare('DELETE FROM limits WHERE expires<=?').run(now());
  if(!db.prepare('INSERT OR IGNORE INTO limits VALUES(?,?)').run('send:'+partner.id,now()+60000).changes)return;
  const hour=Math.floor(now()/3600000),used=db.prepare('SELECT count(*) n FROM limits WHERE bucket LIKE ?').get('hour:'+partner.id+':'+hour+':%').n;
  if(used>=5)return;
  db.prepare('INSERT INTO limits VALUES(?,?)').run('hour:'+partner.id+':'+hour+':'+used,now()+3600000);
  const token=randomBytes(32).toString('hex'),digest=hash(token);
  // Keep existing links valid until expiry; anonymous requests must not revoke sessions.
  db.prepare('INSERT INTO links VALUES(?,?,?,?)').run(digest,recipient,partner.id,now()+15*60000);
  try{
   const response=await request('https://api.resend.com/emails',{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','Idempotency-Key':'partner-login-'+digest},body:JSON.stringify({from,to:[recipient],subject:'Sign in to your FixItFindIt partner dashboard',text:'Open this one-time link, then select Sign in. It expires in 15 minutes.\n\nhttps://www.fixitfindit.com/partners/dashboard/email?token='+token+'\n\nIf you did not request this, ignore this email.'})});
   if(!response.ok||!(await response.json()).id)throw Error('Delivery failed');
  }catch{db.prepare('DELETE FROM links WHERE hash=?').run(digest);throw Error('Email delivery unavailable');}
 },
 consume(token){if(!enabled()||! /^[a-f0-9]{64}$/.test(token||''))return null;const link=db.prepare('DELETE FROM links WHERE hash=? AND expires>? RETURNING email,partner_id').get(hash(token),now());if(!link)return null;const p=partners.approvedEmail(link.email);return p&&p.id===link.partner_id?p:null;}
 };
}
