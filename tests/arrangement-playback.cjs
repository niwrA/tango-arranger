const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const cp=require('node:child_process');
let ts;try{ts=require('typescript')}catch{ts=require(path.join(cp.execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim(),'typescript'));}
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'src/arrangementPlayback.ts'),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const mod={exports:{}};vm.runInNewContext(`(function(module,exports){${code}\n})`,{})(mod,mod.exports);
const {arrangementPlaybackWindow:window,arrangementEventTime:eventTime}=mod.exports;
let checks=0;function test(name,fn){fn();console.log('PASS',name);checks++;}
test('start at beginning schedules complete song',()=>{const w=window(80,4,120,0);assert.equal(w.startBeat,0);assert.equal(w.durationSeconds,160);assert.equal(eventTime(0,w),0);assert.equal(eventTime(6,w),3);});
test('selected measure starts at zero transport seconds',()=>{const w=window(80,4,120,10);assert.equal(w.startBeat,40);assert.equal(eventTime(40,w),0);assert.equal(eventTime(42,w),1);assert.equal(w.durationSeconds,140);});
test('notes earlier than selected measure are skipped',()=>{const w=window(8,4,120,4);assert.equal(eventTime(15.99,w),null);assert.equal(eventTime(0,w),null);assert.equal(eventTime(16,w),0);});
test('last measure plays only its remaining duration',()=>{const w=window(80,3,90,79);assert.equal(w.startBeat,237);assert.ok(Math.abs(w.durationSeconds-2)<1e-9);});
test('selected measure clamps safely to song bounds',()=>{assert.equal(window(4,4,120,-7).startMeasure,0);assert.equal(window(4,4,120,999).startMeasure,3);});
test('invalid song geometry and tempo are rejected',()=>{assert.throws(()=>window(0,4,120,0));assert.throws(()=>window(4,0,120,0));assert.throws(()=>window(4,4,0,0));});
const app=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
test('transport has two explicit start buttons and separate stop',()=>{assert.match(app,/@click="play\('beginning'\)"/);assert.match(app,/@click="play\('selected'\)"/);assert.match(app,/@click="stopPlayback"/);});
test('selected measure is the shared song map/editor selection',()=>{assert.match(app,/const startMeasure=origin==='selected'\?selectedBar.value:0/);assert.match(app,/selectedBar.value=i;overviewFocus.value=i/);});
test('playback offsets all notes and excludes earlier attacks',()=>{assert.match(app,/const seconds=arrangementEventTime\(n.start,window\)/);assert.match(app,/if\(seconds===null\)continue/);assert.match(app,/transport.schedule\(time=>/);});
test('transport stops after remaining measures, not entire song',()=>{assert.match(app,/window.durationSeconds\+0.2/);assert.match(app,/transport.position=0/);});
test('switching play buttons restarts playback instead of toggling stop',()=>{const fn=app.match(/async function play\(origin:PlaybackOrigin\)\{[\s\S]*?\n\}/)?.[0];assert.ok(fn);assert.match(fn,/stopPlayback\(\)/);assert.doesNotMatch(fn,/if\(playing.value\)/);});
console.log(`${checks} arrangement playback checks passed`);
