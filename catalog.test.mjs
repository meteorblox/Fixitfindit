import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCatalog,safeImage} from './catalog.mjs';
import {catalogPage} from './catalog-pages.mjs';
test('US catalog authenticates, normalizes and coalesces requests',async()=>{
  const calls=[];
  const service=createCatalog({apiKey:'test-only',interval:0,request:async(url,opts)=>{
    calls.push({url,opts});
    return {ok:true,json:async()=>({result:true,data:url.includes('getAccessToken')?{accessToken:'private-test-token',accessTokenExpiryDate:'2099-01-01'}:{content:[{productList:[{id:'p1',nameEn:'Brush',bigImage:'javascript:alert(1)',sellPrice:'2-4',listedNum:7}]}]}})};
  }});
  const [a,b]=await Promise.all([service.list('cleaning'),service.list('cleaning')]);
  assert.deepEqual(a,b); await service.list('cleaning'); assert.equal(calls.length,3);
  assert.equal(new URL(calls[1].url).searchParams.get('countryCode'),'US');
  assert.equal(a.products[0].image,''); assert.equal(a.products[0].supplierPrice,'2-4');
  assert.ok(!JSON.stringify(a).includes('private-test-token'));
});
test('supplier failures are sanitized and cached',async()=>{
  let count=0;
  const service=createCatalog({apiKey:'secret-test',interval:0,request:async()=>{count++;throw new Error('secret-test');}});
  for(let i=0;i<2;i++) await assert.rejects(service.list('tools'),/temporarily unavailable/);
  assert.equal(count,1);
  await assert.rejects(service.list('anything'),/Unknown category/);
});
test('partner category links retain storefront and escape product text',()=>{
  const html=catalogPage('<head></head><main id="top"></main>',{store:{slug:'home-helper'},category:{slug:'tools',name:'Tools'},data:{updatedAt:'today',products:[{id:'p1',name:'<script>oops</script>',retailCents:2300,supplierPrice:'2',image:'',listings:5}]}});
  assert.ok(html.includes('/shop/home-helper/category/tools/product/p1'));
  assert.ok(!html.includes('<script>oops'));
  assert.equal(safeImage('http://example.com/image.jpg'),'');
});

test('expanded US collections page through results and deduplicate supplier IDs',async()=>{
 for(const slug of ['kitchen','cleaning','organization','tools','home-improvement']) {
 const pages=[];const catalog=createCatalog({apiKey:'fixture',interval:0,request:async(url)=>({ok:true,json:async()=>{if(url.includes('getAccessToken'))return {result:true,data:{accessToken:'fixture'}};const q=new URL(url).searchParams;if(!q.has('verifiedWarehouse'))return {result:true,data:{content:[]}};pages.push(q.get('page'));assert.equal(q.get('verifiedWarehouse'),'1');assert.equal(q.get('countryCode'),'US');return {result:true,data:{totalPages:3,content:[{productList:Array.from({length:24},(_,i)=>({id:i===0?'shared':q.get('page')+'-'+i,nameEn:'Household organizer'}))}]}};}})});
 const data=await catalog.list(slug);assert.deepEqual(pages,['1','2','3',...Array(slug==='tools'?2:['home-improvement','kitchen'].includes(slug)?3:0).fill('1')]);assert.equal(data.products.filter(p=>p.id==='shared'||/^[123]-/.test(p.id)).length,70);
 }
});

test('unpriced products are excluded from customer collection cards',()=>{
 const html=catalogPage('<head></head><main id="top"></main>',{category:{slug:'cleaning',name:'Cleaning'},data:{updatedAt:'today',products:[{id:'ready',name:'Ready brush',retailCents:3300},{id:'waiting',name:'Unpriced brush',pricingPending:true}]}});
 assert.ok(html.includes('Ready brush'));assert.ok(!html.includes('Unpriced brush'));assert.ok(html.includes('$33.00'));
});
