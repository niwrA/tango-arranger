const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createDomainLoader}=require('./load-domain.cjs');
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
const load=createDomainLoader({globals:{indexedDB,localStorage,crypto:{randomUUID:()=>`test-id-${data.size+1}`}}});
const lib=load('src/localProjects.ts');
const {blankProject}=load('src/music.ts');
async function run(){
  const p={...blankProject({measures:2}),title:'Untitled Tango',beats:4,bpm:124,bars:[{chord:'Dm,A7',section:'A',melody:[]},{chord:'G7',section:'A',melody:[]}]};
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
  assert.match(app,/onMounted\(\(\)=>\{[^}]*void initializeLocalLibrary\(\)/);
  assert.match(app,/\@change="chooseSongFromPicker/);
  assert.match(app,/await adoptLocalSong\(fresh\)/);
  assert.match(app,/await adoptLocalSong\(imported\)/);
  console.log('PASS autosave, restore, new-song and imported-song flows are wired');
  // Run the app startup function against the same fake IndexedDB as the store tests.
  const startup=app.slice(app.indexOf('async function initializeLocalLibrary()'),app.indexOf('// Keep topical menus'));
  const restore=app.slice(app.indexOf('function clampActivityBar('),app.indexOf('function openDirectPracticePicker('));
  const compiledStartup=require('typescript').transpile(startup+restore,{target:require('typescript').ScriptTarget.ES2022});
  const evaluateStartup=new Function('globals',`with(globals){${compiledStartup};return initializeLocalLibrary();}`);
  const ref=value=>({value});
  const globals={
    listLocalSongs:lib.listLocalSongs,readLocalSong:lib.readLocalSong,lastOpenedSongId:lib.lastOpenedSongId,
    rememberOpenedSongId:lib.rememberOpenedSongId,localStorage,localSongId:ref(''),localSongs:ref([]),
    homeOpen:ref(true),libraryLoading:ref(true),libraryReady:ref(false),performanceMode:ref(false),
    saveStatus:ref(''),message:ref(''),selectedBar:ref(0),performanceBeat:ref(0),noteInst:ref(''),
    selectProjectInEditor:p=>{globals.loaded=p;globals.project.value=p;},projectInstruments:()=>[],
    project:ref(null),workspaceTabs:['arrange','notes','about'],active:ref('arrange'),activeRoster:ref(['Violin I','Voice']),
    overviewFocus:ref(0),noteLoopFrom:ref(1),noteLoopTo:ref(1),performanceView:ref('ensemble'),pickupBeats:ref(0),
    activityContext:()=>globals.savedContext, savedContext:{arrange:{tab:'notes',bar:8,instrument:'Violin I',range:[2,9]}},
    homePractise:inst=>{globals.resumedPractice=inst;},
  };
  await evaluateStartup(globals);
  assert.equal(globals.localSongId.value,second);
  assert.equal(globals.homeOpen.value,false);
  assert.equal(globals.loaded.bars[0].chord,'D,D,D,G');
  assert.equal(globals.active.value,'notes');
  assert.equal(globals.selectedBar.value,Math.min(8,globals.loaded.bars.length-1));
  assert.equal(globals.noteInst.value,'Violin I');
  assert.equal(globals.noteLoopTo.value,Math.min(9,globals.loaded.bars.length));
  globals.savedContext.perform={view:'notes',bar:2};
  localStorage.setItem('tango-last-activity','perform');
  await evaluateStartup(globals);
  assert.equal(globals.performanceMode.value,true);
  assert.equal(globals.performanceView.value,'notes');
  assert.equal(globals.performanceBeat.value,Math.min(2,globals.loaded.bars.length-1)*globals.loaded.beats);
  globals.savedContext.practice={instrument:'Voice'};
  localStorage.setItem('tango-last-activity','practice');
  await evaluateStartup(globals);
  assert.equal(globals.resumedPractice,'Voice');
  globals.resumedPractice=undefined;
  globals.savedContext.practice={instrument:'Missing part'};
  await evaluateStartup(globals);
  assert.equal(globals.resumedPractice,undefined);
  assert.equal(globals.performanceMode.value,false);
  assert.equal(globals.active.value,'notes');
  localStorage.setItem('tango-last-activity','');
  await lib.deleteLocalSong(second);
  globals.localSongId.value='';
  globals.libraryLoading.value=true;
  await evaluateStartup(globals);
  assert.equal((await lib.listLocalSongs()).length,0);
  assert.equal(globals.homeOpen.value,true);
  assert.equal(globals.libraryLoading.value,false);
  assert.equal(globals.libraryReady.value,true);
  assert.match(app,/else\{localSongId.value='';rememberOpenedSongId\(''\);showHome\(\);\}/);
  assert.match(app,/if\(localSongId.value\)void flushAutosave\(\)/);
  console.log('PASS startup restores saved songs, and empty Home has no implicit draft');
  const css=fs.readFileSync(path.join(root,'src/style.css'),'utf8');
  for(const [activity,label] of [['arrange','Continue'],['practice','Practise'],['perform','Perform']]){
    assert.ok(app.includes(`@click="homeChooseSong(localSongId,'${activity}')">${label} · {{project.title.trim()||'Untitled tango'}}`));
  }
  assert.match(css,/\.home-workspace \.home-actions button\{[^}]*max-width:100%[^}]*white-space:normal[^}]*overflow-wrap:anywhere/);
  assert.match(css,/\.home-song-row > div:first-child\{[^}]*max-width:100%[^}]*overflow-wrap:anywhere/);
  console.log('PASS Home shortcuts name the current song and can wrap long titles');
  assert.match(app,/async function auditionPitch/);
  assert.match(app,/Tone=await startAudioFromGesture\(\)/);
  assert.match(app,/auditionEvent\(added\)/);
  assert.match(app,/const original=noteMeasure\.value\[index\];\s*commitInspectorCommand\('delete',\{kind:'notes',keys:\[quickNoteKey\(original\)\]\}\);\s*auditionEvent\(original\)/);
  assert.match(app,/@click.stop="selectGridNote\(n\)"/);
  assert.match(app,/function selectGridNote\(note:Note\)\{[\s\S]*?selectScoreNote\(note\)/);
  assert.match(app,/if\(index>=0\)selectNoteEvent\(index\)/);
  assert.match(app,/v-model="auditionEnabled"/);
  console.log('PASS piano-roll click audition, event audition and sound toggle are wired');
  console.log('7 local-library / audition checks passed');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
