"use client";

import {useLayoutEffect,useMemo,useState} from "react";
import {toast} from "sonner";

type NoticeKind="saved"|"submitted"|"sentToWarehouse"|"rejected"|"conflict";
type NoticeId=string|number;
export type RequestNotificationSink={
 success:(message:string,options:{duration:number})=>NoticeId;
 error:(message:string,options:{duration:number})=>NoticeId;
 warning:(message:string,options:{duration:number})=>NoticeId;
 dismiss:(id:NoticeId)=>unknown;
};
const notices:Record<NoticeKind,{tone:"success"|"error"|"warning";message:string}>={
 saved:{tone:"success",message:"ERP đã xác nhận lưu thay đổi."},
 submitted:{tone:"success",message:"ERP đã xác nhận gửi đề nghị mua hàng."},
 sentToWarehouse:{tone:"success",message:"ERP đã xác nhận gửi yêu cầu nhập kho."},
 rejected:{tone:"error",message:"Chưa thể hoàn tất thao tác. Kiểm tra thông tin trên phiếu."},
 conflict:{tone:"warning",message:"Phiếu đã thay đổi trên ERP. Kiểm tra trước khi thao tác lại."},
};
const defaultSink:RequestNotificationSink={
 success:(message,options)=>toast.success(message,options),
 error:(message,options)=>toast.error(message,options),
 warning:(message,options)=>toast.warning(message,options),
 dismiss:id=>toast.dismiss(id),
};

/** Memory-only, component-lifetime ledger. Never sends requests or stores data.
 * Call notify only AFTER the command owner's existing receipt/outcome validation.
 * A toast failure must never alter command state or turn an ACK into an error. */
export function createRequestNotifications(sink:RequestNotificationSink=defaultSink){
 let scope:string|null=null,enabled=false,alive=false;
 const seen=new Set<string>(),visible=new Set<NoticeId>();
 function dismiss(){for(const id of visible){try{sink.dismiss(id);}catch{}}visible.clear();}
 return {
  configure(nextScope:string|null,canRead:boolean){
   if(scope!==nextScope){dismiss();seen.clear();}
   scope=nextScope;alive=true;enabled=canRead&&scope!==null;
   if(!enabled)dismiss();
  },
  notify(expectedScope:string|null,operationId:string,kind:NoticeKind){
   if(!alive||!enabled||expectedScope===null||scope!==expectedScope||!operationId||operationId.length>200)return;
   const key=JSON.stringify([kind,operationId]);if(seen.has(key))return;
   seen.add(key);const notice=notices[kind];
   try{visible.add(sink[notice.tone](notice.message,{duration:notice.tone==="success"?3500:6000}));}catch{}
  },
  retire(){alive=false;enabled=false;scope=null;dismiss();seen.clear();},
 };
}

export function useRequestNotifications(scopeKey:string|null,canRead:boolean){
 const [notifier]=useState(()=>createRequestNotifications());
 useLayoutEffect(()=>{notifier.configure(scopeKey,canRead);},[notifier,scopeKey,canRead]);
 useLayoutEffect(()=>()=>notifier.retire(),[notifier]);
 // Old async handlers carry their original scope; a new scope cannot authorize them.
 return useMemo(()=>(operationId:string,kind:NoticeKind)=>notifier.notify(scopeKey,operationId,kind),[notifier,scopeKey]);
}
