const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
function read(file){return fs.readFileSync(path.join(root,file),'utf8')}
const js=ts.transpileModule(read('src/pianoRegisters.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};vm.runInNewContext('(function(module,exports){'+js+'\n})',{})(mod,mod.exports);
const {PIANO_LOW,PIANO_HIGH,PIANO_WHITES,pianoWindow,movePianoWindow,autoPianoCaptureRange}=mod.exports;
let count=0;function check(name,fn){fn();count++;console.log('PASS '+name)}
check('model covers A0 to C8 inclusive, 88 notes and 52 white keys',()=>{
 assert.equal(PIANO_LOW,21);assert.equal(PIANO_HIGH,108);
 assert.equal(PIANO_HIGH-PIANO_LOW+1,88);
 assert.equal(PIANO_WHITES.length,52);assert.equal(PIANO_WHITES[0],21);assert.equal(PIANO_WHITES.at(-1),108);
 assert.ok(read('src/music.ts').includes("Piano:{clef:'G',staves:2,transposition:0,range:[21,108]"));
});
check('whole register includes all keys, including 36 black keys',()=>{
 const win=pianoWindow([21,108],'all',60,52);
 assert.equal(win.start,21);assert.equal(win.end,108);
 assert.equal(win.whites.length,52);assert.equal(win.blacks.length,36);
 assert.equal(win.blacks[0].pitch,22);
});
check('two overlapping register windows follow their own staff side',()=>{
 const hi=pianoWindow([21,33,84,88],'upper',60,21);
 const lo=pianoWindow([21,33,84,88],'lower',60,21);
 assert.ok(hi.start<=84&&hi.end>=88);
 assert.ok(lo.start<=21&&lo.end>=33);
 assert.equal(hi.whites.length,21);assert.equal(lo.whites.length,21);
});
check('manual shift locks and clamps safely at piano endpoints',()=>{
 const atTop=movePianoWindow(100,12,21);
 assert.equal(pianoWindow([],'all',60,21,atTop).end,108);
 const atBottom=movePianoWindow(21,-12,21);
 assert.equal(atBottom,21);
});
check('recording fits available width while keeping both extreme notes selectable',()=>{
 const low=autoPianoCaptureRange(21,[21,108],380);
 assert.equal(low.start,21);assert.ok(low.end>=low.start);
 const high=autoPianoCaptureRange(108,[21,108],380);
 assert.equal(high.end,108);
 assert.ok(high.end-high.start+1<=10);
 const full=autoPianoCaptureRange(60,[21,108],4000);
 assert.deepEqual({...full},{start:21,end:108});
});
check('piano view and recording share transport data and do not require new playback',()=>{
 const app=read('src/App.vue');
 assert.ok(app.includes('<PianoFocusView v-if="part.inst===\'Piano\''));
 assert.ok(app.includes(':range-pitches="part.registerPitches"'));
 assert.ok(app.includes(':active-pitches="part.activePitches"'));
 assert.ok(app.includes('@switch-mode="flipPerformanceCard(part.inst)"'));
 assert.ok(app.includes('capturePianoElement'));
 assert.ok(app.includes('new ResizeObserver('));
 assert.ok(app.includes('autoPianoCaptureRange('));
 assert.ok(app.includes('showAllPianoKeys()'));
 assert.ok(app.includes('capturePianoKey($event,pitch)'));
 assert.ok(app.includes('releaseCapturePianoKey($event)'));
});
check('separate hand labels are suggestions, not an assumption about actual hands',()=>{
 const focus=read('src/PianoFocusView.vue');
 assert.ok(focus.includes('Upper staff · right hand suggested'));
 assert.ok(focus.includes('Lower staff · left hand suggested'));
 assert.ok(focus.includes('Two registers'));
 assert.ok(focus.includes('Single keyboard'));
 assert.ok(focus.includes("lockedUpper.value=null"));
 assert.ok(focus.includes('PianoKeyboardStrip'));
});
check('touch key width and manual full-keyboard horizontal scrolling remain',()=>{
 const css=read('src/style.css');
 assert.ok(css.includes('.capture-piano.capture-piano-auto .capture-piano-key'));
 assert.ok(css.includes('.capture-piano-key{flex:0 0 44px}'));
 assert.ok(css.includes('overflow-x:auto'));
 assert.ok(read('src/App.vue').includes('Fit available width'));
 assert.ok(read('src/App.vue').includes('Show all 88 keys (scroll)'));
});
console.log(count+' piano range and focus checks passed');
