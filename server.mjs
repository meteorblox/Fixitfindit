import {createRefundTracking} from './refund-tracking.mjs';
import {orders as refundOrders} from './orders.mjs';
import {createProductionWebhookRoute} from './production-webhook.mjs';
import {createOrderStore} from './orders.mjs';
import {createProductionFulfillment} from './production-fulfillment.mjs';
import {createProductionCj} from './production-cj.mjs';
import {createPricedCatalog} from './storefront-pricing.mjs';
import {infoPages,infoPage,infoMenu} from './info-pages.mjs';
import {partnerStore} from './partner-applications.mjs';
import {applicationRoute} from './partner-application-route.mjs';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createCatalog, categories } from './catalog.mjs';
import { catalogPage } from './catalog-pages.mjs';
import { homeContent } from './home.mjs';
import { homeProducts } from './home-products.mjs';
import { partnerPage } from './partners.mjs';
import { checkoutRoute,createCheckout } from './checkout.mjs';
import { productOptions } from './product-options.mjs';
import { createProductCheckoutRoute } from './product-checkout.mjs';
import {createWebhookRoute} from './stripe-webhook.mjs';
const catalog = createPricedCatalog(createCatalog(),{path:process.env.ORDERS_DB_PATH||':memory:'});
const checkoutService=createCheckout();
const productCheckoutRoute = createProductCheckoutRoute({catalog,checkout:checkoutService});
const webhookRoute=createWebhookRoute({resolveSession:checkoutService.retrieve,refundTracking:refundOrders?createRefundTracking({orders:refundOrders,resolveSession:checkoutService.retrieve}):null});
const liveIntake=process.env.LIVE_ORDER_INTAKE==='enabled' && Boolean(process.env.ORDERS_DB_PATH);
const liveOrders=liveIntake?createOrderStore(process.env.ORDERS_DB_PATH,{mode:'live'}):null;
const liveWorker=liveIntake?createProductionFulfillment({path:process.env.ORDERS_DB_PATH,orders:liveOrders,catalog,cj:createProductionCj(),enabled:false}):null;
const productionWebhook=createProductionWebhookRoute({orders:liveOrders,worker:liveWorker,secret:process.env.STRIPE_LIVE_WEBHOOK_SECRET,enabled:liveIntake});

const root = fileURLToPath(new URL('.', import.meta.url));
const template = await readFile(new URL('index.html', import.meta.url), 'utf8');
const stores = JSON.parse(await readFile(new URL('stores.json', import.meta.url), 'utf8'));
const slugs = new Set();
const ids = new Set();
for (const store of stores) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(store.slug) || slugs.has(store.slug) ||
      typeof store.id !== 'string' || !store.id || ids.has(store.id) ||
      typeof store.name !== 'string' || !store.name || typeof store.tagline !== 'string' ||
      !/^#[0-9a-f]{6}$/i.test(store.accent) || store.demo !== true) {
    throw new Error('Invalid store configuration. Only demo storefronts are enabled until checkout attribution is implemented.');
  }
  slugs.add(store.slug); ids.add(store.id);
}
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const assets = new Map([
  ...categories.map(c => ['/category-' + c.slug + '.svg', 'image/svg+xml']),
  ['/product-gallery.js','text/javascript'], ['/site.css', 'text/css'], ['/brand.css', 'text/css'],
  ['/hero-products.png', 'image/png'], ['/fix-it-find-it-logo.png', 'image/png']
]);

export function renderStore(store) {
  // Every storefront uses the same catalog and template; only approved branding varies.
  let html = template.replaceAll('href="site.css"', 'href="/site.css"')
    .replaceAll('href="brand.css"', 'href="/brand.css"')
    .replaceAll('src="fix-it-find-it-logo.png"', 'src="/fix-it-find-it-logo.png"');
  const prefix = store ? `/shop/${store.slug}` : '';
  html = html.replace(/<main id="top">[\s\S]*?<\/main>/,homeContent(prefix))
    .replaceAll('href="#best"', 'href="#browse"').replace('Best finds','Browse categories').replace('See the fixes','Explore the catalog')
    .replace('Independent picks · Easy  checkout · Everyday Deals','Small fixes. Better home.')
    .replace('href="#kitchen"','href="'+prefix+'/category/kitchen"')
    .replace('href="#organize"','href="'+prefix+'/category/organization"');
  html = html.replace('<!-- store-information-menu -->',infoMenu);
  if (!store) return html;
  const name = escape(store.name);
  html = html.replace(/<title>.*?<\/title>/, `<title>${name} — Powered by FixItFindIt</title>`)
    .replace('</head>', `<meta name="robots" content="noindex,nofollow"><style>:root{--orange:${store.accent}}</style></head>`)
    .replace(/<div class="notice">.*?<\/div>/, '<div class="notice">Partner storefront preview · Purchases and commissions are not enabled</div>')
    .replace(/<a class="brand brand-image[^>]*>.*?<\/a>/g, `<a class="brand partner-brand" href="/shop/${store.slug}" aria-label="${name} home"><span class="partner-mark" aria-hidden="true">${escape(store.name[0])}</span><span>${name}</span></a>`)
    .replace('<h1>Small fixes.<br><em>Better home.</em></h1>', `<p class="eyebrow">${name}</p><h1>Small fixes.<br><em>Better home.</em></h1><p>${escape(store.tagline)}</p>`)
    .replace('<b>Amazing Solutions</b> FixItFindIt.com', `<b>${name}</b> · A FixItFindIt storefront preview`);
  html = html.replace('<footer>', '<footer><p class="partner-powered shell">Powered by <a href="/">FixItFindIt</a></p>');
  // Demo cards keep their information, but must not imply tracked or payable purchases.
  html = html.replace(/<a href="https:\/\/www\.(?:amazon|walmart)\.com[^>]*>([\s\S]*?)<\/a>/g,
    '<span class="demo-product-link">$1</span>');
  return html;
}

async function renderHome(store) {
  const products = await homeProducts(catalog, store ? `/shop/${store.slug}` : '');
  return renderStore(store).replace('</main>',`${products}</main>`);
}
export const server = http.createServer(async (req, res) => {
  const send = (status, type, body) => {
    res.writeHead(status, {'Content-Type': `${type}${type.startsWith('text/') ? '; charset=utf-8' : ''}`,
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin'});
    res.end(req.method === 'HEAD' ? undefined : body);
  };
  if (await applicationRoute(req,res,new URL(req.url,'http://localhost'))) return;
  if (await checkoutRoute(req,res,new URL(req.url,'http://localhost'))) return;
  if (await productionWebhook(req,res,new URL(req.url,'http://localhost'))) return;
  if (await webhookRoute(req,res,new URL(req.url,'http://localhost'))) return;
  if (await productCheckoutRoute(req,res,new URL(req.url,'http://localhost'))) return;
  if (!['GET', 'HEAD'].includes(req.method)) return send(405, 'text/plain', 'Method not allowed');
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path === '/partners' || path === '/partners/') return send(200,'text/html',partnerPage(renderStore()));
    if (infoPages[path]) return send(200,'text/html',infoPage(renderStore(),infoPages[path]));
    if (path === '/health') return send(200, 'application/json', JSON.stringify({status:'ok'}));
    if (assets.has(path)) return send(200, assets.get(path), await readFile(resolve(root, path.slice(1))));
    if (path === '/' || path === '/index.html') return send(200, 'text/html', await renderHome());
    const route = path.match(/^(?:\/shop\/([a-z0-9-]+))?\/category\/([a-z0-9-]+)(?:\/product\/([a-zA-Z0-9-]+))?\/?$/);
    if (route) {
      const store = route[1] ? (stores.find(s=>s.slug===route[1]) || partnerStore?.find(route[1])) : undefined;
      const category = categories.find(c=>c.slug===route[2]);
      if ((route[1] && !store) || !category) return send(404,'text/plain','Store or category not found');
      let data, error;
      try { data = await catalog.list(category.slug); } catch(e) { error = e.message; }
      const product = route[3] ? data?.products.find(p=>p.id===route[3]) : undefined;
      if (route[3] && !product && !error) return send(404,'text/plain','Product not found');
      if(product){try{product.images=await catalog.images(category.slug,product.id);}catch{/* Keep the main photo when supplier media is unavailable. */}}
      let page=catalogPage(renderStore(store),{store,category,data,error,product});
      if(product) {
        const params=new URL(req.url,'http://localhost').searchParams;
        const options={product,vid:params.get('variant')||'',zip:params.get('zip')||'',quantity:Number(params.get('quantity')||1)};
        try { options.details=await catalog.detail(category.slug,product.id); } catch { options.detailError='Product options are temporarily unavailable. Please try again later.'; }
        if(options.details && params.has('zip')) {
          try { options.shipping=await catalog.shipping(category.slug,product.id,options.vid,options.zip,options.quantity); }
          catch(e) { options.shippingError=e.message; }
        }
        page=page.replace('<strong>Not available to purchase yet</strong>',productOptions(options)+'<strong>Not available to purchase yet</strong>');
        if(!store && !product.checkoutHold && options.details) {
          const available=product.pricedVariants||product.storefrontVariants||(product.pricingPending?[]:options.details.variants.filter(v=>Number.isSafeInteger(v.stock)&&v.stock>0&&Number.isSafeInteger(v.price)));
          const chosen=available.find(v=>v.id===options.vid)||available[0];
          if(chosen)
          page=page.replace('<strong>Not available to purchase yet</strong>',`<p><a href="/checkout/products?variant=${encodeURIComponent(chosen.id)}&amp;product=${encodeURIComponent(product.id)}&amp;category=${encodeURIComponent(category.slug)}&amp;zip=${encodeURIComponent(options.zip)}">Try this product in sandbox checkout →</a></p><strong>Live purchases are not enabled yet</strong>`);
        }
      }
      return send(error?503:200,'text/html',page);
    }
    const match = path.match(/^\/shop\/([a-z0-9-]+)\/?$/);
    if (match) {
      const store = (stores.find(s => s.slug === match[1]) || partnerStore?.find(match[1]));
      if (store) return send(200, 'text/html', await renderHome(store));
    }
    return send(404, 'text/plain', 'Store or page not found');
  } catch {
    return send(500, 'text/plain', 'Unable to load page');
  }
});
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if(process.env.CJ_API_KEY) {
    void (async()=>{for(const c of categories) {try {await catalog.list(c.slug);} catch {}}})().catch(()=>{});
  }
  server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => console.log('FixItFindIt storefront server ready'));
}
