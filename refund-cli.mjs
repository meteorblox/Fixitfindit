import {orders} from './orders.mjs';
import {createCheckout} from './checkout.mjs';
import {createRefundTracking} from './refund-tracking.mjs';
try{const [action,id]=process.argv.slice(2);if(!orders||!id||!['status','sync'].includes(action))throw Error('Usage: node refund-cli.mjs status|sync ORDER_ID (persistent database required)');const tracker=createRefundTracking({orders,resolveSession:createCheckout({orders}).retrieve});console.log(JSON.stringify(action==='sync'?await tracker.sync(id):orders.refunds.summary(id),null,2));}catch(e){console.error(e.message);process.exitCode=1;}finally{orders?.close();}
