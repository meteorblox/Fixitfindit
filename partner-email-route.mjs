import {randomBytes,timingSafeEqual} from 'node:crypto';
import {dashboardPage} from './partner-dashboard.mjs';
const cookieValue=(req,name)=>req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1);
export function createPartnerEmailRoute({emailLogin,access,findPartner}){
 return async(req,res,url)=>{
  const root='/partners/dashboard',emailPaths=[root+'/email',root+'/email-request',root+'/email-verify'];
  const loginPage=['GET','HEAD'].includes(req.method)&&url.pathname===root&&!access?.resolve(cookieValue(req,'fit_partner_session'),findPartner);
  if(!emailLogin?.enabled()||(!loginPage&&!emailPaths.includes(url.pathname)))return false;
  const original=cookieValue(req,'fit_partner_email_csrf'),csrf=/^[a-f0-9]{48}$/.test(original||'')?original:randomBytes(24).toString('hex');
  const headers={'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"};
  const send=(status,message='',confirmationToken=null)=>{res.setHeader('Set-Cookie','fit_partner_email_csrf='+csrf+'; Path='+root+'; Secure; HttpOnly; SameSite=Strict; Max-Age=28800');res.writeHead(status,headers);res.end(req.method==='HEAD'?undefined:dashboardPage(null,[],message,null,{emailEnabled:true,csrf,confirmationToken}));};
  if(loginPage){send(200);return true;}
  if(['GET','HEAD'].includes(req.method)&&url.pathname===root+'/email'){const token=url.searchParams.get('token');send(/^[a-f0-9]{64}$/.test(token||'')?200:400,'',/^[a-f0-9]{64}$/.test(token||'')?token:null);return true;}
  if(req.method!=='POST'){send(405,'Request a sign-in link below.');return true;}
  if(!req.headers['content-type']?.startsWith('application/x-www-form-urlencoded')){send(415,'Use the sign-in form below.');return true;}
  let body='';for await(const c of req){body+=c;if(Buffer.byteLength(body)>1024){send(413,'Request too large.');return true;}}
  const f=new URLSearchParams(body),submitted=f.get('csrf');
  if(!/^[a-f0-9]{48}$/.test(original||'')||!/^[a-f0-9]{48}$/.test(submitted||'')||!timingSafeEqual(Buffer.from(original),Buffer.from(submitted))){send(403,'Form expired. Please try again below.');return true;}
  try{
   if(url.pathname===root+'/email-request'){await emailLogin.send(f.get('email'));send(200,'If this email belongs to an approved partner, a sign-in link will arrive shortly. Check spam too. Please wait a minute before requesting another.');return true;}
   if(url.pathname===root+'/email-verify'){
    const partner=emailLogin.consume(f.get('token'));if(!partner||findPartner(partner.slug)?.id!==partner.id){send(401,'Link invalid or expired. Request a new one below.');return true;}
    const session=access.login(access.issue(partner),findPartner,'partner-email:'+partner.id);if(!session){send(401,'Please request a new link.');return true;}
    res.setHeader('Set-Cookie','fit_partner_session='+session+'; Path='+root+'; HttpOnly; Secure; SameSite=Strict; Max-Age=28800');res.writeHead(303,{...headers,Location:root});res.end();return true;
   }
   send(404,'Page not found.');
  }catch{send(503,'Email sign-in is temporarily unavailable. Please try again later.');}
  return true;
 };
}
