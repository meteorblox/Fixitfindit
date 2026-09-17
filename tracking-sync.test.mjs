import test from 'node:test';
import assert from 'node:assert/strict';
import {createTrackingSync} from './tracking-sync.mjs';
test('automatic checks only sync submitted active orders, bound batches and retry failures',async()=>{
 let time=0,calls=[];const worker={list:()=>[{orderId:'ready',state:'ready'},{orderId:'done',cjOrderId:'d',state:'delivered'},...['a','b','c'].map(orderId=>({orderId,cjOrderId:orderId,state:'paid'}))],async sync(id){calls.push(id);if(id==='a')throw Error('CJ unavailable');}};
 const service=createTrackingSync({worker,now:()=>time,limit:2});await service.tick();assert.deepEqual(calls,['a','b']);await service.tick();assert.deepEqual(calls,['a','b','c']);time=900001;await service.tick();assert.deepEqual(calls,['a','b','c','a','b']);
});
test('button and scheduler coalesce in-flight reads and throttle repeated refreshes',async()=>{
 let release,count=0;const s=createTrackingSync({worker:{list:()=>[],sync:()=>{count++;return new Promise(r=>release=r);}}});
 const a=s.sync('one'),b=s.sync('one');await Promise.resolve();assert.equal(count,1);release('ok');assert.deepEqual(await Promise.all([a,b]),['ok','ok']);await assert.rejects(s.sync('one'),/wait/);
});
