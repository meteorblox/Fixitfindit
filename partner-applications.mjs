import {validateLogo,logoVersion} from './partner-logo.mjs';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
export function createPartnerStore(path) {
 const db=new DatabaseSync(path);db.exec(`PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS partner_applications(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,brand TEXT NOT NULL,website TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',slug TEXT UNIQUE,created_at TEXT NOT NULL);`);
 db.exec('CREATE TABLE IF NOT EXISTS partner_logos(partner_id TEXT PRIMARY KEY,mime TEXT NOT NULL,bytes BLOB NOT NULL,version TEXT NOT NULL)');
 const approved=id=>Boolean(db.prepare("SELECT id FROM partner_applications WHERE id=? AND status='approved'").get(id));
 return {
 saveLogo(id,bytes){if(!approved(id))throw Error('Approved partner required');const logo=validateLogo(bytes);db.prepare('INSERT INTO partner_logos VALUES(?,?,?,?) ON CONFLICT(partner_id) DO UPDATE SET mime=excluded.mime,bytes=excluded.bytes,version=excluded.version').run(id,logo.mime,logo.bytes,logoVersion(logo.bytes));},
 removeLogo(id){if(!approved(id))throw Error('Approved partner required');db.prepare('DELETE FROM partner_logos WHERE partner_id=?').run(id);},
 logo(slug){return db.prepare("SELECT l.mime,l.bytes FROM partner_logos l JOIN partner_applications p ON p.id=l.partner_id WHERE p.slug=? AND p.status='approved'").get(slug);},
 apply(input){
  const v=Object.fromEntries(['email','name','brand','website'].map(k=>[k,String(input[k]||'').trim()]));v.email=v.email.toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)||v.email.length>254||!v.name||v.name.length>100||!v.brand||v.brand.length>80||v.website.length>500) throw new Error('Enter a valid email, name and storefront name.');
  if(v.website && !/^https?:\/\//i.test(v.website)) throw new Error('Use a full website or social profile URL starting with https://.');
  db.prepare('INSERT OR IGNORE INTO partner_applications(id,email,name,brand,website,created_at) VALUES(?,?,?,?,?,?)').run(randomUUID(),v.email,v.name,v.brand,v.website,new Date().toISOString());
 },
 approvedEmail(email){return db.prepare("SELECT id,email,slug FROM partner_applications WHERE email=? AND status='approved'").get(String(email||'').trim().toLowerCase());},
 list(){return db.prepare('SELECT * FROM partner_applications ORDER BY created_at DESC').all();},
 approve(id,slug){if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||slug.length>60||slug==='home-helper')throw new Error('Choose a unique lowercase storefront slug.');const r=db.prepare("UPDATE partner_applications SET status='approved',slug=? WHERE id=? AND status='pending'").run(slug,id);if(!r.changes)throw new Error('Pending application not found.');},
 find(slug){const r=db.prepare("SELECT id,brand,slug,(SELECT version FROM partner_logos WHERE partner_id=partner_applications.id) logo_version FROM partner_applications WHERE slug=? AND status='approved'").get(slug);return r?{id:r.id,slug:r.slug,name:r.brand,logoUrl:r.logo_version?'/partner-logos/'+r.slug+'?v='+r.logo_version:null,tagline:'Useful finds for your home.',accent:'#167164',demo:false}:undefined;},
 close(){db.close();}
 };
}
export const partnerStore=process.env.ORDERS_DB_PATH?createPartnerStore(process.env.ORDERS_DB_PATH):null;
