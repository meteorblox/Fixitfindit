import {selectedProducts} from './selected-products.mjs';
export const categories = [
  {slug:'kitchen',name:'Kitchen',query:'kitchen'},
  {slug:'cleaning',name:'Cleaning',query:'cleaning brush'},
  {slug:'organization',name:'Organization',query:'organizer'},
  {slug:'tools',name:'Tools',query:'hand tool'},
  {slug:'home-improvement',name:'Home Improvement',query:'home improvement'}
];
const base = 'https://developers.cjdropshipping.com/api2.0/v1';
export function createCatalog({apiKey = process.env.CJ_API_KEY, request = fetch, now = Date.now, interval = 1100} = {}) {
  let token, tokenExpires = 0, queue = Promise.resolve(), nextCall = 0;
  const cache = new Map(), pending = new Map();
  async function call(path, options = {}) {
    const task = queue.then(async () => {
      await new Promise(resolve => setTimeout(resolve, Math.max(0, nextCall - now())));
      nextCall = now() + interval;
      const response = await request(base + path, {...options, signal:AbortSignal.timeout(15000)});
      if (!response.ok) throw new Error('CJ is temporarily unavailable. Please try again later.');
      const data = await response.json();
      if (data.result !== true && !(path.startsWith('/product/stock/getInventoryByPid?') && data.success === true && data.result !== false)) throw new Error('CJ could not load the catalog. Check account access and API quota.');
      return data.data;
    });
    queue = task.catch(() => {});
    return task;
  }
  async function authenticate() {
    if (!apiKey) throw new Error('The CJ catalog connection is not configured on this server yet.');
    if (token && tokenExpires > now() + 60000) return token;
    const result = await call('/authentication/getAccessToken', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({apiKey})});
    if (!result?.accessToken) throw new Error('CJ authentication was not completed.');
    token = result.accessToken;
    tokenExpires = Date.parse(result.accessTokenExpiryDate) || now() + 3600000;
    return token;
  }
  // There are only five possible queries. Results and failures are cached to cap supplier calls.
  async function list(slug) {
    const category = categories.find(c => c.slug === slug);
    if (!category) throw new Error('Unknown category');
    const saved = cache.get(slug);
    if (saved && saved.expires > now()) {
      if (saved.error) throw new Error(saved.error);
      return saved.value;
    }
    if (pending.has(slug)) return pending.get(slug);
    const work = (async () => {
      try {
        const access = await authenticate();
        const params = new URLSearchParams({page:'1',size:'24',keyWord:category.query,countryCode:'US',orderBy:'1',sort:'desc'});
        const result = await call('/product/listV2?' + params, {headers:{'CJ-Access-Token':access}});
        if (!Array.isArray(result?.content)) throw new Error('CJ returned an unexpected catalog format.');
        const products = result.content.flatMap(group => group.productList || []).filter(p => p.id && p.nameEn).map(p => ({
          id:String(p.id),name:String(p.nameEn),image:safeImage(p.bigImage),
          supplierPrice:String(p.sellPrice ?? ''),listings:Number(p.listedNum) || 0,
          hasVideo:p.isVideo === 1,category:slug
        }));
        for(const selected of selectedProducts.filter(p=>p.category===slug)) {
          let loaded=false;
          try {
            const item=await call('/product/query?'+new URLSearchParams(selected.lookup),{headers:{'CJ-Access-Token':access}});
            if(!item?.pid) throw new Error('Selected product details unavailable');
            const existing=products.findIndex(p=>p.id===String(item.pid));
            if(existing>=0) products.splice(existing,1);
            products.unshift({...selected,id:String(item.pid),image:safeImage(item.bigImage || item.productImage),supplierPrice:String(item.sellPrice??''),listings:Number(item.listedNum)||0,hasVideo:false});
            loaded=true;
          } catch { /* A selected product lookup must not hide the rest of the catalog. */ }
          if(!loaded && selected.lookup.pid) {
            const existing=products.findIndex(p=>p.id===selected.lookup.pid);
            const fallback=existing>=0?products.splice(existing,1)[0]:{image:'',supplierPrice:'',listings:0,hasVideo:false};
            products.unshift({...fallback,...selected,id:selected.lookup.pid});
          }
        }
        const value = {products,updatedAt:new Date(now()).toISOString()};
        cache.set(slug,{value,expires:now()+6*3600000});
        return value;
      } catch (error) {
        const message = apiKey ? 'Catalog temporarily unavailable. Please try again later.' : 'The CJ catalog connection is not configured on this server yet.';
        cache.set(slug,{error:message,expires:now()+60000});
        throw new Error(message);
      } finally { pending.delete(slug); }
    })();
    pending.set(slug,work);
    return work;
  }
  async function cached(key, ttl, work) {
    const saved=cache.get(key);
    if(saved?.expires>now()) { if(saved.error) throw new Error(saved.error); return saved.value; }
    if(pending.has(key)) return pending.get(key);
    const task=(async()=>{
      try { const value=await work(); cache.set(key,{value,expires:now()+ttl}); return value; }
      catch { cache.set(key,{error:'Product or shipping details temporarily unavailable.',expires:now()+60000}); throw new Error('Product or shipping details temporarily unavailable.'); }
      finally { pending.delete(key); }
    })();
    pending.set(key,task); return task;
  }
  async function detail(slug,id) {
    const product=selectedProducts.find(p=>p.category===slug && p.lookup.pid===id) || (await list(slug)).products.find(p=>p.id===id);
    if(!product) throw new Error('Unknown product');
    return cached('detail:'+id,5*60000,async()=>{
      const access=await authenticate();
      const data=await call('/product/query?'+new URLSearchParams({pid:id,countryCode:product.origin||'US'}),{headers:{'CJ-Access-Token':access}});
      if(!Array.isArray(data?.variants)) throw new Error('Invalid product details');
      const inventory=await call('/product/stock/getInventoryByPid?'+new URLSearchParams({pid:id}),{headers:{'CJ-Access-Token':access}});
      if(!Array.isArray(inventory?.variantInventories)) throw new Error('Variant inventory is unavailable');
      return {origin:product.origin||'US',variants:data.variants.filter(v=>v.vid).map(v=>({id:String(v.vid),name:String(v.variantKey || v.variantNameEn || v.variantSku || 'Standard'),price:money(v.variantSellPrice),stock:usStock(inventory.variantInventories,v.vid,product.origin||'US')}))};
    });
  }
  async function shipping(slug,id,vid,zip,quantity=1) {
    if(!/^\d{5}$/.test(zip) || !Number.isInteger(quantity) || quantity<1 || quantity>10) throw new Error('Enter a five-digit US ZIP code and quantity from 1 to 10.');
    const details=await detail(slug,id);
    const variant=details.variants.find(v=>v.id===vid);
    if(!variant || variant.stock<quantity || variant.price===null) throw new Error('This option does not have confirmed stock for that quantity.');
    // Bound the quote cache so arbitrary ZIP codes cannot grow memory indefinitely.
    if(cache.size>500) for(const key of cache.keys()) if(key.startsWith('ship:')) cache.delete(key);
    return cached(`ship:${vid}:${zip}:${quantity}`,60000,async()=>{
      const access=await authenticate();
      const data=await call('/logistic/freightCalculate',{method:'POST',headers:{'CJ-Access-Token':access,'Content-Type':'application/json'},body:JSON.stringify({startCountryCode:details.origin,endCountryCode:'US',zip,products:[{vid,quantity}]})});
      if(!Array.isArray(data)) throw new Error('Invalid shipping response');
      return data.map(r=>({name:String(r.logisticName || 'Shipping'),days:String(r.logisticAging || 'Unavailable'),price:money(r.logisticPrice)})).filter(r=>r.price!==null).sort((a,b)=>a.price-b.price);
    });
  }
  return {list,detail,shipping};
}
export function money(value) { if(value===null || value===undefined || value==='') return null; const n=Number(value); return Number.isFinite(n)&&n>=0?Math.round(n*100):null; }
export function usStock(rows,vid,country='US') {
  const row=rows.find(r=>String(r.vid)===String(vid));
  if(!Array.isArray(row?.inventory)) return null;
  const us=row.inventory.filter(i=>i.countryCode===country);
  if(us.some(i=>i.totalInventory===null || i.totalInventory===undefined || !Number.isFinite(Number(i.totalInventory)))) return null;
  return us.reduce((sum,i)=>sum+Math.max(0,Math.floor(Number(i.totalInventory))),0);
}
export function safeImage(value) {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; }
}
