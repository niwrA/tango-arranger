const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..');
const vue=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
const css=fs.readFileSync(path.join(root,'src/style.css'),'utf8');
const pkg=require(path.join(root,'package.json'));
let checks=0;
function test(name,fn){fn();checks++;console.log('PASS',name);}
const editor=vue.slice(vue.indexOf('<section v-else-if="active===\'notes\'" ref="noteEditorRegion"'),vue.indexOf('</main></div><footer'));
test('package and lockfile agree',()=>assert.equal(pkg.version,require('../package-lock.json').version));
test('focus mode is transient, not stored on project',()=>{assert.match(vue,/const noteFocusMode=ref\(false\)/);assert.doesNotMatch(vue,/project\.value\.noteFocusMode/);});
test('enter focus preserves the current tool and closes the popup',()=>{const fn=vue.match(/function enterNoteFocusMode\(\)\{[\s\S]*?\n\}/)[0];assert.match(fn,/noteDetailsPopup\.value=false/);assert.doesNotMatch(fn,/noteEditorTab\.value=/);});
test('exit focus and escape restores regular note editing',()=>{assert.match(vue,/function exitNoteFocusMode\(/);assert.match(vue,/else if\(noteFocusMode\.value\)exitNoteFocusMode\(\)/);});
test('focus can be activated from regular editor',()=>assert.match(editor,/class="secondary note-focus-enter" @click="enterNoteFocusMode"/));
test('focus toolbar precedes piano roll',()=>assert.ok(editor.indexOf('class="note-focus-toolbar"')<editor.indexOf('class="note-grid-scroll"')));
test('top controls include previous next and loop',()=>{assert.match(editor,/<MeasureRangeControl/);assert.match(editor,/@click="toggleNoteLoop"/);});
test('loop from and to bounds can be selected',()=>{assert.match(editor,/<MeasureRangeControl[^>]*:from="noteLoopFrom" :to="noteLoopTo"[^>]*@change="setNoteEditorMeasureRange"/);assert.match(vue,/const range=noteFocusLoopRange\(\)/);});
test('loop walks the range in order',()=>assert.match(vue,/range\.from\+\(loopPass\+\+%\(range\.to-range\.from\+1\)\)/));
test('loop range controls are locked during playback',()=>assert.match(editor,/<MeasureRangeControl[^>]*:disabled="noteLoopPlaying\|\|capturePlaying"/));
test('bottom quick editor includes duration, position, articulation and delete',()=>{for(const marker of ['class="note-focus-bottom"','nudgeSelectedNote(-0.5)','nudgeSelectedNote(0.5)','changeNoteDuration(-0.25)','changeNoteDuration(0.25)','updateSelectedNote(\'articulation\'','deleteSelectedNote'])assert.ok(editor.includes(marker),marker);});
test('all note properties remain available in focus',()=>assert.match(css,/\.note-focus-mode\.note-focus-more-open \.note-properties\{display:block/));
test('full-viewport overlay and sticky navigation',()=>{assert.match(css,/\.note-focus-mode\{position:fixed;inset:0;z-index:120/);assert.match(css,/\.note-focus-toolbar\{position:sticky;top:0/);assert.match(css,/\.note-focus-bottom\{position:fixed;bottom:0/);});
test('focus preserves regular note tabs',()=>{for(const tab of ['notes','capture','figures','expression'])assert.ok(editor.includes(`id="note-tab-${tab}"`));});
test('focus mode retains octave navigation',()=>{assert.match(editor,/class="note-focus-view-tools"/);assert.match(editor,/Treble ↑ octave/);assert.match(editor,/↑ View octave/);});
test('long press opens full note properties in focus',()=>assert.match(vue,/if\(noteFocusMode\.value\)noteFocusMore\.value=true;else noteDetailsPopup\.value=true/));
test('focus grid scrolls independently',()=>assert.match(css,/\.note-focus-mode \.note-grid-scroll\{max-height:calc\(100dvh - 215px\);overflow:auto/));
test('measure navigation keeps the previous range length where possible',()=>{assert.match(vue,/const previousLoopLength=Math.max\(1,noteLoopTo.value-noteLoopFrom.value\+1\)/);assert.match(vue,/Math.min\(previousLoopLength,project.value.bars.length\)/);assert.match(vue,/noteLoopFrom.value=first\+1;\s*noteLoopTo.value=first\+count/);});
test('focus leaves automatically when switching workspace',()=>assert.match(vue,/if\(tab!=='notes'\)\{noteFocusMode\.value=false;noteFocusMore\.value=false;\}/));
test('compact mode category and action selectors do not execute on selection',()=>{
 for(const marker of ['aria-label="Interaction mode"','aria-label="Action category"','aria-label="Musical action"','@click="applyQuickNote(compactQuickAction)"'])assert.ok(editor.includes(marker),marker);
 assert.match(css,/\.musical-compact-selectors\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
});
test('one working range is separate from the Notes or Measures editing target',()=>{
 assert.match(editor,/<MeasureRangeControl[^>]+@change="setNoteEditorMeasureRange"/);
 assert.doesNotMatch(editor,/note-working-presets/);
 assert.match(vue,/const quickScope=ref<'notes'\|'measures'>\('notes'\)/);
});
test('independent playback does not modify working bounds',()=>{
 const fn=vue.match(/function noteFocusLoopRange\(\)\{[\s\S]*?\n\}/)[0];
 assert.match(fn,/if\(independentNoteLoop\.value\)/);
 assert.match(fn,/independentNoteLoopFrom\.value/);
 assert.match(fn,/independentNoteLoopTo\.value/);
});
test('range summary is opt-in and collapses only on phones',()=>{
 const range=fs.readFileSync(path.join(root,'src/MeasureRangeControl.vue'),'utf8');
 assert.match(range,/collapsible\?:boolean/);
 assert.match(range,/collapsible:false/);
 assert.match(range,/range-collapsible:not\(\.range-expanded\)>label/);
});


test('note loop uses shared instrument rendering rather than generic synth',()=>{
 const loop=vue.slice(vue.indexOf('async function toggleNoteLoop(){'),vue.indexOf('\nwatch(active,',vue.indexOf('async function toggleNoteLoop(){')));
 assert.match(loop,/await prepareSamples\(\[inst\]\)/);
 assert.match(loop,/renderArrangementNote\(inst,note,event,/);
 assert.match(loop,/midiPianoAvailable\(inst\)/);
 assert.doesNotMatch(loop,/loopSynth|new Tone\.PolySynth/);
});
test('shared settings dialog precedes the Score and Edit panels and restores toolbar focus',()=>{
 const settings=editor.indexOf('id="note-settings-popup"');
 assert.ok(settings>=0&&settings<editor.indexOf('id="note-panel-score"'));
 assert.match(vue,/querySelector<HTMLElement>\('\.note-settings-icon'\)\?\.focus/);
});
console.log(`${checks} focused editor checks passed`);
