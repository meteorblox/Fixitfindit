import {partnerStore} from './partner-applications.mjs';
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function applicationForm(message='') {return `<section class="partner-details" id="apply"><h2>Apply for a partner storefront</h2><p>Join our prelaunch program. Applications are reviewed manually. Purchases, commissions and payouts are not active yet.</p>${message?`<p role="status">${esc(message)}</p>`:''}<form method="post" action="/partners/apply"><label>Your name<br><input name="name" required maxlength="100" autocomplete="name"></label><br><label>Email<br><input name="email" type="email" required maxlength="254" autocomplete="email"></label><br><label>Storefront name<br><input name="brand" required maxlength="80"></label><br><label>Website or social profile (optional)<br><input name="website" type="url" maxlength="500" placeholder="https://"></label><p>We use these details to review your application and contact you about your storefront. They are stored privately. Applying does not activate commissions or enroll you in marketing emails.</p><label><input type="checkbox" name="consent" value="yes" required> You may contact me about this application.</label><p><button type="submit">Submit application</button></p></form></section>`;}
const limits=new Map();
export async function applicationRoute(req,res,url){
 if(url.pathname!=='/partners/apply')return false;
 const reply=(code,message)=>{res.writeHead(code,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(`<!doctype html><meta name="viewport" content="width=device-width"><title>Partner application | FixItFindIt</title><main style="max-width:650px;margin:60px auto;font:18px/1.6 system-ui;padding:24px"><h1>Partner application</h1><p>${esc(message)}</p><a href="/partners">Back to partner program</a></main>`);};
 if(req.method!=='POST'){reply(405,'Submit the application through our partner page.');return true;}
 if(!['https://www.fixitfindit.com','https://fixitfindit.com','https://fixitfindit-production.up.railway.app'].includes(req.headers.origin)){reply(403,'Please submit from our partner page.');return true;}
 if(!partnerStore){reply(503,'Applications are temporarily unavailable. Please try again later.');return true;}
 const now=Date.now();for(const [k,v] of limits)if(v.until<now)limits.delete(k);
 const key=req.socket.remoteAddress;const rate=limits.get(key)||{count:0,until:now+60000};limits.set(key,rate);
 if(++rate.count>10||limits.size>10000){reply(429,'Please wait a minute before trying again.');return true;}
 try {
  if(!req.headers['content-type']?.startsWith('application/x-www-form-urlencoded')){reply(415,'Unsupported form format.');return true;}
  let body='';for await(const c of req){body+=c.toString();if(Buffer.byteLength(body)>4096){reply(413,'Application is too long.');return true;}}
  const input=Object.fromEntries(new URLSearchParams(body));if(input.consent!=='yes'){reply(400,'Please confirm we may contact you about your application.');return true;}
  partnerStore.apply(input);reply(200,'Thank you. Your application has been received for review. If you have already applied with this email, your original application remains on file. Commissions are not active yet.');
 }catch{reply(400,'Please check your name, email, storefront name and website URL, then try again.');}
 return true;
}
