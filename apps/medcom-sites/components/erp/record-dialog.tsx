"use client";
import {useContext,useId,type ComponentProps,type ReactNode} from "react";
import {createPortal} from "react-dom";
import {cn} from "@/lib/utils";
import {RecordActionHost,RecordSecondaryHost,RecordStatusHost,RecordDetailContext,requestStyles} from "./request-presentation";

/** Reuses the record footer; submit buttons retain their explicit form owner.
 * Standalone editors retain the same inline action bar. No command lives here. */
export function RecordActionBar({children,className,presentationAllowed=true}:{children:ReactNode;className?:string;presentationAllowed?:boolean}){
 const host=useContext(RecordActionHost);const actions=<div className={className} hidden={!presentationAllowed} inert={!presentationAllowed} aria-hidden={!presentationAllowed}>{children}</div>;
 return host?createPortal(actions,host):actions;
}

/** Secondary reads share one header group; standalone callers stay inline.
 * The explicit presentation gate also applies after portaling out of a masked body. */
export function RecordDetailToolbar({children,presentationAllowed=true}:{children:ReactNode;presentationAllowed?:boolean}){
 const host=useContext(RecordSecondaryHost);
 const content=<div className="record-detail-toolbar" role={host?undefined:"group"} aria-label={host?undefined:"Thao tác phiếu"} hidden={!presentationAllowed} inert={!presentationAllowed} aria-hidden={!presentationAllowed}>{children}</div>;
 return host?createPortal(content,host):content;
}
export function RecordDetailStatus({children,presentationAllowed=true}:{children:ReactNode;presentationAllowed?:boolean}){
 const host=useContext(RecordStatusHost);
 const content=<div className="record-detail-status" hidden={!presentationAllowed} inert={!presentationAllowed} aria-hidden={!presentationAllowed}>{children}</div>;
 return host?createPortal(content,host):content;
}
/** Dialog owns document identity; standalone editors retain their own heading. */
export function RecordDetailHeading({title,documentNumber,children}:{title:string;documentNumber?:string|null;children?:ReactNode}){
 const embedded=useContext(RecordDetailContext);
 return <header className={embedded?"record-detail-state":requestStyles.section}>{!embedded&&<><h2 className={requestStyles.title}>{title}</h2>{documentNumber&&<p>Mã phiếu: <strong>{documentNumber}</strong></p>}</>}{children}</header>;
}
export function RecordSection({title,description,children,className,...props}:Omit<ComponentProps<"section">,"title">&{title:string;description?:ReactNode}){
 const id=useId();
 return <section {...props} className={cn("record-section",className)} aria-labelledby={props["aria-label"]?undefined:id}>
  <div className="record-section-heading"><h3 id={id}>{title}</h3>{description&&<div className={requestStyles.muted}>{description}</div>}</div>{children}
 </section>;
}
export function RecordFieldset({title,children,className,...props}:Omit<ComponentProps<"fieldset">,"title">&{title:string}){
 return <fieldset {...props} className={cn("record-section record-fieldset",className)}><legend>{title}</legend><div className="record-field-grid">{children}</div></fieldset>;
}

/** Shared name for the proven retained request-detail foundation. */
export {RequestDetailDialog as RecordDialog} from "./request-detail-dialog";
