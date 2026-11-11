import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'dist-render');
const SUPABASE=process.env.SUPABASE_URL||'https://obloojlkjnagpdokofgw.supabase.co';
const PUBLISHABLE=process.env.SUPABASE_PUBLISHABLE_KEY||'sb_publishable_o9T1y2Pb2jk7dFoVHrx9pg_PNrPNDEV';
const PORT=Number(process.env.PORT||3000);
const mimetypes={
 '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
 '.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png',
 '.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp',
 '.json':'application/json; charset=utf-8','.woff2':'font/woff2',
 '.ico':'image/x-icon','.txt':'text/plain; charset=utf-8'
};
const commonHeaders={
 'X-Frame-Options':'DENY',
 'X-Content-Type-Options':'nosniff',
 'Referrer-Policy':'no-referrer',
 'Permissions-Policy':'geolocation=(),microphone=()',
 'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
};
const send=(res,status,data)=>{
 const body=Buffer.from(JSON.stringify(data));
 res.writeHead(status,{...commonHeaders,'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8','Content-Length':body.length});
 res.end(body);
};
const limitRequest=async(req,bytesLimit)=>{
 let total=0;const chunks=[];
 for await(const buf of req){
  total+=buf.length;
  if(total>bytesLimit)throw Object.assign(new Error('payload_too_large'),{http:413});
  chunks.push(buf);
 }
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}
 catch{throw Object.assign(new Error('invalid_json'),{http:400})}
};
const inMemoryAttempts=new Map();
function loginAllowed(ip){
 const now=Date.now(),key=ip||'unknown';
 const previous=inMemoryAttempts.get(key)||{count:0,expires:now+900000};
 if(previous.expires<now){previous.count=0;previous.expires=now+900000}
 previous.count++;
 inMemoryAttempts.set(key,previous);
 if(inMemoryAttempts.size>2000)for(const [k,v] of inMemoryAttempts)if(v.expires<now)inMemoryAttempts.delete(k);
 return previous.count<=25;
}
function sameOrigin(req){
 const origin=req.headers.origin;
 if(!origin)return true;
 const proto=(req.socket.encrypted||req.headers['x-forwarded-proto']==='https')?'https':'http';
 return origin===proto+'://'+req.headers.host;
}
async function api(req,res,which){
 if(req.method!=='POST')return send(res,405,{error:'method_not_allowed'});
 if(!sameOrigin(req))return send(res,403,{error:'origin_not_allowed'});
 if(!/application\/json/i.test(String(req.headers['content-type']||'')))return send(res,415,{error:'invalid_content_type'});
 let body;
 try{body=await limitRequest(req,which==='auth'?12000:260000)}
 catch(e){return send(res,e.http||400,{error:e.message})}
 if(!body||typeof body!=='object'||Array.isArray(body))return send(res,400,{error:'invalid_request'});
 let endpoint,payload,headers;
 if(which==='auth'){
  if(body.action!=='login'&&body.action!=='refresh')return send(res,400,{error:'unsupported_action'});
  if(body.action==='login'){
   const email=String(body.email||'').trim().toLowerCase();
   const password=body.password;
   if(!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)||typeof password!=='string'||password.length>500)
    return send(res,400,{error:'invalid_credentials'});
   if(!loginAllowed(req.socket.remoteAddress))return send(res,429,{error:'rate_limited'});
   payload={email,password};
  }else{
   if(typeof body.refresh_token!=='string'||body.refresh_token.length>3000)return send(res,400,{error:'invalid_request'});
   payload={refresh_token:body.refresh_token};
  }
  endpoint=SUPABASE+'/auth/v1/token?grant_type='+(body.action==='login'?'password':'refresh_token');
  headers={'content-type':'application/json','apikey':PUBLISHABLE};
 }else{
  const actions=new Set(['ping','stats','list','find','create','update','delete','bulk_update','bulk_delete','import','audit']);
  if(!actions.has(body.action))return send(res,400,{error:'unknown_action'});
  const bearer=String(req.headers.authorization||'');
  if(!/^Bearer [A-Za-z0-9._~-]{50,12000}$/.test(bearer))return send(res,401,{error:'not_authenticated'});
  endpoint=SUPABASE+'/functions/v1/admin-devices';
  payload=body;
  headers={'authorization':bearer,'apikey':PUBLISHABLE,'content-type':'application/json'};
 }
 try{
  const response=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify(payload),signal:AbortSignal.timeout(25000)});
  const text=await response.text();
  if(which==='auth'){
   if(!response.ok)return send(res,response.status===429?429:401,{error:response.status===429?'rate_limited':'invalid_credentials'});
   let obj;try{obj=JSON.parse(text)}catch{return send(res,502,{error:'auth_response_invalid'})}
   if(typeof obj.access_token!=='string'||typeof obj.refresh_token!=='string'||typeof obj.expires_in!=='number')
    return send(res,502,{error:'auth_response_invalid'});
   return send(res,200,{access_token:obj.access_token,refresh_token:obj.refresh_token,expires_in:obj.expires_in,user:{email:obj.user?.email}});
  }
  res.writeHead(response.status,{...commonHeaders,'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8'});
  res.end(text);
 }catch{return send(res,503,{error:which==='auth'?'authentication_unavailable':'admin_service_unavailable'})}
}
async function staticFile(req,res,pathname){
 if(req.method!=='GET'&&req.method!=='HEAD'){return send(res,405,{error:'method_not_allowed'})}
 let file;
 try{file=decodeURIComponent(pathname)}catch{return send(res,400,{error:'bad_path'})}
 if(file.includes('\0')||file.includes('\\'))return send(res,400,{error:'bad_path'});
 if(file==='/'||!path.extname(file))file='/index.html';
 const resolved=path.resolve(root,'.'+file);
 if(resolved!==root&&!resolved.startsWith(root+path.sep))return send(res,403,{error:'forbidden'});
 try{
  const stat=await fs.promises.stat(resolved);
  if(!stat.isFile())return send(res,404,{error:'not_found'});
  res.writeHead(200,{...commonHeaders,'Content-Type':mimetypes[path.extname(resolved)]||'application/octet-stream',
   'Content-Length':stat.size,
   'Cache-Control':file==='/index.html'?'no-store':'public, max-age=3600'});
  if(req.method==='HEAD')return res.end();
  fs.createReadStream(resolved).pipe(res);
 }catch{return send(res,404,{error:'not_found'})}
}
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url||'/', 'http://localhost');
 if(url.pathname==='/health')return send(res,200,{status:'ok',service:'hmc-solar-admin'});
 if(url.pathname==='/api/auth')return api(req,res,'auth');
 if(url.pathname==='/api/admin')return api(req,res,'admin');
 return staticFile(req,res,url.pathname);
});
server.headersTimeout=30000;
server.requestTimeout=30000;
server.listen(PORT,'0.0.0.0',()=>console.log('HMC Solar admin listening on '+PORT));
process.on('SIGTERM',()=>server.close());
