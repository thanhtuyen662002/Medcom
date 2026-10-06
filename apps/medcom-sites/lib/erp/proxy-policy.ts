const purchaseCommandRoutes = new Set([
 "api/purchase-requests/save", "api/purchase-requests/submit",
 "api/purchase-requests/save/lookup", "api/purchase-requests/submit/lookup",
]);
export function purchaseCommandRoute(path:string){return purchaseCommandRoutes.has(path);}
const inboundCommandRoutes = new Set([
 "api/inbound-requests/draft/save", "api/inbound-requests/draft/send-to-warehouse",
 "api/inbound-requests/draft/reconcile",
]);
export function inboundCommandRoute(path:string){return inboundCommandRoutes.has(path);}
export function inboundRoute(path:string){return path==="api/inbound-requests/draft"||inboundCommandRoute(path);}
export function requestBodyLimit(path:string,method:string){return method==="POST"&&(purchaseCommandRoute(path)||inboundCommandRoute(path))?1048576:16384;}
const routes = new Map([
 ...[...purchaseCommandRoutes].map(path=>[path,["POST"]] as [string,string[]]),
 ...[...inboundCommandRoutes].map(path=>[path,["POST"]] as [string,string[]]),
 ["api/inbound-requests/draft",["GET"]],
 ["api/purchase-requests",["GET"]],["api/purchase-requests/workspace",["GET"]],["api/purchase-requests/detail",["GET"]],["api/purchase-requests/lookup",["GET"]],
 ["health/live",["GET"]],["health/ready",["GET"]],["api/auth/csrf",["GET"]],["api/auth/login",["POST"]],["api/auth/session",["GET"]],["api/auth/session/continue",["POST"]],["api/auth/logout",["POST"]],["api/workspace",["GET"]],["api/platform/metadata",["GET"]],["api/documents/purchase-orders",["GET"]],["api/documents/purchase-orders/detail",["GET"]],["api/documents/inbound-requests",["GET"]],["api/documents/inbound-requests/detail",["GET"]],
]);
export function routeAllowed(path:string,method:string){return routes.get(path)?.includes(method)===true;}
export function backendOrigin(value:string|undefined){
 if(!value)return null;
 try{const u=new URL(value);if(u.protocol!=="https:"||u.username||u.password||u.pathname!=="/"||u.search||u.hash)return null;const h=u.hostname.toLowerCase();if(h==="localhost"||h.endsWith(".localhost")||h.endsWith(".local")||h.includes(":")||/^\d+(\.\d+)*$/.test(h)||!h.includes("."))return null;return u.origin;}catch{return null;}
}
export function localHttpsOrigin(value:string|undefined){
 // Validate the original string: URL parsing would erase case, whitespace,
 // default ports, dot segments and other noncanonical spellings.
 const match=/^https:\/\/localhost:([1-9][0-9]{0,4})$/.exec(value??"");
 if(!match||match[0]!==value)return null;
 const port=Number(match[1]);return port<=65535&&port!==443?match[0]:null;
}
export function resolveErpOrigins(configuredOrigin:string|undefined,configuredPublicOrigin:string|undefined,localHttpsMode?:string){
 if(localHttpsMode==="1"){
  const backend=localHttpsOrigin(configuredOrigin),publicOrigin=localHttpsOrigin(configuredPublicOrigin);
  // Local opt-in is an atomic pair, including reads that need no public origin
  // in production. Never combine a local hop with a public DNS origin.
  return backend&&publicOrigin?{backend,publicOrigin}:{backend:null,publicOrigin:null};
 }
 return {backend:backendOrigin(configuredOrigin),publicOrigin:backendOrigin(configuredPublicOrigin)};
}
export function erpCookies(value:string|null){return(value??"").split(";").map(s=>s.trim()).filter(s=>/^__Host-Medcom\.(?:Session(?:C\d+)?|Csrf)=/.test(s)).join("; ");}
export function relayCookie(value:string){if(!/^__Host-Medcom\.(?:Session(?:C\d+)?|Csrf)=/.test(value)||/;\s*domain\s*=/i.test(value))return null;if(!/;\s*secure(?:;|$)/i.test(value)||!/;\s*httponly(?:;|$)/i.test(value)||!/;\s*path=\/(?:;|$)/i.test(value))return null;return value;}
export function sameOriginWrite(configuredPublicOrigin:string|undefined,origin:string|null){const expected=backendOrigin(configuredPublicOrigin);return expected!==null&&origin===expected;}
