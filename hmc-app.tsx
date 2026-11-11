import { useCallback, useEffect, useRef, useState } from "react";
import type { Device, Stats, TokenSession } from "./lib/hmc-api";
import { callAdmin, logIn, normalizeSerial, readSession, validSerial, writeSession } from "./lib/hmc-api";
import { parseCsv, parseXlsx, prepareRows, type ImportRow } from "./lib/import-data";
import "./hmc-dashboard.css";


type Tab="overview"|"inventory"|"audit";
type ModalMode="add"|"edit"|"sale"|"delete"|"bulk"|"import"|"scan"|null;
type AuditEvent={id:number;action:string;serial_number:string;created_at:string};
type FormState={serial_number:string;brand:string;model:string;status:"in_stock"|"sold";sale_date:string;notes:string};
const emptyForm=():FormState=>({serial_number:"",brand:"",model:"",status:"in_stock",sale_date:"",notes:""});
const today=()=>new Date().toLocaleDateString("en-CA");
const str=(s:unknown)=>String(s??"");
const formatDate=(s:unknown)=>{if(!s)return"—";const v=new Date(String(s));return isNaN(v.getTime())?String(s):v.toLocaleDateString("ar-IQ",{year:"numeric",month:"short",day:"numeric"})};
const formatNum=(v:number)=>new Intl.NumberFormat("en-US").format(v);
function Icon({name,size=20}:{name:string;size?:number}){
 const lines:Record<string,React.ReactNode>={
   dashboard:<><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
   boxes:<><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/></>,
   shield:<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></>,
   search:<><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
   plus:<path d="M12 5v14M5 12h14"/>,
   upload:<><path d="M12 16V3m0 0-4 4m4-4 4 4"/><path d="M4 16v4h16v-4"/></>,
   download:<><path d="M12 3v13m0 0-4-4m4 4 4-4"/><path d="M4 17v4h16v-4"/></>,
   clock:<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
   logout:<><path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5"/><path d="m16 17 5-5-5-5m5 5H9"/></>,
   check:<><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></>,
   alert:<><path d="m12 2 10 19H2L12 2Z"/><path d="M12 9v4m0 4h.01"/></>,
   edit:<><path d="m4 20 4.5-1 11-11-3.5-3.5-11 11L4 20Z"/><path d="m14 6 4 4"/></>,
   trash:<><path d="M4 7h16m-10 4v7m4-7v7M6 7l1 14h10l1-14M9 7V4h6v3"/></>,
   menu:<path d="M4 6h16M4 12h16M4 18h16"/>,
   close:<path d="M5 5l14 14M19 5 5 19"/>,
   chevron:<path d="m9 6 6 6-6 6"/>,
   refresh:<><path d="M21 11a9 9 0 0 0-16-5L3 8m0-5v5h5"/><path d="M3 13a9 9 0 0 0 16 5l2-2m0 5v-5h-5"/></>,
   scan:<><path d="M3 9V5a2 2 0 0 1 2-2h4m6 0h4a2 2 0 0 1 2 2v4m0 6v4a2 2 0 0 1-2 2h-4m-6 0H5a2 2 0 0 1-2-2v-4"/><path d="M5 12h14"/></>,
   more:<><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
   lock:<><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
   solar:<><circle cx="12" cy="12" r="4"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M4.9 4.9l2.2 2.2m9.8 9.8 2.2 2.2M4.9 19.1l2.2-2.2m9.8-9.8 2.2-2.2"/></>,
 };
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{lines[name]||lines.boxes}</svg>;
}
function Logo({size="md"}:{size?:"md"|"lg"}){
 return <div className={"brand-block "+(size==="lg"?"brand-lg":"")}>
   <div className="brand-icon"><img src="/assets/hmc-logo.webp" alt="" /></div>
   <div className="brand-titles"><strong>HMC <em>SOLAR</em></strong><span>حلول الطاقة الشمسية</span></div>
 </div>;
}
function Toast({message,type,onClose}:{message:string;type:"error"|"success";onClose:()=>void}){
 useEffect(()=>{const id=setTimeout(onClose,7000);return()=>clearTimeout(id)},[message,onClose]);
 return <div role={type==="error"?"alert":"status"} className={"hmc-toast "+type}><Icon name={type==="error"?"alert":"check"}/><span>{message}</span><button aria-label="إغلاق" onClick={onClose}><Icon name="close" size={16}/></button></div>;
}
function Dialog({title,children,onClose,wide=false}:{title:string;children:React.ReactNode;onClose:()=>void;wide?:boolean}){
 return <div className="modal-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
  <section role="dialog" aria-modal="true" aria-label={title} className={"modal "+(wide?"modal-wide":"")}>
   <header className="modal-header"><h2>{title}</h2><button className="icon-btn" aria-label="إغلاق" onClick={onClose}><Icon name="close"/></button></header>
   {children}
  </section>
 </div>;
}
export function HmcAdmin(){
 const [session,setSession]=useState<TokenSession|null>(null);
 const [checking,setChecking]=useState(true);
 const [loginEmail,setLoginEmail]=useState("");
 const [loginPassword,setLoginPassword]=useState("");
 const [loginBusy,setLoginBusy]=useState(false);
 const [verified,setVerified]=useState(false);
 const [tab,setTab]=useState<Tab>("overview");
 const [menuOpen,setMenuOpen]=useState(false);
 const [devices,setDevices]=useState<Device[]>([]);
 const [counts,setCounts]=useState<Stats>({total:0,sold:0,inStock:0});
 const [query,setQuery]=useState("");
 const [search,setSearch]=useState("");
 const [offset,setOffset]=useState(0);
 const [hasMore,setHasMore]=useState(false);
 const [loading,setLoading]=useState(false);
 const [modal,setModal]=useState<ModalMode>(null);
 const [editing,setEditing]=useState<Device|null>(null);
 const [form,setForm]=useState<FormState>(emptyForm());
 const [working,setWorking]=useState(false);
 const [selected,setSelected]=useState<Set<string>>(new Set());
 const [deleteConfirm,setDeleteConfirm]=useState("");
 const [saleSerial,setSaleSerial]=useState("");
 const [saleDevice,setSaleDevice]=useState<Device|null>(null);
 const [saleDate,setSaleDate]=useState(today());
 const [bulkStatus,setBulkStatus]=useState<"in_stock"|"sold">("sold");
 const [importRows,setImportRows]=useState<ImportRow[]>([]);
 const [importSummary,setImportSummary]=useState("");
 const [audit,setAudit]=useState<AuditEvent[]>([]);
 const [auditLoading,setAuditLoading]=useState(false);
 const [toast,setToast]=useState<{message:string;type:"error"|"success"}|null>(null);
 const [scannerTarget,setScannerTarget]=useState<"sale"|"form">("sale");
 const camera=useRef<HTMLVideoElement|null>(null);
 const activeStream=useRef<MediaStream|null>(null);
 const scnTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const signal=useCallback((message:string,type:"error"|"success"="success")=>setToast({message,type}),[]);
 const closeToast=useCallback(()=>setToast(null),[]);
 const liveSession=useCallback(()=>readSession()||session,[session]);
 const api=useCallback(async(body:Record<string,unknown>)=>{
   const current=liveSession();if(!current)throw new Error("سجّل الدخول أولاً");
   return callAdmin(current,body);
 },[liveSession]);

 const refresh=useCallback(async(page=0,term=search)=>{
  setLoading(true);
  try{
   const [stats,listing]=await Promise.all([
     api({action:"stats"}),api({action:"list",offset:page,limit:25,search:term})
   ]);
   setCounts({total:Number(stats.total)||0,sold:Number(stats.sold)||0,inStock:Number(stats.inStock)||0});
   setDevices(listing.items||[]);setOffset(page);setHasMore(Boolean(listing.has_more));setSelected(new Set());
  }catch(e){signal((e as Error).message,"error")}finally{setLoading(false)}
 },[api,search,signal]);

 const loadAudit=useCallback(async()=>{
  setAuditLoading(true);
  try{const r=await api({action:"audit",limit:80,offset:0});setAudit(r.items||[]);}
  catch(e){signal((e as Error).message,"error")}
  finally{setAuditLoading(false)}
 },[api,signal]);

 useEffect(()=>{
  const s=readSession();
  setSession(s);
  setChecking(false);
 },[]);

 useEffect(()=>{
  if(!session){setVerified(false);return}
  let alive=true;
  api({action:"ping"}).then(()=>{
    if(alive){setVerified(true);void refresh(0,"")}
  }).catch(e=>{if(alive){setVerified(false);signal((e as Error).message,"error");}});
  return()=>{alive=false}
 // Only authenticate on token/session change; the helper refreshes the token automatically.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[session?.access_token]);

 function logout(){writeSession(null);setSession(null);setVerified(false);setDevices([]);setCounts({total:0,sold:0,inStock:0});setSelected(new Set());setModal(null);}
 async function signIn(e:React.FormEvent){
  e.preventDefault();setLoginBusy(true);
  try{
   const s=await logIn(loginEmail,loginPassword);writeSession(s);
   const r=await callAdmin(s,{action:"ping"});
   if(!r.ok)throw new Error("هذا الحساب غير مخوّل");
   setSession(readSession()||s);setLoginPassword("");setVerified(true);signal("تم تسجيل الدخول إلى نظام HMC");
  }catch(e){writeSession(null);signal((e as Error).message,"error")}
  finally{setLoginBusy(false)}
 }
 function openAdd(){setForm(emptyForm());setEditing(null);setModal("add")}
 function openEdit(device:Device){setEditing(device);setForm({serial_number:device.serial_number,brand:device.brand,model:device.model,status:device.status,sale_date:device.sale_date||"",notes:device.notes||""});setModal("edit")}
 function openQuickSale(){setSaleSerial("");setSaleDevice(null);setSaleDate(today());setModal("sale")}
 function editField<K extends keyof FormState>(key:K,value:FormState[K]){setForm(prev=>({...prev,[key]:value}))}
 async function saveDevice(e:React.FormEvent){
  e.preventDefault();
  const sn=normalizeSerial(form.serial_number);
  if(!validSerial(sn))return signal("السيريال يجب أن يكون بين 6 و80 رمزاً وبصيغة صحيحة","error");
  if(!form.brand.trim()||!form.model.trim())return signal("أدخل الشركة المصنعة والموديل","error");
  setWorking(true);
  try{
   const record={serial_number:sn,brand:form.brand.trim(),model:form.model.trim(),status:form.status,
    sale_date:form.status==="sold"?(form.sale_date||today()):null,notes:form.notes.trim()};
   await api(editing?{action:"update",id:editing.id,device:record}:{action:"create",device:record});
   setModal(null);signal(editing?"تم تحديث الجهاز":"تم تسجيل الجهاز");await refresh(0,search);
  }catch(e){signal((e as Error).message,"error")}finally{setWorking(false)}
 }
 async function findSale(e?:React.FormEvent){
  e?.preventDefault();if(!validSerial(saleSerial))return signal("أدخل سيريال صحيح","error");
  setWorking(true);
  try{
   const result=await api({action:"find",serial_number:normalizeSerial(saleSerial)});
   if(!result.items?.length){setSaleDevice(null);signal("هذا الجهاز غير مسجل في المخزون","error")}
   else setSaleDevice(result.items[0]);
  }catch(e){signal((e as Error).message,"error")}finally{setWorking(false)}
 }
 async function saveSale(){
  if(!saleDevice||saleDevice.status==="sold")return;
  setWorking(true);
  try{
   await api({action:"update",id:saleDevice.id,device:{status:"sold",sale_date:saleDate}});
   setModal(null);signal("تم تسجيل بيع الجهاز بنجاح");await refresh(0,search);
  }catch(e){signal((e as Error).message,"error")}finally{setWorking(false)}
 }
 async function deleteOne(){
  if(!editing||deleteConfirm!=="حذف")return;
  setWorking(true);
  try{
   await api({action:"delete",id:editing.id,confirm:"حذف"});
   setModal(null);signal("تم حذف السيريال");await refresh(0,search);
  }catch(e){signal((e as Error).message,"error")}finally{setWorking(false)}
 }
 async function doBulk(mode:"update"|"delete"){
  const ids=[...selected];if(ids.length===0)return;
  if(mode==="delete"&&deleteConfirm!=="حذف")return;
  setWorking(true);
  let success=0,failed=0;
  try{
   for(let i=0;i<ids.length;i+=100){
    const batch=ids.slice(i,i+100);
    const result=await api(mode==="delete"?{action:"bulk_delete",ids:batch,confirm:"حذف"}:{action:"bulk_update",ids:batch,changes:{status:bulkStatus,sale_date:bulkStatus==="sold"?today():null}});
    success+=(result.updated||[]).length;failed+=(result.failed||[]).length;
   }
   signal("تمت معالجة "+success+" جهاز"+(failed?"، تعذر تعديل "+failed:""),failed?"error":"success");
   setModal(null);await refresh(0,search);
  }catch(e){signal((e as Error).message,"error")}finally{setWorking(false)}
 }
 async function loadImportFile(file:File|null){
  if(!file)return;
  setWorking(true);
  try{
   if(file.size>8*1024*1024)throw new Error("حجم الملف يتجاوز 8 MB");
   const rows=/\.xlsx$/i.test(file.name)?await parseXlsx(file):parseCsv(await file.text());
   const result=prepareRows(rows);
   setImportRows(result.devices);
   setImportSummary("قابل للاستيراد: "+result.devices.length+" | غير صالح: "+result.invalid+" | مكرر بالملف: "+result.duplicatesInFile+
     (result.unsafeNumbers?" | سيريالات Excel الطويلة تحتاج تنسيق Text: "+result.unsafeNumbers:""));
  }catch(e){setImportRows([]);signal((e as Error).message,"error")}
  finally{setWorking(false)}
 }
 async function doImport(){
  if(!importRows.length)return;
  setWorking(true);let added=0,duplicates=0,invalid=0;
  try{
   for(let i=0;i<importRows.length;i+=100){
     const batch=importRows.slice(i,i+100);
     const result=await api({action:"import",devices:batch});
     added+=Number(result.added)||0;duplicates+=Number(result.duplicates)||0;invalid+=Number(result.invalid)||0;
   }
   setModal(null);setImportRows([]);signal("تم استيراد "+added+" جهاز، مكرر "+duplicates+"، غير صالح "+invalid);
   await refresh(0,search);
  }catch(e){signal((e as Error).message,"error")}finally{setWorking(false)}
 }
 function downloadText(content:string,filename:string,mime:string){
  const b=new Blob([content],{type:mime});const url=URL.createObjectURL(b);
  const a=document.createElement("a");a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
 }
 function template(){
  downloadText("Serial Number,Brand,Model,Status,Date Sold,Notes\nS6EH1P000001;S6EH1P6KLPLUS,SOLIS,INVERTER/6kW,in_stock,,\n",
    "HMC-Solar-Import-Template.csv","text/csv;charset=utf-8");
 }
 async function backup(format:"json"|"csv"){
  setWorking(true);
  try{
   const collected:Device[]=[];
   for(let i=0;i<20000;i+=100){
    const chunk=await api({action:"list",offset:i,limit:100,search:""});
    collected.push(...(chunk.items||[]));
    if(!chunk.has_more)break;
   }
   const date=today();
   if(format==="json")downloadText(JSON.stringify({format:"HMC Solar Device Backup",version:2,exported_at:new Date().toISOString(),count:collected.length,devices:collected},null,2),
    "HMC-Solar-Backup-"+date+".json","application/json");
   else{
    const fields=["serial_number","brand","model","status","sale_date","notes"] as const;
    const escape=(value:unknown)=>{
      let s=str(value);
      if(/^[=+@-]/.test(s))s="'"+s;
      return '"'+s.replace(/"/g,'""')+'"';
    };
    downloadText(["Serial Number,Brand,Model,Status,Date Sold,Notes",...collected.map(x=>fields.map(key=>escape(x[key])).join(","))].join("\r\n"),
      "HMC-Solar-Backup-"+date+".csv","text/csv;charset=utf-8");
   }
   signal("تم تنزيل نسخة تحتوي على "+collected.length+" جهاز");
  }catch(e){signal((e as Error).message,"error")}finally{setWorking(false)}
 }
 async function openScanner(to:"sale"|"form"){
  setScannerTarget(to);setModal("scan");
 }
 useEffect(()=>{
  if(modal!=="scan")return;
  let stopped=false;
  const start=async()=>{
   if(!camera.current)return;
   if(!("BarcodeDetector" in window)){signal("هذا المتصفح لا يدعم ماسح الباركود. استخدم قارئ الباركود أو أدخل السيريال يدوياً.","error");return}
   try{
    const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"}},audio:false});
    if(stopped){stream.getTracks().forEach(t=>t.stop());return}
    activeStream.current=stream;
    if(!camera.current){stream.getTracks().forEach(t=>t.stop());return}
    camera.current.srcObject=stream;await camera.current.play();
    const detector=new (window as any).BarcodeDetector({formats:["qr_code","code_128","code_39","ean_13","ean_8","data_matrix"]});
    const loop=async()=>{
     if(stopped||!camera.current)return;
     try{
       const found=await detector.detect(camera.current);
       if(found.length&&found[0].rawValue){
         const value=String(found[0].rawValue);stream.getTracks().forEach(t=>t.stop());activeStream.current=null;
         if(scannerTarget==="sale"){setSaleSerial(value);setSaleDevice(null);setModal("sale")}
         else{setForm(f=>({...f,serial_number:value}));setModal(editing?"edit":"add")}
         signal("تمت قراءة السيريال بنجاح");
         return;
       }
     }catch{}
     scnTimer.current=setTimeout(loop,350);
    };
    scnTimer.current=setTimeout(loop,400);
   }catch{signal("تعذر فتح الكاميرا. تأكد من السماح للمتصفح باستخدامها.","error")}
  };
  void start();
  return()=>{stopped=true;if(scnTimer.current)clearTimeout(scnTimer.current);
   activeStream.current?.getTracks().forEach(t=>t.stop());activeStream.current=null}
 },[modal,scannerTarget,editing,signal]);

 function toggle(id:string,checked:boolean){
  setSelected(old=>{const s=new Set(old);if(checked)s.add(id);else s.delete(id);return s});
 }
 function navigate(next:Tab){setTab(next);setMenuOpen(false);if(next==="audit")void loadAudit();}
 function searchSubmit(e:React.FormEvent){e.preventDefault();setSearch(query.trim());void refresh(0,query.trim());}
 function pageMove(change:number){const next=Math.max(0,offset+change*25);void refresh(next,search);}
 const nav:[Tab,string,string][]=[["overview","الرئيسية","dashboard"],["inventory","الأجهزة والمخزون","boxes"],["audit","سجل العمليات","clock"]];

 if(checking)return <div className="boot"><span className="spin"/><p>جاري تجهيز HMC Solar…</p></div>;
 if(!session||!verified)return <div className="login-shell" dir="rtl">
   <div className="login-aside">
     <Logo size="lg"/>
     <div className="aside-content"><div className="kicker">HMC · CONTROL CENTER</div><h1>كل جهاز.<br/><span>سجل واضح.</span></h1>
       <p>منظومة مستقلة لإدارة أجهزة الطاقة الشمسية وتتبع سيريالاتها وعمليات بيعها.</p>
       <div className="aside-line"/><span className="aside-note"><Icon name="shield" size={18}/> اتصال مشفّر · صلاحيات محمية بواسطة Supabase</span>
     </div>
     <div className="aside-footer">HMC SOLAR <span>© 2026</span></div>
   </div>
   <div className="login-panel">
    <div className="mobile-logo"><Logo/></div>
    <div className="login-card">
      <span className="eyebrow"><span className="status-dot"/> بوابة موظفي HMC</span>
      <h2>تسجيل الدخول</h2><p className="subheading">أدخل بيانات حساب الإدارة الخاص بك في Supabase.</p>
      <form onSubmit={signIn} className="login-form">
       <label>البريد الإلكتروني<input type="email" autoComplete="username" required value={loginEmail} placeholder="name@example.com" dir="ltr"
         onChange={e=>setLoginEmail(e.target.value)}/></label>
       <label>كلمة المرور<input type="password" autoComplete="current-password" required value={loginPassword} placeholder="••••••••••" dir="ltr"
         onChange={e=>setLoginPassword(e.target.value)}/></label>
       <button className="btn btn-primary login-submit" type="submit" disabled={loginBusy}>
        <Icon name="lock" size={18}/>{loginBusy?"جاري التحقق من الحساب…":"الدخول إلى لوحة الإدارة"}<Icon name="chevron" size={18}/>
       </button>
      </form>
      <div className="login-info"><Icon name="shield" size={18}/><span>الدخول مخصص للحسابات المصرّح لها فقط. لا يوجد تسجيل حسابات عام.</span></div>
      <p className="login-help">نسيت كلمة المرور؟ أعد ضبطها من إعدادات المستخدمين في Supabase.</p>
    </div>
   </div>
   {toast&&<Toast message={toast.message} type={toast.type} onClose={closeToast}/>}
  </div>;

 return <div className="app-shell" dir="rtl">
  <aside className={"sidebar "+(menuOpen?"sidebar-open":"")}>
   <div className="side-brand"><Logo/></div>
   <div className="side-eyebrow">إدارة الشركة</div>
   <nav className="side-nav">
     {nav.map(([key,label,icon])=><button key={key} onClick={()=>navigate(key)}
      className={"nav-link "+(tab===key?"active":"")}><Icon name={icon} size={20}/>{label}{tab===key&&<span className="nav-mark"/>}</button>)}
   </nav>
   <div className="side-bottom">
    <div className="side-online"><span className="live-dot"/> Supabase متصل</div>
    <button className="nav-link nav-logout" onClick={logout}><Icon name="logout" size={20}/> تسجيل الخروج</button>
   </div>
  </aside>
  {menuOpen&&<button aria-label="إغلاق القائمة" className="mobile-scrim" onClick={()=>setMenuOpen(false)}/>}
  <div className="main-frame">
   <header className="topbar">
    <div className="topbar-start"><button className="mobile-menu icon-btn" onClick={()=>setMenuOpen(true)} aria-label="القائمة"><Icon name="menu"/></button>
     <div className="crumb">HMC Solar <span>/</span> <strong>{nav.find(x=>x[0]===tab)?.[1]}</strong></div></div>
    <div className="top-actions">
     <span className="cloud-state"><span className="live-dot"/>قاعدة البيانات متصلة</span>
     <div className="user-pill"><span className="avatar">HM</span><div><strong>حساب المدير</strong><small>{session.email}</small></div></div>
    </div>
   </header>
   <main className="main-content">
     {tab==="overview"&&<>
      <div className="section-head"><div><span className="section-kicker">نظرة عامة / OPERATIONS</span><h1>مركز إدارة المخزون</h1><p>متابعة الأجهزة وحالات البيع والسيريالات من مكان واحد.</p></div>
       <button className="btn btn-primary" onClick={openAdd}><Icon name="plus" size={18}/> إضافة جهاز</button>
      </div>
      <div className="summary-grid">
       <div className="summary-card total"><div className="summary-top"><span>إجمالي الأجهزة</span><span className="summary-icon"><Icon name="boxes"/></span></div>
        <strong>{formatNum(counts.total)}</strong><small>جهاز مسجّل بالنظام</small><div className="card-stripe"/></div>
       <div className="summary-card sold"><div className="summary-top"><span>الأجهزة المباعة</span><span className="summary-icon"><Icon name="check"/></span></div>
        <strong>{formatNum(counts.sold)}</strong><small>تم تسجيل بيعها</small><div className="card-stripe"/></div>
       <div className="summary-card stock"><div className="summary-top"><span>الأجهزة بالمخزن</span><span className="summary-icon"><Icon name="solar"/></span></div>
        <strong>{formatNum(counts.inStock)}</strong><small>جاهزة للبيع</small><div className="card-stripe"/></div>
      </div>
      <div className="overview-grid">
       <section className="white-card overview-inventory">
        <div className="card-heading"><div><span className="section-kicker">INVENTORY STATUS</span><h3>توزيع الأجهزة</h3></div><button className="text-link" onClick={()=>navigate("inventory")}>عرض كل الأجهزة <Icon name="chevron" size={16}/></button></div>
        <div className="visual-stats">
         <div className="donut" style={{background:counts.total? `conic-gradient(#37aa7f 0% ${(counts.sold/counts.total)*100}%, #3a72d1 ${(counts.sold/counts.total)*100}% 100%)`:"#dde8f7"}}>
          <div><span>{counts.total?Math.round(counts.sold/counts.total*100):0}%</span><small>مباع</small></div></div>
         <div className="legend"><div><span className="legend-dot blue"/><b>بالمخزن</b><em>{counts.inStock} جهاز</em></div><div><span className="legend-dot green"/><b>مباع</b><em>{counts.sold} جهاز</em></div>
          <p>تتحدّث هذه الإحصائيات مباشرة من قاعدة البيانات عند تحميل الصفحة أو حفظ التعديلات.</p>
         </div>
        </div>
       </section>
       <section className="white-card shortcuts">
        <div className="card-heading"><div><span className="section-kicker">QUICK ACTIONS</span><h3>إجراءات سريعة</h3></div></div>
        <button className="shortcut" onClick={openQuickSale}><span className="short-icon"><Icon name="scan"/></span><span><b>تسجيل بيع سريع</b><small>حدد الجهاز بالسيريال ثم سجل عملية البيع</small></span><Icon name="chevron" size={18}/></button>
        <button className="shortcut" onClick={()=>{setModal("import");setImportRows([]);setImportSummary("")}}><span className="short-icon"><Icon name="upload"/></span><span><b>استيراد أجهزة</b><small>Excel أو CSV حتى 500 جهاز بالملف</small></span><Icon name="chevron" size={18}/></button>
        <button className="shortcut" onClick={()=>void backup("json")} disabled={working}><span className="short-icon"><Icon name="download"/></span><span><b>نسخة احتياطية</b><small>تنزيل جميع سجلات الأجهزة إلى جهازك</small></span><Icon name="chevron" size={18}/></button>
       </section>
      </div>
      <section className="white-card recent-records">
       <div className="card-heading"><div><span className="section-kicker">RECENT DEVICES</span><h3>أحدث الأجهزة المسجّلة</h3></div><button className="text-link" onClick={()=>navigate("inventory")}>إدارة المخزون <Icon name="chevron" size={16}/></button></div>
       <div className="table-wrap"><table><thead><tr><th>السيريال نمبر</th><th>الشركة / الموديل</th><th>الحالة</th><th>تاريخ البيع</th></tr></thead>
        <tbody>{devices.slice(0,5).map(d=><tr key={d.id}><td dir="ltr" className="serial">{d.serial_number}</td><td>{d.brand} <span className="muted">{d.model}</span></td><td><span className={"status-tag "+d.status}>{d.status==="sold"?"مباع":"بالمخزن"}</span></td><td>{d.sale_date||"—"}</td></tr>)}
        {!devices.length&&<tr><td colSpan={4} className="empty-table">لا توجد أجهزة مسجلة حالياً</td></tr>}</tbody>
       </table></div>
      </section>
     </>}
     {tab==="inventory"&&<>
       <div className="section-head"><div><span className="section-kicker">DEVICE REGISTRY</span><h1>الأجهزة والمخزون</h1><p>إدارة السيريالات، متابعة حالة الأجهزة وتسجيل البيع.</p></div>
        <button className="btn btn-primary" onClick={openAdd}><Icon name="plus" size={18}/> إضافة جهاز</button></div>
       <section className="white-card inventory-panel">
        <div className="inventory-toolbar">
         <form onSubmit={searchSubmit} className="search-bar"><Icon name="search" size={19}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="ابحث عن سيريال نمبر..." dir="ltr" aria-label="البحث بالسيريال"/><button type="submit">بحث</button></form>
         <div className="toolbar-buttons">
           <button className="btn btn-outline" onClick={openQuickSale}><Icon name="scan" size={17}/> بيع سريع</button>
           <button className="btn btn-outline" onClick={()=>{setModal("import");setImportRows([]);setImportSummary("")}}><Icon name="upload" size={17}/> استيراد Excel</button>
           <button className="btn btn-outline" onClick={()=>void backup("json")} disabled={working}><Icon name="download" size={17}/> نسخة احتياطية</button>
           <button className="icon-btn refresh-btn" title="تحديث" onClick={()=>void refresh(offset,search)}><Icon name="refresh"/></button>
         </div>
        </div>
        {selected.size>0&&<div className="selection-bar"><strong>تم تحديد {selected.size} جهاز</strong><div className="selection-actions"><button onClick={()=>{setBulkStatus("sold");setDeleteConfirm("");setModal("bulk")}}>تعديل المحدد</button><button className="danger-text" onClick={()=>{setDeleteConfirm("");setModal("bulk")}}>حذف المحدد</button><button onClick={()=>setSelected(new Set())}>إلغاء التحديد</button></div></div>}
        <div className="table-wrap inventory-table"><table>
         <thead><tr><th className="checkbox-col"><input type="checkbox" checked={devices.length>0&&devices.every(x=>selected.has(x.id))} onChange={e=>setSelected(e.target.checked?new Set(devices.map(x=>x.id)):new Set())} aria-label="تحديد المعروض"/></th><th>السيريال نمبر</th><th>الجهاز</th><th>الحالة</th><th>تاريخ البيع</th><th>الإجراءات</th></tr></thead>
         <tbody>{devices.map(d=><tr key={d.id}>
          <td><input type="checkbox" checked={selected.has(d.id)} onChange={e=>toggle(d.id,e.target.checked)} aria-label={"تحديد "+d.serial_number}/></td>
          <td dir="ltr" className="serial">{d.serial_number}</td>
          <td><div className="device-name"><strong>{d.brand}</strong><span>{d.model}</span></div></td>
          <td><span className={"status-tag "+d.status}><span className="tag-dot"/>{d.status==="sold"?"مباع":"بالمخزن"}</span></td>
          <td>{d.sale_date||"—"}</td>
          <td><div className="row-buttons"><button title="تعديل" onClick={()=>openEdit(d)}><Icon name="edit" size={17}/></button><button title="حذف" className="danger-text" onClick={()=>{setEditing(d);setDeleteConfirm("");setModal("delete")}}><Icon name="trash" size={17}/></button></div></td>
         </tr>)}
         {loading&&<tr><td colSpan={6} className="empty-table"><span className="spin inline"/> جاري التحميل…</td></tr>}
         {!loading&&!devices.length&&<tr><td colSpan={6} className="empty-table">ماكو أجهزة مطابقة. غيّر البحث أو أضف جهازاً.</td></tr>}
         </tbody></table></div>
         <div className="table-footer"><span>عرض {devices.length?offset+1:0}–{offset+devices.length} جهاز</span><div><button disabled={offset===0||loading} onClick={()=>pageMove(-1)}>السابق</button><button disabled={!hasMore||loading} onClick={()=>pageMove(1)}>التالي</button></div></div>
       </section>
     </>}
     {tab==="audit"&&<>
      <div className="section-head"><div><span className="section-kicker">ACTIVITY HISTORY</span><h1>سجل العمليات</h1><p>حركات إضافة الأجهزة وتعديلها وحذفها، محفوظة في قاعدة Supabase.</p></div><button className="btn btn-outline" onClick={()=>void loadAudit()}><Icon name="refresh" size={17}/> تحديث</button></div>
      <section className="white-card"><div className="table-wrap"><table><thead><tr><th>العملية</th><th>السيريال</th><th>التاريخ</th></tr></thead><tbody>
       {audit.map((a,i)=><tr key={a.id||i}><td><span className={"status-tag "+(a.action==="delete"?"deleted":a.action==="create"?"in_stock":"sold")}>{a.action==="create"?"إضافة":a.action==="update"?"تعديل":"حذف"}</span></td><td className="serial" dir="ltr">{a.serial_number}</td><td>{formatDate(a.created_at)}</td></tr>)}
       {auditLoading&&<tr><td colSpan={3} className="empty-table">جاري تحميل سجل العمليات…</td></tr>}
       {!auditLoading&&!audit.length&&<tr><td colSpan={3} className="empty-table">لا توجد عمليات لعرضها</td></tr>}
      </tbody></table></div></section>
     </>}
     <footer className="main-footer"><span>HMC SOLAR — Inventory Control</span><span>قاعدة البيانات: Supabase · لوحة مستقلة</span></footer>
   </main>
  </div>
  {(modal==="add"||modal==="edit")&&<Dialog title={modal==="edit"?"تعديل بيانات جهاز":"إضافة جهاز جديد"} onClose={()=>setModal(null)}>
    <form className="modal-body form-fields" onSubmit={saveDevice}>
     <label>السيريال نمبر <input required dir="ltr" value={form.serial_number} onChange={e=>editField("serial_number",e.target.value)} placeholder="مثال: 10317312;S6EH1P6KLPLUS"/></label>
     <div className="field-grid"><label>الشركة المصنعة <input required value={form.brand} onChange={e=>editField("brand",e.target.value)} placeholder="Deye / Solis / Dyness"/></label>
      <label>الموديل <input required value={form.model} onChange={e=>editField("model",e.target.value)} placeholder="INVERTER / 6KW"/></label></div>
     <div className="field-grid"><label>حالة الجهاز <select value={form.status} onChange={e=>editField("status",e.target.value as FormState["status"])}><option value="in_stock">بالمخزن</option><option value="sold">مباع</option></select></label>
       {form.status==="sold"&&<label>تاريخ البيع <input type="date" value={form.sale_date||today()} onChange={e=>editField("sale_date",e.target.value)}/></label>}
     </div>
     <label>ملاحظات داخلية <textarea rows={3} maxLength={2000} value={form.notes} onChange={e=>editField("notes",e.target.value)} placeholder="هذه الملاحظات خاصة بالإدارة"/></label>
     <div className="modal-footer"><button type="button" className="btn btn-outline" onClick={()=>setModal(null)}>إلغاء</button><button className="btn btn-primary" disabled={working} type="submit">{working?"جاري الحفظ…":"حفظ الجهاز"}</button></div>
    </form>
   </Dialog>}
  {modal==="sale"&&<Dialog title="تسجيل بيع سريع" onClose={()=>setModal(null)}>
    <div className="modal-body"><p className="modal-desc">أدخل سيريال الجهاز، راجع بياناته، ثم أكّد تسجيل البيع.</p>
     <form className="sale-search" onSubmit={findSale}><input dir="ltr" value={saleSerial} onChange={e=>{setSaleSerial(e.target.value);setSaleDevice(null)}} placeholder="Serial Number" required/><button className="btn btn-primary" disabled={working}>بحث</button></form>
     <button className="scan-link" onClick={()=>void openScanner("sale")}><Icon name="scan" size={17}/> فتح الكاميرا لمسح الباركود</button>
     {saleDevice&&<div className="found-device"><div><strong>{saleDevice.brand} · {saleDevice.model}</strong><span dir="ltr" className="serial">{saleDevice.serial_number}</span></div><span className={"status-tag "+saleDevice.status}>{saleDevice.status==="sold"?"مباع مسبقاً":"بالمخزن"}</span></div>}
     {saleDevice?.status==="in_stock"&&<label className="form-alone">تاريخ البيع<input type="date" value={saleDate} onChange={e=>setSaleDate(e.target.value)}/></label>}
     <div className="modal-footer"><button className="btn btn-outline" onClick={()=>setModal(null)}>إغلاق</button>{saleDevice?.status==="in_stock"&&<button className="btn btn-primary" disabled={working||!saleDate} onClick={()=>void saveSale()}>تأكيد البيع</button>}</div>
    </div>
   </Dialog>}
  {modal==="delete"&&editing&&<Dialog title="حذف الجهاز نهائياً" onClose={()=>setModal(null)}>
   <div className="modal-body"><p className="delete-warning"><Icon name="alert"/> حذف <span dir="ltr" className="serial">{editing.serial_number}</span> يلغي تسجيل هذا الجهاز من المخزون. لا يمكن التراجع عن الحذف من لوحة الإدارة.</p>
    <label className="form-alone">اكتب «حذف» للتأكيد<input value={deleteConfirm} onChange={e=>setDeleteConfirm(e.target.value)} placeholder="حذف"/></label>
    <div className="modal-footer"><button className="btn btn-outline" onClick={()=>setModal(null)}>إلغاء</button><button className="btn btn-danger" disabled={working||deleteConfirm!=="حذف"} onClick={()=>void deleteOne()}>حذف الجهاز</button></div></div>
  </Dialog>}
  {modal==="bulk"&&<Dialog title={"عمليات جماعية على "+selected.size+" جهاز"} onClose={()=>setModal(null)}>
   <div className="modal-body"><p className="modal-desc">التعديل والحذف ينطبقان على الأجهزة المحددة فقط، وتُسجّل كل حركة في سجل العمليات.</p>
    <label className="form-alone">الحالة الجديدة للأجهزة<select value={bulkStatus} onChange={e=>setBulkStatus(e.target.value as "sold"|"in_stock")}><option value="sold">مباع</option><option value="in_stock">بالمخزن</option></select></label>
    <button className="btn btn-primary full" disabled={working} onClick={()=>void doBulk("update")}>تعديل حالة {selected.size} جهاز</button>
    <hr className="modal-divider"/><label className="form-alone">لحذف جميع الأجهزة المحددة اكتب «حذف»<input value={deleteConfirm} onChange={e=>setDeleteConfirm(e.target.value)} placeholder="حذف"/></label>
    <button className="btn btn-danger full" disabled={working||deleteConfirm!=="حذف"} onClick={()=>void doBulk("delete")}>حذف {selected.size} جهاز نهائياً</button>
   </div>
  </Dialog>}
  {modal==="import"&&<Dialog title="استيراد أجهزة من Excel" onClose={()=>setModal(null)} wide>
   <div className="modal-body"><p className="modal-desc">ارفع ملف XLSX أو CSV يحتوي على أعمدة Serial Number و Brand و Model. الحد الأقصى 500 جهاز للملف. السيريالات المكررة في القاعدة تُتجاهل تلقائياً.</p>
    <label className="upload-drop"><Icon name="upload" size={34}/><strong>اختر ملف Excel أو CSV</strong><span>يدعم سيريالات Solis التي تحتوي على الفاصلة المنقوطة ( ; )</span><input type="file" accept=".csv,.xlsx" onChange={e=>void loadImportFile(e.target.files?.[0]||null)}/></label>
    <button className="text-link" onClick={template}><Icon name="download" size={16}/> تحميل نموذج CSV</button>
    {importSummary&&<div className="import-summary">{importSummary}</div>}
    {importRows.length>0&&<div className="import-preview"><strong>معاينة أول 5 أجهزة</strong>{importRows.slice(0,5).map((d,i)=><div key={i}><span className="serial" dir="ltr">{d.serial_number}</span><span>{d.brand} · {d.model}</span></div>)}</div>}
    <div className="modal-footer"><button className="btn btn-outline" onClick={()=>setModal(null)}>إلغاء</button><button className="btn btn-primary" disabled={working||!importRows.length} onClick={()=>void doImport()}>{working?"جاري المعالجة…":"استيراد "+importRows.length+" جهاز"}</button></div>
   </div>
  </Dialog>}
  {modal==="scan"&&<Dialog title="مسح السيريال بالكاميرا" onClose={()=>{setModal(scannerTarget==="sale"?"sale":editing?"edit":"add")}}>
    <div className="modal-body"><p className="modal-desc">وجّه الكاميرا نحو الباركود أو QR على الجهاز. يحتاج متصفحاً يدعم BarcodeDetector واتصال HTTPS.</p>
      <video ref={camera} playsInline muted className="camera-video"/><div className="modal-footer"><button className="btn btn-outline" onClick={()=>setModal(scannerTarget==="sale"?"sale":editing?"edit":"add")}>إلغاء المسح</button></div></div>
   </Dialog>}
   {working&&<div className="work-indicator"><span className="spin inline"/> جاري تنفيذ العملية…</div>}
   {toast&&<Toast message={toast.message} type={toast.type} onClose={closeToast}/>}
  </div>;
}
