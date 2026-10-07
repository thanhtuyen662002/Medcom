// Presentation only. Numeric identity and all workflow/command rules stay unchanged.
export function documentStatusLabel(statusId:number|null|undefined,statusName?:string|null):string {
  if(statusId==null)return "Chưa có trạng thái";
  if(typeof statusName==="string"&&statusName.trim().length>0&&statusName.length<=100
    &&!/[\p{Cc}\p{Cs}]/u.test(statusName))return statusName;
  return `Trạng thái chưa xác định (mã ${statusId})`;
}
