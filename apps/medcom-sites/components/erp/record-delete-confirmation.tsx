"use client";
import {useLayoutEffect,useRef,useState} from "react";
import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from "@/components/ui/alert-dialog";
/** Presentation only. Caller provides current eligibility and owns all mutations. */
export function RecordDeleteConfirmation({open,identity,onCancel,onConfirm,isAllowed,presentationAllowed,intent=identity}:{open:boolean;identity:string;onCancel:()=>void;onConfirm:()=>void;isAllowed:()=>boolean;presentationAllowed:boolean;intent?:unknown}){
 const shown=open&&presentationAllowed;
 const [presentation,setPresentation]=useState({shown,intent,revision:0});
 if(presentation.shown!==shown||presentation.intent!==intent)setPresentation({shown,intent,revision:presentation.revision+1});
 const live=useRef({isAllowed,intent,presentationAllowed,open,revision:presentation.revision});
 useLayoutEffect(()=>{live.current={isAllowed,intent,presentationAllowed,open,revision:presentation.revision};},[isAllowed,intent,presentationAllowed,open,presentation.revision]);
 return <AlertDialog open={shown} onOpenChange={value=>{if(!value)onCancel();}}><AlertDialogContent hidden={!shown} inert={!shown} aria-hidden={!shown} style={{display:shown?undefined:"none"}} onCloseAutoFocus={event=>{if(!live.current.isAllowed())event.preventDefault();}}><AlertDialogHeader><AlertDialogTitle>Xóa dòng hàng?</AlertDialogTitle><AlertDialogDescription>{identity}. Thay đổi chỉ được lưu sau khi ERP xác nhận thao tác Lưu.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel onClick={onCancel}>Giữ dòng</AlertDialogCancel><AlertDialogAction disabled={!shown} onClick={()=>{if(live.current.intent!==intent||live.current.revision!==presentation.revision)return;if(live.current.open&&live.current.presentationAllowed&&live.current.isAllowed())onConfirm();else onCancel();}}>Xóa dòng</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}
