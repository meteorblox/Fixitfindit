import {DatabaseSync} from 'node:sqlite';
import {automaticRetail,eligibleMethod} from './automatic-pricing.mjs';
import {isReplacementPart} from './catalog-policy.mjs';
const version='upfront-150-floor8-buffer25-v1';
export function createPricedCatalog(raw,{path=':memory:',now=Date.now}={}) {
 const db=new DatabaseSync(path);
 db.exec('PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS storefront_prices(product_id TEXT PRIMARY KEY, policy TEXT NOT NULL, expires INTEGER NOT NULL, snapshot TEXT NOT NULL)');
 const pending=new Set(),tasks=[];let queue=Promise.resolve(),running=false,lastCategory;
 async function drain(){running=true;try{while(tasks.length){let index=tasks.findIndex(t=>t.category!==lastCategory);if(index<0)index=0;const {product,category}=tasks.splice(index,1)[0];lastCategory=category;try{await refresh(product,category);}catch{}finally{pending.delete(product.id);}}}finally{running=false;}}
 function saved(id){const row=db.prepare('SELECT snapshot FROM storefront_prices WHERE product_id=? AND policy=? AND expires>?').get(id,version,now());const value=row?JSON.parse(row.snapshot):null;if(value?.unavailable&&(!value.reason||value.reason==='shipping_unconfirmed')&&!value.domesticPolicy)return null;return value?.name&&isReplacementPart(value.name)?null:value;}
 function save(id,value,ttl){db.prepare('INSERT OR REPLACE INTO storefront_prices VALUES(?,?,?,?)').run(id,version,now()+ttl,JSON.stringify(value));}
 async function refresh(product,category){
  try {
   const details=await raw.detail(category,product.id);
   const candidates=details.variants.filter(v=>!isReplacementPart(v.name)&&Number.isSafeInteger(v.stock)&&v.stock>0&&Number.isSafeInteger(v.price)&&v.price>=0).sort((a,b)=>a.price-b.price||a.id.localeCompare(b.id));
   // One explicitly named complete-product option per card for launch.
   // If shipping cannot be established, do not invent a price.
   const chosen=candidates[0];
   if(!chosen){save(product.id,{unavailable:true,reason:'stock_unconfirmed'},3600000);console.info('catalog-price',category,product.id,'stock_unconfirmed');return;}
   for(const chosen of candidates.slice(0,3)) {
   try {
   const samples=[];
   for(const zip of ['10001','60601','90210']) {
    const methods=(await raw.shipping(category,product.id,chosen.id,zip,1)).filter(eligibleMethod).sort((a,b)=>a.totalCents-b.totalCents);
    if(!methods.length) throw new Error('Shipping allowance unavailable');
    samples.push({zip,cents:methods[0].totalCents});
   }
   const allowance=Math.ceil(Math.max(...samples.map(s=>s.cents))*1.25);
   save(product.id,{variantId:chosen.id,name:chosen.name,retailCents:automaticRetail(chosen.price,allowance),supplierCents:chosen.price,allowance,samples},24*3600000);
   console.info('catalog-price',category,product.id,'priced');return;
   } catch { /* Try another complete in-stock option before holding the product. */ }
   }
   save(product.id,{unavailable:true,reason:'shipping_unconfirmed',domesticPolicy:1},15*60000);console.info('catalog-price',category,product.id,'shipping_unconfirmed');
  } catch {save(product.id,{unavailable:true,reason:'supplier_error'},5*60000);console.info('catalog-price',category,product.id,'supplier_error');}
 }
 function schedule(product,category){
  if(product.pricedVariants||product.checkoutHold||pending.has(product.id)||saved(product.id))return;
  pending.add(product.id);
  tasks.push({product,category});if(!running)queue=drain();
 }
 function decorate(product){
  if(product.pricedVariants)return product;
  const price=saved(product.id);
  return price?.variantId?{...product,retailCents:price.retailCents,storefrontVariants:[{id:price.variantId,name:price.name,retailCents:price.retailCents}],optionNote:`Price shown for ${price.name}. Standard shipping included where available. Delivery eligibility is checked for your ZIP.`}:{...product,pricingPending:true,pricingStatus:price?.reason||'pending'};
 }
 return {
  ...raw,
  async list(category){const data=await raw.list(category);for(const p of data.products)schedule(p,category);return {...data,products:data.products.map(decorate)};},
  storefrontPrice(productId,variantId){const price=saved(productId);return price?.variantId===variantId?price:null;},
  async settled(){await queue;},close(){db.close();}
 };
}
