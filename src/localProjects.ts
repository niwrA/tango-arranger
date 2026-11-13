import type {Project} from './music';

/** Browser-local, multi-song library. No server, account or network requests. */
export interface LocalSongSummary {id:string; title:string; updatedAt:number; measures:number}
interface LocalSongRecord extends LocalSongSummary {project:Project}
const DATABASE='tango-arranger-local-songs';
const STORE='songs';
const LAST_OPENED='tango-arranger-last-song';
let opening:Promise<IDBDatabase>|undefined;

function database():Promise<IDBDatabase>{
  if(opening)return opening;
  opening=new Promise<IDBDatabase>((resolve,reject)=>{
    if(typeof indexedDB==='undefined'){reject(new Error('IndexedDB is not available in this browser'));return;}
    const request=indexedDB.open(DATABASE,1);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'id'});
    };
    request.onsuccess=()=>{
      const db=request.result;
      db.onversionchange=()=>{db.close();opening=undefined;};
      resolve(db);
    };
    request.onerror=()=>reject(request.error??new Error('Cannot open local song library'));
    request.onblocked=()=>reject(new Error('Close other tabs using the song library, then reload'));
  }).catch(error=>{opening=undefined;throw error;});
  return opening;
}
function requestResult<T>(request:IDBRequest<T>):Promise<T>{
  return new Promise((resolve,reject)=>{
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error??new Error('Local song request failed'));
  });
}
function cloneProject(project:Project):Project{return JSON.parse(JSON.stringify(project)) as Project;}
export function newLocalSongId():string{
  return typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function'
    ?crypto.randomUUID():`song-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
export async function saveLocalSong(id:string,project:Project):Promise<LocalSongSummary>{
  const db=await database();
  const record:LocalSongRecord={id,title:project.title.trim()||'Untitled Tango',updatedAt:Date.now(),measures:project.bars.length,project:cloneProject(project)};
  await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(STORE,'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error??new Error('Cannot save song locally'));
    tx.onabort=()=>reject(tx.error??new Error('Local save was aborted'));
  });
  const {project:unused,...summary}=record;
  return summary;
}
export async function listLocalSongs():Promise<LocalSongSummary[]>{
  const db=await database();
  const records=await requestResult(db.transaction(STORE,'readonly').objectStore(STORE).getAll() as IDBRequest<LocalSongRecord[]>);
  return records.map(({id,title,updatedAt,measures})=>({id,title,updatedAt,measures})).sort((a,b)=>b.updatedAt-a.updatedAt);
}
export async function readLocalSong(id:string):Promise<Project|undefined>{
  const db=await database();
  const record=await requestResult(db.transaction(STORE,'readonly').objectStore(STORE).get(id) as IDBRequest<LocalSongRecord|undefined>);
  return record?cloneProject(record.project):undefined;
}
export async function deleteLocalSong(id:string):Promise<void>{
  const db=await database();
  await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(STORE,'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error??new Error('Cannot delete local song'));
    tx.onabort=()=>reject(tx.error??new Error('Local deletion was aborted'));
  });
}
export function lastOpenedSongId():string|null{
  try{return localStorage.getItem(LAST_OPENED);}catch{return null;}
}
export function rememberOpenedSongId(id:string):void{
  try{localStorage.setItem(LAST_OPENED,id);}catch{/* IndexedDB still retains songs. */}
}
