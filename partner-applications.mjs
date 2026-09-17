import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
export function createPartnerStore(path) {
 const db=new DatabaseSync(path);db.exec(`PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS partner_applications(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,brand TEXT NOT NULL,website TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',slug TEXT UNIQUE,created_at TEXT NOT NULL);`);
 return {
 apply(input){
  const v=Object.fromEntries(['email','name','brand','website'].map(k=>[k,String(input[k]||'').trim()]));v.email=v.email.toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)||v.email.length>254||!v.name||v.name.length>100||!v.brand||v.brand.length>80||v.website.length>500) throw new Error('Enter a valid email, name and storefront name.');
  if(v.website && !/^https?:\/\//i.test(v.website)) throw new Error('Use a full website or social profile URL starting with https://.');
  db.prepare('INSERT OR IGNORE INTO partner_applications(id,email,name,brand,website,created_at) VALUES(?,?,?,?,?,?)').run(randomUUID(),v.email,v.name,v.brand,v.website,new Date().toISOString());
 },
 list(){return db.prepare('SELECT * FROM partner_applications ORDER BY created_at DESC').all();},
 approve(id,slug){if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||slug.length>60||slug==='home-helper')throw new Error('Choose a unique lowercase storefront slug.');const r=db.prepare("UPDATE partner_applications SET status='approved',slug=? WHERE id=? AND status='pending'").run(slug,id);if(!r.changes)throw new Error('Pending application not found.');},
 find(slug){const r=db.prepare("SELECT id,brand,slug FROM partner_applications WHERE slug=? AND status='approved'").get(slug);return r?{id:r.id,slug:r.slug,name:r.brand,tagline:'Useful finds for your home.',accent:'#167164',demo:false}:undefined;},
 close(){db.close();}
 };
}
export const partnerStore=process.env.ORDERS_DB_PATH?createPartnerStore(process.env.ORDERS_DB_PATH):null;
