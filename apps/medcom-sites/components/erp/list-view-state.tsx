"use client";
import {createContext,useCallback,useContext,useLayoutEffect,useMemo,useRef,useState,useSyncExternalStore,type ReactNode,type Dispatch,type SetStateAction} from "react";
import {emptyListControls,type ListControls,type ListScreen,type ListViewStore} from "@/lib/erp/list-view-state";
const Context=createContext<ListViewStore|null>(null);
export function ListViewProvider({store,children}:{store:ListViewStore;children:ReactNode}){return <Context.Provider value={store}>{children}</Context.Provider>;}
const noopSubscribe=()=>()=>{};
const zero=()=>0;
/** Component state remains local. Root owns only a sanitized copy of controls.
 * Purchase defers restoration until its real fresh bootstrap admits it. */
export function useListControls(screen:ListScreen){
 const store=useContext(Context),epoch=useSyncExternalStore(store?.subscribe??noopSubscribe,store?.getEpoch??zero,zero);
 const [owned,setOwned]=useState(()=>({epoch,value:screen==="purchase-requests"?{...emptyListControls}:store?.read(screen,epoch)??{...emptyListControls}}));
 if(owned.epoch!==epoch)setOwned({epoch,value:{...emptyListControls}});
 const value=owned.epoch===epoch?owned.value:emptyListControls;
 const revision=useRef(0),mounted=useRef(false),purchaseRestored=useRef(false),root=useRef<HTMLElement|null>(null),live=useRef({epoch,value});
 const activity=useRef(true);
 const scrollPending=useRef(value.top!==0||value.left!==0||value.windowTop!==0),frame=useRef<number|null>(null);
 useLayoutEffect(()=>{if(live.current.epoch!==epoch){purchaseRestored.current=false;revision.current++;scrollPending.current=false;}live.current={epoch,value};if(screen!=="purchase-requests"||purchaseRestored.current)store?.save(screen,epoch,value);},[store,screen,epoch,value]);
 // The purchase default must not overwrite retained controls before bootstrap.
 // Saving below is suppressed until qualification, including StrictMode cleanup.
 const set:Dispatch<SetStateAction<ListControls>>=useCallback(next=>{
  if(!mounted.current||store&&store.getEpoch()!==epoch)return;
  revision.current++;scrollPending.current=false;
  setOwned(previous=>({epoch,value:typeof next==="function"?next(previous.epoch===epoch?previous.value:emptyListControls):next}));
 },[epoch,store]);
 const setters=useMemo(()=>{
  const update=<K extends keyof ListControls>(name:K):Dispatch<SetStateAction<ListControls[K]>>=>next=>set(previous=>({...previous,[name]:typeof next==="function"?(next as (old:ListControls[K])=>ListControls[K])(previous[name]):next}));
  return {draftSearch:update("draftSearch"),appliedSearch:update("appliedSearch"),draftBranch:update("draftBranch"),appliedBranch:update("appliedBranch"),page:update("page"),top:update("top"),left:update("left"),windowTop:update("windowTop")};
 },[set]);
 const field=<K extends keyof ListControls>(name:K)=>setters[name];
 useLayoutEffect(()=>{
  mounted.current=true;
  return ()=>{mounted.current=false;if(frame.current!==null)cancelAnimationFrame(frame.current);};
 },[]);
 const qualifyPurchase=useCallback((scope:string,branches:readonly string[])=>{
  if(!store||purchaseRestored.current)return false;
  const before=revision.current,ticket=epoch,value=live.current.value;
  const restored=store.qualifyPurchase(ticket,scope,branches);
  purchaseRestored.current=true;
  if(!restored||before!==0||store.getEpoch()!==ticket||!mounted.current)return false;
  scrollPending.current=!!(restored.top||restored.left||restored.windowTop);
  setOwned({epoch:ticket,value:restored});
  return restored.appliedSearch!==value.appliedSearch||restored.appliedBranch!==value.appliedBranch||restored.page!==value.page;
 },[store,epoch]);
 const current=useCallback(()=>activity.current&&mounted.current&&(!store||store.getEpoch()===live.current.epoch),[store]);
 const captureScroll=(element:HTMLElement)=>{
  if(!current())return;
  scrollPending.current=false;
  const grid=element.classList.contains("desktop-grid-viewport");
  if(!grid)return;
  const old=live.current.value,next={...old,top:element.scrollTop,left:element.scrollLeft};live.current.value=next;
  if(screen!=="purchase-requests"||purchaseRestored.current)store?.save(screen,live.current.epoch,next);
  setOwned(previous=>({...previous,value:{...previous.value,top:next.top,left:next.left}}));
 };
 useLayoutEffect(()=>{
  if(typeof window==="undefined")return;
  const cancel=()=>{scrollPending.current=false;if(frame.current!==null)cancelAnimationFrame(frame.current);};
  const scrolled=()=>{if(!current())return;cancel();const next={...live.current.value,windowTop:window.scrollY};live.current.value=next;setOwned(previous=>({...previous,value:{...previous.value,windowTop:next.windowTop}}));if(screen!=="purchase-requests"||purchaseRestored.current)store?.save(screen,live.current.epoch,next);};
  window.addEventListener("scroll",scrolled,{passive:true});window.addEventListener("wheel",cancel,{passive:true});window.addEventListener("touchmove",cancel,{passive:true});
  const key=(event:KeyboardEvent)=>{if(["PageDown","PageUp","Home","End","ArrowDown","ArrowUp"].includes(event.key))cancel();};window.addEventListener("keydown",key);
  return ()=>{window.removeEventListener("scroll",scrolled);window.removeEventListener("wheel",cancel);window.removeEventListener("touchmove",cancel);window.removeEventListener("keydown",key);};
 },[store,screen,current]);
 const restoreScroll=(ready:boolean)=>{
  if(!ready||!scrollPending.current||!current())return;
  const ticket=live.current.epoch,version=revision.current,offsets={...live.current.value};
  frame.current=requestAnimationFrame(()=>{
   frame.current=null;
   if(!current()||live.current.epoch!==ticket||revision.current!==version||!scrollPending.current)return;
   const element=root.current?.querySelector<HTMLElement>(".desktop-grid-viewport");
   if(!element)return;scrollPending.current=false;element.scrollTop=offsets.top;element.scrollLeft=offsets.left;window.scrollTo({top:offsets.windowTop,behavior:"instant"});
  });
 };
 return {value,set,field,attachRoot:(element:HTMLElement|null)=>{root.current=element;},captureScroll,restoreScroll,qualifyPurchase,setActive:(active:boolean)=>{activity.current=active;}};
}
