import {backendOrigin,erpCookies,relayCookie,routeAllowed,sameOriginWrite,purchaseCommandRoute,requestBodyLimit} from "./proxy-policy";
const problem=(status:number,code:string)=>Response.json({code},{status,headers:{"Cache-Control":"no-store"}});
export async function proxyErpRequest(request:Request,path:string[],configuredOrigin:string|undefined,configuredPublicOrigin:string|undefined,upstreamFetch:typeof fetch=fetch){
 const route=path.join("/");
 if(!routeAllowed(route,request.method))return problem(404,"endpoint_unavailable");
 if(request.method==="POST"&&!backendOrigin(configuredPublicOrigin))return problem(503,"frontend_not_configured");
 if(request.method==="POST"&&!sameOriginWrite(configuredPublicOrigin,request.headers.get("origin")))return problem(403,"origin_rejected");
 const origin=backendOrigin(configuredOrigin);
 if(!origin)return problem(503,"backend_not_configured");
 const incoming=new URL(request.url);if(incoming.search.length>4096)return problem(400,"query_too_large");
 const command=request.method==="POST"&&purchaseCommandRoute(route);
 if(command&&incoming.search)return problem(400,"invalid_purchase_query");
 const headers=new Headers({Accept:"application/json"});const cookie=erpCookies(request.headers.get("cookie"));if(cookie)headers.set("cookie",cookie);
 const csrf=request.headers.get("X-CSRF-TOKEN");if(csrf&&csrf.length<8192)headers.set("X-CSRF-TOKEN",csrf);
 if(command){
  const scope=request.headers.get("X-Purchase-Scope");
  if(!scope||!(/^[a-f0-9]{64}$/).test(scope))return problem(409,"purchase_scope_changed");
  headers.set("X-Purchase-Scope",scope);
  // Browser origin was checked above; the server-to-server hop has its own fixed origin.
  headers.set("Origin",origin);
 }
 let body:string|undefined;
 try{
 if(request.method==="POST"){
  const limit=requestBodyLimit(route,request.method),declared=request.headers.get("content-length");
  if(declared!==null&&!/^\d+$/.test(declared))return problem(400,"invalid_request_body");
  if(declared!==null&&(!Number.isSafeInteger(Number(declared))||Number(declared)>limit))return problem(413,"payload_too_large");
  const reader=request.body?.getReader();const chunks:Uint8Array[]=[];let size=0;
  if(reader){while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>limit){await reader.cancel().catch(()=>undefined);return problem(413,"payload_too_large");}chunks.push(part.value);}}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}body=new TextDecoder("utf-8",{fatal:true}).decode(bytes);
  if(declared!==null&&Number(declared)!==size)return problem(400,"invalid_request_body");
  if(command){
   if(!/^application\/json(?:;\s*charset=utf-8)?$/i.test(request.headers.get("content-type")??""))return problem(415,"json_required");
   if(bytes[0]===239&&bytes[1]===187&&bytes[2]===191)return problem(400,"invalid_request_body");
   const json:unknown=JSON.parse(body);
   if(json===null||typeof json!=="object"||Array.isArray(json))return problem(400,"invalid_request_body");
  }
  if(body){if(!(request.headers.get("content-type")??"").startsWith("application/json"))return problem(415,"json_required");headers.set("Content-Type","application/json");}
 }
 }catch{return problem(400,"invalid_request_body");}
 try{
  const r=await upstreamFetch(`${origin}/${route}${incoming.search}`,{method:request.method,headers,body,cache:"no-store",redirect:"manual",signal:AbortSignal.any([request.signal,AbortSignal.timeout(20000)])});
  if(r.status>=300&&r.status<400)return problem(502,"upstream_redirect_rejected");
  const outgoing=new Headers({"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});
  for(const name of ["content-type","x-correlation-id","retry-after"]){const v=r.headers.get(name);if(v)outgoing.set(name,v);}
  for(const value of r.headers.getSetCookie()){const safe=relayCookie(value);if(safe)outgoing.append("Set-Cookie",safe);}
  return new Response(r.body,{status:r.status,headers:outgoing});
 }catch{return problem(503,"backend_unavailable");}
}
