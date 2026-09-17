import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createPartnerEmailLogin} from './partner-email.mjs';
import {createPartnerEmailRoute} from './partner-email-route.mjs';
import {createDashboardAccess} from './partner-dashboard.mjs';
test('email links are approved-partner scoped, throttled, one-use, expiring and recheck approval',async()=>{
 let time=0,approved=true,sent=[];const partner={id:'p1',slug:'one',email:'one@example.com'};const partners={approvedEmail:e=>approved&&e===partner.email?partner:null};const mail=createPartnerEmailLogin({path:':memory:',partners,key:'test',from:'login@example.com',now:()=>time,request:async(u,o)=>{sent.push(JSON.parse(o.body));return {ok:true,json:async()=>({id:'sent'})};}});
 const token=i=>sent[i].text.match(/token=([a-f0-9]+)/)[1];
 try{await mail.send('unapproved@example.com');assert.equal(sent.length,0);await mail.send('ONE@example.com');await mail.send(partner.email);assert.equal(sent.length,1);assert.equal(mail.consume(token(0)).id,'p1');assert.equal(mail.consume(token(0)),null);time=61000;await mail.send(partner.email);approved=false;assert.equal(mail.consume(token(1)),null);approved=true;time+=61000;await mail.send(partner.email);time+=900001;assert.equal(mail.consume(token(2)),null);}finally{mail.close();}
});
test('partner email route requires CSRF and establishes only the matching partner session',async()=>{
 const access=createDashboardAccess(':memory:'),p={id:'one',slug:'one'},magic='b'.repeat(64);let consumed=0;const find=s=>s==='one'?p:null;const route=createPartnerEmailRoute({access,findPartner:find,emailLogin:{enabled:()=>true,send:async()=>{},consume:t=>{consumed++;return t===magic&&consumed===1?p:null;}}});
 async function run(path,method='GET',body='',cookie=''){const req=Readable.from([body]);req.method=method;req.headers={cookie,'content-type':'application/x-www-form-urlencoded'};const res={headers:{},setHeader(k,v){this.headers[k]=v;},writeHead(n,h){this.status=n;Object.assign(this.headers,h);},end(b){this.body=b;}};await route(req,res,new URL('https://www.fixitfindit.com'+path));return res;}
 try{const r=await run('/partners/dashboard/email?token='+magic);assert.equal(consumed,0);assert.match(r.body,/email-verify/);const cookie=r.headers['Set-Cookie'].split(';')[0],csrf=cookie.split('=')[1];assert.equal((await run('/partners/dashboard/email-verify','POST','token='+magic,cookie)).status,403);assert.equal(consumed,0);const success=await run('/partners/dashboard/email-verify','POST','token='+magic+'&csrf='+csrf,cookie);assert.equal(success.status,303);const session=success.headers['Set-Cookie'].split(';')[0].split('=')[1];assert.equal(access.resolve(session,find).id,'one');assert.equal(access.resolve(session,()=>({id:'two'})),null);}finally{access.close();}
});
