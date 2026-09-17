import {randomBytes,timingSafeEqual} from 'node:crypto';
import {createDashboardAccess} from './partner-dashboard.mjs';
export const owner={id:'store-owner',slug:'store-owner'};
const find=s=>s===owner.slug?owner:null;
export const createOwnerAccess=path=>createDashboardAccess(path===':memory:'?path:path+'.owner-access');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>Number.isSafeInteger(n)?'$'+(n/100).toFixed(2):'Pending verification';
const states={ready:'Ready for CJ submission',creating:'Submission needs reconciliation',created:'CJ draft — review payment in CJ',confirming:'Confirmation needs reconciliation',confirmed:'Awaiting manual CJ payment',paying:'Payment needs reconciliation',paid:'CJ processing',shipped:'Shipped',delivered:'Delivered',cancelled:'Cancelled'};
export function ownerOrdersPage(rows=null,message='',csrf='',emailEnabled=false){
 let content=rows===null?'<h1>Owner sign-in</h1><p>Use your one-time owner access code. It expires after 24 hours.</p><form method="post" action="/owner/orders/login"><label>Access code<input name="code" type="password" required maxlength="48" autocomplete="one-time-code"></label><button>Sign in</button></form>':'<h1>Orders &amp; fulfillment</h1><p>Latest 200 paid live orders. Test orders are excluded. Supplier payments are made manually in CJ.</p><p><a href="/owner/orders">Refresh saved status</a> · <a href="https://www.cjdropshipping.com/" target="_blank" rel="noopener noreferrer">Open CJ</a></p>'+(!rows.length?'<section><h2>No paid live orders yet</h2><p>Orders appear here after a successful live customer payment.</p></section>':rows.map(r=>'<section><h2>'+esc(r.product_name)+'</h2><p>'+esc(r.created_at)+' · Order <code>'+esc(r.id)+'</code></p><div class="amounts"><span>Product: <b>'+money(r.retail_cents)+'</b></span><span>Tax: <b>'+money(r.tax_cents)+'</b></span><span>Customer total: <b>'+money(r.total_cents)+'</b></span></div><p><strong>'+(r.hold?'Refund hold — do not fulfill or pay':r.job?.addressReviewRequired?'Address review required — do not pay CJ yet':r.job?.lastError?'Needs reconciliation — review before proceeding':esc(states[r.job?.state]||'Needs fulfillment preparation'))+'</strong></p><p>Supplier reference: <code>'+esc(r.job?.supplierReference||'Not prepared')+'</code><br>CJ order: <code>'+esc(r.job?.cjOrderId||'Not submitted')+'</code></p><p>Tracking: '+esc(r.job?.trackingNumber||'Not available yet')+(r.job?.trackingProvider?' · '+esc(r.job.trackingProvider):'')+'</p>'+(r.job?.cjOrderId?'<form method="post" action="/owner/orders/sync"><input type="hidden" name="order" value="'+esc(r.id)+'"><button>Sync tracking</button></form>':'')+'</section>').join(''))+'<section><h2>Manual fulfillment</h2><p>Submit orders using the private Railway console. Use Sync tracking above to retrieve CJ status and tracking. If address review is required, run the address command, compare every field in MyCJ, then record verify-address with the exact CJ order ID. Match the CJ order and supplier reference, check refund holds and the final supplier amount before paying. An uncertain submission must be reconciled before retrying.</p><p>This page shows saved tracking. Refreshing this page does not contact CJ. Automatic checks run every 15 minutes for active submitted orders; use Sync tracking for an immediate check.</p></section><form method="post" action="/owner/orders/logout"><button>Sign out</button></form>';
 if(rows===null&&emailEnabled)content='<h1>Owner sign-in</h1><p>Enter your owner email. We will send a sign-in link that expires in 15 minutes.</p><form method="post" action="/owner/orders/email-request"><label>Email address<input name="email" type="email" required maxlength="254" autocomplete="email"></label><button>Email me a sign-in link</button></form><details><summary>Use a recovery code</summary>'+content+'</details>';
 return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Owner orders | FixItFindIt</title><style>body{margin:0;background:#f7f5ef;color:#173c35;font:16px/1.6 system-ui}main{max-width:1000px;margin:32px auto;padding:24px}h1{font-size:2.4rem}h2{font-size:1.25rem}section{padding:24px;background:white;border:1px solid #dae1da;border-radius:14px;margin:20px 0}a{color:#216653}code{overflow-wrap:anywhere}.amounts{display:flex;flex-wrap:wrap;gap:24px}input{display:block;padding:12px;margin:12px 0;max-width:90%;width:400px}button{background:#216653;color:white;padding:12px 20px;border:0;border-radius:8px;font:inherit}</style></head><body><main><a href="/">FixItFindIt</a>'+(message?'<p role="status">'+esc(message)+'</p>':'')+content.replaceAll('<button>', '<input type="hidden" name="csrf" value="'+esc(csrf)+'"><button>')+'</main></body></html>';
}
export function createOwnerOrdersRoute({access,orders,worker,tracking,emailLogin}){
 return async(req,res,url)=>{
  if(url.pathname!=='/owner/orders'&&!url.pathname.startsWith('/owner/orders/'))return false;
  const headers={'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"};
  const send=(status,body)=>{res.writeHead(status,headers);res.end(req.method==='HEAD'?undefined:body);};
  const cookie=v=>'fit_owner_session='+v+'; Path=/owner/orders; HttpOnly; Secure; SameSite=Strict; Max-Age='+(v?28800:0);
  const token=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('fit_owner_session='))?.slice(18);
  const csrfCookie=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('fit_owner_csrf='))?.slice(15);
  const csrf=/^[a-f0-9]{48}$/.test(csrfCookie||'')?csrfCookie:randomBytes(24).toString('hex');
  const page=(rows=null,message='')=>{res.setHeader('Set-Cookie','fit_owner_csrf='+csrf+'; Path=/owner/orders; HttpOnly; Secure; SameSite=Strict; Max-Age=28800');return ownerOrdersPage(rows,message,csrf,emailLogin?.enabled());};
  const redirect=()=>{res.writeHead(303,{...headers,Location:'/owner/orders'});res.end();};
  try{
   if(!access||!orders||!worker){send(503,ownerOrdersPage(null,'Owner dashboard unavailable.'));return true;}
   if(req.method==='POST'){
    if(!req.headers['content-type']?.startsWith('application/x-www-form-urlencoded')){send(415,'Unsupported form');return true;}
    let body='';for await(const c of req){body+=c;if(Buffer.byteLength(body)>1024){send(413,'Request too large');return true;}}
    const form=new URLSearchParams(body),submitted=form.get('csrf');
    const validCsrf=/^[a-f0-9]{48}$/.test(csrfCookie||'')&&/^[a-f0-9]{48}$/.test(submitted||'')&&timingSafeEqual(Buffer.from(csrfCookie),Buffer.from(submitted));
    if(!validCsrf){send(403,page(null,'Sign-in form expired. Please enter your code again below.'));return true;}
    if(url.pathname==='/owner/orders/email-request'){
     if(!emailLogin?.enabled()){send(503,page(null,'Email sign-in is not configured yet.'));return true;}
     try{await emailLogin.send(form.get('email'));send(200,page(null,'If this is the owner email, a sign-in link will arrive shortly. Check spam too. Please allow a minute before requesting another.'));}catch{send(503,page(null,'Email could not be sent. Try again later or use a recovery code.'));}return true;
    }
    if(url.pathname==='/owner/orders/email-verify'){
     if(!emailLogin?.consume(form.get('token'))){send(401,page(null,'Link invalid or expired. Request a new sign-in link.'));return true;}
     const session=access.login(access.issue(owner),find,'owner-email');
     if(!session){send(401,page(null,'Please request a new sign-in link.'));return true;}
     res.setHeader('Set-Cookie',cookie(session));redirect();return true;
    }
    if(url.pathname==='/owner/orders/logout'){access.logout(token);res.setHeader('Set-Cookie',cookie(''));redirect();return true;}
    if(url.pathname==='/owner/orders/sync'){
     if(!access.resolve(token,find)){send(401,page(null,'Please sign in again.'));return true;}
     const id=form.get('order');
     if(!tracking||!orders.listPaid().some(r=>r.id===id)||!worker.summary(id)?.cjOrderId){send(400,'Submitted paid order required');return true;}
     let message='Tracking updated from CJ.';
     try{await tracking.sync(id);}catch{message='CJ could not be refreshed. Saved tracking is unchanged; review order status and try again later.';}
     send(200,page(orders.listPaid().map(r=>({...r,job:worker.summary(r.id),hold:orders.refunds.summary(r.id).fulfillmentHold})),message));return true;
    }
    if(url.pathname!=='/owner/orders/login'){
send(404,'Not found');return true;}
    if(!req.headers['content-type']?.startsWith('application/x-www-form-urlencoded')){send(415,'Unsupported form');return true;}
    const session=access.login(new URLSearchParams(body).get('code'),find,req.socket?.remoteAddress||'unknown');
    if(!session){send(401,page(null,'Code invalid or expired.'));return true;}
    res.setHeader('Set-Cookie',cookie(session));redirect();return true;
   }
   if(['GET','HEAD'].includes(req.method)&&url.pathname==='/owner/orders/email'){
    const linkToken=url.searchParams.get('token');
    if(!emailLogin?.enabled()||!/^[a-f0-9]{64}$/.test(linkToken||'')){send(400,page(null,'Link invalid. Request a new sign-in link.'));return true;}
    // GET never consumes a token: email security scanners can safely open the URL.
    const html=page(null,'Your sign-in link is ready.');
    send(200,html.replace(/<h1>Owner sign-in<\/h1>[\s\S]*<\/main>/,'<h1>Sign in to Orders</h1><form method="post" action="/owner/orders/email-verify"><input type="hidden" name="csrf" value="'+esc(csrf)+'"><input type="hidden" name="token" value="'+esc(linkToken)+'"><button>Sign in</button></form></main>'));return true;
   }
   if(!['GET','HEAD'].includes(req.method)||url.pathname!=='/owner/orders'){send(404,'Not found');return true;}
   if(!access.resolve(token,find)){send(200,page());return true;}
   send(200,page(orders.listPaid().map(r=>({...r,job:worker.summary(r.id),hold:orders.refunds.summary(r.id).fulfillmentHold}))));
  }catch{send(503,ownerOrdersPage(null,'Unable to load orders. Try again later.'));}
  return true;
 };
}
