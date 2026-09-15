import {partnerStore} from './partner-applications.mjs';
try {
 if(!partnerStore)throw new Error('Set ORDERS_DB_PATH to the persistent server database.');
 const [action,id,slug]=process.argv.slice(2);
 if(action==='list')console.log(JSON.stringify(partnerStore.list(),null,2));
 else if(action==='approve'){partnerStore.approve(id,slug);console.log('Approved preview storefront: https://www.fixitfindit.com/shop/'+slug);}
 else throw new Error('Usage: node partner-admin.mjs list | approve APPLICATION_ID STOREFRONT_SLUG');
}catch(e){console.error(e.message);process.exitCode=1;}finally{partnerStore?.close();}
