export function homeContent(prefix = '') {
  const link = slug => `${prefix}/category/${slug}`;
  const tiles = [
    ['cleaning','01','Cleaning','A little less elbow grease.','✦'],
    ['organization','02','Organization','Make room for everyday life.','▤'],
    ['kitchen','03','Kitchen','From meal prep to the last dish.','◒'],
    ['tools','04','Tools','For your next “I can fix that.”','↗'],
    ['home-improvement','05','Home improvement','Small projects. Fresh possibilities.','⌂']
  ];
  return `<main id="top" class="home">
    <section class="home-hero shell">
      <div class="home-copy"><p class="eyebrow">GOOD FINDS. EVERYDAY FIXES.</p><h1>Small fixes.<br><em>Better home.</em></h1><p class="home-lede">For the cluttered drawer. The stubborn corner. The little job you’ve been meaning to do. Find a better way to tackle everyday life.</p><div class="home-actions"><a class="primary" href="#browse">Find your next fix <span>↗</span></a><a class="text-link" href="${link('cleaning')}">Explore household finds →</a></div><p class="home-preview">Explore our growing catalog · Checkout coming soon</p></div>
      <div class="home-visual"><img src="/hero-products.png" alt="Kitchen and household problem-solvers arranged together"><div class="home-stamp">LESS FUSS.<br><b>More living.</b></div><a class="home-image-link" href="${link('kitchen')}"><span>START IN THE KITCHEN<br><b>Little upgrades, everyday usefulness.</b></span><span>↗</span></a></div>
    </section>
    <div class="home-values shell"><span>Household problem-solvers</span><span>Five categories to explore</span><span>A home that works for you</span></div>
    <section class="home-section shell" id="browse"><div class="home-heading"><div><p class="eyebrow">WHERE COULD LIFE BE EASIER?</p><h2>Find your kind of fix.</h2></div><p>A place for every project.<br>A possibility in every category.</p></div><div class="home-categories">${tiles.map(([slug,num,name,desc,icon])=>`<a href="${link(slug)}" class="home-tile"><span class="home-tile-top"><span>↗</span></span><img class="home-category-image" src="/category-${slug}.svg" alt="" loading="lazy"><h3>${name}</h3><p>${desc}</p></a>`).join('')}</div></section>
  </main>`;
}
