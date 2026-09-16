import {retailPrice} from './selected-products.mjs';
import {categories} from './catalog.mjs';
const esc = v => String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function catalogPage(shell, {store, category, data, error, product}) {
  const prefix = store ? `/shop/${store.slug}` : '';
  const links = categories.map(c=>`<a ${c.slug===category?.slug?'aria-current="page"':''} href="${prefix}/category/${c.slug}">${esc(c.name)}</a>`).join('');
  const price = p => retailPrice(p) || ('CJ supplier price: '+esc(p.supplierPrice || 'Unavailable')+' USD');
  const card = p=>`<article class="product"><a class="catalog-photo" href="${prefix}/category/${category.slug}/product/${encodeURIComponent(p.id)}">${p.image?`<img loading="lazy" src="${esc(p.image)}" alt="${esc(p.name)}">`:'<span>Photo unavailable</span>'}</a><div class="product-body"><p class="category">${esc(category.name)}</p><h3>${esc(p.name)}</h3><p>${price(p)}</p><p class="catalog-note">${retailPrice(p)?"Coming soon · Standard shipping included where available":"Shipping and retail price pending."}</p><a href="${prefix}/category/${category.slug}/product/${encodeURIComponent(p.id)}">View product →</a></div></article>`;
  let content = `<p class="eyebrow">Catalog preview</p><h1>${esc(category?.name || 'Find your next home fix')}</h1><p>Browse supplier candidates for our store. Products are awaiting selection and pricing; purchases are not available yet.</p><nav class="category-tabs" aria-label="Categories">${links}</nav>`;
  if (product) {
    content += `<a href="${prefix}/category/${category.slug}">← Back to ${esc(category.name)}</a><div class="catalog-detail">${product.image?`<img src="${esc(product.image)}" alt="${esc(product.name)}">`:''}<div><h2>${esc(product.name)}</h2><p>${price(product)}</p><p>${product.optionNote?esc(product.optionNote):"Variant availability, delivered cost and delivery estimate still need verification."}</p><p>${product.listings} CJ listings · This measures seller listings, not units sold.</p><p>${product.hasVideo?'CJ indicates a video is available. Playback will be added after checking access and usage rights.':'No video indicated in the catalog response.'}</p><strong>Not available to purchase yet</strong></div></div>`;
  } else if (error) content += `<div class="catalog-message" role="status">${esc(error)}</div>`;
  else if (data) content += `<p class="catalog-note">Selected products first, followed by US warehouse search results. Listing popularity is not verified sales. Updated ${esc(data.updatedAt)}</p><div class="grid">${data.products.length?data.products.map(card).join(''):'<p>No matching US warehouse products were returned. Try another category.</p>'}</div>`;
  else content += '<p>Select a category to browse CJ products.</p>';
  return shell.replace(/<main id="top"[^>]*>[\s\S]*?<\/main>/,`<main id="top" class="shell catalog">${content}</main>`)
    .replace('</head>','<meta name="robots" content="noindex,nofollow"></head>')
    .replace(/href="#(?:best|browse|kitchen|organize|top)"/g,`href="${prefix || '/'}"`);
}

