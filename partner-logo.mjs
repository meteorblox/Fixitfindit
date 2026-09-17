import {createHash} from 'node:crypto';
export const LOGO_LIMIT=512*1024;
export function validateLogo(bytes){
 const b=Buffer.from(bytes);if(b.length<20||b.length>LOGO_LIMIT)throw Error('Choose a PNG, JPEG or WebP image up to 512 KB.');
 if(b.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))&&b.subarray(12,16).toString()==='IHDR'&&b.subarray(-8,-4).toString()==='IEND'){
  const w=b.readUInt32BE(16),h=b.readUInt32BE(20);if(!w||!h||w>4096||h>4096)throw Error('Logo dimensions must be between 1 and 4096 pixels.');return {mime:'image/png',bytes:b};
 }
 if(b[0]===255&&b[1]===216&&b[2]===255&&b[b.length-2]===255&&b[b.length-1]===217)return {mime:'image/jpeg',bytes:b};
 if(b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP'&&b.readUInt32LE(4)+8===b.length&&['VP8 ','VP8L','VP8X'].includes(b.subarray(12,16).toString()))return {mime:'image/webp',bytes:b};
 throw Error('Choose a PNG, JPEG or WebP image. SVG and other file types are not supported.');
}
export async function readLogo(req){
 if(!req.headers['content-type']?.startsWith('multipart/form-data;'))throw Error('Choose an image file to upload.');
 let size=0;const chunks=[];for await(const c of req){const b=Buffer.from(c);size+=b.length;if(size>LOGO_LIMIT+8192)throw Error('Logo must be 512 KB or smaller.');chunks.push(b);}
 const f=await new Request('https://local.invalid/',{method:'POST',headers:{'Content-Type':req.headers['content-type']},body:Buffer.concat(chunks)}).formData();
 const file=f.get('logo');if(f.getAll('logo').length!==1||!file||typeof file.arrayBuffer!=='function')throw Error('Choose one logo file.');return validateLogo(await file.arrayBuffer());
}
export function logoVersion(bytes){return createHash('sha256').update(bytes).digest('hex').slice(0,16);}
