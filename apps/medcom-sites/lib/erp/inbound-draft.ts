import {z} from "zod";

// Fixed mirror of Medcom.Contracts.Inbound, verified at main
// b283d057615120ad9b3f96abfc1e7259cb725e09 (accepted I15).
// Decimal and domain DateTime values stay strings throughout the UI seam.
export type InboundDraftAction="Create"|"Save"|"SendToWarehouse";
export type InboundDraftOutcome="Observed"|"Committed"|"Replayed"|"InvalidInput"|"Denied"|"NotFound"|"Conflict"|"Rejected"|"UnsupportedCostEdits"|"NumberingUnavailable"|"Unavailable"|"OutcomeUnknown";
export type InboundDraftHeader={documentDate:string;orderNumber:string;invoiceNo:string;departurePoint:string;destinationPoint:string;orderTypeId:string;branchId:string;objectId:string|null;currencyId:string|null;rateExchange:string|null;notes:string|null};
export type InboundDraftDetailUpsert={rowId:string|null;clientLineId:string|null;itemId:string;lotNumberByDocument:string|null;setQuantityByDocument:string|null;barrelQuantityByDocument:string|null;expireDateByDocument:string|null;unitPrice:string|null};
export type InboundDraftCostInput={rowId:string|null;objectId:string;ncc:string|null;memo:string|null;costType:string|null;currencyId:string|null;rateExchange:string|null;sourceAmount:string|null;vatId:string|null;expenseAccountId:string|null;invoiceNo:string|null;invoiceDate:string|null;allocateKind:string|null;notes:string|null};
export type InboundDraftCommand={operationId:string;action:InboundDraftAction;documentId:string|null;expectedStateEqualityToken:string|null;header:InboundDraftHeader|null;detailUpserts:InboundDraftDetailUpsert[]|null;removedDetailIds:string[]|null;costChanges:InboundDraftCostInput[]|null;note:string|null};
export type InboundDraftReceipt={operationId:string;documentId:string;statusId:number;stateEqualityToken:string;auditId:string;committedAtUtc:string};
export type InboundDraftResult={outcome:InboundDraftOutcome;receipt:InboundDraftReceipt|null;code:string|null};
export type InboundDraftView={documentId:string;statusId:number;header:InboundDraftHeader;details:InboundDraftDetailUpsert[];costRowCount:number;stateEqualityToken:string;costEditingSupported:boolean};
export type InboundDraftReadResult={outcome:InboundDraftOutcome;document:InboundDraftView|null};
export type InboundDraftAdapter={
  // Must read the complete current snapshot in the live authenticated scope.
  // Never return a cached pre-command view, a list projection or a partial page.
  // Preserve strings/NULL and honor signal; the editor also fences ignored aborts.
  read:(documentId:string,signal:AbortSignal)=>Promise<InboundDraftReadResult>;
  execute:(command:InboundDraftCommand,signal:AbortSignal)=>Promise<InboundDraftResult>;
  // Only the server's reconciliation path; never implement this with execute.
  reconcile:(originalCommand:InboundDraftCommand,signal:AbortSignal)=>Promise<InboundDraftResult>;
};
// scopeKey is an opaque, non-secret custody identity for tenant/company/database,
// principal and login incarnation. Rotate on logout/relogin/account changes, even
// when returning to the same account. Never use a document/token/permission value.
export type InboundDraftAccess={scopeKey:string|null;canRead:boolean;canSave:boolean;canSend:boolean;available:boolean;maxCommandBytes:number};

export function exactDecimal(value:string|null,precision:number,scale:number){
  if(value===null)return true;
  const match=/^-?(\d+)(?:\.(\d+))?$/.exec(value);
  return !!match && (match[1].replace(/^0+/,"")||"0").length<=precision-scale
    && (match[2]??"").replace(/0+$/,"").length<=scale;
}
function wellFormed(value:string){
  for(let i=0;i<value.length;i++){
    const code=value.charCodeAt(i);
    if(code===0)return false;
    if(code>=0xd800&&code<=0xdbff){const next=value.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))return false;}
    else if(code>=0xdc00&&code<=0xdfff)return false;
  }
  return true;
}
const text=(width:number)=>z.string().max(width).refine(wellFormed);
const ansi=(width:number)=>z.string().min(1).max(width).regex(/^[\x20-\x7e]+$/).refine(wellFormed).refine(value=>value.trim().length>0);
const decimal=(precision:number,scale:number)=>z.string().max(128).nullable().refine(value=>exactDecimal(value,precision,scale));
// SQL datetime wall-clock subset, preserving its exact source spelling. No Date
// object conversion, timezone normalization or automatic date-only projection.
export function sourceTimestamp(value:string|null){
  if(value===null)return true;
  const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,7}))?$/.exec(value);
  if(!m)return false;
  const [year,month,day,hour,minute,second]=m.slice(1,7).map(Number);
  const fraction=(m[7]??"").padEnd(7,"0"), millis=Number(fraction.slice(0,3));
  const days=new Date(Date.UTC(year,month,0)).getUTCDate();
  return year>=1753&&year<=9999&&month>=1&&month<=12&&day>=1&&day<=days
    &&hour<=23&&minute<=59&&second<=59&&fraction.slice(3)==="0000"&&[0,3,7].includes(millis%10);
}
const timestamp=z.string().refine(sourceTimestamp);
const token=z.string().regex(/^[A-F0-9]{64}$/);
const guid=z.string().uuid().refine(value=>!/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(value));
const headerSchema=z.object({documentDate:timestamp,orderNumber:text(50),invoiceNo:text(50),departurePoint:text(100),destinationPoint:text(100),orderTypeId:text(50),branchId:ansi(50),objectId:ansi(50).nullable(),currencyId:ansi(3).nullable(),rateExchange:decimal(28,10),notes:text(500).nullable()}).strict();
const detailSchema=z.object({rowId:ansi(50).nullable(),clientLineId:guid.nullable(),itemId:ansi(50),lotNumberByDocument:text(50).nullable(),setQuantityByDocument:decimal(18,0),barrelQuantityByDocument:decimal(18,0),expireDateByDocument:timestamp.nullable(),unitPrice:decimal(18,0)}).strict();
const outcomes=z.enum(["Observed","Committed","Replayed","InvalidInput","Denied","NotFound","Conflict","Rejected","UnsupportedCostEdits","NumberingUnavailable","Unavailable","OutcomeUnknown"]);
const receiptSchema=z.object({operationId:guid,documentId:ansi(50),statusId:z.number().int(),stateEqualityToken:token,auditId:guid,committedAtUtc:z.string().datetime({offset:true}).refine(value=>Number.isFinite(Date.parse(value)))}).strict();
const viewSchema=z.object({documentId:ansi(50),statusId:z.number().int(),header:headerSchema,details:z.array(detailSchema).max(500),costRowCount:z.number().int().min(0).max(500),stateEqualityToken:token,costEditingSupported:z.literal(false)}).strict().superRefine((view,ctx)=>{
  const keys=new Set<string>();
  for(const row of view.details){if(row.rowId===null||row.clientLineId!==null||keys.has(row.rowId))ctx.addIssue({code:z.ZodIssueCode.custom,message:"Invalid source row identity"});if(row.rowId!==null)keys.add(row.rowId);}
});
const readSchema=z.object({outcome:outcomes,document:viewSchema.nullable()}).strict();
const resultSchema=z.object({outcome:outcomes,receipt:receiptSchema.nullable(),code:z.string().max(100).nullable()}).strict();
export function observedView(value:unknown,documentId:string):InboundDraftView|null{
  const parsed=readSchema.safeParse(value);
  return parsed.success&&parsed.data.outcome==="Observed"&&parsed.data.document?.documentId===documentId ? parsed.data.document : null;
}
export function commandResult(value:unknown,command:InboundDraftCommand,statusBefore:number):InboundDraftResult|null{
  const parsed=resultSchema.safeParse(value);if(!parsed.success||parsed.data.outcome==="Observed")return null;
  const result=parsed.data, success=result.outcome==="Committed"||result.outcome==="Replayed";
  if(!success)return result.receipt===null?result:null;
  const receipt=result.receipt;
  return receipt&&receipt.operationId===command.operationId&&receipt.documentId===command.documentId
    &&receipt.statusId===(command.action==="SendToWarehouse"?2:statusBefore) ? result:null;
}
const headerKeys=Object.keys(headerSchema.shape) as (keyof InboundDraftHeader)[];
const detailKeys=Object.keys(detailSchema.shape) as (keyof InboundDraftDetailUpsert)[];
// Separate server and client identity namespaces; GUID identity is case-insensitive.
export function lineKey(row:InboundDraftDetailUpsert){
  return row.rowId!==null?`row:${row.rowId}`:`client:${row.clientLineId?.toLowerCase()??"missing"}`;
}
function sameDetail(left:InboundDraftDetailUpsert,right:InboundDraftDetailUpsert|undefined){
  return !!right&&detailKeys.every(key=>left[key]===right[key]);
}
export function sameDraft(view:InboundDraftView,header:InboundDraftHeader,details:InboundDraftDetailUpsert[]){
  if(!headerKeys.every(key=>view.header[key]===header[key])||view.details.length!==details.length)return false;
  const rows=new Map(details.map(row=>[lineKey(row),row]));
  return rows.size===details.length&&view.details.every(row=>sameDetail(row,rows.get(lineKey(row))));
}
export function sameSnapshot(left:InboundDraftView,right:InboundDraftView){
  return left.documentId===right.documentId&&left.statusId===right.statusId
    &&left.stateEqualityToken===right.stateEqualityToken&&left.costRowCount===right.costRowCount
    &&left.costEditingSupported===right.costEditingSupported&&sameDraft(left,right.header,right.details);
}
// An equality token is NOT a monotonic version. A different token may mean an old
// cache OR a newer concurrent change; neither proves read-after-write consistency.
// Fail closed at this barrier rather than inventing ordering or resending Save.
export function snapshotAcknowledges(view:InboundDraftView,receipt:InboundDraftReceipt){
  return view.documentId===receipt.documentId&&view.statusId===receipt.statusId
    &&view.stateEqualityToken===receipt.stateEqualityToken;
}
// Only DTO-visible prerequisites. The backend also checks authority, source log
// capacity and other server-owned state; this helper does not promise acceptance.
export function canSend(view:InboundDraftView){return (view.statusId===0||view.statusId===1)&&view.details.length>0&&view.details.every(row=>row.lotNumberByDocument!==null&&row.setQuantityByDocument!==null&&row.barrelQuantityByDocument!==null&&row.expireDateByDocument!==null);}
export function draftErrors(view:InboundDraftView,header:InboundDraftHeader,details:InboundDraftDetailUpsert[],note:string|null){
  const errors:Record<string,string>={};
  const h=headerSchema.safeParse(header);if(!h.success)for(const issue of h.error.issues)errors[`header.${issue.path.join(".")}`]="Giá trị không đúng kiểu hoặc giới hạn ERP.";
  if(header.documentDate!==view.header.documentDate)errors["header.documentDate"]="Ngày chứng từ hiện có được giữ nguyên.";
  if(header.branchId!==view.header.branchId)errors["header.branchId"]="Chi nhánh chứng từ hiện có được giữ nguyên.";
  if(details.length>500)errors.details="Tối đa 500 dòng; không cắt bớt dữ liệu.";
  const keys=new Set<string>(), existing=new Set(view.details.map(row=>row.rowId));
  for(const row of details){
    const key=lineKey(row), parsed=detailSchema.safeParse(row);
    if(!parsed.success)for(const issue of parsed.error.issues)errors[`detail.${key}.${issue.path.join(".")}`]="Giá trị không đúng kiểu hoặc giới hạn ERP.";
    if(keys.has(key)||row.rowId!==null&&(!existing.has(row.rowId)||row.clientLineId!==null)||row.rowId===null&&row.clientLineId===null)errors.details="Danh tính dòng không hợp lệ.";
    keys.add(key);
  }
  if(note!==null&&(note.length>200||!wellFormed(note)))errors.note="Ghi chú gửi tối đa 200 ký tự hợp lệ.";
  return errors;
}
function deepFreeze<T>(value:T):T{
  if(value!==null&&typeof value==="object"){for(const child of Object.values(value))deepFreeze(child);Object.freeze(value);}return value;
}
export function buildCommand(view:InboundDraftView,header:InboundDraftHeader,details:InboundDraftDetailUpsert[],action:"Save"|"SendToWarehouse",note:string|null,operationId:string):InboundDraftCommand{
  if(Object.keys(draftErrors(view,header,details,action==="SendToWarehouse"?note:null)).length||!guid.safeParse(operationId).success||![0,1].includes(view.statusId))throw new Error("invalid_inbound_draft");
  if(action==="SendToWarehouse"&&(!sameDraft(view,header,details)||!canSend(view)))throw new Error("save_or_refresh_before_send");
  const original=new Map(view.details.map(row=>[row.rowId,row]));
  const command:InboundDraftCommand={operationId,action,documentId:view.documentId,expectedStateEqualityToken:view.stateEqualityToken,
    header:action==="Save"?header:null,
    detailUpserts:action==="Save"?details.filter(row=>row.rowId===null||!sameDetail(row,original.get(row.rowId))):[],
    removedDetailIds:action==="Save"?view.details.filter(row=>!details.some(next=>next.rowId===row.rowId)).map(row=>row.rowId!):[],costChanges:[],note:action==="SendToWarehouse"?note:null};
  return deepFreeze(JSON.parse(JSON.stringify(command)) as InboundDraftCommand);
}
export const commandBytes=(command:InboundDraftCommand)=>new TextEncoder().encode(JSON.stringify(command)).byteLength;
export function accessAvailable(access:InboundDraftAccess){return access.available&&Number.isSafeInteger(access.maxCommandBytes)&&access.maxCommandBytes>0&&access.maxCommandBytes<=1048576;}
export const outcomeMessage:Record<InboundDraftOutcome,string>={Observed:"Đã đọc ERP.",Committed:"ERP đã xác nhận thao tác.",Replayed:"ERP đã xác nhận yêu cầu gốc.",InvalidInput:"ERP từ chối dữ liệu. Nội dung vẫn được giữ lại.",Denied:"Quyền thao tác không còn khả dụng.",NotFound:"Chứng từ không còn khả dụng trong phạm vi hiện tại.",Conflict:"Chứng từ đã thay đổi. Đọc lại ERP trước thao tác mới.",Rejected:"ERP từ chối thao tác. Nội dung vẫn được giữ lại.",UnsupportedCostEdits:"Chỉnh sửa chi phí chưa được hỗ trợ.",NumberingUnavailable:"Cấp số hoặc đổi ngày chứng từ chưa được xác nhận.",Unavailable:"Thao tác chưa khả dụng; cần đọc lại ERP.",OutcomeUnknown:"Chưa xác nhận kết quả. Chỉ kiểm tra yêu cầu gốc, không gửi lại."};
