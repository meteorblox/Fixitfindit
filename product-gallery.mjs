import {safeImage} from './catalog.mjs';
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function productGallery(product){
 const photos=[...new Set([product.image,...(product.images||[])].map(safeImage).filter(Boolean))];
 if(!photos.length)return '<div class="product-gallery"><p>Photo unavailable</p></div>';
 return '<section class="product-gallery" aria-label="Product photos"><a class="gallery-main" href="'+esc(photos[0])+'" target="_blank" rel="noopener"><img src="'+esc(photos[0])+'" alt="'+esc(product.name)+' — photo 1" fetchpriority="high"></a>'+(photos.length>1?'<nav class="gallery-thumbnails" aria-label="Choose product photo">'+photos.map((src,i)=>'<a href="'+esc(src)+'" data-photo="'+(i+1)+'" aria-label="View photo '+(i+1)+'" '+(i===0?'aria-current="true"':'')+'><img src="'+esc(src)+'" alt="" loading="lazy" width="72" height="72"></a>').join('')+'</nav>':'')+'<p class="catalog-note"><span class="gallery-count" aria-live="polite">Photo 1 of '+photos.length+'</span> · Select the large photo to view full size.</p></section>';
}
