import type {ItemDisplayBinding,ItemDisplayContext,ItemDisplaySourceLine} from "@/lib/erp/item-display";
import {itemDisplayFor,itemDisplayValue} from "@/lib/erp/item-display";

/** Standalone read-only identity group. Internal line keys are never visible or labelled. */
export function ItemIdentity({context,binding,line}: {context?:ItemDisplayContext|null;binding:ItemDisplayBinding;line:ItemDisplaySourceLine}){
 const display=itemDisplayFor(context,binding,line);
 const fields=[["Mã hàng",line.itemId],["Mã hàng NSX",display.manufacturerItemCode],
  ["Tên hàng / dịch vụ",display.itemName],["ĐVT",display.unit]] as const;
 return <dl aria-label="Thông tin mặt hàng" className="item-identity">
  {fields.map(([label,value],index)=><div key={label} className={`item-identity-field item-identity-field-${index}`}>
   <dt>{label}</dt>
   <dd className={value==null?"item-identity-unavailable":undefined}>{itemDisplayValue(value)}</dd>
  </div>)}
 </dl>;
}
