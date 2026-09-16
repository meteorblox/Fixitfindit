import {orders} from './orders.mjs';
import {createCatalog} from './catalog.mjs';
import {createCjFulfillment} from './cj-fulfillment.mjs';
import {createFulfillmentWorker} from './fulfillment-worker.mjs';

try {
  if(!orders) throw new Error('Configure ORDERS_DB_PATH on the persistent server volume.');
  const [action,id,value]=process.argv.slice(2);
  if(action==='list') console.log(JSON.stringify(orders.fulfillment.list(),null,2));
  else {
    if(!['submit','sync','simulate-payment','simulate-tracking'].includes(action) || !id) throw new Error('Usage: node fulfillment-cli.mjs list | submit ORDER_ID | sync ORDER_ID | simulate-payment ORDER_ID | simulate-tracking ORDER_ID SBX_NUMBER');
    const worker=createFulfillmentWorker({orders,cj:createCjFulfillment(),catalog:createCatalog()});
    const result=await ({submit:worker.submit,sync:worker.sync,'simulate-payment':worker.simulatePayment,'simulate-tracking':worker.simulateTracking}[action])(id,value);
    console.log(JSON.stringify(result,null,2));
  }
} catch(e) {console.error(e.message);process.exitCode=1;}
finally {orders?.close();}
