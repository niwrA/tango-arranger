const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const app=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
const session=fs.readFileSync(path.join(root,'src/toneSession.ts'),'utf8');
let count=0;
function test(name,fn){fn();count++;console.log('PASS',name);}
test('Tone.js is not eagerly imported when the app loads',()=>{
 assert.doesNotMatch(app,/import\s+\*\s+as\s+Tone\s+from\s+['"]tone['"]/);
 assert.match(app,/import type \{PolySynth,Synth\} from 'tone'/);
});
test('AudioContext is constructed and resumed before asynchronous Tone import',()=>{
 const create=session.indexOf('new AudioContext()');
 const resume=session.indexOf('context.resume()');
 const load=session.lastIndexOf("import('tone')");
 const wait=session.indexOf('await Promise.all');
 assert.ok(create>=0&&resume>create&&load>resume&&wait>load);
});
test('Tone.js adopts the already resumed native audio context',()=>{
 assert.match(session,/tone\.setContext\(context\)/);
 assert.match(session,/await tone\.start\(\)/);
 assert.match(session,/tone\.getContext\(\)\.state!=='running'/);
});
test('Full playback and measure loop unlock on their user gestures',()=>{
 const matches=app.match(/Tone=await startAudioFromGesture\(\);/g)||[];
 assert.ok(matches.length>=6,'all playback and audition entry points must unlock audio on a user gesture');
});
test('Expressive audition also unlocks audio before accessing Tone',()=>{
 const event=app.slice(app.indexOf('function auditionEvent('),app.indexOf('function selectNoteEvent('));
 const unlock=event.indexOf('await startAudioFromGesture()');
 const prepare=event.indexOf('await prepareSamples([inst])');
 const render=event.indexOf('renderArrangementNote(');
 assert.ok(unlock>=0&&prepare>unlock&&render>prepare);
 assert.match(event,/if\(!current\(\)\)return;\s+const at=Tone.now\(\)/);
});
test('Audio session and Vue setup script parse as TypeScript',()=>{
 let ts;try{ts=require('typescript')}catch{ts=require(path.join(cp.execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim(),'typescript'));}
 const script=app.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)?.[1];
 for(const code of [session,script]){
  assert.ok(code);
  const output=ts.transpileModule(code,{reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});
  const errors=(output.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
  assert.deepEqual(errors.map(e=>ts.flattenDiagnosticMessageText(e.messageText,' ')),[]);
 }
});
console.log(`${count} audio-unlock checks passed`);
