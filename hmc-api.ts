export const SUPABASE_URL="https://obloojlkjnagpdokofgw.supabase.co";
export type Device = {
 id:string;serial_number:string;brand:string;model:string;status:"in_stock"|"sold";
 sale_date:string|null;notes:string;created_at:string;updated_at?:string;
};
export type Stats={total:number;sold:number;inStock:number};
export type TokenSession={access_token:string;refresh_token:string;expires_at:number;email:string};
const STORAGE="hmc_solar_auth_v1";
export const readSession=():TokenSession|null=>{
 if(typeof window==="undefined")return null;
 try {const x=JSON.parse(sessionStorage.getItem(STORAGE)||"null");return x&&typeof x.access_token==="string"&&typeof x.refresh_token==="string"?x:null}catch{return null}
};
export const writeSession=(s:TokenSession|null)=>{
 if(typeof window==="undefined")return;
 if(s)sessionStorage.setItem(STORAGE,JSON.stringify(s));
 else sessionStorage.removeItem(STORAGE);
};
const unwrap=async(res:Response)=>{
 let data:Record<string,any>;
 try{data=await res.json()}catch{throw new Error("تعذر قراءة رد الخادم")}
 if(!res.ok){
  const messages:Record<string,string>={
   invalid_credentials:"البريد أو كلمة المرور غير صحيحة في Supabase",
   rate_limited:"تم تجاوز عدد محاولات الدخول، حاول لاحقاً",
   not_authenticated:"انتهت جلسة الدخول، سجّل الدخول مجدداً",
   admin_required:"هذا الحساب لا يمتلك صلاحية إدارة HMC في Supabase",
   duplicate_serial:"السيريال موجود مسبقاً",
   invalid_serial:"صيغة السيريال غير صالحة",
   invalid_sale_date:"تاريخ البيع غير صالح",
   missing_product_details:"اسم الشركة والموديل مطلوبان",
   origin_not_allowed:"تعذر التحقق من عنوان لوحة الإدارة",
   invalid_ids:"عملية غير صحيحة؛ حدّد السيريالات من جديد",
   invalid_changes:"لم تُحدد حقول التعديل",
   admin_backend_unavailable:"خدمة إدارة المخزون متوقفة مؤقتاً",
   admin_service_unavailable:"تعذر الاتصال بقاعدة البيانات",
  };
  const e=new Error(messages[String(data.error)]||"حدث خطأ في الطلب إلى الخادم");
  Object.assign(e,{code:data.error,status:res.status});throw e;
 }
 return data;
};
const authRequest=async(body:unknown)=>unwrap(await fetch("/api/auth",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}));
export const logIn=async(email:string,password:string)=>{
 const x=await authRequest({action:"login",email,password});
 return {access_token:x.access_token,refresh_token:x.refresh_token,expires_at:Date.now()+x.expires_in*1000,email:String(x.user?.email||email)} as TokenSession;
};
export const refreshSession=async(s:TokenSession)=>{
 const x=await authRequest({action:"refresh",refresh_token:s.refresh_token});
 const fresh:TokenSession={access_token:x.access_token,refresh_token:x.refresh_token,expires_at:Date.now()+x.expires_in*1000,email:s.email};
 writeSession(fresh);return fresh;
};
export const callAdmin=async(s:TokenSession,body:Record<string,unknown>)=>{
 let current=s;
 if(Date.now()>s.expires_at-60000)current=await refreshSession(s);
 let result=await fetch("/api/admin",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+current.access_token},body:JSON.stringify(body)});
 if(result.status===401){current=await refreshSession(current);result=await fetch("/api/admin",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+current.access_token},body:JSON.stringify(body)})}
 return unwrap(result);
};
export const normalizeSerial=(s:string)=>s.replace(/[\s-]/g,"").toUpperCase();
export const validSerial=(s:string)=>/^[A-Z0-9_./:;]{6,80}$/.test(normalizeSerial(s));
