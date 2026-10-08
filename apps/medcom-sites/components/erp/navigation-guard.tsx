"use client";
import {createContext,useCallback,useContext,useEffect,useLayoutEffect,useRef,useState,type ReactNode} from "react";
import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from "@/components/ui/alert-dialog";
type Blocker={message:string;canDiscard:boolean};
export type NavigationGuardValidationPhase="request"|"accept";
export type NavigationGuardAuthority={lifecycleKey:string;presentationAllowed:boolean};
const Context=createContext<{request:(action:()=>void,validate?:(phase:NavigationGuardValidationPhase)=>boolean)=>void;register:(key:symbol,blocker:Blocker|null)=>void;isBlocked:()=>boolean;cancelPending:()=>void;hasPending:()=>boolean;onPendingCancelled:(listener:()=>void)=>()=>void}>({request:action=>action(),register:()=>{},isBlocked:()=>false,cancelPending:()=>{},hasPending:()=>false,onPendingCancelled:()=>()=>{}});
const summarize=(values:Blocker[]):Blocker=>({message:values.map(value=>value.message).join(" "),canDiscard:values.every(value=>value.canDiscard)});
const standaloneAuthority:NavigationGuardAuthority={lifecycleKey:"standalone",presentationAllowed:true};
export function NavigationGuardProvider({children,authority=standaloneAuthority,getAuthority}:{children:ReactNode;authority?:NavigationGuardAuthority;getAuthority?:()=>NavigationGuardAuthority}){
 const blockers=useRef(new Map<symbol,Blocker>());
 const pending=useRef<{action:()=>void;lifecycleKey:string;validate?:(phase:NavigationGuardValidationPhase)=>boolean}|null>(null);
 const cancellationListeners=useRef(new Set<()=>void>());
 const [warning,setWarning]=useState<(Blocker&{lifecycleKey:string})|null>(null);
 const current=useCallback(()=>getAuthority?.()??authority,[getAuthority,authority]);
 const register=useCallback((key:symbol,value:Blocker|null)=>{
  if(value)blockers.current.set(key,value);else blockers.current.delete(key);
  if(pending.current)setWarning(previous=>previous?{...summarize([...blockers.current.values()]),lifecycleKey:previous.lifecycleKey}:null);
 },[]);
 const isBlocked=useCallback(()=>blockers.current.size>0,[]);
 // Superseding navigation cancels only the queued choice, never editor custody.
 const cancelPending=useCallback(()=>{const cancelled=pending.current!==null;pending.current=null;setWarning(null);if(cancelled)for(const listener of cancellationListeners.current)listener();},[]);
 const hasPending=useCallback(()=>pending.current!==null,[]);
 const onPendingCancelled=useCallback((listener:()=>void)=>{cancellationListeners.current.add(listener);return()=>{cancellationListeners.current.delete(listener);};},[]);
 const request=useCallback((action:()=>void,validate?:(phase:NavigationGuardValidationPhase)=>boolean)=>{
  const state=current();if(!state.presentationAllowed||validate&&!validate("request"))return;
  if(pending.current)cancelPending();
  const values=[...blockers.current.values()];
  if(!values.length){if(!validate||validate("accept"))action();return;}
  pending.current={action,lifecycleKey:state.lifecycleKey,validate};setWarning({...summarize(values),lifecycleKey:state.lifecycleKey});
 },[current,cancelPending]);
 const presentation=authority,validPending=warning?.lifecycleKey===presentation.lifecycleKey;
 // Retire queued navigation only at a real login boundary. Hiding a dialog for
 // an outage is presentation, not Cancel and not approval to run its action.
 useLayoutEffect(()=>{if(pending.current&&pending.current.lifecycleKey!==presentation.lifecycleKey)cancelPending();},[presentation.lifecycleKey,cancelPending]);
 useEffect(()=>{const handler=(event:BeforeUnloadEvent)=>{if(blockers.current.size){event.preventDefault();event.returnValue="";}};window.addEventListener("beforeunload",handler);return()=>window.removeEventListener("beforeunload",handler);},[]);
 const dismiss=()=>{if(!current().presentationAllowed)return;cancelPending();};
 return <Context.Provider value={{request,register,isBlocked,cancelPending,hasPending,onPendingCancelled}}>{children}<AlertDialog open={presentation.presentationAllowed&&validPending&&!!warning} onOpenChange={open=>{if(!open)dismiss();}}><AlertDialogContent hidden={!presentation.presentationAllowed||!validPending} inert={!presentation.presentationAllowed||!validPending} aria-hidden={!presentation.presentationAllowed||!validPending} style={{display:presentation.presentationAllowed&&validPending?undefined:"none"}} className="workspace-navigation-warning" onCloseAutoFocus={event=>{if(!current().presentationAllowed)event.preventDefault();}}><AlertDialogHeader><AlertDialogTitle>Công việc chưa hoàn tất</AlertDialogTitle><AlertDialogDescription>{warning?.message||"Công việc đã được cập nhật. Xác nhận trước khi rời màn hình."}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Tiếp tục làm việc</AlertDialogCancel>{warning?.canDiscard&&<AlertDialogAction onClick={event=>{
  const state=current(),queued=pending.current;
  if(!state.presentationAllowed||queued?.lifecycleKey!==state.lifecycleKey){event.preventDefault();return;}
  if(queued.validate&&!queued.validate("accept")){event.preventDefault();cancelPending();return;}
  const values=[...blockers.current.values()];
  if(values.some(value=>!value.canDiscard)){event.preventDefault();setWarning({...summarize(values),lifecycleKey:state.lifecycleKey});return;}
  pending.current=null;blockers.current.clear();setWarning(null);queued.action();
 }}>Bỏ thay đổi và rời màn hình</AlertDialogAction>}</AlertDialogFooter></AlertDialogContent></AlertDialog></Context.Provider>;
}
export function useNavigationGuard(){return useContext(Context);}
export function useDirtyGuard(active:boolean,canDiscard:boolean){const {register}=useNavigationGuard();const key=useRef(Symbol("document"));useLayoutEffect(()=>{register(key.current,active?{canDiscard,message:canDiscard?"Bạn có thay đổi chưa lưu. Rời màn hình sẽ bỏ các thay đổi này.":"Kết quả thao tác chưa được xác nhận. Hãy kiểm tra kết quả trước khi rời màn hình để tránh gửi trùng."}:null);const current=key.current;return()=>register(current,null);},[active,canDiscard,register]);}
