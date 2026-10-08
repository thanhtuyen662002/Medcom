/** Bounded presentation memory. No rows, document selections or command custody. */
export type ListScreen = "purchase-requests" | "purchase-orders" | "inbound-requests";
export type ListControls = {draftSearch:string;appliedSearch:string;draftBranch:string;appliedBranch:string;page:number;top:number;left:number;windowTop:number};
export const emptyListControls:ListControls={draftSearch:"",appliedSearch:"",draftBranch:"",appliedBranch:"",page:1,top:0,left:0,windowTop:0};
const screens:readonly ListScreen[]=["purchase-requests","purchase-orders","inbound-requests"];
const text=(value:unknown,limit:number)=>typeof value==="string"?value.slice(0,limit):"";
const offset=(value:unknown)=>typeof value==="number"&&Number.isFinite(value)?Math.max(0,Math.min(10000000,value)):0;
export function cleanListControls(input:Partial<ListControls>):ListControls {
 return {draftSearch:text(input.draftSearch,100),appliedSearch:text(input.appliedSearch,100),draftBranch:text(input.draftBranch,100),appliedBranch:text(input.appliedBranch,100),page:Number.isInteger(input.page)?Math.max(1,Math.min(1000,input.page!)):1,top:offset(input.top),left:offset(input.left),windowTop:offset(input.windowTop)};
}
export function createListViewStore(){
 let scope:string|null=null,epoch=0,purchaseScope:string|null=null;
 const slots=new Map<ListScreen,ListControls>(),listeners=new Set<()=>void>();
 const emit=()=>{for(const callback of listeners)callback();};
 const retire=()=>{scope=null;purchaseScope=null;slots.clear();epoch++;emit();};
 return {
  getEpoch:()=>epoch, subscribe:(callback:()=>void)=>{listeners.add(callback);return ()=>{listeners.delete(callback);};},
  /** Called only by root on a current verified workspace response. Equal scopes
   * after B or terminal retirement are new incarnations; null recovery is inert. */
  admit(next:string){if(!next||next==="unverified"){retire();return;}if(next!==scope){retire();scope=next;}},
  retire,
  read(screen:ListScreen,ticket=epoch){return ticket===epoch&&scope!==null&&screens.includes(screen)?{...(slots.get(screen)??emptyListControls)}:{...emptyListControls};},
  save(screen:ListScreen,ticket:number,controls:ListControls){if(ticket!==epoch||scope===null||!screens.includes(screen))return false;slots.set(screen,cleanListControls(controls));return true;},
  /** Binding metadata is only the single current purchase READ-scope identity,
   * never a bootstrap/proof/branch DTO. Fresh bootstrap supplies the branches. */
  qualifyPurchase(ticket:number,next:string,branches:readonly string[]){
   if(ticket!==epoch||scope===null)return null;
   if(purchaseScope!==null&&purchaseScope!==next)slots.delete("purchase-requests");
   purchaseScope=next;
   const value=this.read("purchase-requests",ticket);
   if(value.appliedBranch&&!branches.includes(value.appliedBranch)){value.appliedBranch="";value.page=1;value.top=0;value.left=0;value.windowTop=0;}
   if(value.draftBranch&&!branches.includes(value.draftBranch))value.draftBranch="";
   return value;
  },
 };
}
export type ListViewStore=ReturnType<typeof createListViewStore>;
