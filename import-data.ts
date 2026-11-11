export type ImportRow={
  serial_number:string;brand:string;model:string;status:"in_stock"|"sold";sale_date:string|null;notes:string;
};
export const serial=(input:unknown)=>String(input??"").replace(/[\s-]/g,"").toUpperCase();
const normalHead=(x:unknown)=>String(x??"").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu,"");
const column=(headers:unknown[],names:string[])=>headers.findIndex(x=>names.includes(normalHead(x)));
export function parseCsv(text:string):string[][]{
  const rows:string[][]=[];let cells:string[]=[];let cell="";let quoted=false;
  const input=text.replace(/^\uFEFF/,"");
  for(let i=0;i<input.length;i++){
    const x=input[i];
    if(x==='"'&&quoted&&input[i+1]==='"'){cell+='"';i++;}
    else if(x==='"'){quoted=!quoted;}
    else if(x===','&&!quoted){cells.push(cell);cell="";}
    else if((x==='\n'||x==='\r')&&!quoted){
      if(x==='\r'&&input[i+1]==='\n')i++;
      cells.push(cell);if(cells.some(s=>s.trim()))rows.push(cells);cells=[];cell="";
    }else cell+=x;
  }
  cells.push(cell);if(cells.some(s=>s.trim()))rows.push(cells);
  return rows;
}
const textOf=(element:Element|null)=>element?.textContent||"";
function unzipEntries(buf:ArrayBuffer){
 const view=new DataView(buf),bytes=new Uint8Array(buf);
 let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){
  if(view.getUint32(i,true)===0x06054b50){end=i;break}
 }
 if(end<0)throw new Error("ملف Excel غير صالح");
 const entries=new Map<string,{method:number;start:number;size:number}>();
 const n=view.getUint16(end+10,true);let pos=view.getUint32(end+16,true);
 for(let i=0;i<n;i++){
  if(view.getUint32(pos,true)!==0x02014b50)throw new Error("تعذر قراءة ملف Excel");
  const method=view.getUint16(pos+10,true),size=view.getUint32(pos+20,true);
  const nameLen=view.getUint16(pos+28,true),extra=view.getUint16(pos+30,true),comment=view.getUint16(pos+32,true);
  const local=view.getUint32(pos+42,true);
  const name=new TextDecoder().decode(bytes.slice(pos+46,pos+46+nameLen));
  if(view.getUint32(local,true)!==0x04034b50)throw new Error("ملف Excel غير مكتمل");
  const start=local+30+view.getUint16(local+26,true)+view.getUint16(local+28,true);
  if(start+size>bytes.length)throw new Error("ملف Excel غير مكتمل");
  entries.set(name,{method,start,size});pos+=46+nameLen+extra+comment;
 }
 return {entries,bytes};
}
async function fromZip(filename:string,map:ReturnType<typeof unzipEntries>){
 const found=map.entries.get(filename);
 if(!found)return null;
 const bytes=map.bytes.slice(found.start,found.start+found.size);
 let expanded:Uint8Array;
 if(found.method===0)expanded=bytes;
 else if(found.method===8){
  try{
    const stream=new Blob([bytes as unknown as BlobPart]).stream()
      .pipeThrough(new DecompressionStream("deflate-raw"));
    expanded=new Uint8Array(await new Response(stream).arrayBuffer());
  }catch{throw new Error("المتصفح لا يدعم قراءة XLSX. احفظ الملف بصيغة CSV وأعد المحاولة.")}
 }else throw new Error("نوع ضغط Excel غير مدعوم");
 return new TextDecoder("utf-8").decode(expanded);
}
function doc(xml:string){
 const parsed=new DOMParser().parseFromString(xml,"application/xml");
 if(parsed.querySelector("parsererror"))throw new Error("تعذر قراءة XML داخل ملف Excel");
 return parsed;
}
export async function parseXlsx(file:File):Promise<string[][]>{
 if(file.size>8*1024*1024)throw new Error("الحد الأعلى لحجم ملف Excel هو 8 MB");
 const map=unzipEntries(await file.arrayBuffer());
 const workbook=await fromZip("xl/workbook.xml",map);
 if(!workbook)throw new Error("ملف Excel لا يحتوي على صفحات");
 const wb=doc(workbook);
 const firstSheet=wb.getElementsByTagName("sheet")[0];
 if(!firstSheet)throw new Error("ملف Excel فارغ");
 const relId=firstSheet.getAttribute("r:id")||firstSheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships","id");
 let path="xl/worksheets/sheet1.xml";
 const rels=await fromZip("xl/_rels/workbook.xml.rels",map);
 if(rels&&relId){
  const relation=Array.from(doc(rels).getElementsByTagName("Relationship")).find(x=>x.getAttribute("Id")===relId);
  if(relation){
    const target=(relation.getAttribute("Target")||"worksheets/sheet1.xml").replace(/^\/+/,"");
    path=target.startsWith("xl/")?target:"xl/"+target;
  }
 }
 // Reject paths leaving the xl package and normalize no arbitrary zip traversal.
 if(path.includes("..")||!path.startsWith("xl/"))throw new Error("اسم صفحة Excel غير صالح");
 const sheet=await fromZip(path,map);
 if(!sheet)throw new Error("تعذر قراءة أول صفحة من Excel");
 const stringsXml=await fromZip("xl/sharedStrings.xml",map);
 const shared=stringsXml?Array.from(doc(stringsXml).getElementsByTagName("si")).map(x=>textOf(x)):[];
 const sheetDoc=doc(sheet),result:string[][]=[];
 const rows=Array.from(sheetDoc.getElementsByTagName("row")).slice(0,502);
 for(const row of rows){
   const cells:string[]=[];
   for(const cell of Array.from(row.getElementsByTagName("c"))){
     const ref=cell.getAttribute("r")||"A1";
     const colName=(ref.match(/^[A-Z]+/)||["A"])[0];
     let col=0;for(const letter of colName)col=col*26+letter.charCodeAt(0)-64;
     if(col>40)continue;
     const type=cell.getAttribute("t");
     const raw=textOf(cell.getElementsByTagName("v")[0]||cell.getElementsByTagName("is")[0]||null);
     cells[col-1]=type==="s"?(shared[Number(raw)]||""):raw;
   }
   result.push(cells);
 }
 return result;
}
const dateFromExcel=(value:string):string=>{
 const s=value.trim();
 if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
 if(/^\d+(\.\d+)?$/.test(s)){
  const serial=Number(s);
  if(serial>20000&&serial<90000)return new Date(Date.UTC(1899,11,30)+Math.floor(serial)*86400000).toISOString().slice(0,10);
 }
 return new Date().toISOString().slice(0,10);
};
export function prepareRows(rows:string[][]){
 if(rows.length<2)throw new Error("الملف فارغ");
 const [head,...data]=rows;
 const idx={
  serial:column(head,["serialnumber","serial","sn","serialno","السيريال","السيريالنمبر","الرقمالتسلسلي"]),
  brand:column(head,["brand","الشركة","الشركةالمصنعة","ماركة"]),
  model:column(head,["model","product","productmodel","الموديل","النوع","المنتج"]),
  status:column(head,["status","الحالة","حالة"]),
  date:column(head,["datesold","saledate","تاريخالبيع"]),
  notes:column(head,["notes","ملاحظات"]),
 };
 if(idx.serial<0||idx.brand<0||idx.model<0)throw new Error("يجب أن يحتوي الملف على Serial Number و Brand و Model");
 if(data.length>500)throw new Error("الحد الأقصى 500 جهاز لكل ملف");
 const seen=new Set<string>();const prepared:ImportRow[]=[];
 let invalid=0,duplicatesInFile=0,unsafeNumbers=0;
 for(const row of data){
  const rawSerial=String(row?.[idx.serial]||"");
  // Excel stores >15-digit numeric serials imprecisely: require text for those.
  if(/^\d{15,}$/.test(rawSerial.trim())){unsafeNumbers++;invalid++;continue}
  const sn=serial(rawSerial),brand=String(row?.[idx.brand]||"").trim(),model=String(row?.[idx.model]||"").trim();
  if(!/^[A-Z0-9_./:;]{6,80}$/.test(sn)||!brand||!model){invalid++;continue}
  if(seen.has(sn)){duplicatesInFile++;continue}seen.add(sn);
  const rawStatus=String(row?.[idx.status]||"").trim().toLowerCase().replace(/\s/g,"");
  const status:ImportRow["status"]=(["sold","مباع","تمالبيع"].includes(rawStatus))?"sold":"in_stock";
  prepared.push({serial_number:sn,brand,model,status,sale_date:status==="sold"?dateFromExcel(String(row?.[idx.date]||"")):null,notes:String(row?.[idx.notes]||"").trim()});
 }
 return {devices:prepared,invalid,duplicatesInFile,unsafeNumbers};
}
