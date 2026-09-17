import {createOrderStore} from './orders.mjs';
import {createCatalog} from './catalog.mjs';
import {createProductionCj} from './production-cj.mjs';
import {createProductionFulfillment} from './production-fulfillment.mjs';
let orders,worker;
try {
 if(!process.env.ORDERS_DB_PATH)throw new Error('Persistent order storage required');
 const enabled=process.env.CJ_PRODUCTION_FULFILLMENT==='enabled';
 orders=createOrderStore(process.env.ORDERS_DB_PATH,{mode:'live'});
 worker=createProductionFulfillment({path:process.env.ORDERS_DB_PATH,orders,catalog:createCatalog(),cj:createProductionCj({enabled}),enabled});
 const [action,id,limit]=process.argv.slice(2);
 if(!id||!['status','submit','sync','pay'].includes(action))throw new Error('Usage: production-fulfillment-cli.mjs status|submit|sync ORDER_ID or pay ORDER_ID MAX_CENTS');
 if(action==='pay'&&!/^\d+$/.test(limit||''))throw new Error('Payment requires an explicit maximum in cents');
 console.log(JSON.stringify(await ({status:worker.summary,submit:worker.submit,sync:worker.sync,pay:worker.pay}[action])(id,Number(limit))));
}catch{console.error('Production action failed or is disabled. Inspect private order state; reconcile uncertain outcomes before retrying.');process.exitCode=1;}finally{worker?.close();orders?.close();}
