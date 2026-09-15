const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function shortTitle(name) {
  const clean = name.replace(/\s+/g,' ').trim();
  return clean.length > 85 ? clean.slice(0,82).replace(/\s+\S*$/,'') + '…' : clean;
}
export async function homeProducts(catalog, prefix = '') {
  const sections = [['cleaning','Cleaning & household'],['organization','Make room for better living'],['kitchen','Kitchen discoveries']];
  const used = new Set();
  const rows = [];
  for (const [slug,title] of sections) {
    let products = [];
    try {
      const result = await catalog.list(slug);
      products = result.products.filter(p=>p.image && !used.has(p.id)).slice(0,4);
    } catch { /* One unavailable category must not prevent the homepage from loading. */ }
    products.forEach(p=>used.add(p.id));
    const categoryUrl = `${prefix}/category/${slug}`;
    if (!products.length) continue;
    rows.push(`<section class="home-product-section shell"><div class="home-product-heading"><h2>${title}</h2><a href="${categoryUrl}">View all →</a></div><div class="home-product-grid">${products.map(p=>`<a class="home-product-card" href="${categoryUrl}/product/${encodeURIComponent(p.id)}"><div class="home-product-photo"><img loading="lazy" src="${escape(p.image)}" alt="${escape(p.name)}"></div><div class="home-product-info"><h3 title="${escape(p.name)}">${escape(shortTitle(p.name))}</h3><p class="home-product-price">${p.supplierPrice?`${escape(p.supplierPrice)} USD`:'Price unavailable'}</p><small>CJ supplier price · Shipping extra</small><span>View details ↗</span></div></a>`).join('')}</div></section>`);
  }
  return `<div id="products"><div class="shell home-product-intro"><p>Explore products from our supplier catalog. Retail pricing and checkout are still being prepared.</p></div>${rows.length?rows.join(''):'<p class="shell home-product-empty" role="status">Products are temporarily unavailable. Please try the category links or check back shortly.</p>'}</div>`;
}
