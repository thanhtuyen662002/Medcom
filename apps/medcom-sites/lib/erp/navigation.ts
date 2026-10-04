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

/** Prevent late authority reads from reviving a logged-out or superseded UI. */
export class AuthorityFence{
 private generation=0;
 begin(){return ++this.generation;}
 isCurrent(generation:number){return generation===this.generation;}
 invalidate(){this.generation++;}
}
