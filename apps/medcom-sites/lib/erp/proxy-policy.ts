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
export const erpScreenModules = [
  "purchase-requests",
  "sales-orders",
  "internal-transfer-requests",
  "warehouse-qr",
  "sales-qr",
  "machine-movements",
  "machine-repairs",
  "purchase-orders",
  "inbound-requests",
  "purchase-approvals",
  "sales-order-pm",
  "sales-order-sa",
  "internal-transfer-pm",
  "internal-transfer-batches",
  "internal-transfer-tech",
  "internal-transfer-sa",
  "internal-transfer-accounting",
  "internal-transfer-warehouse-out",
  "internal-transfer-warehouse-in",
] as const;
export type ErpScreenModule = typeof erpScreenModules[number];

const fullCudModules = [
  "purchase-requests",
  "sales-orders",
  "internal-transfer-requests",
  "machine-movements",
  "machine-repairs",
  "purchase-orders",
  "inbound-requests",
  "internal-transfer-batches",
] as const;

const saveOnlyModules = [
  "internal-transfer-pm",
  "internal-transfer-tech",
  "internal-transfer-sa",
  "internal-transfer-accounting",
  "internal-transfer-warehouse-out",
  "internal-transfer-warehouse-in",
] as const;

const legacyDraftModules = [
  "purchase-requests",
  "sales-orders",
  "internal-transfer-requests",
  "machine-movements",
  "machine-repairs",
] as const;

const erpScreenPostRoutes = new Set([
  ...erpScreenModules.map(m => `api/erp/${m}/options`),
  ...erpScreenModules.map(m => `api/erp/${m}/commands/lookup`),
  ...fullCudModules.flatMap(m => [
    `api/erp/${m}/create`,
    `api/erp/${m}/save`,
    `api/erp/${m}/delete`,
  ]),
  ...saveOnlyModules.map(m => `api/erp/${m}/save`),
  ...legacyDraftModules.flatMap(m => [
    `api/erp/${m}/selection`,
    `api/erp/${m}/paste/validate`,
  ]),
  "api/erp/inbound-requests/sections/costs/save",
  "api/erp/internal-transfer-tech/sections/assets/save",
  "api/erp/purchase-orders/item-price",
  "api/erp/warehouse-qr/qr/add",
  "api/erp/warehouse-qr/qr/delete",
  "api/erp/sales-qr/qr/add",
  "api/erp/sales-qr/qr/delete",
  "api/erp/purchase-requests/actions/submit",
  "api/erp/purchase-requests/actions/send-purchase-order",
  "api/erp/sales-orders/actions/send-pm",
  "api/erp/sales-orders/actions/send-pm/options",
  "api/erp/sales-orders/actions/recall",
  "api/erp/internal-transfer-requests/actions/send-pm",
  "api/erp/internal-transfer-requests/actions/send-pm/options",
  "api/erp/internal-transfer-requests/actions/recall",
  "api/erp/inbound-requests/actions/send-management",
  "api/erp/inbound-requests/actions/send-warehouse",
  "api/erp/purchase-approvals/actions/approve",
  "api/erp/purchase-approvals/actions/reject",
  "api/erp/sales-order-pm/actions/send-sa",
  "api/erp/sales-order-pm/actions/reject",
  "api/erp/sales-order-sa/actions/send-accounting",
  "api/erp/sales-order-sa/actions/send-tech",
  "api/erp/sales-order-sa/actions/reject",
  "api/erp/sales-order-sa/actions/return-step",
  "api/erp/sales-order-sa/actions/return-step/options",
  "api/erp/internal-transfer-pm/actions/pm-confirm",
  "api/erp/internal-transfer-pm/actions/reject",
  "api/erp/internal-transfer-batches/actions/sync-requests",
  "api/erp/internal-transfer-batches/actions/send-tech",
  "api/erp/internal-transfer-tech/actions/send-sa",
  "api/erp/internal-transfer-tech/actions/send-sa/options",
  "api/erp/internal-transfer-tech/actions/reject",
  "api/erp/internal-transfer-sa/actions/send-accounting",
  "api/erp/internal-transfer-sa/actions/reject",
  "api/erp/internal-transfer-sa/actions/return-step",
  "api/erp/internal-transfer-sa/actions/return-step/options",
  "api/erp/internal-transfer-accounting/actions/send-warehouse",
  "api/erp/internal-transfer-accounting/actions/reject",
  "api/erp/internal-transfer-accounting/actions/return-step",
  "api/erp/internal-transfer-accounting/actions/return-step/options",
  "api/erp/internal-transfer-warehouse-out/actions/dispatch",
  "api/erp/internal-transfer-warehouse-out/actions/reject",
  "api/erp/internal-transfer-warehouse-out/actions/return-step",
  "api/erp/internal-transfer-warehouse-out/actions/return-step/options",
  "api/erp/internal-transfer-warehouse-in/actions/receive",
]);
export function erpScreenPostRoute(path:string){return erpScreenPostRoutes.has(path);}

const erpScreenGetRoutes = new Set([
  ...erpScreenModules.flatMap(m => [
    `api/erp/${m}/screen`,
    `api/erp/${m}`,
    `api/erp/${m}/detail`,
    `api/erp/${m}/actions`,
  ]),
  "api/erp/sales-orders/contract-info",
  "api/erp/sales-qr/contract-info",
  "api/erp/sales-order-pm/contract-info",
  "api/erp/sales-order-sa/contract-info",
]);
export function erpScreenGetRoute(path:string){return erpScreenGetRoutes.has(path);}
export function erpScreenRoute(path:string){return erpScreenPostRoute(path)||erpScreenGetRoute(path);}

export function isNotificationId(segment:string):boolean{
 if(!/^[1-9]\d{0,9}$/.test(segment))return false;
 const num=Number(segment);
 return Number.isSafeInteger(num)&&num>0&&num<=2147483647;
}
export function notificationGetRoute(path:string):boolean{
 if(path==="api/notifications")return true;
 const parts=path.split("/");
 if(parts.length===3&&parts[0]==="api"&&parts[1]==="notifications"&&isNotificationId(parts[2]))return true;
 if(parts.length===4&&parts[0]==="api"&&parts[1]==="notifications"&&isNotificationId(parts[2])&&parts[3]==="target")return true;
 return false;
}
export function notificationReadRoute(path:string):boolean{
 const parts=path.split("/");
 return parts.length===4&&parts[0]==="api"&&parts[1]==="notifications"&&isNotificationId(parts[2])&&parts[3]==="read";
}
export function notificationRoute(path:string):boolean{return notificationGetRoute(path)||notificationReadRoute(path);}

export function requestBodyLimit(path:string,method:string){return method==="POST"&&(purchaseCommandRoute(path)||inboundCommandRoute(path)||erpScreenPostRoute(path)||notificationReadRoute(path))?1048576:16384;}
const routes = new Map([
 ...[...purchaseCommandRoutes].map(path=>[path,["POST"]] as [string,string[]]),
 ...[...inboundCommandRoutes].map(path=>[path,["POST"]] as [string,string[]]),
 ...[...erpScreenPostRoutes].map(path=>[path,["POST"]] as [string,string[]]),
 ...[...erpScreenGetRoutes].map(path=>[path,["GET"]] as [string,string[]]),
 ["api/inbound-requests/draft",["GET"]],
 ["api/lookups/branches",["GET"]],
 ["api/purchase-requests",["GET"]],["api/purchase-requests/workspace",["GET"]],["api/purchase-requests/detail",["GET"]],["api/purchase-requests/lookup",["GET"]],
 ["health/live",["GET"]],["health/ready",["GET"]],["api/contracts/openapi.json",["GET"]],["api/auth/csrf",["GET"]],["api/auth/login",["POST"]],["api/auth/session",["GET"]],["api/auth/session/continue",["POST"]],["api/auth/logout",["POST"]],["api/workspace",["GET"]],["api/platform/metadata",["GET"]],["api/documents/field-contract",["GET"]],["api/documents/query-contract",["GET"]],["api/documents/purchase-orders",["GET"]],["api/documents/purchase-orders/detail",["GET"]],["api/documents/inbound-requests",["GET"]],["api/documents/inbound-requests/detail",["GET"]],["api/v2/documents/purchase-orders",["GET"]],["api/v2/documents/purchase-orders/detail",["GET"]],["api/v2/documents/inbound-requests",["GET"]],["api/v2/documents/inbound-requests/detail",["GET"]],["api/v2/purchase-requests",["GET"]],["api/v2/purchase-requests/detail",["GET"]],
]);
export function routeAllowed(path:string,method:string){
 if(method==="GET"&&notificationGetRoute(path))return true;
 if(method==="POST"&&notificationReadRoute(path))return true;
 return routes.get(path)?.includes(method)===true;
}
export function backendOrigin(value:string|undefined){
 if(!value)return null;
 try{const u=new URL(value);if(u.protocol!=="https:"||u.username||u.password||u.pathname!=="/"||u.search||u.hash)return null;const h=u.hostname.toLowerCase();if(h==="localhost"||h.endsWith(".localhost")||h.endsWith(".local")||h.includes(":")||/^\d+(\.\d+)*$/.test(h)||!h.includes("."))return null;const tld=h.split(".").pop()??"";if(/^\d+$/.test(tld)||tld.startsWith("-"))return null;return u.origin;}catch{return null;}
}
export function isCanonicalIpv4(hostname:string):boolean{
 const parts=hostname.split(".");
 if(parts.length!==4)return false;
 for(const part of parts){
  if(!/^(0|[1-9]\d{0,2})$/.test(part))return false;
  const n=Number(part);
  if(n<0||n>255)return false;
 }
 if(hostname==="0.0.0.0"||hostname==="255.255.255.255")return false;
 return true;
}
export function publicOrigin(value:string|undefined){
 if(!value)return null;
 const dns=backendOrigin(value);
 if(dns)return dns;
 try{
  const u=new URL(value);
  if(u.protocol!=="https:"||u.username||u.password||u.pathname!=="/"||u.search||u.hash)return null;
  const rawHost=value.slice("https://".length).split("/")[0].split("?")[0].split("#")[0].split(":")[0];
  if(!isCanonicalIpv4(rawHost)||rawHost!==u.hostname)return null;
  if(u.port){
   const p=Number(u.port);
   if(!Number.isSafeInteger(p)||p<1||p>65535)return null;
  }
  return u.origin;
 }catch{return null;}
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
 return {backend:backendOrigin(configuredOrigin),publicOrigin:publicOrigin(configuredPublicOrigin)};
}
export function erpCookies(value:string|null){return(value??"").split(";").map(s=>s.trim()).filter(s=>/^__Host-Medcom\.(?:Session(?:C\d+)?|Csrf)=/.test(s)).join("; ");}
export function relayCookie(value:string){if(!/^__Host-Medcom\.(?:Session(?:C\d+)?|Csrf)=/.test(value)||/;\s*domain\s*=/i.test(value))return null;if(!/;\s*secure(?:;|$)/i.test(value)||!/;\s*httponly(?:;|$)/i.test(value)||!/;\s*path=\/(?:;|$)/i.test(value))return null;return value;}
export function sameOriginWrite(configuredPublicOrigin:string|undefined,origin:string|null){const expected=publicOrigin(configuredPublicOrigin);return expected!==null&&origin===expected;}
