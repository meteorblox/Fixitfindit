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
      if (data.result !== true) throw new Error('CJ could not load the catalog. Check account access and API quota.');
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
  return {list};
}
export function safeImage(value) {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; }
}
