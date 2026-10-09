"use client";
import {ItemIdentity} from "./item-identity";
import {pagedItemDisplayBinding} from "@/lib/erp/item-display";
import {Fragment,useCallback,useEffect,useLayoutEffect,useEffectEvent,useId,useRef,useState,useSyncExternalStore,type CSSProperties} from "react";
import Image from "next/image";
import {LayoutDashboard,ShoppingBag,Package,ArrowLeftRight,FileText,SlidersHorizontal,Search,ChevronRight,ChevronLeft,RefreshCw,LockKeyhole,LogOut,ShieldCheck,Star,Clock3,WifiOff,Check,Sun,Moon,BookOpen,CheckCircle2,Rows3,Menu,X} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Badge} from "@/components/ui/badge";
import {Sidebar,SidebarProvider,SidebarHeader,SidebarContent,SidebarGroup,SidebarGroupLabel,SidebarMenu,SidebarMenuItem,SidebarMenuButton,SidebarFooter,SidebarInset,SidebarTrigger,useSidebar} from "@/components/ui/sidebar";
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from "@/components/ui/dialog";
import {Command,CommandInput,CommandList,CommandEmpty,CommandGroup,CommandItem} from "@/components/ui/command";
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuItem,DropdownMenuLabel,DropdownMenuSeparator} from "@/components/ui/dropdown-menu";
import {Table,TableHeader,TableHead,TableBody,TableRow,TableCell} from "@/components/ui/table";
import {RequestEmpty,RequestStatus,RequestButton} from "./request-presentation";
import {ListLoading} from "./list-loading";
import {Switch} from "@/components/ui/switch";
import {toast} from "sonner";
import {Toaster} from "@/components/ui/sonner";
import {createListViewStore} from "@/lib/erp/list-view-state";
import {ListViewProvider} from "./list-view-state";
import {ScreenHeader} from "./screen-shell";
import {RequestHelp} from "./request-help";
import {RecordDialog,RecordSection,RecordDetailToolbar,RecordDetailStatus} from "./record-dialog";
import {WorkspaceSearch,useScreenFinderShortcut} from "./workspace-search";
import {QueryClient,QueryClientProvider,useQueryClient,useQuery} from "@tanstack/react-query";
import {Documents,type DocumentReadState} from "./documents";
import {InboundRequestScreen} from "./inbound-request-screen";
import {PurchaseRequestScreen} from "./purchase-request-screen";
import type {RequestDetailNavigation,RegisterRequestDetailNavigation} from "./request-detail-dialog";
import {ConfiguredDocumentSheet} from "./configured-screen";
import {ReportWorkspace} from "./reports";
import {RoleNavigationEditor} from "./role-navigation-editor";
import type {WorkspaceExtensions} from "@/lib/erp/extensions";
import {NavigationGuardProvider,useNavigationGuard} from "./navigation-guard";
import {WorkspaceAuthGate,protectedPresentationProps} from "./workspace-auth-gate";
import {deriveWorkspaceAuthState,resolveWorkspaceReturnTarget,type WorkspaceAuthInputs,type WorkspaceAuthState} from "@/lib/erp/workspace-auth-state";
import {Connectivity,SessionWarning,ErrorPanel} from "./feedback";
import {screens,transferStages,isScreen,type ScreenId} from "@/lib/erp/catalog";
import {authorizedScreenIds,mobileQuickScreenIds,workspaceReadViewScope,AuthorityFence} from "@/lib/erp/navigation";
import {ApiError,errorMessage,getWorkspace,getDocuments,getDetail,getHealth,logout,continueSession} from "@/lib/erp/api";
import type {WorkspaceData,DocumentKind,DocumentRow} from "@/lib/erp/contracts";
const icons:Record<ScreenId,typeof FileText>={home:LayoutDashboard,"purchase-orders":ShoppingBag,"purchase-requests":FileText,"purchase-approval":CheckCircle2,"inbound-requests":Package,transfers:ArrowLeftRight,sales:FileText,accounting:BookOpen,reports:Rows3,settings:SlidersHorizontal};
const paletteOptions = [
 {id:"monochrome",name:"Đen & trắng",swatch:"#171717"},
 {id:"blue",name:"Xanh dương",swatch:"#1d4ed8"},
 {id:"violet",name:"Tím",swatch:"#6d28d9"},
 {id:"teal",name:"Xanh ngọc",swatch:"#0f766e"},
 {id:"rose",name:"Hồng",swatch:"#be185d"},
 {id:"orange",name:"Cam",swatch:"#c2410c"},
] as const;
type PaletteId = typeof paletteOptions[number]["id"];
type InitialPreferences = {ready:boolean;screen:ScreenId;compact:boolean;dark:boolean;palette:PaletteId;favorites:ScreenId[]};
const defaultPreferences:InitialPreferences={ready:false,screen:"purchase-orders",compact:false,dark:false,palette:"monochrome",favorites:[]};
const noPreferenceSubscription=()=>()=>{};
const serverPreferences=()=>defaultPreferences;
function createPreferenceSnapshot(){let snapshot:InitialPreferences|undefined;return ()=>{if(snapshot)return snapshot;const initial=new URLSearchParams(window.location.search).get("screen");snapshot={...defaultPreferences,ready:true,screen:isScreen(initial)?initial:"purchase-orders"};try{const pref=JSON.parse(localStorage.getItem("medcom.preferences.v1")??"{}");snapshot.compact=pref?.compact===true;snapshot.dark=pref?.dark===true;if(paletteOptions.some(p=>p.id===pref?.palette))snapshot.palette=pref.palette;if(Array.isArray(pref?.favorites))snapshot.favorites=pref.favorites.filter((id:unknown):id is ScreenId=>typeof id==="string"&&isScreen(id));}catch{}return snapshot;};}
const date=(value:string)=>new Intl.DateTimeFormat("vi-VN",{day:"2-digit",month:"2-digit",year:"numeric",timeZone:"UTC"}).format(new Date(value+"T00:00:00Z"));
const time=(value:string)=>new Intl.DateTimeFormat("vi-VN",{hour:"2-digit",minute:"2-digit"}).format(new Date(value));
function UserInitials({name}:{name?:string}){return <span className="user-initials">{name?name.trim().split(/\s+/).slice(-2).map(p=>p[0]).join("").toUpperCase():<LockKeyhole size={16}/>}</span>;}
function Notice({title,text,action}:{title:string;text:string;action?:React.ReactNode}){return <RequestEmpty title={title}>{text}{action}</RequestEmpty>;}
type RequestHistoryView={screen:ScreenId;lifecycleKey:string;hostKey:string|null;selectedId:string|null};
type RequestHistoryIntent=RequestHistoryView&{index:number;revision:number;selectionAccepted:boolean};
type RequestHistoryHost={key:string;screen:ScreenId;lifecycleKey:string;navigation:RequestDetailNavigation|null;selectedId:string|null};
type AuthController={state:WorkspaceAuthState;read:()=>WorkspaceAuthInputs;publish:(update:(previous:WorkspaceAuthInputs)=>WorkspaceAuthInputs)=>void};
export default function Workspace({extensions}: {extensions?:WorkspaceExtensions}){
 const [client]=useState(()=>new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0},mutations:{retry:false}}}));
 const [inputs,setInputs]=useState<WorkspaceAuthInputs>({lifecycleKey:"bootstrap",session:"unresolved",hasAuthenticatedProof:false,authority:"verifying",proofLifecycleKey:null,signOutPending:false});
 const inputsRef=useRef(inputs);
 const readAuth=useCallback(()=>inputsRef.current,[]);
 const readGuard=useCallback(()=>deriveWorkspaceAuthState(inputsRef.current),[]);
 const publish=useCallback((update:(previous:WorkspaceAuthInputs)=>WorkspaceAuthInputs)=>{const next=update(inputsRef.current);inputsRef.current=next;setInputs(next);},[]);
 const state=deriveWorkspaceAuthState(inputs);
 return <QueryClientProvider client={client}><NavigationGuardProvider authority={state} getAuthority={readGuard}><SidebarProvider className="workspace-auth-layout"><WorkspaceContent extensions={extensions} auth={{state,read:readAuth,publish}}/></SidebarProvider></NavigationGuardProvider></QueryClientProvider>;
}
function WorkspaceContent({extensions,auth}:{extensions?:WorkspaceExtensions;auth:AuthController}){
 const {state:authState,read:readAuth,publish:publishAuth}=auth;
 const presentationAllowed=authState.presentationAllowed;
 const presentationCurrent=useCallback(()=>deriveWorkspaceAuthState(readAuth()).presentationAllowed,[readAuth]);
 const [listViews]=useState(createListViewStore);
 const [guideOpen,setGuideOpen]=useState(false);
 const finderShortcut=useScreenFinderShortcut();
 const queryClient=useQueryClient();const {request:guardNavigation,isBlocked:isNavigationBlocked,cancelPending:cancelPendingNavigation,hasPending:hasPendingNavigation,onPendingCancelled}=useNavigationGuard();
 const {isMobile,setOpenMobile}=useSidebar();const authorityFence=useRef(new AuthorityFence());const mounted=useRef(false);
 const [preferenceSnapshot]=useState(createPreferenceSnapshot);const initial=useSyncExternalStore(noPreferenceSubscription,preferenceSnapshot,serverPreferences);const [screenOverride,setScreen]=useState<ScreenId|null>(null);const screen=screenOverride??initial.screen;const [workspace,updateWorkspace]=useState<WorkspaceData|null>(null);
 const [sessionError,updateSessionError]=useState<unknown>(null);const [sessionBusy,setSessionBusy]=useState(true);const [accountOpen,setAccountOpen]=useState(false);const [commandOpen,setCommandVisible]=useState(false);
 const detailHost=useRef<RequestHistoryHost|null>(null);
 const commandOpener=useRef<HTMLElement|null>(null),commandInput=useRef<HTMLInputElement>(null),commandNavigated=useRef(false);
 const setCommandOpen=useCallback((open:boolean)=>{if(open&&(!presentationCurrent()||detailHost.current?.selectedId!=null))return;if(open)commandNavigated.current=false;if(open&&document.activeElement instanceof HTMLElement&&!document.activeElement.closest(".command-modal"))commandOpener.current=document.activeElement;setCommandVisible(open);},[presentationCurrent]);
 const knownSessionLimit=useRef<number|null>(null);
 const ownedHistory=useRef<{owner:string;index:number;href:string}|null>(null);
 const authorizedRef=useRef<ScreenId[]>([]),admittedLifecycle=useRef<string|null>(null),returnTarget=useRef<ScreenId>(initial.screen);
 const mayNavigate=useCallback((id:ScreenId)=>presentationCurrent()&&authorizedRef.current.includes(id),[presentationCurrent]);
 const [loginBoundary,updateLoginBoundary]=useState(0);
 const [authorityChecking,setAuthorityChecking]=useState(true);
 const [readBlocked,updateReadBlocked]=useState(true),[readGeneration,setReadGeneration]=useState(0),[readViewScope,setReadViewScope]=useState("unverified");
 const readBlockedRef=useRef(true),publishedReadScope=useRef<string|null>(null);
 const setReadBlocked=useCallback((value:boolean)=>{readBlockedRef.current=value;updateReadBlocked(value);},[]);
 const serverSessionScope=useRef<string|null>(null),serverPrincipalScope=useRef<string|null>(null),serverReadScope=useRef<string|null>(null),recheckBlockedScope=useRef<string|null>(null),signOutPending=useRef(false);
 const suspendReads=useCallback(()=>{publishAuth(previous=>({...previous,authority:"verifying",proofLifecycleKey:null}));setReadBlocked(true);void queryClient.cancelQueries({predicate:q=>q.queryKey[0]==="erp-documents"||q.queryKey[0]==="workspace-detail"});},[queryClient,setReadBlocked,publishAuth]);
 // This memory-only identity belongs to authentication, never document/rights,
 // expiry, credentials or the last retained draft. Bootstrap creates it only
 // after a current authenticated workspace response; explicit login rotates it.
 const loginLifecycle=useRef<{key:string|null;retired:boolean}>({key:null,retired:false});
 const [inboundLoginKey,setInboundLoginKey]=useState<string|null>(null);
 const [sessionRetired,setSessionRetired]=useState(false);
 const setWorkspace=useCallback((value:WorkspaceData|null,background=false)=>{
  if(value!==null){
   if(loginLifecycle.current.retired)return;
   if(Math.min(Date.parse(value.session.idleExpiresAt),Date.parse(value.session.absoluteExpiresAt))<=Date.now())throw new ApiError(401,"session_expired");
   const principalScope=JSON.stringify([value.session.tenantId,value.session.companyId]);
   if(serverSessionScope.current!==null&&(serverSessionScope.current!==value.sessionScope||serverPrincipalScope.current!==principalScope)){
    knownSessionLimit.current=null;queryClient.clear();admittedLifecycle.current=null;
    const key=crypto.randomUUID();loginLifecycle.current={key,retired:false};setInboundLoginKey(key);updateLoginBoundary(boundary=>boundary+1);
   }
   if(serverReadScope.current!==null&&serverReadScope.current!==value.readScope){
    queryClient.removeQueries({predicate:q=>q.queryKey[0]==="erp-documents"||q.queryKey[0]==="workspace-detail"});
   }
   serverSessionScope.current=value.sessionScope??null;serverPrincipalScope.current=principalScope;serverReadScope.current=value.readScope??null;
   knownSessionLimit.current=Math.min(Date.parse(value.session.idleExpiresAt),Date.parse(value.session.absoluteExpiresAt));
   if(loginLifecycle.current.key===null){const key=crypto.randomUUID();loginLifecycle.current.key=key;setInboundLoginKey(key);}
   const scope=workspaceReadViewScope(value);
   const replaceReadData=!background||readBlockedRef.current||publishedReadScope.current!==scope;
   publishedReadScope.current=scope;setReadViewScope(scope);
   if(replaceReadData)setReadGeneration(generation=>generation+1);
   else void queryClient.invalidateQueries({predicate:q=>q.queryKey[0]==="erp-documents"||q.queryKey[0]==="workspace-detail"});
   const blocked=document.visibilityState!=="visible"||recheckBlockedScope.current===value.readScope;
   setReadBlocked(blocked);recheckBlockedScope.current=null;
   const key=loginLifecycle.current.key!;
   listViews.admit(JSON.stringify([key,scope]));
   authorizedRef.current=authorizedScreenIds(value);
   publishAuth(()=>({lifecycleKey:key,session:"live",hasAuthenticatedProof:true,authority:blocked?"unavailable":"verified",proofLifecycleKey:blocked?null:key,signOutPending:false}));
   // Resolve only the first proven route of a login. Later rights loss masks the
   // current host instead of unmounting unresolved editor/command custody.
   if(!blocked&&admittedLifecycle.current!==key){
    const requested=returnTarget.current;
    const target=resolveWorkspaceReturnTarget(requested,authorizedRef.current,deriveWorkspaceAuthState(readAuth()));
    if(target){setScreen(target);returnTarget.current=target;const current=ownedHistory.current,url=new URL(current?.href??location.href);url.searchParams.set("screen",target);if(current)current.href=url.href;
     // A login proof can arrive between popstate and its restoration. Rewrite
     // only our accepted entry, never the browser's temporarily visited target.
     const entry=history.state?.medcomWorkspace;if(!current||entry?.owner===current.owner&&entry.index===current.index)history.replaceState(history.state,"",url);
    }
    admittedLifecycle.current=key;
   }
  }else{if(signOutPending.current)listViews.retire();setReadBlocked(true);authorizedRef.current=[];publishAuth(previous=>({...previous,authority:"unavailable",proofLifecycleKey:null}));}
  updateWorkspace(value);
 },[queryClient,setReadBlocked,publishAuth,readAuth,listViews]);
 const setSessionError=useCallback((error:unknown)=>{
  if(error instanceof ApiError&&error.status===401){
   listViews.retire();
   const previous=readAuth();
   if(!loginLifecycle.current.retired)publishAuth(()=>({lifecycleKey:crypto.randomUUID(),session:previous.hasAuthenticatedProof||previous.session==="expired"?"expired":"anonymous",hasAuthenticatedProof:false,authority:"unavailable",proofLifecycleKey:null,signOutPending:false}));
   loginLifecycle.current.retired=true;loginLifecycle.current.key=null;signOutPending.current=false;authorizedRef.current=[];setInboundLoginKey(null);setSessionRetired(true);setReadViewScope("retired");setReadBlocked(true);serverSessionScope.current=null;serverPrincipalScope.current=null;
  }
  // Positive retirement is sticky until a successful explicit login.
  if(!loginLifecycle.current.retired||error instanceof ApiError&&error.status===401)updateSessionError(error);
 },[setReadBlocked,publishAuth,readAuth,listViews]);
 const setLoginBoundary=useCallback((update:(value:number)=>number)=>{
  listViews.retire();setGuideOpen(false);
  const key=crypto.randomUUID();loginLifecycle.current={key,retired:false};serverSessionScope.current=null;serverPrincipalScope.current=null;signOutPending.current=false;admittedLifecycle.current=null;authorizedRef.current=[];
  publishAuth(()=>({lifecycleKey:key,session:"unresolved",hasAuthenticatedProof:false,authority:"verifying",proofLifecycleKey:null,signOutPending:false}));
  setReadViewScope(key);setReadBlocked(true);setInboundLoginKey(key);setSessionRetired(false);updateSessionError(null);updateLoginBoundary(update);
 },[setReadBlocked,publishAuth,listViews]);
 const [favoriteOverride,setFavorites]=useState<ScreenId[]|null>(null);const favorites=favoriteOverride??initial.favorites;const [compactOverride,setCompact]=useState<boolean|null>(null);const compact=compactOverride??initial.compact;const [darkOverride,setDark]=useState<boolean|null>(null);const dark=darkOverride??initial.dark;const [paletteOverride,setPalette]=useState<PaletteId|null>(null);const palette=paletteOverride??initial.palette;const preferencesReady=initial.ready;const [lastVisit,setLastVisit]=useState<ScreenId[]>([]);
 const [health,setHealth]=useState<Awaited<ReturnType<typeof getHealth>>|null>(null);const [healthError,setHealthError]=useState<unknown>(null);const [checking,setChecking]=useState(true);const [checkedAt,setCheckedAt]=useState<string|null>(null);
 const loadWorkspace=useCallback((signal?:AbortSignal)=>{if(!mounted.current||signOutPending.current)return Promise.resolve();suspendReads();setAuthorityChecking(true);const fence=authorityFence.current;const generation=fence.begin();return getWorkspace(signal).then(w=>{if(signal?.aborted||!fence.isCurrent(generation))return;setWorkspace(w);setSessionError(null);}).catch(e=>{if(signal?.aborted||!fence.isCurrent(generation))return;setWorkspace(null);setSessionError(e);}).finally(()=>{if(!signal?.aborted&&fence.isCurrent(generation)){setSessionBusy(false);setAuthorityChecking(false);}});},[setWorkspace,setSessionError,suspendReads]);
 // Purchase recovery must reuse the parent authority fence/state so normal polling
 // and idle/absolute expiry lifecycle resume after a successful verification.
 const verifyWorkspace=useCallback(()=>{setSessionBusy(true);return loadWorkspace();},[loadWorkspace]);
 const healthRequest=useRef<AbortController|null>(null);
 const checkHealth=useCallback(()=>{healthRequest.current?.abort();const controller=new AbortController();healthRequest.current=controller;return getHealth(controller.signal).then(result=>{if(controller.signal.aborted)return;setHealth(result);setHealthError(null);}).catch(e=>{if(controller.signal.aborted)return;setHealth(null);setHealthError(e);}).finally(()=>{if(!controller.signal.aborted){setCheckedAt(new Date().toISOString());setChecking(false);}});},[]);
 // Workspace alone serializes owner/index. Protected selections stay in this
 // bounded, login- and mounted-host-scoped memory, never URL/history/storage.
 const historyViews=useRef(new Map<number,RequestHistoryView>()),historyLifecycle=useRef<string|null>(null);
 const navigationRevision=useRef(0);
 const traversal=useRef<{phase:"restore"|"apply";intent:RequestHistoryIntent|null;ignoredIndex?:number}|null>(null);
 const requestedDetail=useRef<RequestHistoryIntent|null>(null),afterTraversal=useRef<(()=>void)|null>(null);
 const restoreFrame=useRef<number|null>(null);
 useLayoutEffect(()=>onPendingCancelled(()=>{requestedDetail.current=null;}),[onPendingCancelled]);
 const commitScreen=useCallback((id:ScreenId)=>{setGuideOpen(false);commandNavigated.current=true;setOpenMobile(false);setScreen(id);returnTarget.current=id;setCommandOpen(false);setLastVisit(old=>[id,...old.filter(x=>x!==id)].slice(0,5));},[setOpenMobile,setCommandOpen]);
 const syncHistoryLifecycle=useCallback(()=>{
  const lifecycle=readAuth().lifecycleKey;if(historyLifecycle.current===lifecycle)return;
  historyLifecycle.current=lifecycle;navigationRevision.current++;requestedDetail.current=null;afterTraversal.current=null;detailHost.current=null;
  for(const [index,view] of historyViews.current)historyViews.current.set(index,{...view,lifecycleKey:lifecycle,hostKey:null,selectedId:null});
  // Do not abandon an already-issued browser traversal: restore its index, but
  // never replay its old detail or queued action into the new authentication.
  if(traversal.current)traversal.current={phase:"restore",intent:null,ignoredIndex:traversal.current.phase==="apply"?traversal.current.intent?.index:traversal.current.ignoredIndex};
 },[readAuth]);
 const currentHistoryView=useCallback(():RequestHistoryView=>{
  const host=detailHost.current;
  return {screen:returnTarget.current,lifecycleKey:readAuth().lifecycleKey,hostKey:host?.screen===returnTarget.current?host.key:null,selectedId:host?.screen===returnTarget.current?host.navigation?.selectedId??host.selectedId:null};
 },[readAuth]);
 const rememberHistoryView=useCallback((index:number,view:RequestHistoryView)=>{
  historyViews.current.set(index,view);
  // Losing an old memory entry only loses optional detail replay. Its allowlisted
  // screen can still be visited; no stale protected identity is reconstructed.
  if(historyViews.current.size>128){const farthest=[...historyViews.current.keys()].sort((a,b)=>Math.abs(b-index)-Math.abs(a-index))[0];historyViews.current.delete(farthest);}
 },[]);
 const intentCurrent=useCallback((intent:RequestHistoryIntent)=>intent.revision===navigationRevision.current&&intent.lifecycleKey===readAuth().lifecycleKey&&mayNavigate(intent.screen),[mayNavigate,readAuth]);
 const applyHistory=useCallback((intent:RequestHistoryIntent)=>{
  const current=ownedHistory.current;if(!current||!intentCurrent(intent))return;
  requestedDetail.current=null;
  if(current.index===intent.index){rememberHistoryView(current.index,currentHistoryView());return;}
  traversal.current={phase:"apply",intent};history.go(intent.index-current.index);
 },[intentCurrent,rememberHistoryView,currentHistoryView]);
 const requestHistory=useCallback((intent:RequestHistoryIntent)=>{
  if(!intentCurrent(intent))return;
  const host=detailHost.current;
  if(intent.screen===returnTarget.current&&host?.screen===intent.screen&&host.lifecycleKey===intent.lifecycleKey&&host.navigation){
   const target=intent.hostKey===host.key?intent.selectedId:null;
   if(host.navigation.selectedId!==target){
    const expected={...intent,hostKey:host.key,selectedId:target,selectionAccepted:true};requestedDetail.current=expected;
    // These return void and may only queue a warning. Only registration of the
    // expected committed selection below permits the browser index to advance.
    if(target===null)host.navigation.requestClose();else host.navigation.requestOpen(target);
    // The synchronous selection ref distinguishes immediate refusal from an
    // admitted React update. It is NOT commitment: only registration applies
    // history. Cancel/invalid guard choices separately clear this expectation.
    if(requestedDetail.current===expected&&!hasPendingNavigation()&&host.navigation.getSelectedId()!==target)requestedDetail.current=null;
    return;
   }
   applyHistory({...intent,hostKey:host.key,selectedId:target,selectionAccepted:true});return;
  }
  guardNavigation(()=>applyHistory(intent),()=>intentCurrent(intent));
 },[intentCurrent,applyHistory,guardNavigation,hasPendingNavigation]);
 const restoreHistory=useCallback(()=>{
  if(restoreFrame.current!==null)cancelAnimationFrame(restoreFrame.current);
  // Coalesce repeated Back/Forward before issuing a corrective traversal. Never
  // repair by pushing/replacing an entry: that would destroy the forward stack.
  restoreFrame.current=requestAnimationFrame(()=>{
   restoreFrame.current=null;const current=ownedHistory.current,entry=history.state?.medcomWorkspace;
   if(current&&entry?.owner===current.owner&&Number.isSafeInteger(entry.index)&&entry.index!==current.index)history.go(current.index-entry.index);
  });
 },[]);
 const navigate=useCallback((id:ScreenId)=>{
  syncHistoryLifecycle();if(!mayNavigate(id))return;
  const revision=++navigationRevision.current,lifecycle=readAuth().lifecycleKey;requestedDetail.current=null;cancelPendingNavigation();
  const valid=()=>revision===navigationRevision.current&&readAuth().lifecycleKey===lifecycle&&mayNavigate(id);
  const request=()=>{
   if(!valid())return;
   if(id===returnTarget.current){
    const host=detailHost.current,current=ownedHistory.current;
    if(host?.screen===id&&host.navigation?.selectedId!=null&&current){
     const previous=[...historyViews.current].filter(([index,view])=>index<current.index&&view.screen===id&&view.lifecycleKey===lifecycle&&view.hostKey===host.key&&view.selectedId===null).sort(([a],[b])=>b-a)[0];
     requestHistory({screen:id,lifecycleKey:lifecycle,hostKey:host.key,selectedId:null,index:previous?.[0]??current.index,revision,selectionAccepted:false});
    }else commitScreen(id);
    return;
   }
   guardNavigation(()=>{
   if(!valid()||isNavigationBlocked())return;const current=ownedHistory.current;if(!current)return;
   const url=new URL(window.location.href);url.searchParams.set("screen",id);
   for(const index of historyViews.current.keys())if(index>current.index)historyViews.current.delete(index);
   current.index++;current.href=url.href;history.pushState({medcomWorkspace:{owner:current.owner,index:current.index}},"",url);
   rememberHistoryView(current.index,{screen:id,lifecycleKey:lifecycle,hostKey:null,selectedId:null});commitScreen(id);
   },valid);
  };
  if(traversal.current){afterTraversal.current=request;traversal.current={phase:"restore",intent:null,ignoredIndex:traversal.current.phase==="apply"?traversal.current.intent?.index:traversal.current.ignoredIndex};restoreHistory();}else request();
 },[syncHistoryLifecycle,mayNavigate,readAuth,cancelPendingNavigation,guardNavigation,isNavigationBlocked,rememberHistoryView,commitScreen,restoreHistory,requestHistory]);
 const recordSelection=useCallback((host:RequestHistoryHost)=>{
  const current=ownedHistory.current;if(!current||host!==detailHost.current||host.screen!==returnTarget.current||host.lifecycleKey!==readAuth().lifecycleKey)return;
  const view=currentHistoryView();
  if(!mayNavigate(host.screen)){rememberHistoryView(current.index,view);return;}
  if(view.selectedId===null){
   const previous=[...historyViews.current].filter(([index,entry])=>index<current.index&&entry.screen===host.screen&&entry.lifecycleKey===host.lifecycleKey&&entry.hostKey===host.key&&entry.selectedId===null).sort(([a],[b])=>b-a)[0];
   if(previous){applyHistory({...previous[1],index:previous[0],revision:navigationRevision.current,selectionAccepted:true});return;}
   rememberHistoryView(current.index,view);return;
  }
  for(const index of historyViews.current.keys())if(index>current.index)historyViews.current.delete(index);
  current.index++;history.pushState({medcomWorkspace:{owner:current.owner,index:current.index}},"",current.href);rememberHistoryView(current.index,view);
 },[readAuth,currentHistoryView,mayNavigate,rememberHistoryView,applyHistory]);
 const onDetailRegistration=useCallback((id:ScreenId,lifecycleKey:string,navigation:RequestDetailNavigation|null)=>{
  syncHistoryLifecycle();if(lifecycleKey!==readAuth().lifecycleKey)return;
  let host=detailHost.current;
  if(navigation===null){
   if(host?.screen!==id||host.lifecycleKey!==lifecycleKey)return;
   host.navigation=null;const retiring=host;
   // The child updates registration with cleanup/setup in the same layout pass.
   // Only a real unmount (no replacement registration) retires its memory scope.
   queueMicrotask(()=>{if(retiring.navigation===null){if(detailHost.current===retiring)detailHost.current=null;for(const [index,view] of historyViews.current)if(view.hostKey===retiring.key)historyViews.current.set(index,{...view,hostKey:null,selectedId:null});}});
   return;
  }
  if(!host||host.screen!==id||host.lifecycleKey!==lifecycleKey){host={key:crypto.randomUUID(),screen:id,lifecycleKey,navigation,selectedId:navigation.selectedId};detailHost.current=host;const current=ownedHistory.current;if(current&&id===returnTarget.current)rememberHistoryView(current.index,currentHistoryView());return;}
  const changed=host.selectedId!==navigation.selectedId;host.navigation=navigation;host.selectedId=navigation.selectedId;
  if(!changed)return;
  const pending=requestedDetail.current;
  if(pending&&intentCurrent(pending)&&pending.hostKey===host.key&&pending.selectedId===navigation.selectedId){applyHistory(pending);return;}
  requestedDetail.current=null;navigationRevision.current++;cancelPendingNavigation();
  if(traversal.current){afterTraversal.current=()=>recordSelection(host);traversal.current={phase:"restore",intent:null,ignoredIndex:traversal.current.phase==="apply"?traversal.current.intent?.index:traversal.current.ignoredIndex};restoreHistory();}else recordSelection(host);
 },[syncHistoryLifecycle,readAuth,rememberHistoryView,currentHistoryView,intentCurrent,applyHistory,cancelPendingNavigation,recordSelection,restoreHistory]);
 const registerPurchaseDetail=useCallback<RegisterRequestDetailNavigation>(navigation=>onDetailRegistration("purchase-requests",authState.lifecycleKey,navigation),[authState.lifecycleKey,onDetailRegistration]);
 const registerInboundDetail=useCallback<RegisterRequestDetailNavigation>(navigation=>onDetailRegistration("inbound-requests",authState.lifecycleKey,navigation),[authState.lifecycleKey,onDetailRegistration]);
 const onHistoryPop=useEffectEvent(()=>{
  syncHistoryLifecycle();const current=ownedHistory.current,entry=history.state?.medcomWorkspace,requested=new URL(location.href).searchParams.get("screen");
  if(!current||entry?.owner!==current.owner||!Number.isSafeInteger(entry.index))return;
  const pending=traversal.current;
  if(pending?.phase==="restore"&&entry.index===current.index){
   if(restoreFrame.current!==null){cancelAnimationFrame(restoreFrame.current);restoreFrame.current=null;}
   traversal.current=null;
   if(location.href!==current.href)history.replaceState(history.state,"",current.href);
   const action=afterTraversal.current;afterTraversal.current=null;
   if(action){action();return;}
   if(pending.intent)requestHistory(pending.intent);else rememberHistoryView(current.index,currentHistoryView());return;
  }
  if(pending?.phase==="restore"&&pending.ignoredIndex===entry.index){restoreHistory();return;}
  if(pending?.phase==="apply"&&pending.intent&&pending.intent.index===entry.index){
   const intent=pending.intent,host=detailHost.current;
   // A screen commit unmounts the host, so recheck late command/readback custody
   // after the asynchronous traversal. A detail commit only mirrors an ALREADY
   // accepted child selection and must not close/remount or resend that editor.
   const detailMatches=intent.selectionAccepted&&host?.screen===intent.screen&&host.key===intent.hostKey&&host.navigation?.selectedId===intent.selectedId;
   if(!intentCurrent(intent)||intent.selectionAccepted&&!detailMatches||!intent.selectionAccepted&&isNavigationBlocked()){
    traversal.current={phase:"restore",intent:intentCurrent(intent)&&!intent.selectionAccepted?intent:null};restoreHistory();return;
   }
   traversal.current=null;current.index=entry.index;current.href=location.href;
   if(!intent.selectionAccepted)commitScreen(intent.screen);
   rememberHistoryView(current.index,intent.selectionAccepted?currentHistoryView():{screen:intent.screen,lifecycleKey:intent.lifecycleKey,hostKey:null,selectedId:null});
   const action=afterTraversal.current;afterTraversal.current=null;if(action)action();return;
  }
  if(entry.index===current.index)return;
  const id=isScreen(requested)?requested:"purchase-orders",view=historyViews.current.get(entry.index),lifecycleKey=readAuth().lifecycleKey;
  const revision=++navigationRevision.current;requestedDetail.current=null;afterTraversal.current=null;cancelPendingNavigation();
  traversal.current={phase:"restore",intent:{screen:id,lifecycleKey,hostKey:view?.lifecycleKey===lifecycleKey?view.hostKey:null,selectedId:view?.lifecycleKey===lifecycleKey?view.selectedId??null:null,index:entry.index,revision,selectionAccepted:false}};restoreHistory();
 });
 useLayoutEffect(()=>{syncHistoryLifecycle();const current=ownedHistory.current;if(current&&!traversal.current&&!requestedDetail.current)rememberHistoryView(current.index,currentHistoryView());},[authState.lifecycleKey,screen,syncHistoryLifecycle,rememberHistoryView,currentHistoryView]);
 useEffect(()=>{mounted.current=true;const controller=new AbortController();const fence=authorityFence.current;void loadWorkspace(controller.signal);void checkHealth();return()=>{mounted.current=false;controller.abort();fence.invalidate();healthRequest.current?.abort();};},[loadWorkspace,checkHealth]);
 useEffect(()=>{if(!ownedHistory.current)ownedHistory.current={owner:crypto.randomUUID(),index:0,href:location.href};const current=ownedHistory.current;const previousScrollRestoration=history.scrollRestoration;history.scrollRestoration="manual";history.replaceState({...history.state,medcomWorkspace:{owner:current.owner,index:current.index}},"",current.href);const onPop=()=>onHistoryPop();window.addEventListener("popstate",onPop);return()=>{window.removeEventListener("popstate",onPop);history.scrollRestoration=previousScrollRestoration;if(restoreFrame.current!==null)cancelAnimationFrame(restoreFrame.current);};},[]);
 useEffect(()=>{if(!preferencesReady)return;if(admittedLifecycle.current===null)returnTarget.current=screen;document.documentElement.classList.toggle("dark",dark);document.documentElement.dataset.palette=palette;try{localStorage.setItem("medcom.preferences.v1",JSON.stringify({compact,dark,palette,favorites}));}catch{}},[compact,dark,palette,favorites,preferencesReady,screen]);
 useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if(!presentationCurrent()){if(e.metaKey||e.ctrlKey){e.preventDefault();e.stopImmediatePropagation();}return;}if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="k"){e.preventDefault();if(detailHost.current?.navigation?.selectedId){e.stopImmediatePropagation();return;}setCommandOpen(true);}};window.addEventListener("keydown",onKey,true);return()=>window.removeEventListener("keydown",onKey,true);},[setCommandOpen,presentationCurrent]);
 const hasWorkspace=workspace!==null;
 const sessionEnded=sessionRetired||sessionError instanceof ApiError&&sessionError.status===401;
 useEffect(()=>{
  if(sessionEnded||!inboundLoginKey)return;
  let controller:AbortController|null=null;
  const refresh=async(background=false)=>{
   if(signOutPending.current)return;
   if(document.visibilityState!=="visible"){
    controller?.abort();controller=null;authorityFence.current.invalidate();suspendReads();return;
   }
   if(controller)return;
   const request=new AbortController();controller=request;setAuthorityChecking(true);if(!background||readBlockedRef.current)suspendReads();
   const fence=authorityFence.current,generation=fence.begin();
   try{const w=await getWorkspace(request.signal);if(!request.signal.aborted&&fence.isCurrent(generation)){setWorkspace(w,background);setSessionError(null);}}
   catch(e){if(!request.signal.aborted&&fence.isCurrent(generation)){setWorkspace(null);setSessionError(e);}}
   finally{if(controller===request)controller=null;if(!request.signal.aborted&&fence.isCurrent(generation)){setSessionBusy(false);setAuthorityChecking(false);}}
  };
  const focus=()=>void refresh(document.visibilityState==="visible"&&!readBlockedRef.current);window.addEventListener("focus",focus);window.addEventListener("online",focus);document.addEventListener("visibilitychange",focus);
  const timer=setInterval(()=>void refresh(true),60000);
  return()=>{controller?.abort();clearInterval(timer);window.removeEventListener("focus",focus);window.removeEventListener("online",focus);document.removeEventListener("visibilitychange",focus);};
 },[inboundLoginKey,sessionEnded,setWorkspace,setSessionError,suspendReads]);
 useEffect(()=>{
  if(sessionEnded){knownSessionLimit.current=null;return;}
  if(workspace){const idle=new Date(workspace.session.idleExpiresAt).getTime(),absolute=new Date(workspace.session.absoluteExpiresAt).getTime();knownSessionLimit.current=Math.min(idle,absolute);}
  const limit=knownSessionLimit.current;if(limit===null||!Number.isFinite(limit))return;
  // A queued timer from a prior login/renewal may run before React cleans it up.
  const expire=()=>{if(knownSessionLimit.current!==limit)return;authorityFence.current.invalidate();knownSessionLimit.current=null;setWorkspace(null);setSessionError(new ApiError(401,"session_expired"));};
  // One deadline timer also handles an already elapsed limit on the next timer turn.
  const timer=setTimeout(expire,Math.max(0,Math.min(limit-Date.now(),2147483647)));return()=>clearTimeout(timer);
 },[workspace,sessionEnded,loginBoundary,setWorkspace,setSessionError]);
 useEffect(()=>{const context=(document as Document&{modelContext?:{registerTool:(tool:unknown,options:{signal:AbortSignal})=>void|Promise<void>}}).modelContext;if(!context?.registerTool)return;const controller=new AbortController();
  const register=async()=>{await context.registerTool({name:"navigate_medcom_screen",description:"Open a Medcom screen; this only changes navigation and does not submit ERP data.",inputSchema:{type:"object",properties:{screen:{type:"string",enum:presentationAllowed?authorizedScreenIds(workspace):[]}},required:["screen"],additionalProperties:false},annotations:{readOnlyHint:false},execute:async(input:unknown)=>{if(!input||typeof input!=="object"||!("screen"in input)||typeof input.screen!=="string"||!isScreen(input.screen))throw new Error("Invalid screen");if(!mayNavigate(input.screen))throw new Error("Screen is not currently authorized");navigate(input.screen);await new Promise(resolve=>requestAnimationFrame(resolve));return{requestedScreen:input.screen};}},{signal:controller.signal});};void register().catch(()=>{});return()=>controller.abort();},[navigate,mayNavigate,presentationAllowed,workspace]);
 const inboundSessionScope=workspace?.sessionScope,inboundReadScope=workspace?.readScope;
 const readInboundList=useCallback((page:number,search:string,branch:string,signal:AbortSignal)=>{
  if(!inboundSessionScope||!inboundReadScope)return Promise.reject(new ApiError(502,"invalid_read_scope"));
  return getDocuments("inbound-requests",page,search,branch,signal,{sessionScope:inboundSessionScope,readScope:inboundReadScope});
 },[inboundSessionScope,inboundReadScope]);
 const authorizedIds=presentationAllowed?authorizedScreenIds(workspace):[];const shownScreens=screens.filter(s=>authorizedIds.includes(s.id));const shownFavorites=favorites.filter(id=>authorizedIds.includes(id));
 const current=screens.find(s=>s.id===screen)!;const Icon=icons[screen];const connected=!!workspace;const configured=!(healthError instanceof ApiError&&healthError.code==="backend_not_configured");
 const currentAuthorized=authorizedIds.includes(screen);
 const [previousPresentation,setPreviousPresentation]=useState(presentationAllowed);
 if(previousPresentation!==presentationAllowed){setPreviousPresentation(presentationAllowed);if(!presentationAllowed){setAccountOpen(false);setCommandVisible(false);}}
 useLayoutEffect(()=>{toast.dismiss();if(!presentationAllowed)setOpenMobile(false);},[presentationAllowed,setOpenMobile]);
 // A suspended observer may report the same cached denial after the first remount.
 const onDenied=useCallback((e:unknown)=>{if(loginLifecycle.current.key!==inboundLoginKey)return;if(e instanceof ApiError&&e.status===401){authorityFence.current.invalidate();setWorkspace(null);setSessionError(e);}
  else if(e instanceof ApiError&&(e.status===403||e.code==="read_scope_changed")&&!readBlockedRef.current){listViews.retire();recheckBlockedScope.current=serverReadScope.current;setReadViewScope(current=>current+":denied");suspendReads();void loadWorkspace();}
 },[inboundLoginKey,setWorkspace,setSessionError,suspendReads,loadWorkspace,listViews]);
 useEffect(()=>{if(!hasWorkspace)queryClient.clear();},[hasWorkspace,queryClient]);
 const toggleFavorite=(id:ScreenId)=>setFavorites(old=>{const current=old??initial.favorites;return current.includes(id)?current.filter(x=>x!==id):[...current,id];});
 async function signOut(){guardNavigation(()=>{void performSignOut();});}
 async function performSignOut(){
  if(!presentationCurrent())return;
  const fence=authorityFence.current,generation=fence.begin();signOutPending.current=true;publishAuth(previous=>({...previous,signOutPending:true,proofLifecycleKey:null}));setWorkspace(null);queryClient.clear();
  try{await logout();if(!mounted.current||!fence.isCurrent(generation))return;setSessionError(new ApiError(401,"signed_out"));toast.success("Đã đăng xuất ERP.");}
  catch(e){if(mounted.current&&fence.isCurrent(generation)){signOutPending.current=false;publishAuth(previous=>({...previous,signOutPending:false,authority:"unavailable",proofLifecycleKey:null}));toast.error(errorMessage(e));}}
 }
 async function extend(){
  if(!presentationCurrent()||signOutPending.current)return;
  const fence=authorityFence.current,generation=fence.begin();const current=()=>mounted.current&&fence.isCurrent(generation);setSessionBusy(true);setAuthorityChecking(true);
  try{
   await continueSession();if(!current())return;
   const next=await getWorkspace();if(!current())return;
   setWorkspace(next);setSessionError(null);toast.success("Đã gia hạn phiên làm việc.");
  }catch(e){if(!current())return;setWorkspace(null);setSessionError(e);toast.error(errorMessage(e));}
  finally{if(current()){setSessionBusy(false);setAuthorityChecking(false);}}
 }
 const onLoginSuccess=()=>{if(readAuth().lifecycleKey!==authState.lifecycleKey||signOutPending.current)return;knownSessionLimit.current=null;authorityFence.current.invalidate();queryClient.clear();setWorkspace(null);setLoginBoundary(value=>value+1);setSessionBusy(true);void loadWorkspace();};
 const requestLogin=()=>{if(!presentationCurrent())return;void verifyWorkspace();};
 return <WorkspaceAuthGate state={authState} onRetry={()=>{if(!sessionBusy&&!signOutPending.current)void verifyWorkspace();}} login={{configured,onSuccess:onLoginSuccess}}><ListViewProvider store={listViews}><Fragment key={authState.lifecycleKey}><a className="skip-link" href="#main-content">Đến nội dung chính</a>{presentationAllowed&&<Sidebar className="erp-sidebar"><SidebarHeader><a className="brand" href="?screen=home" onClick={e=>{e.preventDefault();navigate("home");}}><span className="brand-logo-frame"><Image unoptimized className="brand-logo" src="/medcom-logo.png" alt="MEDCOMTECH — Moving forward together" width={2065} height={761}/></span></a>{isMobile&&<Button variant="ghost" size="icon" className="mobile-drawer-close" aria-label="Đóng menu" onClick={()=>setOpenMobile(false)}><X size={18}/></Button>}</SidebarHeader><SidebarContent>
 <SidebarGroup><SidebarMenu><SidebarMenuItem><SidebarMenuButton isActive={screen==="home"} onClick={()=>navigate("home")}><LayoutDashboard/><span>Tổng quan</span></SidebarMenuButton></SidebarMenuItem></SidebarMenu></SidebarGroup>
 {shownFavorites.length>0&&<SidebarGroup><SidebarGroupLabel>Yêu thích</SidebarGroupLabel><SidebarMenu>{shownFavorites.map(id=><SidebarMenuItem key={id}><SidebarMenuButton isActive={screen===id} onClick={()=>navigate(id)}><Star/><span>{screens.find(s=>s.id===id)?.label}</span></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarGroup>}
 {(["Mua hàng","Kho hàng","Bán hàng","Kế toán","Phân tích"] as const).filter(group=>shownScreens.some(s=>s.group===group)).map(group=><SidebarGroup key={group}><SidebarGroupLabel>{group}</SidebarGroupLabel><SidebarMenu>{shownScreens.filter(s=>s.group===group).map(s=>{const I=icons[s.id];return <SidebarMenuItem key={s.id}><SidebarMenuButton isActive={screen===s.id} onClick={()=>navigate(s.id)}><I/><span>{s.label}</span>{screen===s.id&&<span className="nav-active-mark"/>}</SidebarMenuButton></SidebarMenuItem>;})}</SidebarMenu></SidebarGroup>)}
 </SidebarContent><SidebarFooter><SidebarMenu><SidebarMenuItem><SidebarMenuButton isActive={guideOpen} onClick={()=>{if(!presentationCurrent())return;guardNavigation(()=>{if(!presentationCurrent())return;setGuideOpen(true);setOpenMobile(false);},presentationCurrent);}}><BookOpen/><span>Hướng dẫn</span></SidebarMenuButton></SidebarMenuItem><SidebarMenuItem><SidebarMenuButton isActive={screen==="settings"} onClick={()=>navigate("settings")}><SlidersHorizontal/><span>Thiết lập</span></SidebarMenuButton></SidebarMenuItem></SidebarMenu>{isMobile&&<div className="mobile-drawer-account"><UserInitials name={workspace?.session.displayName}/><span>{workspace?.session.displayName??"Chưa đăng nhập ERP"}</span><Button variant="ghost" size="icon" aria-label={connected?"Đăng xuất ERP":"Đăng nhập ERP"} onClick={()=>{setOpenMobile(false);if(connected)void signOut();else if(configured)requestLogin();else navigate("settings");}}>{connected?<LogOut size={17}/>:<LockKeyhole size={17}/>}</Button></div>}<div className="sidebar-bottom"><ShieldCheck size={16}/><span>Quyền truy cập do ERP xác nhận</span></div></SidebarFooter></Sidebar>}
 <SidebarInset className={compact?"erp-inset compact":"erp-inset"}><header className="topbar"><div className="topbar-context"><SidebarTrigger aria-label="Mở hoặc thu gọn điều hướng"/><span className="topbar-divider"/><span className="breadcrumb-root">Không gian làm việc</span><ChevronRight size={14}/><strong>{current.group}</strong></div><div className="topbar-actions"><WorkspaceSearch open={commandOpen} onOpen={()=>setCommandOpen(true)} shortcut={finderShortcut}/><Button variant="ghost" size="icon" aria-label={dark?"Chuyển giao diện sáng":"Chuyển giao diện tối"} onClick={()=>setDark(!dark)}>{dark?<Sun size={18}/>:<Moon size={18}/>}</Button><DropdownMenu open={presentationAllowed&&accountOpen} onOpenChange={open=>{if(presentationCurrent())setAccountOpen(open);}}><DropdownMenuTrigger asChild><Button variant="ghost" className="user-button"><UserInitials name={workspace?.session.displayName}/><span>{workspace?.session.displayName??"Tài khoản ERP"}</span></Button></DropdownMenuTrigger><DropdownMenuContent {...protectedPresentationProps(presentationAllowed)} align="end" onCloseAutoFocus={event=>{if(!presentationCurrent())event.preventDefault();}}><DropdownMenuLabel>{workspace?.session.displayName??"Chưa đăng nhập ERP"}</DropdownMenuLabel><DropdownMenuSeparator/>{connected?<><DropdownMenuItem onClick={()=>void extend()}><Clock3/>Gia hạn phiên</DropdownMenuItem><DropdownMenuItem onClick={()=>void signOut()}><LogOut/>Đăng xuất ERP</DropdownMenuItem></>:<DropdownMenuItem onClick={()=>requestLogin()}><LockKeyhole/>Đăng nhập ERP</DropdownMenuItem>}<DropdownMenuItem onClick={()=>navigate("settings")}><SlidersHorizontal/>Thiết lập</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div></header>
 <main id="main-content" className="workspace-content"><div className="workspace-screen-presentation" hidden={!currentAuthorized} inert={!currentAuthorized} aria-hidden={!currentAuthorized}>{!guideOpen&&<ScreenHeader level={1} title={current.label} description={current.description} eyebrow={<><Icon size={15}/>{current.group.toUpperCase()}</>} actions={<>{screen!=="home"&&screen!=="settings"&&<Button variant="ghost" size="icon" aria-label={favorites.includes(screen)?"Bỏ yêu thích":"Thêm vào yêu thích"} onClick={()=>toggleFavorite(screen)}><Star size={19} fill={favorites.includes(screen)?"currentColor":"none"}/></Button>}<Badge variant="outline" className={connected?"connection connected":"connection"}>{connected?<ShieldCheck size={14}/>:<WifiOff size={14}/>} {connected?"Đã đăng nhập ERP":configured?"Chưa đăng nhập":"Chưa kết nối ERP"}</Badge></>}/>}
 <Connectivity/><SessionWarning session={workspace?.session??null} extend={extend}/>{sessionError instanceof ApiError&&sessionError.code==="session_expired"&&<div className="erp-feedback" role="alert"><strong>Phiên làm việc đã hết hạn. Đăng nhập ERP để tiếp tục.</strong></div>}
 {!connected&&<div className="connection-banner"><div className="banner-icon"><LockKeyhole size={19}/></div><div><strong>{configured?"Đăng nhập để truy cập dữ liệu doanh nghiệp":"Kết nối hệ thống ERP để bắt đầu làm việc"}</strong><p>{configured?"Dữ liệu và thao tác được giới hạn theo quyền của tài khoản ERP.":"Danh sách chứng từ sẽ hiển thị sau khi hệ thống ERP được kết nối."}</p></div><Button variant="outline" onClick={()=>configured?requestLogin():navigate("settings")}>{configured?"Đăng nhập ERP":"Xem kết nối"}</Button></div>}
 {guideOpen?<RequestHelp/>:screen==="home"?<Home navigate={navigate} recent={lastVisit} favorites={favorites} availableIds={authorizedIds}/>:screen==="purchase-requests"?<PurchaseRequestScreen compact={compact} setCompact={setCompact} registerDetailNavigation={registerPurchaseDetail} presentationAllowed={presentationAllowed&&currentAuthorized} workspace={readBlocked?null:workspace} verifying={authorityChecking} loginBoundary={loginBoundary} sessionEnded={sessionEnded} onVerifyWorkspace={verifyWorkspace} onDenied={onDenied} onLogin={()=>requestLogin()}/>:screen==="inbound-requests"?<><InboundRequestScreen compact={compact} setCompact={setCompact} registerDetailNavigation={registerInboundDetail} presentationAllowed={presentationAllowed&&currentAuthorized} loginKey={inboundLoginKey} workspace={readBlocked?null:workspace} list={readInboundList} onDenied={onDenied} historyOwner="workspace"/>{inboundLoginKey!==null&&workspace===null&&!sessionEnded&&<Button variant="outline" disabled={sessionBusy} onClick={()=>void verifyWorkspace()}>Xác minh lại phiên nhập hàng</Button>}</>:screen==="purchase-orders"?<Documents key={JSON.stringify([screen,readViewScope,loginBoundary,listViews.getEpoch()])} kind={screen} workspace={workspace} verified={!readBlocked} generation={readGeneration} compact={compact} setCompact={setCompact} onLogin={()=>requestLogin()} onDenied={onDenied} renderDetail={(selected,close,read)=>extensions?.documentScreens?.[screen]?<ConfiguredDocumentSheet screen={screen} selected={selected} documentId={read.documentId} presentationAllowed={presentationAllowed&&currentAuthorized&&read.active} isPresentationAllowed={presentationCurrent} close={close} workspace={readBlocked?null:workspace} extension={extensions.documentScreens[screen]} onDenied={onDenied}/>:<Detail presentationAllowed={presentationAllowed&&currentAuthorized} kind={screen} selected={selected} close={close} onDenied={onDenied} read={read}/>}/>:screen==="transfers"?<Transfers/>:screen==="settings"?<Settings compact={compact} setCompact={setCompact} dark={dark} setDark={setDark} palette={palette} setPalette={setPalette} health={health} healthError={healthError} checking={checking} checkHealth={async()=>{setChecking(true);await checkHealth();}} checkedAt={checkedAt} workspace={workspace} extend={extend}/>:screen==="reports"?workspace&&authorizedIds.includes("reports")&&extensions?.reports?<ReportWorkspace key={JSON.stringify([workspace.session.tenantId,workspace.session.companyId,workspace.session.authorityVersion,workspace.session.absoluteExpiresAt])} scopeKey={JSON.stringify([workspace.session.tenantId,workspace.session.companyId,workspace.session.authorityVersion,workspace.session.absoluteExpiresAt])} adapter={extensions.reports.adapter} lookupAdapter={extensions.reports.lookup} onDenied={onDenied}/>:<Reports/>:<Unavailable screen={screen}/>}
 {!guideOpen&&screen==="settings"&&workspace&&extensions?.roleNavigation&&<RoleNavigationEditor key={JSON.stringify([workspace.session.tenantId,workspace.session.companyId,workspace.session.authorityVersion,workspace.session.absoluteExpiresAt,extensions.roleNavigation.configuration.roleId])} configuration={extensions.roleNavigation.configuration} adapter={extensions.roleNavigation.adapter} onPublished={extensions.roleNavigation.onPublished} onDenied={onDenied}/>}
 </div>{!currentAuthorized&&<Notice title="Chưa được cấp quyền" text="Màn hình này không còn trong phạm vi được ERP cho phép. Công việc chưa hoàn tất vẫn được giữ để xác minh kết quả."/>}</main><footer className="workspace-footer"><span><ShieldCheck size={13}/> Medcom ERP</span><span>{workspace?`Phiên làm việc đến ${time(workspace.session.idleExpiresAt)}`:"Dữ liệu doanh nghiệp chỉ hiển thị sau xác thực"}</span><span className="footer-shortcut">{finderShortcut.label} · Tìm màn hình</span></footer></SidebarInset>
 <Dialog open={presentationAllowed&&commandOpen} onOpenChange={setCommandOpen}><DialogContent {...protectedPresentationProps(presentationAllowed)} className="command-modal" showCloseButton={false} onOpenAutoFocus={event=>{event.preventDefault();if(presentationCurrent())commandInput.current?.focus();}} onCloseAutoFocus={event=>{event.preventDefault();if(!presentationCurrent()||commandNavigated.current)return;const opener=commandOpener.current;const target=opener?.isConnected?opener:document.querySelector<HTMLElement>(".global-search");target?.focus();}}><DialogHeader className="command-heading"><DialogTitle>Tìm màn hình</DialogTitle><DialogDescription className="sr-only">Điều hướng đến phân hệ và màn hình ERP.</DialogDescription><Button type="button" variant="ghost" size="icon" aria-label="Đóng tìm màn hình" onClick={()=>setCommandOpen(false)}><X size={18}/></Button></DialogHeader><Command><CommandInput ref={commandInput} placeholder="Tìm màn hình hoặc phân hệ…"/><CommandList><CommandEmpty>Không tìm thấy màn hình phù hợp.</CommandEmpty>{["Tổng quan","Mua hàng","Kho hàng","Bán hàng","Kế toán","Phân tích","Hệ thống"].filter(g=>shownScreens.some(s=>s.group===g)).map(g=><CommandGroup heading={g} key={g}>{shownScreens.filter(s=>s.group===g).map(s=>{const I=icons[s.id];return <CommandItem key={s.id} value={`${s.label} ${s.group}`} onSelect={()=>navigate(s.id)}><I/><span>{s.label}</span></CommandItem>;})}</CommandGroup>)}</CommandList></Command></DialogContent></Dialog>
 <MobileBottomNav screen={screen} workspace={workspace} configuration={extensions?.effectiveMobileNavigation} navigate={navigate} onSearch={()=>setCommandOpen(true)} searchOpen={commandOpen}/>{presentationAllowed&&<Toaster theme={dark?"dark":"light"} position="top-center" duration={3000} offset="88px" mobileOffset={{top:"76px"}}/>}
 </Fragment></ListViewProvider></WorkspaceAuthGate>;
}
function MobileBottomNav({screen,workspace,configuration,navigate,onSearch,searchOpen}:{screen:ScreenId;workspace:WorkspaceData|null;configuration?:WorkspaceExtensions["effectiveMobileNavigation"];navigate:(id:ScreenId)=>void;onSearch:()=>void;searchOpen:boolean}){
 const {isMobile,openMobile,setOpenMobile}=useSidebar();const [keyboardOpen,setKeyboardOpen]=useState(false);
 useEffect(()=>{if(!isMobile)return;const viewport=window.visualViewport;if(!viewport)return;const check=()=>{const editing=document.activeElement?.matches("input,textarea,[contenteditable=true]");setKeyboardOpen(!!editing&&window.innerHeight-viewport.height>150);};viewport.addEventListener("resize",check);document.addEventListener("focusin",check);document.addEventListener("focusout",check);return()=>{viewport.removeEventListener("resize",check);document.removeEventListener("focusin",check);document.removeEventListener("focusout",check);};},[isMobile]);
 if(!isMobile||keyboardOpen)return null;
 const quick=mobileQuickScreenIds(workspace);const secondary=quick[1]??"settings";const labels:Partial<Record<ScreenId,string>>={"purchase-requests":"Đề nghị mua","purchase-orders":"Mua hàng","purchase-approval":"Duyệt mua","inbound-requests":"Nhập kho",transfers:"Chuyển kho",sales:"Hóa đơn",accounting:"Kế toán",reports:"Báo cáo",settings:"Thiết lập"};
 const entry=(id:ScreenId)=>{const Icon=icons[id];const fullLabel=screens.find(s=>s.id===id)!.label;return <button key={id} type="button" className="mobile-nav-item" aria-label={fullLabel} aria-current={screen===id?"page":undefined} onClick={()=>navigate(id)}><Icon size={21} aria-hidden="true"/><span>{id==="home"?"Tổng quan":labels[id]??fullLabel}</span></button>;};
 const configuredEntries=configuration?.entries.filter(e=>e.enabled&&isScreen(e.screenId)&&authorizedScreenIds(workspace).includes(e.screenId)).slice(0,4);
 if(workspace&&configuredEntries?.length)return <nav className="mobile-bottom-nav" aria-label="Điều hướng nhanh theo vai trò" style={{"--mobile-nav-count":configuredEntries.length+1} as CSSProperties}>{configuredEntries.map(e=>{const id=e.screenId as ScreenId;const Icon=icons[id];return <button key={id} type="button" className={e.primary?"mobile-nav-item mobile-nav-primary":"mobile-nav-item"} aria-label={e.label} aria-current={screen===id?"page":undefined} onClick={()=>navigate(id)}>{e.primary?<span className="mobile-primary-icon"><Icon size={21}/></span>:<Icon size={21}/>}<span>{e.label}</span></button>;})}<button type="button" className="mobile-nav-item" aria-label="Mở menu đầy đủ" aria-haspopup="dialog" aria-expanded={openMobile} onClick={()=>setOpenMobile(true)}><Menu size={21}/><span>Menu</span></button></nav>;
 return <nav className="mobile-bottom-nav" aria-label="Điều hướng nhanh trên điện thoại" style={{"--mobile-nav-count":quick.length?5:4} as CSSProperties}>{entry("home")}{quick[0]&&entry(quick[0])}<button type="button" className="mobile-nav-item mobile-nav-primary" aria-label="Tìm màn hình được cấp quyền" aria-haspopup="dialog" aria-expanded={searchOpen} onClick={onSearch}><span className="mobile-primary-icon"><Search size={21} aria-hidden="true"/></span><span>Tìm kiếm</span></button>{entry(secondary)}<button type="button" className="mobile-nav-item" aria-label="Mở menu đầy đủ" aria-haspopup="dialog" aria-expanded={openMobile} onClick={()=>setOpenMobile(true)}><Menu size={21} aria-hidden="true"/><span>Menu</span></button></nav>;
}
function Home({navigate,recent,favorites,availableIds}:{navigate:(id:ScreenId)=>void;recent:ScreenId[];favorites:ScreenId[];availableIds?:ScreenId[]}){
 const allowed=(id:ScreenId)=>availableIds?.includes(id)??true;
 const modules=[
  {id:"purchase-orders" as const,label:"Mua hàng",text:"Đơn đặt hàng · Duyệt yêu cầu",icon:ShoppingBag,color:"teal"},
  {id:"inbound-requests" as const,label:"Kho hàng",text:"Yêu cầu nhập · Điều chuyển nội bộ",icon:Package,color:"blue"},
  {id:"sales" as const,label:"Bán hàng",text:"Yêu cầu hóa đơn",icon:FileText,color:"violet"},
  {id:"accounting" as const,label:"Kế toán",text:"Thiết lập kết chuyển",icon:BookOpen,color:"amber"},
 ].filter(m=>allowed(m.id));
 const recentIds=(recent.length?recent:["purchase-orders","inbound-requests","transfers"] as ScreenId[]).filter(allowed);
 const favoriteIds=favorites.filter(allowed);
 return <><div className="section-heading"><h2>Phân hệ nghiệp vụ</h2><span>Chọn công việc để bắt đầu</span></div>
 {modules.length?<div className="module-grid">{modules.map(m=><button className="module-card" key={m.id} onClick={()=>navigate(m.id)}><span className={`module-icon ${m.color}`}><m.icon size={25}/></span><div><h3>{m.label}</h3><p>{m.text}</p></div><ChevronRight size={18}/></button>)}</div>:<section className="panel mobile-home-empty"><Notice title="Chưa có menu nghiệp vụ" text="Các phân hệ được hiển thị sau khi ERP xác nhận quyền truy cập."/></section>}
 <div className="home-bottom"><section className="panel"><div className="panel-heading"><h2>Truy cập nhanh</h2><Clock3 size={18}/></div>{recentIds.length?recentIds.map(id=><button className="quick-row" key={id} onClick={()=>navigate(id)}><FileText size={17}/><span>{screens.find(s=>s.id===id)?.label}</span><ChevronRight size={15}/></button>):<div className="quiet-empty"><Clock3 size={25}/><p>Chưa có công việc được cấp quyền.</p></div>}</section>
 <section className="panel"><div className="panel-heading"><h2>Màn hình yêu thích</h2><Star size={18}/></div>{favoriteIds.length?favoriteIds.map(id=><button className="quick-row" key={id} onClick={()=>navigate(id)}><Star size={17}/><span>{screens.find(s=>s.id===id)?.label}</span><ChevronRight size={15}/></button>):<div className="quiet-empty"><Star size={25}/><p>Giữ công việc thường dùng trong tầm tay.</p><span>Bấm ngôi sao cạnh tên màn hình để thêm yêu thích.</span></div>}</section></div></>;
}
type DetailProps={presentationAllowed:boolean;kind:DocumentKind;selected:DocumentRow|null;close:()=>void;onDenied:(e:unknown)=>void;read:DocumentReadState};
function Detail(props:DetailProps){return <DetailContent key={JSON.stringify([props.kind,props.read.documentId])} {...props}/>;}
function DetailContent({presentationAllowed,kind,selected,close,onDenied,read}:DetailProps){const [page,setPage]=useState(1);const [refresh,setRefresh]=useState(0);const instance=useId();const documentId=read.documentId;
 const query=useQuery<Awaited<ReturnType<typeof getDetail>>>({queryKey:["workspace-detail",instance,read.scope?.readScope,read.generation,kind,documentId,page,refresh],enabled:read.active&&!!selected&&!!read.scope,refetchOnWindowFocus:false,refetchOnReconnect:false,queryFn:({signal})=>getDetail(kind,documentId!,page,signal,read.scope??undefined)});
 const detail=read.active&&!query.error&&query.data?.document.documentId===documentId&&query.data?.page===page?query.data:null;const error=query.error;const busy=query.isFetching;const summary=detail?.document??selected;
 const detailViewport=useRef<HTMLDivElement>(null),scroll=useRef(0);
 useLayoutEffect(()=>{if(presentationAllowed&&read.active&&detail&&detailViewport.current)detailViewport.current.scrollTop=scroll.current;},[detail,presentationAllowed,read.active]);
 const reportError=useEffectEvent((e:unknown)=>{if(e instanceof ApiError&&[401,403,404].includes(e.status)){close();toast.error(errorMessage(e));}onDenied(e);});
 useEffect(()=>{if(error)reportError(error);},[error]);
 return <RecordDialog bodyRef={detailViewport} onBodyScroll={event=>{if(presentationAllowed&&read.active&&detail)scroll.current=event.currentTarget.scrollTop;}} open={presentationAllowed&&read.active&&!!documentId} presentationAllowed={presentationAllowed&&read.active} title={kind==="purchase-orders"?"Đơn đặt hàng mua":"Yêu cầu nhập kho"} documentNumber={selected?.documentId} closeLabel="Đóng chứng từ" onRequestClose={()=>{if(presentationAllowed&&read.active)close();}}><div className="detail-body"><RecordDetailToolbar presentationAllowed={presentationAllowed&&read.active}><RequestButton type="button" variant="outline" aria-label="Làm mới chi tiết" aria-disabled={busy} onClick={()=>{if(!busy)setRefresh(v=>v+1);}}><RefreshCw size={16} className={busy?"spin":""}/>Làm mới chi tiết</RequestButton></RecordDetailToolbar><RecordSection title="Thông tin chung">{selected&&<><RecordDetailStatus presentationAllowed={presentationAllowed&&read.active}><RequestStatus value={summary!.statusId} statusName={summary!.statusName}/></RecordDetailStatus><div className="detail-summary"><div><span>Ngày chứng từ</span><strong>{date(summary!.documentDate)}</strong></div><div><span>Chi nhánh</span><strong>{summary!.branchId}</strong></div><div><span>Khóa chứng từ</span><strong>{summary!.isLocked===null?"Chưa xác định":summary!.isLocked?"Đã khóa":"Không khóa"}</strong></div></div></>}</RecordSection><RecordSection title="Dòng hàng">{error?<ErrorPanel error={error} retry={()=>setRefresh(v=>v+1)}/>:!detail?<ListLoading form label="Đang tải chi tiết chứng từ…"/>:detail?<><div className="table-scroll desktop-detail-lines"><Table><TableHeader><TableRow><TableHead>STT</TableHead><TableHead>Mặt hàng</TableHead>{kind==="purchase-orders"?<><TableHead className="text-right">Số lượng</TableHead><TableHead className="text-right">Số lượng 2</TableHead></>:<><TableHead className="text-right">Bộ theo CT</TableHead><TableHead className="text-right">Thùng theo CT</TableHead><TableHead className="text-right">Bộ thực tế</TableHead><TableHead className="text-right">Thùng thực tế</TableHead></>}</TableRow></TableHeader><TableBody>{kind==="purchase-orders"?detail.purchaseOrderLines.map((l,ordinal)=><TableRow key={l.lineId}><TableCell>{(page-1)*50+ordinal+1}</TableCell><TableCell><ItemIdentity binding={pagedItemDisplayBinding(kind,detail)} context={detail.itemDisplayContext} line={l}/></TableCell><TableCell className="text-right numeric">{l.quantity??"—"}</TableCell><TableCell className="text-right numeric">{l.quantity2??"—"}</TableCell></TableRow>):detail.inboundRequestLines.map((l,ordinal)=><TableRow key={l.lineId}><TableCell>{(page-1)*50+ordinal+1}</TableCell><TableCell><ItemIdentity binding={pagedItemDisplayBinding(kind,detail)} context={detail.itemDisplayContext} line={l}/></TableCell>{[l.setQuantityByDocument,l.barrelQuantityByDocument,l.setQuantityByReal,l.barrelQuantityByReal].map((v,i)=><TableCell className="text-right numeric" key={i}>{v??"—"}</TableCell>)}</TableRow>)}</TableBody></Table></div><div className="mobile-detail-lines">{(kind==="purchase-orders"?detail.purchaseOrderLines:detail.inboundRequestLines).map((l,ordinal)=><article className="mobile-line-card" key={l.lineId}><div><span>Dòng {(page-1)*50+ordinal+1}</span></div><ItemIdentity binding={pagedItemDisplayBinding(kind,detail)} context={detail.itemDisplayContext} line={l}/><dl>{"quantity"in l?<><div><dt>Số lượng</dt><dd>{l.quantity??"—"}</dd></div><div><dt>Số lượng 2</dt><dd>{l.quantity2??"—"}</dd></div></>:<><div><dt>Bộ theo CT</dt><dd>{l.setQuantityByDocument??"—"}</dd></div><div><dt>Thùng theo CT</dt><dd>{l.barrelQuantityByDocument??"—"}</dd></div><div><dt>Bộ thực tế</dt><dd>{l.setQuantityByReal??"—"}</dd></div><div><dt>Thùng thực tế</dt><dd>{l.barrelQuantityByReal??"—"}</dd></div></>}</dl></article>)}</div>{!detail.purchaseOrderLines.length&&!detail.inboundRequestLines.length&&<Notice title="Không có dòng hàng" text="ERP không trả về dòng hàng tại trang này."/>}<div className="table-footer"><span>Trang {page}</span><div className="pagination"><Button variant="outline" size="icon" disabled={page===1||busy} aria-label="Trang dòng hàng trước" onClick={()=>setPage(p=>p-1)}><ChevronLeft size={16}/></Button><Button variant="outline" size="icon" disabled={!detail.hasMore||busy||page>=1000} aria-label="Trang dòng hàng tiếp theo" onClick={()=>setPage(p=>p+1)}><ChevronRight size={16}/></Button></div></div></>:null}</RecordSection><RecordSection title="Ghi chú"><p className="text-sm text-muted-foreground">Dịch vụ đọc chưa cung cấp ghi chú cho phiếu này.</p></RecordSection></div></RecordDialog>;
}
function Transfers(){const [stage,setStage]=useState(0);return <><section className="panel"><div className="panel-heading"><h2>Quy trình điều chuyển</h2><Badge variant="outline">8 giai đoạn</Badge></div><p className="panel-intro">Chọn giai đoạn để xem phạm vi công việc. Các bước được tách riêng theo hệ thống ERP.</p><div className="stage-grid">{transferStages.map((s,i)=><button className={stage===i?"stage-card active":"stage-card"} key={s.form} onClick={()=>setStage(i)}><span className="stage-index">{String(i+1).padStart(2,"0")}</span><strong>{s.label}</strong>{stage===i?<CheckCircle2 size={17}/>:<ChevronRight size={17}/>}</button>)}</div></section><section className="panel stage-detail"><div className="panel-heading"><div><span className="page-eyebrow">GIAI ĐOẠN {stage+1}</span><h2>{transferStages[stage].label}</h2></div><ArrowLeftRight size={21}/></div><Notice title="Chưa thể tải danh sách điều chuyển" text="Dịch vụ cho giai đoạn này chưa được cung cấp. Không có thao tác điều chuyển nào được gửi từ màn hình này."/></section></>;}
function Reports(){return <section className="panel"><div className="panel-heading"><h2>Báo cáo</h2></div><Notice title="Chưa có báo cáo được cung cấp" text="Danh mục, tham số và quyền chạy báo cáo được ERP cung cấp theo tài khoản. Tác vụ và kết quả sẽ xuất hiện tại đây khi dịch vụ báo cáo được kết nối."/></section>;}
function Unavailable({screen}:{screen:ScreenId}){const s=screens.find(x=>x.id===screen)!;const disabled="sourceDisabled"in s&&s.sourceDisabled;return <section className="panel"><div className="panel-heading"><h2>{s.label}</h2><Badge variant="outline">{disabled?"Chưa được mở":"Chưa khả dụng"}</Badge></div><Notice title={disabled?"Màn hình đang được tắt trong nguồn ERP":"Dịch vụ nghiệp vụ chưa sẵn sàng"} text={disabled?"Yêu cầu hóa đơn chưa được mở trong cấu hình nguồn. Quyền truy cập cần được xác nhận trước khi sử dụng.":"Khi ERP cung cấp dịch vụ và quyền tương ứng, dữ liệu sẽ được tích hợp vào màn hình này."}/></section>;}
function Settings({compact,setCompact,dark,setDark,palette,setPalette,health,healthError,checking,checkHealth,checkedAt,workspace,extend}:{compact:boolean;setCompact:(v:boolean)=>void;dark:boolean;setDark:(v:boolean)=>void;palette:PaletteId;setPalette:(v:PaletteId)=>void;health:Awaited<ReturnType<typeof getHealth>>|null;healthError:unknown;checking:boolean;checkHealth:()=>Promise<void>;checkedAt:string|null;workspace:WorkspaceData|null;extend:()=>Promise<void>}){const labels:Record<string,string>={process:"Dịch vụ ứng dụng",database:"Cơ sở dữ liệu",legacy_adapter:"Kết nối ERP",business_release:"Nghiệp vụ production"};const status:Record<string,string>={healthy:"Khả dụng",not_configured:"Chưa cấu hình",unavailable:"Không khả dụng"};return <div className="settings-grid"><section className="panel"><div className="panel-heading"><h2>Không gian cá nhân</h2><SlidersHorizontal size={19}/></div><div className="setting-row"><div><strong>Giao diện tối</strong><p>Giảm độ sáng trong môi trường làm việc tối.</p></div><Switch checked={dark} onCheckedChange={setDark} aria-label="Giao diện tối"/></div><fieldset className="palette-setting"><legend>Màu giao diện</legend><p>Áp dụng cho nút, menu và điểm nhấn ở cả hai chế độ.</p><div className="palette-options">{paletteOptions.map(option=><button key={option.id} type="button" className="palette-choice" aria-pressed={palette===option.id} onClick={()=>setPalette(option.id)}><span className={option.id==="monochrome"?"palette-swatch monochrome-swatch":"palette-swatch"} style={{"--palette-swatch":option.swatch} as CSSProperties} aria-hidden="true"/><span>{option.name}</span>{palette===option.id&&<Check size={16} aria-hidden="true"/>}</button>)}</div></fieldset><div className="setting-row"><div><strong>Bảng dữ liệu gọn</strong><p>Hiển thị nhiều dòng hơn trên cùng màn hình.</p></div><Switch checked={compact} onCheckedChange={setCompact} aria-label="Bảng dữ liệu gọn"/></div><p className="panel-intro">Các tùy chỉnh này chỉ được lưu trên thiết bị đang sử dụng.</p></section><section className="panel"><div className="panel-heading"><h2>Kết nối hệ thống</h2><Button variant="outline" aria-disabled={checking} onClick={()=>{if(!checking)void checkHealth();}}><RefreshCw size={15} className={checking?"spin":""}/>Kiểm tra lại</Button></div>{health?health.checks.map(c=><div className="setting-row" key={c.component}><strong>{labels[c.component]??c.component}</strong><Badge variant="outline">{status[c.status]??c.status}</Badge></div>):<div className="connection-state"><WifiOff size={28}/><strong>{healthError?errorMessage(healthError):"Đang kiểm tra kết nối…"}</strong><p>Quản trị viên cần cung cấp kết nối backend HTTPS để truy cập ERP.</p></div>}<div className="settings-check-time">{checkedAt?`Kiểm tra gần nhất: ${time(checkedAt)}`:"Chưa kiểm tra"}</div></section><section className="panel session-panel"><div className="panel-heading"><h2>Phiên làm việc ERP</h2><ShieldCheck size={19}/></div>{workspace?<><div className="detail-summary"><div><span>Tài khoản</span><strong>{workspace.session.displayName}</strong></div><div><span>Đơn vị</span><strong>{workspace.session.companyName}</strong></div><div><span>Hết hạn không hoạt động</span><strong>{time(workspace.session.idleExpiresAt)}</strong></div><div><span>Giới hạn phiên</span><strong>{time(workspace.session.absoluteExpiresAt)}</strong></div></div><Button variant="outline" onClick={()=>void extend()}><Clock3 size={15}/>Gia hạn phiên</Button></>:<p className="panel-intro">Chưa có phiên ERP. Đăng nhập bằng tài khoản ERP để truy cập dữ liệu được cấp quyền.</p>}</section></div>;}
