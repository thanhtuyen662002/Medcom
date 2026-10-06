"use client";
import {createContext,useCallback,useContext,useEffect,useLayoutEffect,useRef,useState,type ReactNode} from "react";
import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from "@/components/ui/alert-dialog";
type Blocker={message:string;canDiscard:boolean};
const Context=createContext<{request:(action:()=>void)=>void;register:(key:symbol,blocker:Blocker|null)=>void;isBlocked:()=>boolean}>({request:action=>action(),register:()=>{},isBlocked:()=>false});
export function NavigationGuardProvider({children}:{children:ReactNode}){
 const blockers=useRef(new Map<symbol,Blocker>());const pending=useRef<(()=>void)|null>(null);const [warning,setWarning]=useState<Blocker|null>(null);
 const register=useCallback((key:symbol,value:Blocker|null)=>{if(value)blockers.current.set(key,value);else blockers.current.delete(key);},[]);
 const isBlocked=useCallback(()=>blockers.current.size>0,[]);
 const request=useCallback((action:()=>void)=>{const values=[...blockers.current.values()];if(!values.length){action();return;}pending.current=action;setWarning({message:values.map(x=>x.message).join(" "),canDiscard:values.every(x=>x.canDiscard)});},[]);
 useEffect(()=>{const handler=(event:BeforeUnloadEvent)=>{if(blockers.current.size){event.preventDefault();event.returnValue="";}};window.addEventListener("beforeunload",handler);return()=>window.removeEventListener("beforeunload",handler);},[]);
 return <Context.Provider value={{request,register,isBlocked}}>{children}<AlertDialog open={!!warning} onOpenChange={open=>{if(!open){pending.current=null;setWarning(null);}}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Công việc chưa hoàn tất</AlertDialogTitle><AlertDialogDescription>{warning?.message}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Tiếp tục làm việc</AlertDialogCancel>{warning?.canDiscard&&<AlertDialogAction onClick={event=>{const values=[...blockers.current.values()];if(values.some(value=>!value.canDiscard)){event.preventDefault();setWarning({message:values.map(value=>value.message).join(" "),canDiscard:false});return;}const action=pending.current;pending.current=null;blockers.current.clear();setWarning(null);action?.();}}>Bỏ thay đổi và rời màn hình</AlertDialogAction>}</AlertDialogFooter></AlertDialogContent></AlertDialog></Context.Provider>;
}
export function useNavigationGuard(){return useContext(Context);}
export function useDirtyGuard(active:boolean,canDiscard:boolean){const {register}=useNavigationGuard();const key=useRef(Symbol("document"));useLayoutEffect(()=>{register(key.current,active?{canDiscard,message:canDiscard?"Bạn có thay đổi chưa lưu. Rời màn hình sẽ bỏ các thay đổi này.":"Kết quả thao tác chưa được xác nhận. Hãy kiểm tra kết quả trước khi rời màn hình để tránh gửi trùng."}:null);const current=key.current;return()=>register(current,null);},[active,canDiscard,register]);}
