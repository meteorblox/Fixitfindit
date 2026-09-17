import test from 'node:test';
import assert from 'node:assert/strict';
import {createOwnerEmailLogin} from './owner-email.mjs';
import {createOwnerAccess,createOwnerOrdersRoute} from './owner-orders.mjs';
import {Readable} from 'node:stream';
test('email login restricts recipient, throttles delivery, expires and consumes links once',async()=>{
 let time=0,sent=[];const a=createOwnerEmailLogin({path:':memory:',email:'owner@example.com',key:'fake',from:'login@example.com',now:()=>time,request:async(u,o)=>{sent.push(JSON.parse(o.body));return {ok:true,json:async()=>({id:'mail'})};}});
 try{await a.send('other@example.com');assert.equal(sent.length,0);await a.send('OWNER@example.com');await a.send('owner@example.com');assert.equal(sent.length,1);const token=sent[0].text.match(/token=([a-f0-9]+)/)[1];assert.equal(a.consume('x'.repeat(64)),false);assert.equal(a.consume(token),true);assert.equal(a.consume(token),false);time=61000;await a.send('owner@example.com');time+=900001;assert.equal(a.consume(sent[1].text.match(/token=([a-f0-9]+)/)[1]),false);}finally{a.close();}
});
test('failed delivery invalidates its token and missing config disables email login',async()=>{
 let token;const a=createOwnerEmailLogin({path:':memory:',email:'owner@example.com',key:'fake',from:'login@example.com',request:async(u,o)=>{token=JSON.parse(o.body).text.match(/token=([a-f0-9]+)/)[1];return {ok:false};}});try{await assert.rejects(a.send('owner@example.com'));assert.equal(a.consume(token),false);}finally{a.close();}const off=createOwnerEmailLogin({path:':memory:'});assert.equal(off.enabled(),false);off.close();
});
test('email scanner GET does not sign in; CSRF-protected POST consumes link and redirects privately',async()=>{
 const access=createOwnerAccess(':memory:');let consumes=0;const magic='b'.repeat(64);const route=createOwnerOrdersRoute({access,orders:{listPaid:()=>[],refunds:{summary:()=>({})}},worker:{summary:()=>null},emailLogin:{enabled:()=>true,consume:t=>{consumes++;return t===magic&&consumes===1;},send:async()=>{}}});
 async function run(path,method='GET',body='',cookie=''){const req=Readable.from([body]);req.method=method;req.headers={cookie,'content-type':'application/x-www-form-urlencoded'};const res={headers:{},setHeader(k,v){this.headers[k]=v;},writeHead(s,h){this.status=s;Object.assign(this.headers,h);},end(b){this.body=b;}};await route(req,res,new URL('https://www.fixitfindit.com'+path));return res;}
 try{const landing=await run('/owner/orders/email?token='+magic);assert.equal(landing.status,200);assert.equal(consumes,0);assert.match(landing.body,/email-verify/);assert.doesNotMatch(landing.body,/name="email"/);const cookie=landing.headers['Set-Cookie'].split(';')[0],csrf=cookie.split('=')[1];assert.equal((await run('/owner/orders/email-verify','POST','token='+magic,cookie)).status,403);assert.equal(consumes,0);const logged=await run('/owner/orders/email-verify','POST','token='+magic+'&csrf='+csrf,cookie);assert.equal(logged.status,303);assert.equal(logged.headers.Location,'/owner/orders');assert.match(logged.headers['Set-Cookie'],/fit_owner_session=/);assert.match((await run('/owner/orders','GET','',logged.headers['Set-Cookie'].split(';')[0])).body,/No paid live orders/);assert.equal((await run('/owner/orders/email-verify','POST','token='+magic+'&csrf='+csrf,cookie)).status,401);}finally{access.close();}
});
