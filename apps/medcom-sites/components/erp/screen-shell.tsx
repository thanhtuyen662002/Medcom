import type {ReactNode,Ref} from "react";
/** Shared heading geometry for the shell and each mounted list. */
export function ScreenHeader({title,description,eyebrow,actions,level=2,titleRef}:{title:string;description?:string;eyebrow?:ReactNode;actions?:ReactNode;level?:1|2;titleRef?:Ref<HTMLHeadingElement>}){
 const Heading=level===1?"h1":"h2";
 return <header className={level===1?"page-heading":"request-list-header"}><div>{eyebrow&&<div className="page-eyebrow">{eyebrow}</div>}<Heading ref={titleRef} tabIndex={titleRef?-1:undefined} className="request-title scroll-mt-24">{title}</Heading>{description&&<p className="screen-description">{description}</p>}</div>{actions&&<div className="heading-actions">{actions}</div>}</header>;
}
