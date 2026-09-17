import {createPartnerEmailLogin} from './partner-email.mjs';
import {createPartnerEmailRoute} from './partner-email-route.mjs';
import {createOwnerEmailLogin} from './owner-email.mjs';
import {createTrackingSync} from './tracking-sync.mjs';
import {salesOpen,launchCopy,purchaseLink} from './launch-presentation.mjs';
import {createCustomerTracking,createTrackingRoute} from './customer-tracking.mjs';
import {createOwnerAccess,createOwnerOrdersRoute} from './owner-orders.mjs';
import {createManualPayouts} from './manual-payouts.mjs';
import {createDashboardAccess,createDashboardRoute} from './partner-dashboard.mjs';
import {referralToken} from './affiliate-store.mjs';
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
const productCheckoutRoute = createProductCheckoutRoute({catalog,checkout:checkoutService,resolvePartner:req=>refundOrders?.affiliates.resolve(referralToken(req),findPartner)});
const webhookRoute=createWebhookRoute({resolveSession:checkoutService.retrieve,refundTracking:refundOrders?createRefundTracking({orders:refundOrders,resolveSession:checkoutService.retrieve}):null});
const liveIntake=process.env.LIVE_ORDER_INTAKE==='enabled' && Boolean(process.env.ORDERS_DB_PATH);
const liveOrders=liveIntake?createOrderStore(process.env.ORDERS_DB_PATH,{mode:'live'}):null;
const liveWorker=liveIntake?createProductionFulfillment({path:process.env.ORDERS_DB_PATH,orders:liveOrders,catalog,cj:createProductionCj(),enabled:false}):null;
const ownerAccess=liveIntake?createOwnerAccess(process.env.ORDERS_DB_PATH):null;
const trackingCj=createProductionCj({enabled:true,paymentMode:'manual'});
const trackingWorker=liveIntake?createProductionFulfillment({path:process.env.ORDERS_DB_PATH,orders:liveOrders,catalog,cj:{enabled:trackingCj.enabled,detail:trackingCj.detail},enabled:true}):null;
const trackingSync=trackingWorker?createTrackingSync({worker:trackingWorker}):null;
trackingSync?.start();
const ownerEmail=liveIntake?createOwnerEmailLogin({path:process.env.ORDERS_DB_PATH}):null;

const liveReady=process.env.CJ_PRODUCTION_FULFILLMENT==='enabled' && liveIntake && process.env.LIVE_CHECKOUT==='enabled' && Boolean(process.env.STRIPE_LIVE_WEBHOOK_SECRET?.startsWith('whsec_'));
const liveCheckout=createCheckout({key:process.env.STRIPE_LIVE_SECRET_KEY,orders:liveOrders,mode:'live',allowLive:liveReady});
const liveRefundTracking=liveOrders?createRefundTracking({orders:liveOrders,key:process.env.STRIPE_LIVE_SECRET_KEY,mode:'live',resolveSession:liveCheckout.retrieve}):null;
const customerTracking=liveOrders?createCustomerTracking({path:process.env.ORDERS_DB_PATH,orders:liveOrders,worker:liveWorker}):null;
const trackingRoute=createTrackingRoute(customerTracking);
const liveCheckoutRoute=createProductCheckoutRoute({catalog,checkout:liveCheckout,mode:'live',customerTracking,resolvePartner:req=>liveOrders?.affiliates.resolve(referralToken(req),slug=>{const p=findPartner(slug);return p&&!p.demo?p:null;})});
const productionWebhook=createProductionWebhookRoute({orders:liveOrders,worker:liveWorker,secret:process.env.STRIPE_LIVE_WEBHOOK_SECRET,enabled:liveIntake,resolveSession:liveCheckout.retrieve,refundTracking:liveRefundTracking});

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
const findPartner=slug=>partnerStore?.find(slug)||stores.find(s=>s.slug===slug);
const dashboardAccess=process.env.ORDERS_DB_PATH?createDashboardAccess(process.env.ORDERS_DB_PATH):null;
const manualPayouts=process.env.ORDERS_DB_PATH?createManualPayouts(process.env.ORDERS_DB_PATH,{affiliates:liveOrders?.affiliates}):null;
const ownerRoute=createOwnerOrdersRoute({access:ownerAccess,orders:liveOrders,worker:liveWorker,tracking:trackingSync,emailLogin:ownerEmail,partners:partnerStore,payouts:manualPayouts});
const partnerEmail=process.env.ORDERS_DB_PATH?createPartnerEmailLogin({path:process.env.ORDERS_DB_PATH,partners:partnerStore}):null;
const partnerEmailRoute=createPartnerEmailRoute({emailLogin:partnerEmail,access:dashboardAccess,findPartner});
const dashboardRoute=createDashboardRoute({access:dashboardAccess,findPartner,affiliates:refundOrders?.affiliates,liveAffiliates:liveOrders?.affiliates,payouts:manualPayouts,branding:partnerStore});
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const assets = new Map([
  ['/favicon.svg','image/svg+xml'],
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
  if (!store) return launchCopy(html,liveCheckout.enabled());
  const name = escape(store.name);
  const logo=typeof store.logoUrl==='string'&&/^\/partner-logos\/[a-z0-9-]+\?v=[a-f0-9]{16}$/.test(store.logoUrl)?'<img src="'+escape(store.logoUrl)+'" alt="" style="width:auto;height:56px;max-width:180px;object-fit:contain">':'<span class="partner-mark" aria-hidden="true">'+escape(store.name[0])+'</span>';
  html = html.replace(/<title>.*?<\/title>/, `<title>${name}</title>`)
    .replace('</head>', `<meta name="robots" content="noindex,nofollow"><style>:root{--orange:${store.accent}}</style></head>`)
    .replace(/<div class="notice">.*?<\/div>/, store.demo?'<div class="notice">Demo only · Purchases and commissions are not enabled</div>':'')
    .replace(/<a class="brand brand-image[^>]*>.*?<\/a>/g, `<a class="brand partner-brand" href="/shop/${store.slug}" aria-label="${name} home">${logo}${store.showName===false&&store.logoUrl?'':'<span>'+name+'</span>'}</a>`)
    .replace('<h1>Small fixes.<br><em>Better home.</em></h1>', `<p class="eyebrow">${name}</p><h1>Small fixes.<br><em>Better home.</em></h1><p>${escape(store.tagline)}</p>`)
    .replace('<b>Amazing Solutions</b> FixItFindIt.com', `<b>${name}</b>`);
  html = html.replace(/<div class="copyright shell">[\s\S]*?<\/div>/, '<div class="copyright partner-powered shell">© 2026 · Powered by <a href="https://www.fixitfindit.com/">fixitfindit.com</a></div>');
  // Demo cards keep their information, but must not imply tracked or payable purchases.
  html = html.replace(/<a href="https:\/\/www\.(?:amazon|walmart)\.com[^>]*>([\s\S]*?)<\/a>/g,
    '<span class="demo-product-link">$1</span>');
  return launchCopy(html,salesOpen(liveCheckout.enabled(),store));
}

async function renderHome(store) {
  const products = await homeProducts(catalog, store ? `/shop/${store.slug}` : '');
  return launchCopy(renderStore(store).replace('</main>',`${products}</main>`),salesOpen(liveCheckout.enabled(),store));
}
export const server = http.createServer(async (req, res) => {
  const send = (status, type, body) => {
    res.writeHead(status, {'Content-Type': `${type}${type.startsWith('text/') ? '; charset=utf-8' : ''}`,
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin'});
    res.end(req.method === 'HEAD' ? undefined : body);
  };
  const referralPath=new URL(req.url,'http://localhost').pathname.match(/^\/shop\/([a-z0-9-]+)(?:\/|$)/);
  if(req.method==='GET'&&referralPath&&refundOrders){const partner=findPartner(referralPath[1]);if(partner){try{const token=refundOrders.affiliates.visit(partner);res.setHeader('Set-Cookie','fit_referral='+token+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000');}catch{/* Store browsing remains available if referral storage fails. */}}}
  if (await trackingRoute(req,res,new URL(req.url,'http://localhost'))) return;
  if (await ownerRoute(req,res,new URL(req.url,'http://localhost'))) return;
  if (await partnerEmailRoute(req,res,new URL(req.url,'http://localhost'))) return;
  if (await dashboardRoute(req,res,new URL(req.url,'http://localhost'))) return;
  if (await applicationRoute(req,res,new URL(req.url,'http://localhost'))) return;
  if (await checkoutRoute(req,res,new URL(req.url,'http://localhost'))) return;
  if (await productionWebhook(req,res,new URL(req.url,'http://localhost'))) return;
  if (await webhookRoute(req,res,new URL(req.url,'http://localhost'))) return;
  if (await liveCheckoutRoute(req,res,new URL(req.url,'http://localhost'))) return;
  if (await productCheckoutRoute(req,res,new URL(req.url,'http://localhost'))) return;
  if (!['GET', 'HEAD'].includes(req.method)) return send(405, 'text/plain', 'Method not allowed');
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path === '/partners' || path === '/partners/') return send(200,'text/html',partnerPage(renderStore(),liveCheckout.enabled()));
    if (infoPages[path]) return send(200,'text/html',infoPage(renderStore(),infoPages[path]));
    const logoPath=path.match(/^\/partner-logos\/([a-z0-9-]+)$/);
    if(logoPath){const logo=partnerStore?.logo(logoPath[1]);if(!logo)return send(404,'text/plain','Logo not found');res.setHeader('Cache-Control','public, max-age=0, must-revalidate');res.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");return send(200,logo.mime,Buffer.from(logo.bytes));}
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
      let page=launchCopy(catalogPage(renderStore(store),{store,category,data,error,product}),salesOpen(liveCheckout.enabled(),store));
      if(product) {
        const params=new URL(req.url,'http://localhost').searchParams;
        const options={product,vid:params.get('variant')||'',zip:params.get('zip')||'',quantity:Number(params.get('quantity')||1)};
        try { options.details=await catalog.detail(category.slug,product.id); } catch { options.detailError='Product options are temporarily unavailable. Please try again later.'; }
        if(options.details && params.has('zip')) {
          try { options.shipping=await catalog.shipping(category.slug,product.id,options.vid,options.zip,options.quantity); }
          catch(e) { options.shippingError=e.message; }
        }
        page=page.replace('<strong>Not available to purchase yet</strong>',productOptions(options)+'<strong>Not available to purchase yet</strong>');
        if(!product.checkoutHold && options.details) {
          const available=product.pricedVariants||product.storefrontVariants||(product.pricingPending?[]:options.details.variants.filter(v=>Number.isSafeInteger(v.stock)&&v.stock>0&&Number.isSafeInteger(v.price)));
          const chosen=available.find(v=>v.id===options.vid)||available[0];
          if(chosen)
          page=page.replace('<strong>Not available to purchase yet</strong>',purchaseLink({open:salesOpen(liveCheckout.enabled(),store),variant:chosen.id,product:product.id,category:category.slug,zip:options.zip}));
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
