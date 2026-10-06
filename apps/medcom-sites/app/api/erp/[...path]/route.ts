import {proxyErpRequest} from "@/lib/erp/proxy";

export const dynamic="force-dynamic";
export const runtime="nodejs";

async function proxy(request:Request,context:{params:Promise<{path:string[]}>}){
 const {path}=await context.params;
 return proxyErpRequest(request,path,process.env.MEDCOM_API_ORIGIN,process.env.MEDCOM_PUBLIC_ORIGIN,undefined,process.env.MEDCOM_LOCAL_HTTPS);
}
export const GET=proxy;
export const POST=proxy;
