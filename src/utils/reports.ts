import type { SavedReport } from "../core/types";
const DB_NAME="vectorbody-typescript-v1",STORE="reports";
function openDb():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))
      req.result.createObjectStore(STORE,{keyPath:"id"});};
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error??new Error("本地数据库打开失败"));
  });
}
async function withStore<T>(mode: IDBTransactionMode,work:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
  const db=await openDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,mode),request=work(tx.objectStore(STORE));
    tx.oncomplete=()=>{db.close();resolve(request.result);};
    tx.onerror=()=>{db.close();reject(tx.error??new Error("存储失败"));};
    tx.onabort=()=>{db.close();reject(tx.error??new Error("存储取消"));};
  });
}
export async function listReports():Promise<SavedReport[]> {
  const results=await withStore<SavedReport[]>("readonly",s=>s.getAll());
  return results.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}
export async function saveReport(report:SavedReport):Promise<void> {
  await withStore<IDBValidKey>("readwrite",s=>s.put(report));
}
export async function deleteReport(id:string):Promise<void> {
  await withStore<undefined>("readwrite",s=>s.delete(id));
}
export function downloadJson(report:SavedReport) {
  const data=new Blob([JSON.stringify(report,null,2)],{type:"application/json;charset=utf-8"});
  const url=URL.createObjectURL(data),a=document.createElement("a");
  a.href=url;a.download="VectorBody_"+report.id+".json";a.click();URL.revokeObjectURL(url);
}
