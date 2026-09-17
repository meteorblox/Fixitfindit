// Only supplier reads: this service never submits, confirms or pays orders.
export function createTrackingSync({worker,now=Date.now,interval=15*60*1000,limit=20}){
 const pending=new Map(),attempted=new Map();let running=false;
 async function sync(id){
  if(pending.has(id))return pending.get(id);
  if(now()-(attempted.get(id)??-Infinity)<30000)throw Error('Please wait before refreshing again');
  attempted.set(id,now());
  const task=Promise.resolve().then(()=>worker.sync(id)).finally(()=>pending.delete(id));pending.set(id,task);return task;
 }
 async function tick(){if(running)return;running=true;try{
  const rows=worker.list().filter(r=>r.cjOrderId&&!['delivered','cancelled'].includes(r.state)&&now()-(attempted.get(r.orderId)??-Infinity)>=interval).sort((a,b)=>(attempted.get(a.orderId)||0)-(attempted.get(b.orderId)||0)).slice(0,limit);
  for(const r of rows){try{await sync(r.orderId);}catch{ /* retry next cycle; worker records reconciliation status */ }}
 }finally{running=false;}}
 return {sync,tick,start(){const timer=setInterval(()=>void tick().catch(()=>{}),interval);timer.unref();void tick().catch(()=>{});return ()=>clearInterval(timer);}};
}
