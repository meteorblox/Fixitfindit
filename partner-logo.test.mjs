import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createPartnerStore} from './partner-applications.mjs';
import {createDashboardRoute,dashboardPage} from './partner-dashboard.mjs';
import {readLogo,validateLogo,LOGO_LIMIT} from './partner-logo.mjs';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7e0AAAAASUVORK5CYII=','base64');
test('logos persist for approved partners only and removal restores fallback',()=>{
 const store=createPartnerStore(':memory:');try{store.apply({name:'A',brand:'Alpha',email:'a@example.com'});store.apply({name:'B',brand:'Beta',email:'b@example.com'});const [a,b]=store.list();assert.throws(()=>store.saveLogo(a.id,png));store.approve(a.id,'alpha');store.approve(b.id,'beta');store.saveLogo(a.id,png);assert.match(store.find('alpha').logoUrl,/^\/partner-logos\/alpha\?v=/);assert.equal(store.find('beta').logoUrl,null);assert.deepEqual(Buffer.from(store.logo('alpha').bytes),png);store.removeLogo(a.id);assert.equal(store.find('alpha').logoUrl,null);assert.equal(store.logo('alpha'),undefined);}finally{store.close();}
});
test('upload parser accepts image file and rejects SVG, disguised HTML, oversized and duplicate files',async()=>{
 assert.equal(validateLogo(png).mime,'image/png');assert.throws(()=>validateLogo(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')));assert.throws(()=>validateLogo(Buffer.alloc(LOGO_LIMIT+1)));
 async function upload(duplicate=false){const form=new FormData();form.append('logo',new Blob([png],{type:'text/html'}),'logo.html');if(duplicate)form.append('logo',new Blob([png]),'second.png');const request=new Request('https://example.com',{method:'POST',body:form}),req=Readable.from([Buffer.from(await request.arrayBuffer())]);req.headers={'content-type':request.headers.get('content-type')};return readLogo(req);}
 assert.equal((await upload()).mime,'image/png');await assert.rejects(upload(true));
});
test('logo route requires authentication and same origin and uses session partner not supplied ID',async()=>{
 let saved=[];const partner={id:'own',slug:'own',name:'Own',demo:false};const route=createDashboardRoute({access:{resolve:t=>t==='valid'?partner:null},findPartner:()=>partner,affiliates:{list:()=>[]},branding:{saveLogo:(id,b)=>saved.push(id),removeLogo:id=>saved.push('remove:'+id)}});
 async function run({token='valid',origin='https://www.fixitfindit.com',remove=false}={}){const f=new FormData();f.append('logo',new Blob([png]),'logo.png');f.append('partner','someone-else');const r=new Request('https://example.com',{method:'POST',body:f}),req=Readable.from([Buffer.from(await r.arrayBuffer())]);req.method='POST';req.headers={origin,cookie:'fit_partner_session='+token,'content-type':r.headers.get('content-type')};const res={writeHead(n,h){this.status=n;this.headers=h;},end(){}};await route(req,res,new URL('https://www.fixitfindit.com/partners/dashboard/logo'+(remove?'/remove':'')));return res;}
 assert.equal((await run({token:'bad'})).status,403);assert.equal((await run({origin:'https://evil.example'})).status,403);assert.deepEqual(saved,[]);assert.equal((await run()).status,303);assert.deepEqual(saved,['own']);await run({remove:true});assert.deepEqual(saved,['own','remove:own']);assert.match(dashboardPage(partner,[],'',null,{brandingAllowed:true}),/Save logo/);
});
