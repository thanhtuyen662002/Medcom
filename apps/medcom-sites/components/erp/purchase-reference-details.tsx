"use client";
import {useEffect,useLayoutEffect,useMemo,useRef,useState} from "react";
import {
 createPurchaseReferenceController,initialPurchaseReferenceContext,purchaseReferenceIdentity,PURCHASE_REFERENCE_LIMITS,
 type PurchaseReferenceInput,type PurchaseReferenceContext,type PurchaseReferenceController,type PurchaseReferenceKind,
 type PurchaseReferenceState,type PurposeReference,type CurrencyReference,
} from "@/lib/erp/purchase-reference-context";

export type PurchaseReferenceHook = Readonly<{
 context: PurchaseReferenceContext;
 continueLookup: (kind: PurchaseReferenceKind) => void;
 retryLookup: (kind: PurchaseReferenceKind) => void;
}>;
function decodeIdentity(identity:string): PurchaseReferenceInput {
 const [scopeKey,readIdentity,authorityKey,documentId,allowed,presentationAllowed,purposeId,currencyId]=JSON.parse(identity) as [string|null,string|null,string|null,string|null,boolean,boolean,number|null,string];
 return {scopeKey,readIdentity,authorityKey,documentId,allowed,presentationAllowed,purposeId,currencyId};
}
export function usePurchaseReferenceContext(input: PurchaseReferenceInput): PurchaseReferenceHook {
 const identity=purchaseReferenceIdentity(input);
 const initial=useMemo(()=>initialPurchaseReferenceContext(decodeIdentity(identity)),[identity]);
 const [state,setState]=useState<PurchaseReferenceContext>(initial);
 if(state.identity!==identity)setState(initial);
 const controller=useRef<{identity:string;value:PurchaseReferenceController}|null>(null);
 // Use scalar identity, not object reference churn. Layout cleanup retires the old
 // lifetime at commit, before a new lifetime can publish. Render also masks old state.
 useLayoutEffect(()=>{
  const value=createPurchaseReferenceController(decodeIdentity(identity),setState);
  controller.current={identity,value};value.start();
  return ()=>{value.dispose();if(controller.current?.value===value)controller.current=null;};
 },[identity]);
 function act(kind: PurchaseReferenceKind, action:"continue"|"retry"){
  if(controller.current?.identity===identity)controller.current.value[action](kind);
 }
 return {context:state.identity===identity?state:initial,
  continueLookup:kind=>act(kind,"continue"),retryLookup:kind=>act(kind,"retry")};
}
export type PurchaseReferenceDetailsProps = PurchaseReferenceInput & Readonly<{
 /** Stored readback value displayed separately, never substituted by catalog rate. */
 documentRateExchange: number;
 onContextChange?: (context: PurchaseReferenceContext) => void;
}>;
function sourceText(label:string|null) {
 return label===null ? "Nguồn ERP không có tên (NULL)." : label==="" ? "Tên nguồn ERP là chuỗi rỗng." : label;
}
const messages = {
 partial:"Chưa xác định: còn trang kết quả chưa đọc.",
 exhausted:"Không tìm thấy ID chính xác trong toàn bộ kết quả tìm kiếm này.",
 ambiguous:"Chưa xác định: kết quả có ID lặp hoặc không rõ ràng. Cần xác minh lại nguồn.",
 "invalid-id":"Không thể tra cứu ID này; cần đọc lại chứng từ hợp lệ.",
 "page-limit":"Chưa xác định: đã đạt giới hạn trang; vẫn còn kết quả chưa đọc.",
};
export function PurchaseReferenceDetails(props: PurchaseReferenceDetailsProps) {
 const {context,continueLookup,retryLookup}=usePurchaseReferenceContext(props);
 const {onContextChange}=props;
 useEffect(()=>{onContextChange?.(context);},[context,onContextChange]);
 const active=context.purpose.status!=="inactive" || context.currency.status!=="inactive";
 if(!active)return null;
 function details(kind:PurchaseReferenceKind,state:PurchaseReferenceState<PurposeReference|CurrencyReference>){
  return <div style={{minWidth:0,border:"1px solid var(--border, #bbb)",borderRadius:8,padding:12}}>
   <h4>{kind==="purposes"?"Mục đích — tham chiếu nguồn ERP":"Tiền tệ — tham chiếu nguồn ERP"}</h4>
   <p>ID trên chứng từ: <span style={{whiteSpace:"pre-wrap"}}>{kind==="purposes"?props.purposeId===null?"NULL":String(props.purposeId):props.currencyId}</span></p>
   <div role="status" aria-live="polite">
    {state.status==="no-selection"&&<p>Chứng từ không chọn mục đích.</p>}
    {state.status==="loading"&&<p>Đang đọc tham chiếu ERP…</p>}
    {(state.status==="resolved"||state.status==="resolved-null-label")&&<>
     <p>Đã khớp ID chính xác: <span style={{whiteSpace:"pre-wrap"}}>{state.value.id}</span></p>
     <p style={{whiteSpace:"pre-wrap"}}>{sourceText("currencyName" in state.value?state.value.currencyName:state.value.label)}</p>
     {"rateExchange" in state.value&&<p>Tỷ giá tham chiếu danh mục hiện tại: {String(state.value.rateExchange)}</p>}
    </>}
    {state.status==="unresolved"&&<p>{messages[state.reason]}</p>}
    {state.status==="unavailable"&&<p>Tham chiếu nguồn ERP chưa khả dụng. Có thể đọc lại chứng từ để xác minh nguồn.</p>}
    {state.status==="failed"&&<p>{["authentication","authority","scope"].includes(state.failure)
     ?"Cần xác minh lại phiên hoặc phạm vi truy cập qua màn hình chính."
     :"Không đọc được tham chiếu. Thông tin chứng từ vẫn độc lập với lần tra cứu này."}</p>}
   </div>
   {kind==="currencies"&&<p>Tỷ giá lưu trên chứng từ: {String(props.documentRateExchange)}</p>}
   {"progress" in state&&<><p>Đã đọc {state.progress.pages}/{PURCHASE_REFERENCE_LIMITS.pages} trang; {state.progress.requests}/{PURCHASE_REFERENCE_LIMITS.requests} yêu cầu.</p>
    {state.progress.canContinue&&<button type="button" onClick={()=>continueLookup(kind)}>Đọc thêm một trang {kind==="purposes"?"mục đích":"tiền tệ"}</button>}
    {state.progress.canRetry&&<button type="button" onClick={()=>retryLookup(kind)}>Thử lại tham chiếu {kind==="purposes"?"mục đích":"tiền tệ"}</button>}
    {state.status==="failed"&&!state.progress.canRetry&&!["authentication","authority","scope"].includes(state.failure)&&<p>Đã hết ngân sách tra cứu; cần đọc lại chứng từ để bắt đầu lần xác minh mới.</p>}
   </>}
  </div>;
 }
 return <section aria-label="Tham chiếu mua hàng chỉ đọc" style={{minWidth:0,maxWidth:"100%",overflowWrap:"anywhere"}}>
  <h3>Tham chiếu mua hàng chỉ đọc</h3>
  <p>Tham chiếu từ danh mục ERP hiện tại khi nguồn được xác minh; không chứng minh giá trị tại thời điểm lập phiếu. Tỷ giá danh mục không thay thế tỷ giá lưu trên chứng từ.</p>
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(min(100%, 280px), 1fr))",gap:12,minWidth:0}}>
   {details("purposes",context.purpose)}{details("currencies",context.currency)}
  </div>
 </section>;
}
