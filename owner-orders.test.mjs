import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createOwnerAccess,createOwnerOrdersRoute,owner,ownerOrdersPage} from './owner-orders.mjs';
import {createDashboardAccess} from './partner-dashboard.mjs';
import {createOrderStore} from './orders.mjs';
import {DatabaseSync} from 'node:sqlite';
const find=s=>s===owner.slug?owner:null;
test('owner credentials are isolated from partners, one-use and revocable',()=>{
 const dir=mkdtempSync(join(tmpdir(),'fit-owner-')),path=join(dir,'orders.sqlite');const a=createOwnerAccess(path),p=createDashboardAccess(path);
 try{const partnerCode=p.issue(owner);assert.equal(a.login(partnerCode,find),null);const code=a.issue(owner),token=a.login(code,find);assert.ok(token);assert.equal(a.login(code,find),null);assert.equal(p.resolve(token,find),null);a.revoke(owner.id);assert.equal(a.resolve(token,find),null);}finally{a.close();p.close();rmSync(dir,{recursive:true});}
});
test('only authenticated owner sees paid orders, holds, unprepared orders and escaped supplier data',async()=>{
 const access=createOwnerAccess(':memory:');let reads=0;const route=createOwnerOrdersRoute({access,orders:{listPaid(){reads++;return [{id:'order-private',product_name:'<script>bad</script>',retail_cents:12700,tax_cents:0,total_cents:12700}];},refunds:{summary:()=>({fulfillmentHold:true})}},worker:{summary:()=>null}});
 async function run({cookie='',method='GET',path='/owner/orders',body='',origin='https://www.fixitfindit.com'}={}){const req=Readable.from([body]);req.method=method;req.headers={cookie,origin,'content-type':'application/x-www-form-urlencoded'};const res={headers:{},setHeader(k,v){this.headers[k]=v;},writeHead(s,h){this.status=s;Object.assign(this.headers,h);},end(b){this.body=b;}};await route(req,res,new URL('https://www.fixitfindit.com'+path));return res;}
 try{assert.match((await run()).body,/Owner sign-in/);assert.equal(reads,0);const code=access.issue(owner);assert.equal((await run({method:'POST',path:'/owner/orders/login',body:'code='+code,origin:'https://evil.example'})).status,403);const login=await run({method:'POST',path:'/owner/orders/login',body:'code='+code});assert.equal(login.status,303);const cookie=login.headers['Set-Cookie'].split(';')[0];assert.match(login.headers['Set-Cookie'],/HttpOnly; Secure; SameSite=Strict/);const r=await run({cookie});assert.match(r.body,/order-private/);assert.match(r.body,/Refund hold/);assert.match(r.body,/Not submitted/);assert.ok(!r.body.includes('<script>'));assert.equal(r.headers['Cache-Control'],'private, no-store');assert.equal((await run({cookie,method:'POST',path:'/owner/orders/pay'})).status,404);await run({cookie,method:'POST',path:'/owner/orders/logout'});assert.match((await run({cookie})).body,/Owner sign-in/);}finally{access.close();}
});
test('paid order listing excludes sandbox and unpaid records',()=>{
 const dir=mkdtempSync(join(tmpdir(),'fit-paid-')),path=join(dir,'orders.sqlite');const live=createOrderStore(path,{mode:'live'}),sandbox=createOrderStore(path);const item={productId:'p',variantId:'v',name:'Product',retailCents:1000};const paid=live.prepare('one',item),unpaid=live.prepare('two',item),fake=sandbox.prepare('three',item);const db=new DatabaseSync(path);
 try{db.prepare('UPDATE orders SET status=? WHERE id=?').run('paid_live',paid.id);db.prepare('UPDATE orders SET status=? WHERE id=?').run('paid_sandbox',fake.id);assert.deepEqual(live.listPaid().map(r=>r.id),[paid.id]);assert.ok(!live.listPaid().some(r=>r.id===unpaid.id));}finally{db.close();live.close();sandbox.close();rmSync(dir,{recursive:true});}
});
test('owner empty screen does not imply launch readiness or live tracking',()=>{const html=ownerOrdersPage([]);assert.match(html,/No paid live orders yet/);assert.match(html,/does not contact CJ/);});
