const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const src=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
let tests=0;
function test(name,fn){fn();tests++;console.log('PASS',name);}
test('map cell single click selects; double click and Enter open the exact instrument-measure',()=>{
  const cell=src.match(/<button type="button" :class="\['song-cell'[\s\S]*?<\/button>/)?.[0];
  assert.ok(cell,'song map cell button not found');
  assert.match(cell,/@click="focusOverview\(inst,i\)"/);
  assert.match(cell,/@dblclick\.stop="openMapCellNotes\(inst,i\)"/);
  assert.match(cell,/@keydown\.enter\.stop\.prevent="openMapCellNotes\(inst,i\)"/);
  assert.match(src,/function openMapCellNotes\(inst:Instrument,i:number\)\{focusOverview\(inst,i\);openNoteEditor\(inst,i\);\}/);
  assert.match(cell,/:aria-label="`\$\{inst\}, measure \$\{i\+1\}/);
});
test('note editor can return to same instrument and measure in map',()=>{
  assert.match(src,/function returnToMap\(\)\{[\s\S]*?focusOverview\(inst,i\);active\.value='overview'/);
  assert.match(src,/data-map-measure="i" :data-map-instrument="inst"/);
  assert.match(src,/querySelector<HTMLButtonElement>\(`\.song-cell\[data-map-measure=/);
  assert.match(src,/@click="returnToMap"/);
});
test('note editor has previous and next measure actions with safe boundaries',()=>{
  assert.match(src,/:disabled="selectedBar<=0" @click="openNoteEditor\(noteInst,selectedBar-1\)"/);
  assert.match(src,/:disabled="selectedBar>=project\.bars\.length-1" @click="openNoteEditor\(noteInst,selectedBar\+1\)"/);
  assert.match(src,/event\.key==='\['&&selectedBar\.value>0/);
  assert.match(src,/event\.key==='\]'&&selectedBar\.value<project\.value\.bars\.length-1/);
});
test('note-editor shortcuts ignore text fields and modifier keys',()=>{
  assert.match(src,/if\(event\.altKey\|\|event\.ctrlKey\|\|event\.metaKey\|\|event\.shiftKey\|\|event\.defaultPrevented\)return/);
  assert.match(src,/target\?\.closest\('input,textarea,select,\[contenteditable="true"\]'\)/);
  assert.match(src,/if\(event\.key==='Escape'\)\{event\.preventDefault\(\);returnToMap\(\)/);
  assert.match(src,/ref="noteEditorRegion" class="note-editor-section" tabindex="-1" @keydown="handleNoteEditorKey"/);
});
test('score note list double click and lead-sheet melody double click are wired',()=>{
  assert.match(src,/class="notes score-notes-shortcut"[^>]*@dblclick="openNoteEditor\(entry\.inst,selectedBar\)"/);
  assert.match(src,/@dblclick\.stop="focusLeadMelody\(span\.start\+offset-1\)"/);
  assert.match(src,/data-lead-melody rows="3"/);
  assert.match(src,/function focusLeadMelody\(i:number\)\{[\s\S]*?selectLeadMeasure\(i\);[\s\S]*?querySelector<HTMLTextAreaElement>/);
});
test('Vue script TypeScript parses without diagnostics',()=>{
  let ts;try{ts=require('typescript')}catch{ts=require(path.join(cp.execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim(),'typescript'));}
  const script=src.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  const result=ts.transpileModule(script,{reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});
  const errors=(result.diagnostics??[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
  assert.deepEqual(errors.map(e=>ts.flattenDiagnosticMessageText(e.messageText,' ')),[]);
});
test('map-cell action passes exact instrument and measure to note editor',()=>{
  let ts;try{ts=require('typescript')}catch{ts=require(path.join(cp.execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim(),'typescript'));}
  const vm=require('node:vm');
  const code=src.match(/function openMapCellNotes\(inst:Instrument,i:number\)\{[^}]*\}/)?.[0];
  assert.ok(code);
  const compiled=ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const actions=[];
  const action=vm.runInNewContext(`${compiled};openMapCellNotes`,{focusOverview:(...a)=>actions.push(['select',...a]),openNoteEditor:(...a)=>actions.push(['edit',...a])});
  action('Bandoneon II',31);
  assert.deepEqual(actions,[['select','Bandoneon II',31],['edit','Bandoneon II',31]]);
});
test('note-editor shortcuts respect boundaries, modifiers and text-entry focus',()=>{
  let ts;try{ts=require('typescript')}catch{ts=require(path.join(cp.execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim(),'typescript'));}
  const vm=require('node:vm');
  const code=src.match(/function handleNoteEditorKey\(event:KeyboardEvent\)\{[\s\S]*?\n\}/)?.[0];
  assert.ok(code);
  const compiled=ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const actions=[],selectedBar={value:3},noteInst={value:'Violin II'},project={value:{bars:Array(5).fill({})}};
  const handler=vm.runInNewContext(`${compiled};handleNoteEditorKey`,{selectedBar,noteInst,project,returnToMap:()=>actions.push('map'),openNoteEditor:(inst,i)=>actions.push([inst,i])});
  const ev=(key,extra={})=>({key,altKey:false,ctrlKey:false,metaKey:false,shiftKey:false,defaultPrevented:false,target:{closest:()=>null},preventDefault(){this.prevented=true;},...extra});
  let e=ev('[');handler(e);assert.equal(e.prevented,true);assert.deepEqual(actions.pop(),['Violin II',2]);
  e=ev(']');handler(e);assert.deepEqual(actions.pop(),['Violin II',4]);
  selectedBar.value=4;e=ev(']');handler(e);assert.equal(e.prevented,undefined);assert.equal(actions.length,0);
  e=ev('[',{target:{closest:()=>({tagName:'INPUT'})}});handler(e);assert.equal(e.prevented,undefined);assert.equal(actions.length,0);
  e=ev('[',{ctrlKey:true});handler(e);assert.equal(e.prevented,undefined);assert.equal(actions.length,0);
  e=ev('Escape');handler(e);assert.equal(e.prevented,true);assert.equal(actions.pop(),'map');
});
test('structure and keys are isolated from the main orchestration map',()=>{
  const start=src.indexOf('<section v-if="active===\'structure\'"');
  const map=src.indexOf('<section v-else-if="active===\'overview\'"');
  const lead=src.indexOf('<section v-else-if="active===\'lead\'"');
  assert.ok(start>=0&&map>start&&lead>map);
  const structure=src.slice(start,map),overview=src.slice(map,lead);
  assert.match(structure,/<h3>Song structure<\/h3>/);
  assert.match(structure,/<h3>Keys by section<\/h3>/);
  assert.match(structure,/@click="active='overview'"/);
  assert.doesNotMatch(overview,/<h3>Song structure<\/h3>/);
  assert.doesNotMatch(overview,/<h3>Keys by section<\/h3>/);
  assert.match(overview,/<div class="overview-workspace">/);
  assert.match(overview,/<div class="song-map-scroll">/);
  assert.match(overview,/<div class="editor overview-edit">/);
  assert.match(overview,/@click="active='structure'"/);
});
test('map remains the default tab and tab navigation includes structure and keys',()=>{
  assert.match(src,/ref<'overview'\|'structure'\|'lead'\|'arrange'\|'rhythm'\|'score'\|'notes'\|'about'>\('overview'\)/);
  assert.match(src,/<nav class="tabs" aria-label="Main work areas">/);
  assert.match(src,/2 · Structure & keys/);
  assert.match(src,/7 · Note editor/);
  assert.match(src,/<div class="overview-section-strip"/);
});
console.log(`${tests} navigation checks passed`);
