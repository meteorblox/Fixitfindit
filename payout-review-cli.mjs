import {createOrderStore} from './orders.mjs';
import {payoutReview} from './payout-review.mjs';
let orders;try{const [partner,period,mode='sandbox']=process.argv.slice(2);if(!process.env.ORDERS_DB_PATH||!partner)throw Error('Usage: node payout-review-cli.mjs PARTNER_ID YYYY-MM [sandbox|live]');orders=createOrderStore(process.env.ORDERS_DB_PATH,{mode});console.log(JSON.stringify(payoutReview(orders.affiliates.list(partner),{mode,period}),null,2));}catch(e){console.error(e.message);process.exitCode=1;}finally{orders?.close();}
