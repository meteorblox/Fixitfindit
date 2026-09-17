import {createOrderStore} from './orders.mjs';
import {createCatalog} from './catalog.mjs';
import {createProductionCj} from './production-cj.mjs';
import {createProductionFulfillment} from './production-fulfillment.mjs';
let orders,worker;
try {
 if(!process.env.ORDERS_DB_PATH)throw new Error('Persistent order storage required');
 const paymentMode=process.env.CJ_PAYMENT_MODE||"manual";
 const enabled=process.env.CJ_PRODUCTION_FULFILLMENT==='enabled';
 orders=createOrderStore(process.env.ORDERS_DB_PATH,{mode:'live'});
 worker=createProductionFulfillment({path:process.env.ORDERS_DB_PATH,orders,catalog:createCatalog(),cj:createProductionCj({enabled,paymentMode}),enabled});
 const [action,id,limit]=process.argv.slice(2);
 if(action!=='list'&&(!id||!['status','submit','sync','pay','address','verify-address'].includes(action)))throw new Error('Usage: production-fulfillment-cli.mjs list or status|submit|sync|address ORDER_ID or verify-address ORDER_ID CJ_ORDER_ID or pay ORDER_ID MAX_CENTS');
 if(action==='pay'&&paymentMode!=='wallet')throw new Error('Manual CJ payment required');
 if(action==='pay'&&!/^\d+$/.test(limit||''))throw new Error('Payment requires an explicit maximum in cents');
 console.log(JSON.stringify(await ({list:worker.list,status:worker.summary,submit:worker.submit,sync:worker.sync,pay:worker.pay,address:worker.address,'verify-address':worker.verifyAddress}[action])(id,action==='verify-address'?limit:Number(limit))));
}catch{console.error('Production action failed or is disabled. Inspect private order state; reconcile uncertain outcomes before retrying.');process.exitCode=1;}finally{worker?.close();orders?.close();}
