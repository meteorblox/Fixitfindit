const base='https://developers.cjdropshipping.com/api2.0/v1';
export function createCjFulfillment({apiKey=process.env.CJ_API_KEY,mode=process.env.CJ_FULFILLMENT_MODE,request=fetch,interval=1100}={}) {
  let token,expires=0,authentication,queue=Promise.resolve(),nextCall=0;
  const enabled=()=>mode==='sandbox' && Boolean(apiKey);
  function call(path,body,access) {
    if(!enabled()) throw new Error('CJ sandbox fulfillment is not enabled.');
    const task=queue.then(async()=>{
      await new Promise(resolve=>setTimeout(resolve,Math.max(0,nextCall-Date.now())));
      nextCall=Date.now()+interval;
      try {
        const res=await request(base+path,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(20000),
          headers:{'Content-Type':'application/json',...(access?{'CJ-Access-Token':access}:{})},
          ...(body?{body:JSON.stringify(body)}:{})});
        if(!res.ok) throw new Error();
        const data=await res.json();
        if(data.result!==true) throw new Error();
        return data.data;
      } catch {throw new Error('CJ request failed; reconcile order state before retrying mutations.');}
    });
    queue=task.catch(()=>{});return task;
  }
  async function authenticate() {
    if(token && expires>Date.now()+60000) return token;
    if(authentication) return authentication;
    authentication=(async()=>{
      const data=await call('/authentication/getAccessToken',{apiKey});
      if(typeof data?.accessToken!=='string' || !data.accessToken) throw new Error('CJ authentication failed.');
      token=data.accessToken;expires=Date.parse(data.accessTokenExpiryDate)||Date.now()+3600000;
      return token;
    })();
    try {return await authentication;} finally {authentication=null;}
  }
  async function detail(id) {
    if(typeof id!=='string'||!id||id.length>200) throw new Error('Invalid CJ order ID.');
    const data=await call('/shopping/order/getOrderDetail?'+new URLSearchParams({orderId:id}),null,await authenticate());
    if(data?.isSandbox!==1) throw new Error('CJ did not confirm a sandbox order.');
    return data;
  }
  return {
    enabled,detail,
    async create(payload) {
      if(payload?.isSandbox!==1 || payload.payType!==3 || !/^FITTEST-[a-f0-9-]{36}$/.test(payload.orderNumber||'')) throw new Error('Only FixItFindIt sandbox orders can be created.');
      // A closed set of fields and fixed flags prevents accidental live ordering.
      const allowed=['orderNumber','shippingCountryCode','shippingCountry','shippingZip','shippingProvince','shippingCity','shippingCustomerName','shippingAddress','shippingAddress2','logisticName','fromCountryCode','products','remark'];
      const body=Object.fromEntries(allowed.map(k=>[k,payload[k]]));
      const data=await call('/shopping/order/createOrderV2',{...body,isSandbox:1,payType:3,orderFlow:1,shopLogisticsType:2},await authenticate());
      if(typeof data?.orderId!=='string'||!data.orderId||data.orderId.length>200) throw new Error('CJ order ID missing; reconciliation required.');
      return data.orderId;
    },
    async simulatePayment(id) {
      await detail(id); // Refuse live or unidentifiable orders even if called directly.
      return call('/shopping/sandbox/simulatePay',{orderId:id},await authenticate());
    },
    async simulateTracking(id,trackNumber) {
      if(typeof trackNumber!=='string'||!/^SBX[A-Za-z0-9-]{1,61}$/.test(trackNumber)) throw new Error('Use an SBX-prefixed test tracking number, maximum 64 characters.');
      await detail(id);
      return call('/shopping/sandbox/updateTrackNumber',{orderId:id,trackNumber},await authenticate());
    }
  };
}
