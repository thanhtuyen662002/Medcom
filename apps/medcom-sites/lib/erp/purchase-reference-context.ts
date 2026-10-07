import {ApiError} from "./api";
import {getPurchaseLookup, type PurchaseLookupPage} from "./purchase-request-api";

/** These are parent evidence, never grants produced by this supplement.
 * Rotate readIdentity for EVERY selection incarnation (including batched A→B→A),
 * session replacement, branch/authority change, or permission loss/recovery. */
export type PurchaseReferenceInput = Readonly<{
 scopeKey: string | null;
 readIdentity: string | null;
 authorityKey: string | null;
 documentId: string | null;
 allowed: boolean;
 presentationAllowed: boolean;
 purposeId: number | null;
 currencyId: string;
}>;
export type PurchaseReferenceKind = "purposes" | "currencies";
export type PurposeReference = Readonly<{id: string; label: string | null}>;
export type CurrencyReference = Readonly<{id: string; label: string; currencyName: string; rateExchange: number}>;
export type ReferenceFailure = "authentication" | "authority" | "scope" | "response" | "connection";
export type ReferenceProgress = Readonly<{pages: number; requests: number; hasMore: boolean; canContinue: boolean; canRetry: boolean}>;
export type PurchaseReferenceState<T> =
 | Readonly<{status: "inactive" | "no-selection"}>
 | Readonly<{status: "loading"; progress: ReferenceProgress}>
 | Readonly<{status: "resolved" | "resolved-null-label"; value: T; progress: ReferenceProgress}>
 | Readonly<{status: "unresolved"; reason: "partial" | "exhausted" | "ambiguous" | "invalid-id" | "page-limit"; progress: ReferenceProgress}>
 | Readonly<{status: "unavailable"; progress: ReferenceProgress}>
 | Readonly<{status: "failed"; failure: ReferenceFailure; progress: ReferenceProgress}>;
export type PurchaseReferenceContext = Readonly<{
 identity: string;
 purpose: PurchaseReferenceState<PurposeReference>;
 currency: PurchaseReferenceState<CurrencyReference>;
}>;
/** At most one automatic request per non-null field. Each click makes ONE GET.
 * Each field admits five successful pages and six total attempts, including retry.
 * A fresh parent identity resets the budget; no cache survives that lifetime. */
export const PURCHASE_REFERENCE_LIMITS = Object.freeze({pages: 5, requests: 6, pageSize: 20, search: 100, apiPage: 1000});
export function purchaseReferenceIdentity(input: PurchaseReferenceInput): string {
 return JSON.stringify([input.scopeKey,input.readIdentity,input.authorityKey,input.documentId,input.allowed,input.presentationAllowed,input.purposeId,input.currencyId]);
}
function authorized(input: PurchaseReferenceInput) {
 return input.allowed && input.presentationAllowed && !!input.documentId && input.documentId.length <= 100
  && !!input.readIdentity && !!input.authorityKey && !!input.scopeKey && /^[a-f0-9]{64}$/.test(input.scopeKey);
}
const emptyProgress: ReferenceProgress = Object.freeze({pages:0,requests:0,hasMore:false,canContinue:false,canRetry:false});
function purposeCandidate(id: number | null): string | null {
 return id === null ? null : Number.isInteger(id) && id >= -2147483648 && id <= 2147483647 ? String(id) : "";
}
function currencyCandidate(id: string): string {
 return typeof id === "string" && id.length > 0 && id.length <= 3 && !/\p{White_Space}$/u.test(id)
  && !/[\p{Cc}\uD800-\uDFFF]/u.test(id) ? id : "";
}
export function initialPurchaseReferenceContext(input: PurchaseReferenceInput): PurchaseReferenceContext {
 const initial = (candidate: string | null): PurchaseReferenceState<never> => !authorized(input) ? {status:"inactive"}
  : candidate === null ? {status:"no-selection"} : candidate === "" ? {status:"unresolved",reason:"invalid-id",progress:emptyProgress}
  : {status:"loading",progress:emptyProgress};
 return {identity:purchaseReferenceIdentity(input),purpose:initial(purposeCandidate(input.purposeId)),currency:initial(currencyCandidate(input.currencyId))};
}
export type PurchaseReferenceController = Readonly<{
 start: () => void;
 continue: (kind: PurchaseReferenceKind) => void;
 retry: (kind: PurchaseReferenceKind) => void;
 dispose: () => void;
 snapshot: () => PurchaseReferenceContext;
}>;
/** Executes only the existing validated GET seam; no injected grant or write transport. */
export function createPurchaseReferenceController(input: PurchaseReferenceInput, notify: (context: PurchaseReferenceContext) => void): PurchaseReferenceController {
 const captured = {...input}, identity = purchaseReferenceIdentity(captured);
 let context = initialPurchaseReferenceContext(captured), disposed = false, started = false;
 type Field = {candidate: string | null; pages: number; requests: number; hasMore: boolean; ambiguous: boolean; seen: Set<string>;
  match?: PurposeReference | CurrencyReference; abort?: AbortController; failed?: ReferenceFailure};
 const fields: Record<PurchaseReferenceKind, Field> = {
  purposes: {candidate:purposeCandidate(captured.purposeId),pages:0,requests:0,hasMore:false,ambiguous:false,seen:new Set()},
  currencies: {candidate:currencyCandidate(captured.currencyId),pages:0,requests:0,hasMore:false,ambiguous:false,seen:new Set()}
 };
 function emit(kind: PurchaseReferenceKind, state: PurchaseReferenceState<PurposeReference | CurrencyReference>) {
  if (disposed) return;
  context = {...context,identity,[kind === "purposes" ? "purpose" : "currency"]:state};
  notify(context);
 }
 function progress(field: Field): ReferenceProgress {
  const room = field.requests < PURCHASE_REFERENCE_LIMITS.requests && field.pages < PURCHASE_REFERENCE_LIMITS.pages && field.pages < PURCHASE_REFERENCE_LIMITS.apiPage;
  return {pages:field.pages,requests:field.requests,hasMore:field.hasMore,canContinue:room && field.hasMore && !field.abort && !field.ambiguous && !field.failed,
   canRetry:room && !!field.failed && !field.abort && ["connection","response"].includes(field.failed)};
 }
 function settle(kind: PurchaseReferenceKind) {
  const f=fields[kind], p=progress(f);
  if(f.ambiguous)emit(kind,{status:"unresolved",reason:"ambiguous",progress:p});
  else if(f.match)emit(kind,{status:kind==="purposes" && f.match.label===null ? "resolved-null-label" : "resolved",value:f.match,progress:p});
  else emit(kind,{status:"unresolved",reason:f.hasMore ? f.pages>=PURCHASE_REFERENCE_LIMITS.pages ? "page-limit" : "partial" : "exhausted",progress:p});
 }
 async function fetchPage(kind: PurchaseReferenceKind) {
  const f=fields[kind];
  if(disposed || !authorized(captured) || !f.candidate || f.candidate.length>100 || f.abort || f.ambiguous
   || f.requests>=PURCHASE_REFERENCE_LIMITS.requests || f.pages>=PURCHASE_REFERENCE_LIMITS.pages) return;
  const page=f.pages+1, abort=new AbortController();f.abort=abort;f.requests++;f.failed=undefined;
  emit(kind,{status:"loading",progress:progress(f)});
  try {
   const reply: PurchaseLookupPage = await getPurchaseLookup(captured.scopeKey!,kind,f.candidate,page,abort.signal);
   if(disposed || abort.signal.aborted) return;
   f.abort=undefined;
   if(!reply.available){f.match=undefined;f.hasMore=false;emit(kind,{status:"unavailable",progress:progress(f)});return;}
   f.pages=page;f.hasMore=reply.hasMore;
   for(const item of reply.items){
    if(f.seen.has(item.id)) f.ambiguous=true;
    f.seen.add(item.id);
    // Exact source identity only: no trim, case folding, label or default match.
    if(item.id===f.candidate) f.match=Object.freeze({...item}) as PurposeReference | CurrencyReference;
   }
   if(f.ambiguous)f.match=undefined;
   settle(kind);
  } catch(error: unknown) {
   if(disposed || abort.signal.aborted) return;
   f.abort=undefined;
   f.failed=error instanceof ApiError ? error.status===401 ? "authentication" : error.status===403 ? "authority"
    : error.status===409 ? "scope" : error.status===502 ? "response" : "connection" : "connection";
   // Failure hides catalog values only. Authoritative document/command state is external.
   emit(kind,{status:"failed",failure:f.failed,progress:progress(f)});
  }
 }
 return {
  snapshot:()=>context,
  start:()=>{if(started || disposed)return;started=true;void fetchPage("purposes");void fetchPage("currencies");},
  continue:kind=>{if(progress(fields[kind]).canContinue)void fetchPage(kind);},
  retry:kind=>{if(progress(fields[kind]).canRetry)void fetchPage(kind);},
  dispose:()=>{disposed=true;context=initialPurchaseReferenceContext({...captured,allowed:false});for(const f of Object.values(fields)){f.abort?.abort();f.seen.clear();f.match=undefined;}}
 };
}
