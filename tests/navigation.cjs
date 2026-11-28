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
  assert.match(cell,/@click="selectOverviewMapCell\(inst,i,\$event\)"/);
  assert.match(cell,/@dblclick\.stop="onMapCellDoubleClick\(inst,i,\$event\)"/);
  assert.match(cell,/@keydown\.enter\.stop\.prevent="onMapCellEnter\(inst,i,\$event\)"/);
  assert.match(src,/if\(!event\.shiftKey\)openMapCellNotes\(inst,i\)/);
  assert.match(src,/else openMapCellNotes\(inst,i\)/);
  assert.match(src,/function openMapCellNotes\(inst:Instrument,i:number\)\{focusOverview\(inst,i\);openNoteEditor\(inst,i\);\}/);
  assert.match(cell,/:aria-label="`\$\{inst\}, measure \$\{i\+1\}/);
});
test('note editor can return to same instrument and measure in map',()=>{
  assert.match(src,/function returnToMap\(\)\{[\s\S]*?focusOverview\(inst,i\);active\.value='arrange'/);
  assert.match(src,/data-map-measure="i" :data-map-instrument="inst"/);
  assert.match(src,/querySelector<HTMLButtonElement>\(`\.song-cell\[data-map-measure=/);
  assert.match(src,/@click="returnToMap"/);
});
test('note editor has previous and next measure actions with safe boundaries',()=>{
  assert.match(src,/:disabled="selectedBar<=0" @click="openNoteEditor\(noteInst,selectedBar-1\)"/);
  assert.match(src,/:disabled="selectedBar>=project\.bars\.length-1" @click="openNoteEditor\(noteInst,selectedBar\+1\)"/);
  assert.match(src,/action==='previousMeasure'&&selectedBar\.value>0/);
  assert.match(src,/action==='nextMeasure'&&selectedBar\.value<project\.value\.bars\.length-1/);
});
test('note-editor shortcuts ignore text fields and modifier keys',()=>{
  assert.match(src,/altKey:event\.altKey,ctrlKey:event\.ctrlKey,metaKey:event\.metaKey,shiftKey:event\.shiftKey/);
  assert.match(src,/target\?\.closest\('input,textarea,select,\[contenteditable\]'\)/);
  assert.match(src,/if\(action==='escape'\)\{/);
  assert.match(src,/ref="noteEditorRegion" class="note-editor-section" tabindex="-1" :class="[^\"]+" @keydown="handleNoteEditorKey"/);
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
  const {resolveEditorShortcut}=(()=>{
    const source=fs.readFileSync(path.join(root,'src/editorShortcuts.ts'),'utf8');
    const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
    const exports={};vm.runInNewContext(compiled,{exports});return exports;
  })();
  const editor={
    selectedBar,noteInst,project,noteDrag:null,gridBrushPointer:null,quickDraft:{value:null},
    editorKeyAction:(event,kind)=>resolveEditorShortcut(kind,event.key,{altKey:event.altKey,ctrlKey:event.ctrlKey,metaKey:event.metaKey,shiftKey:event.shiftKey,editable:!!event.target?.closest?.('input,textarea,select,[contenteditable]')}),
    pendingKeyChange:{value:null},newSongOpen:{value:false},noteDetailsPopup:{value:false},noteFocusMore:{value:false},noteFocusMode:{value:false},exitNoteFocusMode:()=>actions.push('exitFocus'),
    returnToMap:()=>actions.push('map'),openNoteEditor:(inst,i)=>actions.push([inst,i]),
    cancelNoteDrag:()=>{},cancelGridBrush:()=>{editor.gridBrushPointer=null;actions.push('cancelBrush');}
  };
  const handler=vm.runInNewContext(`${compiled};handleNoteEditorKey`,editor);
  const ev=(key,extra={})=>({key,altKey:false,ctrlKey:false,metaKey:false,shiftKey:false,defaultPrevented:false,target:{closest:()=>null},preventDefault(){this.prevented=true;},...extra});
  let e=ev('[');handler(e);assert.equal(e.prevented,true);assert.deepEqual(actions.pop(),['Violin II',2]);
  e=ev(']');handler(e);assert.deepEqual(actions.pop(),['Violin II',4]);
  selectedBar.value=4;e=ev(']');handler(e);assert.equal(e.prevented,undefined);assert.equal(actions.length,0);
  e=ev('[',{target:{closest:()=>({tagName:'INPUT'})}});handler(e);assert.equal(e.prevented,undefined);assert.equal(actions.length,0);
  e=ev('[',{ctrlKey:true});handler(e);assert.equal(e.prevented,undefined);assert.equal(actions.length,0);
  editor.gridBrushPointer={id:1};e=ev('Escape');handler(e);
  assert.equal(e.prevented,true);assert.equal(editor.gridBrushPointer,null);assert.deepEqual(actions.splice(0),['cancelBrush']);
  e=ev('Escape');handler(e);assert.equal(e.prevented,true);assert.equal(actions.pop(),'map');
});
test('section and key editing is separate from the orchestration map',()=>{
  const start=src.indexOf('<section v-if="active===\'structure\'"');
  const lead=src.indexOf('<section v-else-if="active===\'lead\'"');
  const arrange=src.indexOf('<section v-else-if="active===\'arrange\'"');
  const rhythm=src.indexOf('<section v-else-if="active===\'rhythm\'"');
  assert.ok(start>=0&&lead>start&&arrange>lead&&rhythm>arrange);
  const structure=src.slice(start,lead),orchestration=src.slice(arrange,rhythm);
  assert.match(structure,/<h3>Song structure<\/h3>/);
  assert.match(structure,/<h3>Keys by section<\/h3>/);
  assert.match(src,/<button[^>]+@click="[^"]*active='arrange'">Arrangement<\/button>/);
  assert.match(orchestration,/<div class="song-map-scroll">/);
  assert.match(orchestration,/<div class="editor overview-edit">/);
  assert.match(orchestration,/Configure the selected A\/B\/C song part/);
  assert.doesNotMatch(orchestration,/class="overview-section-strip"/);
});
test('Structure opens by default, saved tabs restore, and tabs have descriptive labels',()=>{
  assert.match(src,/function initialWorkspaceTab\(\):WorkspaceTab\{[\s\S]*?workspaceTabs.includes\(saved as WorkspaceTab\)[\s\S]*?return 'structure'/);
  assert.match(src,/const active=ref<[^>]+>\(initialWorkspaceTab\(\)\)/);
  const nav=src.match(/<nav class="tabs workspace-menu" aria-label="Main work areas"[^>]*>[\s\S]*?<\/nav>/)?.[0];
  assert.ok(nav);
  assert.deepEqual([...nav.matchAll(/<button[^>]*>([^<]+)<\/button>/g)].map(m=>m[1]),
    ['Song','Lead sheet','Arrangement','Note editor','Rhythm designer','About &amp; releases']);
  assert.doesNotMatch(nav,/\d+ ·/);
  assert.doesNotMatch(nav,/Song overview/);
});
console.log(`${tests} navigation checks passed`);
