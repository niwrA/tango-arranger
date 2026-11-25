const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'src/noteGridWindow.ts'),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};
new Function('module','exports',compiled)(mod,mod.exports);
const {noteGridViewport}=mod.exports;
assert.deepEqual(noteGridViewport(1,16,0,900),{first:0,end:1,active:0,leftPx:0,widthPx:448});
assert.deepEqual(noteGridViewport(33,16,0,900),{first:0,end:3,active:0,leftPx:0,widthPx:1344});
const middle=noteGridViewport(33,16,15*448,900);
assert.equal(middle.first,13);
assert.equal(middle.end,18);
assert.equal(middle.active,15);
assert.equal(middle.leftPx,13*448);
assert.equal(middle.widthPx,5*448);
const last=noteGridViewport(33,16,33*448,900);
assert.equal(last.end,33);
assert.equal(last.active,32);
assert.ok(last.end-last.first<=5);
const wide=noteGridViewport(1000,16,500*448,1024);
assert.ok(wide.end-wide.first<=6,'rendering remains bounded for a huge selection');
assert.equal(noteGridViewport(33,16,100,900).active,0);
assert.equal(noteGridViewport(33,16,400,900).active,1);
assert.ok(noteGridViewport(33,8,8*28*7,700).first>0);
assert.equal(noteGridViewport(33,16,-999,0).active,0);
const vue=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
assert.match(vue,/function handleNoteGridScroll\(event:Event\)/);
assert.match(vue,/@scroll.passive="handleNoteGridScroll"/);
assert.match(vue,/function refreshNoteGridViewport\(alignSelected=false\)/);
assert.equal((vue.match(/v-for="barIndex in noteGridMeasures"/g)||[]).length,3);
assert.doesNotMatch(vue,/v-for="barIndex in focusVisibleMeasures"/);
assert.match(vue,/noteGridNotesByPitch/);
assert.match(vue,/noteGridScrollers\(\)/);
assert.match(vue,/if\(Math.abs\(element.scrollLeft-noteGridScrollLeft\)<0.5\)return/);
assert.match(vue,/const nextMeasure=range\[next.active\]/);
assert.match(vue,/\.note-grid-window-cells\{grid-template-columns:repeat\(var\(--note-window-steps\)/);
assert.match(vue,/touch-action:pan-x pan-y!important/);
// Native scrolling and note editing must remain separate gestures.
assert.doesNotMatch(vue,/function beginNoteGridPan/);
assert.match(vue,/@pointermove="moveNoteDrag\(\$event\)"/);
assert.match(vue,/\.note-continuous-pitch-title,\.note-continuous-pitch-label\{position:sticky;left:0/);
assert.match(vue,/\.note-continuous-beats\{position:sticky;top:40px/);
assert.match(vue,/target\?\.closest\('\.note-bar,\.note-resize-handle'\)/);
assert.doesNotMatch(vue,/class="note-grid-selection-status"/);
assert.doesNotMatch(vue,/function stepNoteGrid\(/);
assert.match(vue,/class="note-active-measure"/);


const styles=fs.readFileSync(path.join(root,'src/style.css'),'utf8');
const enterFocus=vue.match(/function enterNoteFocusMode\(\)\{[\s\S]*?\n\}/)?.[0]??'';
assert.ok(enterFocus,'Focus entry function is present');
assert.doesNotMatch(enterFocus,/noteEditorTab\.value\s*=\s*'notes'/,'entering focus keeps the selected tool');
assert.match(vue,/\.note-editor-section\.note-focus-mode>\.note-subtabs\{\s*display:flex!important/,'Focus has visible tool tabs');
for(const tab of ['notes','score','capture','figures','expression']){
  assert.ok(vue.includes(`<section id="note-panel-${tab}" v-show="noteEditorTab==='${tab}'"`),`Focus retains the ${tab} tool panel`);
}
assert.match(vue,/<ScorePreview[^>]*:from-measure="noteLoopFrom" :to-measure="noteLoopTo"/,'Score follows the Note Editor range');
assert.doesNotMatch(styles,/\.note-focus-mode[^\n]*\.note-subtabs\{display:none!important\}/,'global styles must not hide focus tabs');
assert.doesNotMatch(styles,/\.note-focus-mode #note-panel-capture[^\n]*display:none!important/,'global styles must not hide alternate tools');
assert.match(vue,/<div class="note-editor-meta"/,'context and snap share a compact row');
assert.match(vue,/class="note-active-measure"/,'editing measure remains visible');
assert.match(vue,/v-if="noteFocusMode&&noteEditorTab==='notes'&&selectedEvent" class="note-focus-bottom"/,'quick note controls render only for a selected note');
assert.match(vue,/'note-focus-has-selection':noteFocusMode&&noteEditorTab==='notes'&&!!selectedEvent/,'focus bottom clearance follows selection');

console.log('Note-grid virtualization and Focus-mode layout checks passed');
