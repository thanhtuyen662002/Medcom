import {env} from "cloudflare:workers";
import {backendOrigin,erpCookies,relayCookie,routeAllowed,sameOriginWrite} from "@/lib/erp/proxy-policy";
export const dynamic="force-dynamic";
const problem=(status:number,code:string)=>Response.json({code},{status,headers:{"Cache-Control":"no-store"}});
async function proxy(request:Request,context:{params:Promise<{path:string[]}>}){
 const {path}=await context.params;const route=path.join("/");
 if(!routeAllowed(route,request.method))return problem(404,"endpoint_unavailable");
 if(request.method==="POST"&&!sameOriginWrite(request.url,request.headers.get("origin")))return problem(403,"origin_rejected");
 const origin=backendOrigin((env as unknown as Record<string,string>).MEDCOM_API_ORIGIN);
 if(!origin)return problem(503,"backend_not_configured");
 const incoming=new URL(request.url);if(incoming.search.length>4096)return problem(400,"query_too_large");
 const headers=new Headers({Accept:"application/json"});const cookie=erpCookies(request.headers.get("cookie"));if(cookie)headers.set("cookie",cookie);
 const csrf=request.headers.get("X-CSRF-TOKEN");if(csrf&&csrf.length<8192)headers.set("X-CSRF-TOKEN",csrf);
 let body:string|undefined;
 if(request.method==="POST"){
  if(Number(request.headers.get("content-length")??0)>16384)return problem(413,"payload_too_large");
  const reader=request.body?.getReader();const chunks:Uint8Array[]=[];let size=0;
  if(reader){while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>16384){await reader.cancel();return problem(413,"payload_too_large");}chunks.push(part.value);}}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}body=new TextDecoder().decode(bytes);
  if(body){if(!(request.headers.get("content-type")??"").startsWith("application/json"))return problem(415,"json_required");headers.set("Content-Type","application/json");}
 }
 try{
  const r=await fetch(`${origin}/${route}${incoming.search}`,{method:request.method,headers,body,redirect:"manual",signal:AbortSignal.timeout(20000)});
  if(r.status>=300&&r.status<400)return problem(502,"upstream_redirect_rejected");
  const outgoing=new Headers({"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});
  for(const name of ["content-type","x-correlation-id","retry-after"]){const v=r.headers.get(name);if(v)outgoing.set(name,v);}
  for(const value of r.headers.getSetCookie()){const safe=relayCookie(value);if(safe)outgoing.append("Set-Cookie",safe);}
  return new Response(r.body,{status:r.status,headers:outgoing});
 }catch{return problem(503,"backend_unavailable");}
}
export const GET=proxy;export const POST=proxy;
