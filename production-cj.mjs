// Production access is opt-in and never shares the sandbox adapter's mutations.
export function createProductionCj({apiKey=process.env.CJ_API_KEY,enabled=false,request=fetch,interval=1100}={}) {
 let token,expires=0,queue=Promise.resolve(),next=0;
 async function call(path,body,method=body?'POST':'GET') {
  if(!enabled||!apiKey)throw new Error('Production CJ access is disabled');
  const task=queue.then(async()=>{await new Promise(r=>setTimeout(r,Math.max(0,next-Date.now())));next=Date.now()+interval;
   const response=await request('https://developers.cjdropshipping.com/api2.0/v1'+path,{method,redirect:'error',signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/json',...(token?{'CJ-Access-Token':token}:{})},...(body?{body:JSON.stringify(body)}:{})});
   if(!response.ok)throw new Error('CJ request failed; reconcile before retrying');const result=await response.json();if(result.result!==true)throw new Error('CJ request failed; reconcile before retrying');return result.data;});queue=task.catch(()=>{});return task;
 }
 async function auth(){if(token&&expires>Date.now()+60000)return;const data=await call('/authentication/getAccessToken',{apiKey});if(!data?.accessToken)throw new Error('CJ authentication failed');token=data.accessToken;expires=Date.parse(data.accessTokenExpiryDate)||Date.now()+3600000;}
 async function detail(id){if(typeof id!=='string'||!id||id.length>200)throw new Error('Invalid order ID');await auth();const data=await call('/shopping/order/getOrderDetail?'+new URLSearchParams({orderId:id}));if(data?.isSandbox!==0)throw new Error('Expected a production order');return data;}
 return {enabled:()=>enabled&&Boolean(apiKey),detail,
  async create(payload){
   if(payload?.isSandbox!==0||payload.payType!==3||!/^FITLIVE-[a-f0-9-]{36}$/.test(payload.orderNumber||''))throw new Error('Invalid production draft');
   const fields=['orderNumber','shippingCountryCode','shippingCountry','shippingZip','shippingProvince','shippingCity','shippingCustomerName','shippingAddress','shippingAddress2','logisticName','fromCountryCode','products'];
   const body=Object.fromEntries(fields.map(k=>[k,payload[k]]));await auth();const data=await call('/shopping/order/createOrderV2',{...body,isSandbox:0,payType:3,orderFlow:1,shopLogisticsType:2});if(!data?.orderId||typeof data.orderId!=='string')throw new Error('Creation result unknown');return data.orderId;
  },
  async confirm(id){await auth();return call('/shopping/order/confirmOrder',{orderId:id},'PATCH');},
  async pay(id){await auth();return call('/shopping/pay/payBalanceV2',{shipmentOrderId:id});}
 };
}
