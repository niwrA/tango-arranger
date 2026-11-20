const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const src=fs.readFileSync(path.join(root,'src/stringFingerboard.ts'),'utf8');
const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};vm.runInNewContext('(function(module,exports){'+js+'\n})',{})(mod,mod.exports);
const {fingerboardStrings,visibleFingerboardFrets,fingerboardMidi}=mod.exports;
let count=0;function check(name,fn){fn();count++;console.log('PASS '+name)}
check('violin high E string is above A D G',()=>assert.deepEqual(Array.from(fingerboardStrings('Violin I'),x=>x.name),['E5','A4','D4','G3']));
check('violin II has same string order',()=>assert.deepEqual(Array.from(fingerboardStrings('Violin II'),x=>x.midi),[76,69,62,55]));
check('contrabass E A D G display is unchanged',()=>assert.deepEqual(Array.from(fingerboardStrings('Contrabass'),x=>x.midi),[28,33,38,43]));
check('guitar display and non-string instruments are unchanged',()=>{assert.equal(fingerboardStrings('Piano').length,0);assert.equal(fingerboardStrings('Guitar').length,6)});
check('window clamps to a maximum of 24 semitones',()=>{assert.deepEqual(Array.from(visibleFingerboardFrets(0,8)),[0,1,2,3,4,5,6,7]);assert.deepEqual(Array.from(visibleFingerboardFrets(20,12)),[13,14,15,16,17,18,19,20,21,22,23,24]);assert.equal(visibleFingerboardFrets(12,25)[0],0);assert.throws(()=>visibleFingerboardFrets(0,26))});
check('fingerboard maps notes to chromatic MIDI without re-pitching',()=>{assert.equal(fingerboardMidi(76,12,[55,109]),88);assert.equal(fingerboardMidi(28,12,[28,70]),40);assert.equal(fingerboardMidi(55,0,[62,109]),null);assert.equal(fingerboardMidi(76,25,[55,109]),null)});
const app=fs.readFileSync(path.join(root,'src/App.vue'),'utf8'),diagram=fs.readFileSync(path.join(root,'src/PerformanceChordDiagram.vue'),'utf8');
check('performance and capture use same tuning source',()=>{assert.ok(diagram.includes('fingerboardStrings(family.value)'));assert.ok(app.includes('fingerboardStrings(noteInst.value)'))});
check('capture fingerboard retains hold-to-record events and draft apply',()=>{const span=app.slice(app.indexOf('class="capture-fingerboard-scroll"'),app.indexOf('aria-label="Melody keyboard note range"'));assert.ok(span.includes('capturePianoKey($event,string.midi+fret)'));assert.ok(span.includes('releaseCapturePianoKey($event)'));assert.ok(span.includes('capturePianoKeyClick($event,string.midi+fret)'));assert.ok(app.includes('applyCapturedMelody'))});
check('keyboard alternative preserved',()=>{assert.ok(app.includes("captureInputLayout==='keyboard'"));assert.ok(app.includes('captureKeyboardPitches'));assert.ok(app.includes('captureSpeed.value'))});
console.log(count+' fingerboard checks passed');
