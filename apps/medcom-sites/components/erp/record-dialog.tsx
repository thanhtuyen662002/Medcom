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

/** Shared name for the proven retained request-detail foundation. */
export {RequestDetailDialog as RecordDialog} from "./request-detail-dialog";
