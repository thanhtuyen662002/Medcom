import type {ItemDisplayBinding,ItemDisplayContext,ItemDisplaySourceLine} from "@/lib/erp/item-display";
import {itemDisplayFor,itemDisplayValue} from "@/lib/erp/item-display";

/** Standalone read-only identity group. Internal line keys are never visible or labelled. */
export function ItemIdentity({context,binding,line}: {context?:ItemDisplayContext|null;binding:ItemDisplayBinding;line:ItemDisplaySourceLine}){
 const display=itemDisplayFor(context,binding,line);
 const fields=[["Mã hàng",line.itemId],["Mã hàng NSX",display.manufacturerItemCode],
  ["Tên hàng / dịch vụ",display.itemName],["ĐVT",display.unit]] as const;
 return <dl aria-label="Thông tin mặt hàng" className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
  {fields.map(([label,value])=><div key={label} className="min-w-0 rounded-md border p-2">
   <dt className="text-xs text-muted-foreground">{label}</dt>
   <dd className="whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{itemDisplayValue(value)}</dd>
  </div>)}
 </dl>;
}
