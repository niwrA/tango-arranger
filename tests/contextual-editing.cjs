const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createRequire}=require('node:module');
const root=path.resolve(__dirname,'..');
const fromRepo=createRequire(path.join(root,'package.json'));
const ts=fromRepo('typescript');
const compiler=fromRepo('@vue/compiler-sfc');
const tsSource=fs.readFileSync(path.join(root,'src/contextPress.ts'),'utf8');
const transpiled=ts.transpileModule(tsSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const mod={exports:{}};
vm.runInNewContext('(function(module,exports){'+transpiled+'})',{setTimeout,clearTimeout,Date,Math},{filename:'contextPress.ts'})(mod,mod.exports);
const {createLongPressMenu,isContextMenuKey}=mod.exports;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let count=0;
function check(name,fn){fn();count++;console.log('PASS',name);}
function pointer(x=0,y=0){return {pointerId:3,pointerType:'touch',isPrimary:true,button:0,clientX:x,clientY:y};}

check('context menu keyboard gestures include Menu and Shift+F10 only',()=>{
 assert.equal(isContextMenuKey({key:'ContextMenu',shiftKey:false}),true);
 assert.equal(isContextMenuKey({key:'F10',shiftKey:true}),true);
 assert.equal(isContextMenuKey({key:'F10',shiftKey:false}),false);
 assert.equal(isContextMenuKey({key:'Enter',shiftKey:true}),false);
});
(async()=>{
 const hold=createLongPressMenu(9,12);let opened=0;
 hold.start(pointer(),()=>opened++);
 await sleep(25);
 assert.equal(opened,1,'Long touch must open the menu');
 hold.end(pointer());
 assert.equal(hold.consumeClick(),true,'Synthetic click after long touch is consumed');
 assert.equal(hold.consumeClick(),false,'Click suppression is one shot');
 console.log('PASS touch long press opens once without duplicate click');count++;
 hold.start(pointer(),()=>opened++);
 hold.end(pointer());
 assert.equal(hold.consumeClick(),false,'Ordinary short tap must not be suppressed');
 await sleep(20);
 assert.equal(opened,1,'Short tap does not open menu');
 console.log('PASS normal tap stays unchanged');count++;
 hold.start(pointer(),()=>opened++);
 hold.move(pointer(8,10));
 await sleep(20);
 assert.equal(opened,1,'Touch movement past threshold cancels menu');
 console.log('PASS scrolling gesture cancels pending long press');count++;
 hold.start(pointer(),()=>opened++);
 hold.end(pointer());
 await sleep(20);
 assert.equal(opened,1,'Pointer release cancels pending hold');
 hold.start(pointer(),()=>opened++);
 hold.cancel();
 await sleep(20);
 assert.equal(opened,1,'Pointer cancel clears pending hold');
 console.log('PASS release and cancellation do not open menus');count++;
 hold.start({...pointer(),pointerType:'mouse'},()=>opened++);
 hold.start({...pointer(),pointerType:'touch',button:2},()=>opened++);
 hold.start({...pointer(),pointerType:'touch',isPrimary:false},()=>opened++);
 await sleep(25);
 assert.equal(opened,1,'Mouse/nonprimary pointer must not start touch holds');
 console.log('PASS right click and secondary touch do not trigger a delayed menu');count++;
 const phrase=fs.readFileSync(path.join(root,'src/PhrasePlanEditor.vue'),'utf8');
 const app=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
 const files=[['src/PhrasePlanEditor.vue',phrase],['src/App.vue',app]];
 for(const [name,source] of files){
  const result=compiler.parse(source,{filename:name});
  assert.equal(result.errors.length,0,name+': '+result.errors.join('; '));
 }
 console.log('PASS Vue component structure parses');count++;
 const expectedPhrase=[
  'class="phrase-blocks"','phraseContextKey($event,phrase.id)',
  'phraseHold.move($event)','phraseHold.end($event)',
  'copyPriorPhrase()','setPhrasePlacement(','setPhraseActivity(',
  "emit('open-notes'","props.draft&&clone(props.draft)",
  "emit('update:draft',plan)","'open-notes':[firstMeasure:number,lastMeasure:number]"
 ];
 for(const item of expectedPhrase)assert.ok(phrase.includes(item),'Missing phrase-menu behavior: '+item);
 assert.ok(app.includes('@open-notes="openPhraseNotes"'));
 console.log('PASS phrase blocks, draft-only changes and note-editor navigation');count++;
 const expectedRhythm=[
  "function rhythmMenuAction(","rhythmPointerDown($event,i)",
  'rhythmContextKey($event,i)','rhythmPress.move($event)',
  'class="context-sheet-dialog rhythm-context-dialog"',
  "rhythmMenuAction('accent')","rhythmMenuAction('split')",
  "rhythmMenuAction('delete')","rhythmMenuAction('details')",
  "function selectRhythmAttack(index:number)","rhythmPress.consumeClick()",
  '.rhythm-event{touch-action:pan-y'
 ];
 for(const item of expectedRhythm)assert.ok(app.includes(item),'Missing rhythm-menu behavior: '+item);
 console.log('PASS rhythm context actions reuse existing editor and preserve scrolling');count++;
 const expectedDynamics=[
  'type DynamicsContextTarget=',"openDynamicsContext('measure',barIndex)",
  "openDynamicsContext('hairpin',item.index)",
  'dynamicsContextKey($event','dynamicsPress.move($event)',
  'class="context-sheet-dialog dynamics-context-dialog"',
  "dynamicsMenuAction('start')","dynamicsMenuAction('end')",
  "dynamicsMenuAction('edit')","dynamicsMenuAction('delete')",
  'selectedRange?[selectedRange.instrument]',
  "window.confirm('Delete this '",
  "watch([active,noteEditorTab]"
 ];
 for(const item of expectedDynamics)assert.ok(app.includes(item),'Missing dynamics-menu behavior: '+item);
 console.log('PASS dynamics and hairpin menus reuse validated endpoints');count++;
 const css=fs.readFileSync(path.join(root,'src/style.css'),'utf8');
 const leadStart=app.indexOf("<section v-else-if=\"active==='lead'\">");
 const leadEnd=app.indexOf("<section v-else-if=\"active==='arrange'\"",leadStart);
 assert.ok(leadStart>=0&&leadEnd>leadStart);
 const lead=app.slice(leadStart,leadEnd);
 assert.match(lead,/class="lead-command-bar" role="group"/);
 assert.match(lead,/class="lead-preview-controls" role="group"/);
 assert.match(lead,/class="lead-history-controls" role="group"/);
 assert.match(lead,/class="lead-measure-count"/);
 assert.doesNotMatch(lead,/lead-history-actions/);
 const toolbar=lead.slice(lead.indexOf('class="lead-command-bar"'),lead.indexOf('<p class="muted">'));
 assert.ok(toolbar.indexOf('lead-preview-controls')<toolbar.indexOf('lead-history-controls'));
 assert.ok(toolbar.indexOf('lead-history-controls')<toolbar.indexOf('lead-measure-count'));
 for(const action of ["previewPart('lead',0,project.bars.length-1)","previewPart('lead',selectedBar,project.bars.length-1)","restoreHistory('undo')","restoreHistory('redo')"])
   assert.ok(toolbar.includes(action),'Missing action in combined toolbar: '+action);
 assert.ok(css.includes('.lead-command-bar{display:flex;align-items:center;flex-wrap:wrap'));
 assert.ok(css.includes('@media(max-width:480px)'));
 assert.ok(css.includes('.lead-history-controls{order:2}'));
 console.log('PASS compact single-row lead playback/history toolbar and mobile wrapping');count++;
 console.log(count+' contextual editing checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
