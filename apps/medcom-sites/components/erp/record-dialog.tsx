"use client";
import {useContext,type ReactNode} from "react";
import {createPortal} from "react-dom";
import {RecordActionHost} from "./request-presentation";

/** Reuses the record footer; submit buttons retain their explicit form owner.
 * Standalone editors retain the same inline action bar. No command lives here. */
export function RecordActionBar({children,className,presentationAllowed=true}:{children:ReactNode;className?:string;presentationAllowed?:boolean}){
 const host=useContext(RecordActionHost);const actions=<div className={className} hidden={!presentationAllowed} inert={!presentationAllowed} aria-hidden={!presentationAllowed}>{children}</div>;
 return host?createPortal(actions,host):actions;
}

/** Read/recovery actions stay inline and separate from the guarded write footer. */
export function RecordDetailToolbar({children}:{children:ReactNode}){
 return <div className="record-detail-toolbar" role="group" aria-label="Thao tác phiếu">{children}</div>;
}

/** Shared name for the proven retained request-detail foundation. */
export {RequestDetailDialog as RecordDialog} from "./request-detail-dialog";
