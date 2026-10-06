"use client";
import {useEffect,useRef,useState,type FormEvent,type CSSProperties} from "react";
import {MobileRequest,type MobileRequestAccess} from "./mobile-request";
import {ApiError,errorMessage} from "@/lib/erp/api";
import {getPurchaseWorkspace,getPurchaseDocuments,mobilePurchaseSnapshot,type PurchaseWorkspace,type PurchasePage,type PurchaseReadback} from "@/lib/erp/purchase-request-api";
import type {WorkspaceData} from "@/lib/erp/contracts";
import {workspaceStateScope} from "@/lib/erp/navigation";

const control:CSSProperties={border:"1px solid var(--border)",borderRadius:8,padding:"8px 12px",background:"var(--background)",color:"var(--foreground)"};
const gap:CSSProperties={display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"};
const qualification="Chỉ đọc ERP. Tạo, lưu và gửi chưa được mở: cấp số, nhật ký lệnh và kiểm thử SQL thực tế chưa được xác nhận.";
type ReadState={key:string;observation?:WorkspaceData|null;scopeKey?:string;bootstrap?:PurchaseWorkspace;list?:PurchasePage;detail?:PurchaseReadback;detailError?:unknown;error?:unknown;loading:boolean};

type PurchaseRequestScreenProps={workspace:WorkspaceData|null;loginBoundary:number;onDenied:(error:unknown)=>void;onLogin:()=>void};
export function PurchaseRequestScreen(props:PurchaseRequestScreenProps){
 const boundary=workspaceStateScope(props.workspace,props.loginBoundary);
 return <PurchaseRequestReader key={boundary} {...props} boundary={boundary}/>;
}
function PurchaseRequestReader({workspace,boundary,onDenied,onLogin}:PurchaseRequestScreenProps&{boundary:string}){
 const [searchInput,setSearchInput]=useState(""),[search,setSearch]=useState(""),[branch,setBranch]=useState(""),[page,setPage]=useState(1),[selected,setSelected]=useState<string|null>(null),[refresh,setRefresh]=useState(0);
 const [state,setState]=useState<ReadState>({key:"",loading:false});const generation=useRef(0),serverScope=useRef<string|null>(null);
 const allowed=!!workspace?.session.capabilities.includes("purchase-requests.read")&&!!workspace.branchIds.length;
 const safeBranch=workspace?.branchIds.includes(branch)?branch:"";
 const key=JSON.stringify([boundary,workspace?.session.authorityVersion,workspace?.session.capabilities,workspace?.branchIds,search,safeBranch,page,selected,refresh]);
 useEffect(()=>{
  const current=++generation.current,controller=new AbortController();
  if(!allowed)return ()=>controller.abort();
  void (async()=>{
   const bootstrap=await getPurchaseWorkspace(controller.signal);
   if(controller.signal.aborted||current!==generation.current)return;
   const changedScope=serverScope.current!==null&&serverScope.current!==bootstrap.scopeKey;serverScope.current=bootstrap.scopeKey;
   if(changedScope){setSearchInput("");setSearch("");setBranch("");setPage(1);setSelected(null);setRefresh(value=>value+1);return;}
   if(safeBranch&&!bootstrap.data.branchIds.includes(safeBranch)){setBranch("");setPage(1);setSelected(null);return;}
   const result=await getPurchaseDocuments(bootstrap.scopeKey,bootstrap.data.branchIds,page,search,safeBranch,selected,controller.signal);
   if(controller.signal.aborted||current!==generation.current)return;
   setState({key,observation:workspace,scopeKey:bootstrap.scopeKey,bootstrap:bootstrap.data,...result,loading:false});
  })().catch(error=>{if(controller.signal.aborted||current!==generation.current)return;setState({key,observation:workspace,error,loading:false});onDenied(error);});
  return ()=>controller.abort();
 },[key,allowed,safeBranch,page,search,selected,onDenied,workspace]);
 // Render gating hides old rows synchronously, before effect cleanup on changed authority.
 const active=allowed&&state.key===key&&state.observation===workspace?state:null, busy=!active||active.loading;
 function find(event:FormEvent){event.preventDefault();setSearch(searchInput);setPage(1);setSelected(null);setRefresh(value=>value+1);}
 if(!workspace)return <section><h2>Đề nghị mua hàng</h2><p>Đăng nhập ERP để đọc đề nghị mua hàng.</p><button style={control} onClick={onLogin}>Đăng nhập ERP</button></section>;
 if(!allowed)return <section role="status"><h2>Đề nghị mua hàng</h2><p>Bạn không có quyền đọc đề nghị mua hàng trong phạm vi hiện tại.</p></section>;
 const snapshot=active?.detail?mobilePurchaseSnapshot(active.detail):null;
 const access:MobileRequestAccess={scopeKey:active?.scopeKey??null,canRead:true,canEdit:false,canSaveDraft:false,canSubmit:false,available:false,
  branches:(active?.bootstrap?.branchIds??[]).map(id=>({id,label:id})),currencies:active?.detail?[{id:active.detail.document.header.currencyId,label:active.detail.document.header.currencyId}]:[],
  purposes:active?.detail?.document.header.purposeId!==null&&active?.detail?[{id:String(active.detail.document.header.purposeId),label:String(active.detail.document.header.purposeId)}]:[],
  maxNotesLength:65536,maxPurposeLength:65536,maxLines:100,itemLookupId:"items",objectLookupId:"objects"};
 return <section aria-label="Danh sách đề nghị mua hàng" style={{display:"grid",gap:16}}>
  <h2>Đề nghị mua hàng</h2><p id="purchase-write-qualification" role="status">{qualification}</p>
  <div style={gap}>{["Tạo đề nghị","Lưu nháp","Gửi đề nghị"].map(label=><button key={label} style={control} disabled aria-describedby="purchase-write-qualification">{label}</button>)}</div>
  <form onSubmit={find} style={gap}><label>Tìm mã đề nghị <input style={control} value={searchInput} maxLength={100} onChange={event=>setSearchInput(event.target.value)}/></label>
   <button type="submit" style={control} disabled={busy}>Tìm kiếm</button>
   <label>Chi nhánh <select aria-label="Chi nhánh" style={control} value={safeBranch} disabled={busy} onChange={event=>{setBranch(event.target.value);setPage(1);setSelected(null);}}><option value="">Tất cả chi nhánh được phép</option>{(active?.bootstrap?.branchIds??[]).map(id=><option key={id} value={id}>{id}</option>)}</select></label>
   <button style={control} type="button" disabled={busy} onClick={()=>setRefresh(value=>value+1)}>Làm mới</button>
  </form>
  {busy?<p role="status">Đang đọc ERP…</p>:active.error?<p role="alert">{active.error instanceof ApiError&&active.error.code==="purchase_scope_changed"?"Phiên ERP đã thay đổi. Hãy làm mới dữ liệu.":errorMessage(active.error)}</p>:<>
   <div style={{display:"grid",gap:8}}>{active.list?.rows.map(row=><article key={row.documentId} style={{border:"1px solid var(--border)",padding:12,borderRadius:8}}>
    <strong>{row.documentId}</strong><p>{row.purchaseDate??"Ngày: NULL"} · {row.branchId} · Trạng thái ERP: {row.statusId}</p><p>{row.personSuggest} · {row.department}</p>
    <button style={control} onClick={()=>setSelected(row.documentId)} aria-label={`Mở đề nghị ${row.documentId}`}>Mở đề nghị</button>
   </article>)}{active.list?.rows.length===0&&<p>Không có đề nghị phù hợp trong phạm vi của bạn.</p>}</div>
   <nav aria-label="Phân trang đề nghị" style={gap}><button style={control} disabled={page===1} onClick={()=>{setPage(value=>value-1);setSelected(null);}}>Trang trước</button><span>Trang {page}</span><button style={control} disabled={!active.list?.hasMore||page>=1000} onClick={()=>{setPage(value=>value+1);setSelected(null);}}>Trang sau</button></nav>
   {selected&&<section aria-label={`Chi tiết đề nghị ${selected}`} style={{display:"grid",gap:12}}>
    <div style={gap}><h3>{selected}</h3><button style={control} onClick={()=>setSelected(null)}>Đóng đề nghị</button></div>
    {active.detail?<>
     {snapshot?<MobileRequest key={JSON.stringify([active.scopeKey,active.detail.document.purchaseRequestId,active.detail.stateToken])} initial={snapshot} access={access}/>:<p>Hiển thị toàn bộ dữ liệu ở chế độ chỉ đọc; biểu mẫu di động không hỗ trợ đầy đủ hình dạng phiếu này.</p>}
     <FullPurchaseReadback readback={active.detail}/>
    </>:<p role="alert">{errorMessage(active.detailError)}</p>}
   </section>}
  </>}
 </section>;
}

function value(value:string|number|boolean|null){return value===null?"NULL":typeof value==="boolean"?String(value):value===""?"\"\"":String(value);}
function FullPurchaseReadback({readback}:{readback:PurchaseReadback}){
 const document=readback.document;
 const labels:Record<string,string>={purchaseRequestId:"Mã đề nghị",branchId:"Chi nhánh",statusId:"Trạng thái ERP",isLocked:"Khóa phiếu",purchaseDate:"Ngày giờ đề nghị trên ERP",purposeId:"Mã mục đích",personSuggest:"Người đề nghị",department:"Phòng ban",purposeDescOrClient:"Diễn giải mục đích / khách hàng",price:"Giá trị đề nghị",notes:"Ghi chú",currencyId:"Tiền tệ",objectId:"Mã đối tượng",rateExchange:"Tỷ giá"};
 return <section aria-label="Dữ liệu ERP đầy đủ" style={{overflowX:"auto"}}><h4>Dữ liệu ERP đầy đủ — chỉ đọc</h4>
  <dl>{Object.entries({purchaseRequestId:document.purchaseRequestId,branchId:document.branchId,statusId:document.statusId,isLocked:document.isLocked,...document.header}).map(([field,data])=><div key={field}><dt>{labels[field]}</dt><dd style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{value(data)}</dd></div>)}</dl>
  <p>{document.lines.length} dòng hàng</p>
  <table aria-label="Toàn bộ dòng đề nghị"><thead><tr>{["Mã dòng","Mã mặt hàng","Ngân sách","Thời gian yêu cầu","Số lượng","Đơn giá","Thành tiền","Model"].map(field=><th key={field} scope="col">{field}</th>)}</tr></thead>
   <tbody>{document.lines.map(line=><tr key={line.lineId}>{[line.lineId,line.values.itemId,line.values.budget,line.values.timeRequired,line.values.quantity,line.values.unitPrice,line.values.totalPrice,line.values.model].map((data,index)=><td key={index} style={{whiteSpace:"pre-wrap",padding:8}}>{value(data)}</td>)}</tr>)}</tbody>
  </table>
 </section>;
}
