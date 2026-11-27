const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'tango-shortcuts-'));
let count=0;
function check(name,fn){fn();count++;console.log('PASS '+name);}
try{
 const compilation=cp.spawnSync(process.execPath,[require.resolve('typescript/bin/tsc'),'--strict','--module','commonjs','--target','es2022','--lib','es2022,dom','--outDir',tmp,path.join(root,'src/editorShortcuts.ts')],{encoding:'utf8'});
 assert.equal(compilation.status,0,compilation.stdout+'\n'+compilation.stderr);
 const {resolveEditorShortcut:resolve}=require(path.join(tmp,'editorShortcuts.js'));
 for(const editor of ['notes','rhythm']){
  for(const key of ['Delete','Backspace'])check(`${editor} ${key} deletes`,()=>assert.equal(resolve(editor,key),'delete'));
  for(const [key,expected] of [['ArrowLeft','previous'],['ArrowRight','next'],['+','lengthen'],['=','lengthen'],['-','shorten'],['l','loop'],['L','loop'],['Escape','escape']])check(`${editor} ${key} resolves ${expected}`,()=>assert.equal(resolve(editor,key),expected));
  for(const modifier of ['altKey','ctrlKey','metaKey','isComposing','editable','defaultPrevented'])check(`${editor} ignores ${modifier}`,()=>assert.equal(resolve(editor,'Delete',{[modifier]:true}),null));
  check(`${editor} shifted Delete is not intercepted`,()=>assert.equal(resolve(editor,'Delete',{shiftKey:true}),null));
  check(`${editor} shifted plus still changes duration`,()=>assert.equal(resolve(editor,'+',{shiftKey:true}),'lengthen'));
  check(`${editor} Space on button keeps native activation`,()=>assert.equal(resolve(editor,' ',{buttonFocused:true}),null));
  check(`${editor} Space on editor region toggles loop`,()=>assert.equal(resolve(editor,' ',{buttonFocused:false}),'loop'));
 }
 for(const [key,expected] of [['ArrowUp','pitchUp'],['ArrowDown','pitchDown'],['[','previousMeasure'],[']','nextMeasure']])check(`note ${key}`,()=>assert.equal(resolve('notes',key),expected));
 for(const [key,expected] of [['a','accent'],['A','accent'],['s','split'],['S','split']])check(`rhythm ${key}`,()=>assert.equal(resolve('rhythm',key),expected));
 check('Editor-specific shortcuts do not leak',()=>{
  assert.equal(resolve('notes','a'),null);assert.equal(resolve('rhythm','ArrowUp'),null);assert.equal(resolve('rhythm','['),null);
 });
 const app=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
 const css=fs.readFileSync(path.join(root,'src/style.css'),'utf8');
 check('Both editors listen for keyboard commands on their own section',()=>{
  assert.match(app,/class="rhythm-editor-section" tabindex="-1" @keydown="handleRhythmEditorKey"/);
  assert.match(app,/class="note-editor-section" tabindex="-1" :class="[^\"]+" @keydown="handleNoteEditorKey"/);
 });
 check('Both Delete actions call existing persistent edit operations',()=>{
  assert.match(app,/action==='delete'&&selectedEvent\.value\)\{event\.preventDefault\(\);deleteSelectedNote\(\);\}/);
  assert.match(app,/action==='delete'&&rhythmSelectedSlot\.value\)\{event\.preventDefault\(\);rhythmDelete\(\);\}/);
  assert.match(app,/function deleteSelectedNote\(\)\{[^}]*?commitInspectorCommand\('delete',\{kind:'notes',keys:\[quickNoteKey\(note\)\]/);
  assert.match(app,/function rhythmDelete\([\s\S]*?rhythmPattern\.value=rhythmPattern\.value\.filter/);
 });
 check('Shortcut dispatch ignores editable controls and modified keys',()=>{
  assert.match(app,/target\?\.closest\('input,textarea,select,\[contenteditable\]'\)/);
  assert.match(app,/altKey:event\.altKey,ctrlKey:event\.ctrlKey,metaKey:event\.metaKey,shiftKey:event\.shiftKey/);
 });
 check('Keyboard delete handlers and visible focus exist in both editors',()=>{
  assert.match(app,/action==='delete'&&selectedEvent\.value\)\{event\.preventDefault\(\);deleteSelectedNote\(\)/);
  assert.match(app,/action==='delete'&&rhythmSelectedSlot\.value\)\{event\.preventDefault\(\);rhythmDelete\(\)/);
  assert.match(css,/\.rhythm-event:focus-visible/);
  assert.match(css,/\.note-event-button:focus-visible/);
 });
 check('After deletion selection and focus move to remaining notes or attacks',()=>{
  assert.match(app,/function rhythmDelete\([\s\S]*?focusSelectedRhythmAttack\(\)/);
  assert.match(app,/function deleteSelectedNote\([\s\S]*?focusSelectedNoteButton\(\)/);
 });
 check('Delete key actually invokes note-editor delete, while text entry does not',()=>{
  const vm=require('node:vm');
  let ts;try{ts=require('typescript')}catch{ts=require(path.join(cp.execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim(),'typescript'));}
  const code=app.match(/function handleNoteEditorKey\(event:KeyboardEvent\)\{[\s\S]*?\n\}/)?.[0];
  assert.ok(code);
  const compiled=ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  let deletes=0;
  const handler=vm.runInNewContext(`${compiled};handleNoteEditorKey`,{
    pendingKeyChange:{value:null},newSongOpen:{value:false},selectedEvent:{value:{pitch:65}},
    editorKeyAction:(event,editor)=>resolve(editor,event.key,{editable:event.target?.editing,ctrlKey:event.ctrlKey}),
    deleteSelectedNote:()=>{deletes++;}
  });
  const ev=(key,editing=false)=>({key,target:{editing},preventDefault(){this.prevented=true;}});
  let e=ev('Delete');handler(e);assert.equal(deletes,1);assert.equal(e.prevented,true);
  e=ev('Backspace',true);handler(e);assert.equal(deletes,1);assert.equal(e.prevented,undefined);
  e=ev('Backspace');handler(e);assert.equal(deletes,2);assert.equal(e.prevented,true);
 });
 check('Delete key actually invokes rhythm-editor delete without applying the pattern',()=>{
  const vm=require('node:vm');
  let ts;try{ts=require('typescript')}catch{ts=require(path.join(cp.execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim(),'typescript'));}
  const code=app.match(/function handleRhythmEditorKey\(event:KeyboardEvent\)\{[\s\S]*?\n\}/)?.[0];
  assert.ok(code);
  const compiled=ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  let deletes=0;
  const handler=vm.runInNewContext(`${compiled};handleRhythmEditorKey`,{
    pendingKeyChange:{value:null},newSongOpen:{value:false},rhythmSelectedSlot:{value:{beat:0,duration:1}},
    editorKeyAction:(event,editor)=>resolve(editor,event.key,{editable:event.target?.editing}),
    rhythmDelete:()=>{deletes++;}
  });
  const e={key:'Delete',target:{editing:false},preventDefault(){this.prevented=true;}};
  handler(e);assert.equal(deletes,1);assert.equal(e.prevented,true);
 });
 console.log(`${count} editor shortcut assertions passed`);
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
