"use client";
import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from "react";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {Skeleton} from "@/components/ui/skeleton";
import {canDispatchDocumentEdit,DocumentEditor} from "./document-editor";
import {ErrorPanel} from "./feedback";
import {RequestDetailDialog,useDetailPresentationProof} from "./request-detail-dialog";
import {useNavigationGuard} from "./navigation-guard";
import {ApiError} from "@/lib/erp/api";
import type {WorkspaceExtensions} from "@/lib/erp/extensions";
import type {WorkspaceData,DocumentKind,DocumentRow} from "@/lib/erp/contracts";
import type {DocumentAdapter,DocumentSnapshot,ScreenDefinition} from "@/lib/erp/presentation";
import {documentSnapshotSchema} from "@/lib/erp/ui-contracts";
import {authorizedScreenIds} from "@/lib/erp/navigation";
type ConfiguredSheetProps={screen:DocumentKind;workspace:WorkspaceData|null;extension:NonNullable<WorkspaceExtensions["documentScreens"]>[DocumentKind];selected:DocumentRow|null;documentId?:string|null;presentationAllowed?:boolean;isPresentationAllowed?:()=>boolean;close:()=>void;onDenied:(error:unknown)=>void};
export function ConfiguredDocumentSheet({screen,workspace,extension,selected,documentId=selected?.documentId??null,presentationAllowed=true,isPresentationAllowed,close,onDenied}:ConfiguredSheetProps){
 const {request}=useNavigationGuard();
 // The selected identity comes from the owning Documents state even while its
 // fresh row is masked. This never supplies remembered workspace authority.
 return <RequestDetailDialog open={documentId!==null} presentationAllowed={presentationAllowed&&workspace!==null} title={selected?.documentId??"Chứng từ"} closeLabel="Đóng chứng từ" onRequestClose={()=>request(close)}>
  {documentId&&<ConfiguredScreen key={documentId} screen={screen} documentId={documentId} workspace={workspace} presentationAllowed={presentationAllowed} isPresentationAllowed={isPresentationAllowed} extension={extension} onDenied={onDenied}/>}</RequestDetailDialog>;
}
function ConfiguredScreen({screen,documentId,workspace,presentationAllowed,isPresentationAllowed,extension,onDenied}:{screen:DocumentKind;documentId:string;workspace:WorkspaceData|null;presentationAllowed:boolean;isPresentationAllowed?:()=>boolean;extension:NonNullable<WorkspaceExtensions["documentScreens"]>[DocumentKind];onDenied:(error:unknown)=>void}){
 const client=useQueryClient();
 const scope=workspace?JSON.stringify([workspace.sessionScope,workspace.readScope,workspace.session.tenantId,workspace.session.companyId,workspace.session.authorityVersion,screen,documentId]):null;
 // An authority observation refreshes the query, not the original operation's
 // custody. Only an actual session/read/tenant/company boundary retires it.
 const custodyScope=workspace?JSON.stringify([workspace.sessionScope,workspace.readScope,workspace.session.tenantId,workspace.session.companyId,screen,documentId]):null;
 const allowed=presentationAllowed&&!!workspace&&authorizedScreenIds(workspace).includes(screen);
 const query=useQuery({queryKey:["erp-configured-screen",scope],queryFn:async({signal})=>{if(!workspace||!extension)throw new ApiError(403,"configured_screen_unavailable");const snapshot=documentSnapshotSchema.parse(await extension.load(documentId,workspace,signal));if(snapshot.id!==documentId)throw new ApiError(502,"invalid_api_response");return snapshot;},enabled:allowed&&!!extension,gcTime:0,retry:false,refetchOnWindowFocus:false,refetchOnReconnect:false});
 // Keep the previous read's identity while masked. A cached definition is not
 // a fresh recovery proof; dataUpdatedAt also distinguishes an identical read.
 const proof=useMemo(()=>query.data?{snapshot:query.data,updatedAt:query.dataUpdatedAt}:null,[query.data,query.dataUpdatedAt]);
 const presentationReady=useDetailPresentationProof(allowed,proof,()=>{void query.refetch();});
 const [admitted,setAdmitted]=useState<{snapshot:DocumentSnapshot;scope:string|null}|null>(null);
 if(!admitted&&allowed&&!query.error&&proof)setAdmitted({snapshot:proof.snapshot,scope:custodyScope});
 const shown=allowed&&!query.error&&presentationReady&&!!proof&&(!admitted||admitted.scope===custodyScope);
 const currentDefinition=shown?proof.snapshot.definition:null;
 const access=useRef<{definition:ScreenDefinition|null;scope:string|null;extension:typeof extension}>({definition:null,scope:null,extension}),rootPresentation=useRef(isPresentationAllowed);
 useLayoutEffect(()=>{access.current={definition:currentDefinition,scope:custodyScope,extension};rootPresentation.current=isPresentationAllowed;},[currentDefinition,custodyScope,extension,isPresentationAllowed]);
 useLayoutEffect(()=>()=>{access.current={definition:null,scope:null,extension:undefined};},[]);
 const canRead=useCallback(()=>!!admitted&&access.current.scope===admitted.scope&&access.current.extension===extension&&!!access.current.definition&&(rootPresentation.current?.()??true),[admitted,extension]);
 const guardedAdapter=useMemo<DocumentAdapter|null>(()=>extension?{
  save:(snapshot,values,actionId)=>canRead()&&snapshot.id===documentId&&canDispatchDocumentEdit(snapshot,values,actionId,access.current.definition)?extension.adapter.save(snapshot,values,actionId):Promise.reject(new ApiError(403,"configured_screen_unavailable")),
  // An already-dispatched operation keeps its original identity. A revoked
  // save grant must not prevent its reconciliation under the same read scope.
  reconcile:input=>canRead()&&input.documentId===documentId?extension.adapter.reconcile(input):Promise.reject(new ApiError(403,"configured_screen_unavailable")),
  reload:id=>canRead()&&id===documentId?extension.adapter.reload(id):Promise.reject(new ApiError(403,"configured_screen_unavailable")),
 }:null,[extension,documentId,canRead]);
 useEffect(()=>{if(query.error)onDenied(query.error);},[query.error,onDenied]);
 return <>
  {allowed&&query.error&&<ErrorPanel error={query.error} retry={()=>void query.refetch()}/>}
  {!shown&&<Skeleton className="h-60" aria-label="Đang xác minh chứng từ"/>}
  <div hidden={!shown} inert={!shown} aria-hidden={!shown}>{admitted&&extension&&<DocumentEditor snapshot={admitted.snapshot} currentDefinition={currentDefinition} adapter={guardedAdapter!} lookupAdapter={extension.lookup} onConfirmed={()=>{if(canRead())void query.refetch();void client.invalidateQueries({queryKey:["erp-documents"]});}} onDenied={onDenied}/>}</div>
 </>;
}
