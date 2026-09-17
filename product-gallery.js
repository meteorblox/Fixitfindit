document.querySelectorAll('.product-gallery').forEach(gallery=>{
 const links=[...gallery.querySelectorAll('[data-photo]')],main=gallery.querySelector('.gallery-main'),image=main?.querySelector('img'),count=gallery.querySelector('.gallery-count');
 if(!image)return;
 const name=image.alt.replace(/ — photo 1$/,'');
 function choose(link){image.src=link.href;image.alt=name+' — photo '+link.dataset.photo;main.href=link.href;links.forEach(a=>a.removeAttribute('aria-current'));link.setAttribute('aria-current','true');count.textContent='Photo '+link.dataset.photo+' of '+links.length;}
 links.forEach((link,index)=>{link.addEventListener('click',event=>{if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();choose(link);});link.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const n=event.key==='Home'?0:event.key==='End'?links.length-1:(index+(event.key==='ArrowRight'?1:-1)+links.length)%links.length;links[n].focus();choose(links[n]);});});
});
