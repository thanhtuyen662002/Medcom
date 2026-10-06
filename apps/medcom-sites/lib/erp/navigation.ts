import {screens,type ScreenId} from "./catalog";
import type {WorkspaceData} from "./contracts";

/** Local shell entries are safe; business shortcuts require server navigation
 * and, where known, the current capability. Never trust a returned href. */
export function authorizedScreenIds(workspace:WorkspaceData|null):ScreenId[]{
 const business:ScreenId[]=[];
 for(const item of workspace?.navigation??[]){
  const screen=screens.find(s=>s.id===item.id);
  if(!screen||screen.id==="home"||screen.id==="settings")continue;
  if("sourceDisabled"in screen&&screen.sourceDisabled)continue;
  if("capability"in screen&&!workspace!.session.capabilities.includes(screen.capability))continue;
  if(!business.includes(screen.id))business.push(screen.id);
 }
 return ["home",...business,"settings"];
}

/** Interim adapter for the existing workspace DTO. Role configuration is not
 * invented or saved locally: its API is an explicit backend handoff. */
export function mobileQuickScreenIds(workspace:WorkspaceData|null):ScreenId[]{
 return authorizedScreenIds(workspace).filter(id=>id!=="home"&&id!=="settings").slice(0,2);
}

/** Observation versions still fence query data, but do not identify a new UI
 * authorization scope. A new login boundary always retires local preferences.
 * The current DTO has no principal ID; include its observable identity and
 * fixed session lifetime, without treating a display name alone as identity. */
export function workspaceStateScope(workspace:WorkspaceData|null,loginBoundary=0):string{
 if(!workspace)return JSON.stringify([loginBoundary,"anonymous"]);
 const set=(values:readonly string[])=>[...new Set(values)].sort();
 const session=workspace.session;
 return JSON.stringify([loginBoundary,session.displayName,session.tenantId,session.companyId,
  session.companyName,Date.parse(session.absoluteExpiresAt),set(session.capabilities),
  set(workspace.branchIds),set(authorizedScreenIds(workspace))]);
}

/** Prevent late authority reads from reviving a logged-out or superseded UI. */
export class AuthorityFence{
 private generation=0;
 begin(){return ++this.generation;}
 isCurrent(generation:number){return generation===this.generation;}
 invalidate(){this.generation++;}
}

/** Read controls belong to a verified server session/rights scope, not an
 * observation number, clock extension, display name or request generation. */
export function workspaceReadViewScope(workspace:WorkspaceData):string{
 const set=(values:readonly string[])=>[...new Set(values)].sort();
 if(!workspace.sessionScope||!workspace.readScope)return "unverified";
 return JSON.stringify([workspace.sessionScope,workspace.readScope,workspace.session.tenantId,
  workspace.session.companyId,set(workspace.session.capabilities),set(workspace.branchIds),set(authorizedScreenIds(workspace))]);
}
