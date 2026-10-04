"use client";
import {useEffect,useState} from "react";
import {Copy,RefreshCw,WifiOff,Clock3} from "lucide-react";
import {Button} from "@/components/ui/button";
import {ApiError,errorMessage} from "@/lib/erp/api";
import {sessionRemaining} from "@/lib/erp/presentation";
import type {Session} from "@/lib/erp/contracts";

export function ErrorPanel({error,retry}:{error:unknown;retry?:()=>void}){
 const [copied,setCopied]=useState(false);const reference=error instanceof ApiError?error.correlationId:undefined;
 return <div className="erp-feedback" role="alert"><strong>{errorMessage(error)}</strong>{reference&&<div className="support-reference"><span>Mã hỗ trợ: <code>{reference}</code></span><Button variant="ghost" size="sm" onClick={async()=>{try{await navigator.clipboard.writeText(reference);setCopied(true);}catch{setCopied(false);}}}><Copy size={14}/>{copied?"Đã sao chép":"Sao chép"}</Button></div>}{retry&&<Button variant="outline" size="sm" onClick={retry}><RefreshCw size={14}/>Thử lại</Button>}</div>;
}
export function Connectivity(){const [online,setOnline]=useState(true);useEffect(()=>{const update=()=>setOnline(navigator.onLine);update();window.addEventListener("online",update);window.addEventListener("offline",update);return()=>{window.removeEventListener("online",update);window.removeEventListener("offline",update);};},[]);return online?null:<div className="erp-feedback connectivity-warning" role="status"><WifiOff size={18}/><div><strong>Mất kết nối mạng</strong><p>Dữ liệu đang hiển thị có thể đã thay đổi. Kết nối và quyền truy cập sẽ được kiểm tra lại khi mạng phục hồi.</p></div></div>;}
export function SessionWarning({session,extend}:{session:Session|null;extend:()=>Promise<void>}){
 const [now,setNow]=useState(Date.now());const [busy,setBusy]=useState(false);
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),10000);return()=>clearInterval(timer);},[]);
 if(!session)return null;const remaining=sessionRemaining(session.idleExpiresAt,session.absoluteExpiresAt,now);if(remaining===0||remaining>300000)return null;
 const absoluteFirst=Date.parse(session.absoluteExpiresAt)<=Date.parse(session.idleExpiresAt);
 return <div className="erp-feedback session-warning" role="status"><Clock3 size={20}/><div><strong>Phiên làm việc còn khoảng {Math.ceil(remaining/60000)} phút</strong><p>{absoluteFirst?"Phiên sắp đạt giới hạn thời gian. Bạn cần đăng nhập lại để tiếp tục.":"Tiếp tục phiên để tránh gián đoạn công việc."}</p></div>{!absoluteFirst&&<Button disabled={busy} onClick={()=>{if(busy)return;setBusy(true);void extend().finally(()=>setBusy(false));}}>{busy?"Đang xác nhận…":"Tiếp tục phiên"}</Button>}</div>;
}
export function Freshness({updatedAt,fetching,stale}:{updatedAt:number;fetching:boolean;stale:boolean}){
 const [now,setNow]=useState(Date.now());useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
 return <span className="freshness" role="status">{fetching?<><RefreshCw size={13} className="spin"/>Đang làm mới</>:stale?"Cần cập nhật dữ liệu":updatedAt?`Cập nhật ${Math.max(0,Math.floor((now-updatedAt)/1000))} giây trước`:"Chưa tải dữ liệu"}</span>;
}
