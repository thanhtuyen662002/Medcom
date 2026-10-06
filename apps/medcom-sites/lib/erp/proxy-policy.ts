const routes = new Map([
 ["api/purchase-requests",["GET"]],["api/purchase-requests/workspace",["GET"]],["api/purchase-requests/detail",["GET"]],["api/purchase-requests/lookup",["GET"]],
 ["health/live",["GET"]],["health/ready",["GET"]],["api/auth/csrf",["GET"]],["api/auth/login",["POST"]],["api/auth/session",["GET"]],["api/auth/session/continue",["POST"]],["api/auth/logout",["POST"]],["api/workspace",["GET"]],["api/platform/metadata",["GET"]],["api/documents/purchase-orders",["GET"]],["api/documents/purchase-orders/detail",["GET"]],["api/documents/inbound-requests",["GET"]],["api/documents/inbound-requests/detail",["GET"]],
]);
export function routeAllowed(path:string,method:string){return routes.get(path)?.includes(method)===true;}
export function backendOrigin(value:string|undefined){
 if(!value)return null;
 try{const u=new URL(value);if(u.protocol!=="https:"||u.username||u.password||u.pathname!=="/"||u.search||u.hash)return null;const h=u.hostname.toLowerCase();if(h==="localhost"||h.endsWith(".localhost")||h.endsWith(".local")||h.includes(":")||/^\d+(\.\d+)*$/.test(h)||!h.includes("."))return null;return u.origin;}catch{return null;}
}
export function erpCookies(value:string|null){return(value??"").split(";").map(s=>s.trim()).filter(s=>/^__Host-Medcom\.(?:Session(?:C\d+)?|Csrf)=/.test(s)).join("; ");}
export function relayCookie(value:string){if(!/^__Host-Medcom\.(?:Session(?:C\d+)?|Csrf)=/.test(value)||/;\s*domain\s*=/i.test(value))return null;if(!/;\s*secure(?:;|$)/i.test(value)||!/;\s*httponly(?:;|$)/i.test(value)||!/;\s*path=\/(?:;|$)/i.test(value))return null;return value;}
export function sameOriginWrite(configuredPublicOrigin:string|undefined,origin:string|null){const expected=backendOrigin(configuredPublicOrigin);return expected!==null&&origin===expected;}
