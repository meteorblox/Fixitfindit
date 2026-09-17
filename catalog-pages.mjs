import {retailPrice} from './selected-products.mjs';
import {categories} from './catalog.mjs';
const esc = v => String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function catalogPage(shell, {store, category, data, error, product}) {
  const prefix = store ? `/shop/${store.slug}` : '';
  const links = categories.map(c=>`<a ${c.slug===category?.slug?'aria-current="page"':''} href="${prefix}/category/${c.slug}">${esc(c.name)}</a>`).join('');
  const price = p => retailPrice(p) || 'Check delivered price';
  const card = p=>`<article class="product"><a class="catalog-photo" href="${prefix}/category/${category.slug}/product/${encodeURIComponent(p.id)}">${p.image?`<img loading="lazy" src="${esc(p.image)}" alt="${esc(p.name)}">`:'<span>Photo unavailable</span>'}</a><div class="product-body"><p class="category">${esc(category.name)}</p><h3>${esc(p.name)}</h3><p>${price(p)}</p><p class="catalog-note">${retailPrice(p)?"Coming soon · Standard shipping included where available":"Select an option and enter your ZIP for a delivered price."}</p><a href="${prefix}/category/${category.slug}/product/${encodeURIComponent(p.id)}">View product →</a></div></article>`;
  let content = `<p class="eyebrow">Catalog preview</p><h1>${esc(category?.name || 'Find your next home fix')}</h1><p>Explore our home and kitchen collection. Live purchases are coming soon.</p><nav class="category-tabs" aria-label="Categories">${links}</nav>`;
  if (product) {
    content += `<a href="${prefix}/category/${category.slug}">← Back to ${esc(category.name)}</a><div class="catalog-detail">${product.image?`<img src="${esc(product.image)}" alt="${esc(product.name)}">`:''}<div><h2>${esc(product.name)}</h2><p>${price(product)}</p><p>${product.optionNote?esc(product.optionNote):"Select an option and enter your ZIP to see its price with standard shipping included."}</p><strong>Not available to purchase yet</strong></div></div>`;
  } else if (error) content += `<div class="catalog-message" role="status">${esc(error)}</div>`;
  else if (data) content += `<p class="catalog-note">Collection updated ${esc(data.updatedAt)}</p><div class="grid">${data.products.length?data.products.map(card).join(''):'<p>No matching US warehouse products were returned. Try another category.</p>'}</div>`;
  else content += '<p>Select a category to browse CJ products.</p>';
  return shell.replace(/<main id="top"[^>]*>[\s\S]*?<\/main>/,`<main id="top" class="shell catalog">${content}</main>`)
    .replace('</head>','<meta name="robots" content="noindex,nofollow"></head>')
    .replace(/href="#(?:best|browse|kitchen|organize|top)"/g,`href="${prefix || '/'}"`);
}

