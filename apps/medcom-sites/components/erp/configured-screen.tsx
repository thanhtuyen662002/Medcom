"use client";
import {useEffect} from "react";
import {useQuery} from "@tanstack/react-query";
import {Skeleton} from "@/components/ui/skeleton";
import {DocumentEditor} from "./document-editor";
import {ErrorPanel} from "./feedback";
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from "@/components/ui/sheet";
import {useNavigationGuard} from "./navigation-guard";
import {useQueryClient} from "@tanstack/react-query";
import {ApiError} from "@/lib/erp/api";
import type {WorkspaceExtensions} from "@/lib/erp/extensions";
import type {WorkspaceData,DocumentKind,DocumentRow} from "@/lib/erp/contracts";
import {documentSnapshotSchema} from "@/lib/erp/ui-contracts";
import {authorizedScreenIds} from "@/lib/erp/navigation";
export function ConfiguredDocumentSheet({screen,workspace,extension,selected,close,onDenied}:{screen:DocumentKind;workspace:WorkspaceData;extension:NonNullable<WorkspaceExtensions["documentScreens"]>[DocumentKind];selected:DocumentRow|null;close:()=>void;onDenied:(error:unknown)=>void}){const {request}=useNavigationGuard();return <Sheet open={!!selected} onOpenChange={open=>{if(!open)request(close);}}><SheetContent className="detail-sheet"><SheetHeader><SheetTitle>{selected?.documentId??"Chứng từ"}</SheetTitle><SheetDescription>Thông tin và thao tác do ERP xác nhận</SheetDescription></SheetHeader>{selected&&<ConfiguredScreen key={selected.documentId} screen={screen} documentId={selected.documentId} workspace={workspace} extension={extension} onDenied={onDenied}/>}</SheetContent></Sheet>;}
function ConfiguredScreen({screen,documentId,workspace,extension,onDenied}:{screen:DocumentKind;documentId:string;workspace:WorkspaceData;extension:NonNullable<WorkspaceExtensions["documentScreens"]>[DocumentKind];onDenied:(error:unknown)=>void}){
 const client=useQueryClient();const scope=JSON.stringify([workspace.session.tenantId,workspace.session.companyId,workspace.session.authorityVersion,workspace.session.absoluteExpiresAt,screen,documentId]);const allowed=authorizedScreenIds(workspace).includes(screen);
 const query=useQuery({queryKey:["erp-configured-screen",scope],queryFn:async({signal})=>{const snapshot=documentSnapshotSchema.parse(await extension!.load(documentId,workspace,signal));if(snapshot.id!==documentId)throw new ApiError(502,"invalid_api_response");return snapshot;},enabled:allowed&&!!extension,gcTime:0,retry:false,refetchOnWindowFocus:false,refetchOnReconnect:false});
 useEffect(()=>{if(query.error)onDenied(query.error);},[query.error,onDenied]);
 if(!allowed||!extension)return <div className="erp-feedback">Chưa được ERP cấp quyền mở màn hình.</div>;
 if(query.error)return <ErrorPanel error={query.error} retry={()=>void query.refetch()}/>;
 if(!query.data)return <Skeleton className="h-60" aria-label="Đang tải chứng từ"/>;
 return <DocumentEditor key={scope} snapshot={query.data} adapter={extension.adapter} lookupAdapter={extension.lookup} onConfirmed={()=>{void query.refetch();void client.invalidateQueries({queryKey:["erp-documents"]});}} onDenied={onDenied}/>;
}
