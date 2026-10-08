import {Skeleton} from "@/components/ui/skeleton";
/** Authority remains unverified. Geometry imitates an empty table/form, never rows. */
export function ListLoading({label="Đang tải chứng từ…",form=false}:{label?:string;form?:boolean}){
 return <div role="status" aria-label={label} aria-busy="true" className={form?"verification-skeleton form-skeleton":"verification-skeleton"}><span className="sr-only">{label}</span><div aria-hidden="true"><div className="skeleton-heading"><Skeleton/><Skeleton/></div>{form?<div className="skeleton-fields">{Array.from({length:6},(_,i)=><div key={i}><Skeleton/><Skeleton/></div>)}</div>:<><div className="skeleton-toolbar"><Skeleton/><Skeleton/><Skeleton/></div><div className="skeleton-table"><div className="skeleton-table-head">{[0,1,2,3].map(i=><Skeleton key={i}/>)}</div>{Array.from({length:6},(_,i)=><div className="skeleton-table-row" key={i}>{[0,1,2,3].map(j=><Skeleton key={j}/>)}</div>)}</div></>}</div></div>;
}
