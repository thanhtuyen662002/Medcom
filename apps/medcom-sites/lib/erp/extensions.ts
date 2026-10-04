import type {DocumentAdapter,DocumentSnapshot,LookupAdapter,ReportAdapter,RoleNavigation,RoleNavigationAdapter} from "./presentation";
import type {WorkspaceData,DocumentKind} from "./contracts";
/** Integration seam. BE adapters resolve authorized definitions, not raw ERP metadata. */
export type WorkspaceExtensions={
 documentScreens?:Partial<Record<DocumentKind,{load:(documentId:string,workspace:WorkspaceData,signal:AbortSignal)=>Promise<DocumentSnapshot>;adapter:DocumentAdapter;lookup:LookupAdapter}>>;
 reports?:{adapter:ReportAdapter;lookup:LookupAdapter};
 roleNavigation?:{configuration:RoleNavigation;adapter:RoleNavigationAdapter;onPublished:(next:RoleNavigation)=>void};
 effectiveMobileNavigation?:{version:string;entries:RoleNavigation["entries"]};
};
