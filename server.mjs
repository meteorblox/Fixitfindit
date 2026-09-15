import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createCatalog, categories } from './catalog.mjs';
import { catalogPage } from './catalog-pages.mjs';
import { homeContent } from './home.mjs';
const catalog = createCatalog();

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
  ['/site.css', 'text/css'], ['/brand.css', 'text/css'],
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
    .replace('Independent picks · Easy  checkout · Everyday Deals','Small fixes. Better home. · Catalog preview')
    .replace('href="#kitchen"','href="'+prefix+'/category/kitchen"')
    .replace('href="#organize"','href="'+prefix+'/category/organization"');
  if (!store) return html;
  const name = escape(store.name);
  html = html.replace(/<title>.*?<\/title>/, `<title>${name} — Powered by FixItFindIt</title>`)
    .replace('</head>', `<meta name="robots" content="noindex,nofollow"><style>:root{--orange:${store.accent}}</style></head>`)
    .replace(/<div class="notice">.*?<\/div>/, '<div class="notice">Partner storefront preview · Purchases and commissions are not enabled</div>')
    .replace(/<a class="brand brand-image[^>]*>.*?<\/a>/g, `<a class="brand partner-brand" href="/shop/${store.slug}" aria-label="${name} home"><span class="partner-mark" aria-hidden="true">${escape(store.name[0])}</span><span>${name}<small>Powered by FixItFindIt</small></span></a>`)
    .replace('<h1>Small fixes.<br><em>Better home.</em></h1>', `<p class="eyebrow">${name}</p><h1>Small fixes.<br><em>Better home.</em></h1><p>${escape(store.tagline)}</p>`)
    .replace('<b>Amazing Solutions</b> FixItFindIt.com', `<b>${name}</b> · A FixItFindIt storefront preview`);
  // Demo cards keep their information, but must not imply tracked or payable purchases.
  html = html.replace(/<a href="https:\/\/www\.(?:amazon|walmart)\.com[^>]*>([\s\S]*?)<\/a>/g,
    '<span class="demo-product-link">$1</span>');
  return html;
}

export const server = http.createServer(async (req, res) => {
  const send = (status, type, body) => {
    res.writeHead(status, {'Content-Type': `${type}${type.startsWith('text/') ? '; charset=utf-8' : ''}`,
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin'});
    res.end(req.method === 'HEAD' ? undefined : body);
  };
  if (!['GET', 'HEAD'].includes(req.method)) return send(405, 'text/plain', 'Method not allowed');
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path === '/health') return send(200, 'application/json', JSON.stringify({status:'ok'}));
    if (assets.has(path)) return send(200, assets.get(path), await readFile(resolve(root, path.slice(1))));
    if (path === '/' || path === '/index.html') return send(200, 'text/html', renderStore());
    const route = path.match(/^(?:\/shop\/([a-z0-9-]+))?\/category\/([a-z0-9-]+)(?:\/product\/([a-zA-Z0-9-]+))?\/?$/);
    if (route) {
      const store = route[1] ? stores.find(s=>s.slug===route[1]) : undefined;
      const category = categories.find(c=>c.slug===route[2]);
      if ((route[1] && !store) || !category) return send(404,'text/plain','Store or category not found');
      let data, error;
      try { data = await catalog.list(category.slug); } catch(e) { error = e.message; }
      const product = route[3] ? data?.products.find(p=>p.id===route[3]) : undefined;
      if (route[3] && !product && !error) return send(404,'text/plain','Product not found');
      return send(error?503:200,'text/html',catalogPage(renderStore(store),{store,category,data,error,product}));
    }
    const match = path.match(/^\/shop\/([a-z0-9-]+)\/?$/);
    if (match) {
      const store = stores.find(s => s.slug === match[1]);
      if (store) return send(200, 'text/html', renderStore(store));
    }
    return send(404, 'text/plain', 'Store or page not found');
  } catch {
    return send(500, 'text/plain', 'Unable to load page');
  }
});
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => console.log('FixItFindIt storefront server ready'));
}
