export function recipientFromForm(form) {
 const read=(key,max)=>{const v=form.get(key);if(typeof v!=='string'||!v.trim()||v.length>max||/[\x00-\x1f]/.test(v))throw new Error('Enter a complete US delivery address.');return v.trim();};
 const state=read('state',2).toUpperCase(),zip=read('zip',5);
 if(!'AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(' ').includes(state)||!/^\d{5}$/.test(zip))throw new Error('Enter a valid US state and ZIP.');
 return {name:read('name',50),address:{line1:read('line1',200),line2:form.get('line2')?read('line2',200):'',city:read('city',50),state,postal_code:zip,country:'US'}};
}
export function sameRecipient(a,b) {
 const norm=v=>String(v??'').trim().replace(/\s+/g,' ').toLowerCase();
 return Boolean(a&&b&&norm(a.name)===norm(b.name)&&['line1','line2','city','state','postal_code','country'].every(k=>norm(a.address?.[k])===norm(b.address?.[k])));
}
export function shippingFields(prefix,recipient) {
 return Object.fromEntries([[prefix+'[name]',recipient.name],...Object.entries(recipient.address).map(([k,v])=>[prefix+'[address]['+k+']',v])]);
}
