const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const cp=require('node:child_process');
let ts;try{ts=require('typescript');}catch{ts=require(path.join(cp.execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim(),'typescript'));}
const root=path.resolve(__dirname,'..');
const data=new Map();
const localData=new Map();
const localStorage={getItem:k=>localData.get(k)??null,setItem:(k,v)=>localData.set(k,v)};
function fakeRequest(result,tx){
  const request={result,error:null,onsuccess:null,onerror:null};
  queueMicrotask(()=>{request.onsuccess?.();tx?.oncomplete?.();});
  return request;
}
const db={objectStoreNames:{contains:()=>true},onversionchange:null,close(){},
  transaction(){
    const tx={oncomplete:null,onerror:null,onabort:null,error:null,objectStore(){return {
      put(record){data.set(record.id,structuredClone(record));return fakeRequest(undefined,tx);},
      get(id){return fakeRequest(data.get(id)?structuredClone(data.get(id)):undefined,tx);},
      getAll(){return fakeRequest([...data.values()].map(x=>structuredClone(x)),tx);},
      delete(id){data.delete(id);return fakeRequest(undefined,tx);}
    };}};
    return tx;
  }
};
const indexedDB={open(){const request={result:db,error:null,onupgradeneeded:null,onsuccess:null,onerror:null,onblocked:null};queueMicrotask(()=>request.onsuccess?.());return request;}};
const source=fs.readFileSync(path.join(root,'src/localProjects.ts'),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const mod={exports:{}};
vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`,{indexedDB,localStorage,crypto:{randomUUID:()=>`test-id-${data.size+1}`},Date,Math,JSON,Promise,Error,console}, {filename:'src/localProjects.ts'})(()=>{throw Error('No runtime imports expected');},mod,mod.exports);
const lib=mod.exports;
async function run(){
  const p={title:'Untitled Tango',beats:4,bpm:124,bars:[{chord:'Dm,A7',section:'A',melody:[]},{chord:'G7',section:'A',melody:[]}]};
  const first=lib.newLocalSongId();assert.equal(first,'test-id-1');
  await lib.saveLocalSong(first,p);
  p.bars[0].chord='Changed after save';
  const saved=await lib.readLocalSong(first);assert.equal(saved.bars[0].chord,'Dm,A7');
  saved.bars[0].chord='Changed after load';
  assert.equal((await lib.readLocalSong(first)).bars[0].chord,'Dm,A7');
  console.log('PASS IndexedDB persists independent copies of project content');
  const second=lib.newLocalSongId();assert.equal(second,'test-id-2');
  await lib.saveLocalSong(second,{...p,bars:[{chord:'D,D,D,G',section:'A',melody:[]}]});
  const songs=await lib.listLocalSongs();
  assert.equal(songs.length,2);assert.ok(songs.some(s=>s.id===first&&s.measures===2));
  assert.ok(songs.some(s=>s.id===second&&s.measures===1));
  assert.ok(songs.every(s=>s.title==='Untitled Tango'));
  console.log('PASS two unnamed songs remain separate selectable records');
  lib.rememberOpenedSongId(second);assert.equal(lib.lastOpenedSongId(),second);
  assert.equal((await lib.readLocalSong(second)).bars[0].chord,'D,D,D,G');
  console.log('PASS last-opened song and multi-chord measures survive reload');
  await lib.deleteLocalSong(first);assert.equal((await lib.listLocalSongs()).length,1);
  assert.equal(await lib.readLocalSong(first),undefined);
  assert.equal((await lib.readLocalSong(second)).bars[0].chord,'D,D,D,G');
  console.log('PASS deleting one song leaves the other unchanged');
  const app=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
  assert.match(app,/watch\(project,scheduleAutosave,\{deep:true\}\)/);
  assert.match(app,/await flushAutosave\(\)/);
  assert.match(app,/onMounted\(\(\)=>\{void initializeLocalLibrary\(\)/);
  assert.match(app,/\@change="openLocalSong/);
  assert.match(app,/await adoptLocalSong\(fresh\)/);
  assert.match(app,/await adoptLocalSong\(imported\)/);
  console.log('PASS autosave, restore, new-song and imported-song flows are wired');
  assert.match(app,/async function auditionPitch/);
  assert.match(app,/Tone=await startAudioFromGesture\(\)/);
  assert.match(app,/auditionEvent\(added\)/);
  assert.match(app,/auditionEvent\(events\[index\]\)/);
  assert.match(app,/\@click="selectNoteEvent\(i\)"/);
  assert.match(app,/v-model="auditionEnabled"/);
  console.log('PASS piano-roll click audition, event audition and sound toggle are wired');
  console.log('6 local-library / audition checks passed');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
