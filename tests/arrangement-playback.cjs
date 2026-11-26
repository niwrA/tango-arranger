const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..');
const {arrangementPlaybackWindow:window,arrangementEventTime:eventTime,arrangementCountInEnd:countInEnd}=
 require('./load-domain.cjs').createDomainLoader()('src/arrangementPlayback.ts');
let checks=0;function test(name,fn){fn();console.log('PASS',name);checks++;}
test('start at beginning schedules complete song',()=>{const w=window(80,4,120,0);assert.equal(w.startBeat,0);assert.equal(w.durationSeconds,160);assert.equal(eventTime(0,w),0);assert.equal(eventTime(6,w),3);});
test('a whole count-in precedes the shortened pickup and section A starts on its own downbeat',()=>{
 const w=window(8,3,120,0,1,true);
 assert.equal(w.countInBeats,3);
 assert.equal(w.startBeat,2);
 assert.equal(w.startBeat-w.transportStartBeat,3);
 assert.equal(eventTime(1,w),null);
 assert.equal(eventTime(2,w),0);
 assert.equal(eventTime(3,w),.5);
 assert.equal(window(8,3,120,1,1,true).startBeat,3);
 assert.equal(window(8,3,120,0,1).transportStartBeat,2);
});
test('count-in continues through pickup rests up to the first written attack',()=>{
 const pickup=window(8,4,120,0,2,true);
 assert.equal(countInEnd(pickup,4,2),4);
 assert.equal(countInEnd(pickup,4,3),5);
 assert.equal(countInEnd(pickup,4,3.5),5.5);
 assert.equal(countInEnd(pickup,4,4),4);
 assert.equal(countInEnd(pickup,4,Infinity),4);
 assert.equal(countInEnd(window(8,4,120,0,0,true),4,1),4);
 assert.equal(countInEnd(window(8,4,120,1,2,true),4,5),4);
 assert.equal(countInEnd(window(8,4,120,0,2,false),4,3.5),0);
});
test('selected measure starts at zero transport seconds',()=>{const w=window(80,4,120,10);assert.equal(w.startBeat,40);assert.equal(eventTime(40,w),0);assert.equal(eventTime(42,w),1);assert.equal(w.durationSeconds,140);});
test('notes earlier than selected measure are skipped',()=>{const w=window(8,4,120,4);assert.equal(eventTime(15.99,w),null);assert.equal(eventTime(0,w),null);assert.equal(eventTime(16,w),0);});
test('last measure plays only its remaining duration',()=>{const w=window(80,3,90,79);assert.equal(w.startBeat,237);assert.ok(Math.abs(w.durationSeconds-2)<1e-9);});
test('selected measure clamps safely to song bounds',()=>{assert.equal(window(4,4,120,-7).startMeasure,0);assert.equal(window(4,4,120,999).startMeasure,3);});
test('invalid song geometry and tempo are rejected',()=>{assert.throws(()=>window(0,4,120,0));assert.throws(()=>window(4,0,120,0));assert.throws(()=>window(4,4,0,0));});
const app=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
test('transport has two explicit start buttons and separate stop',()=>{assert.match(app,/@click="play\('beginning'\)"/);assert.match(app,/@click="play\('selected'\)"/);assert.match(app,/@click="stopPlayback"/);});
test('selected measure is the shared song map/editor selection',()=>{assert.match(app,/const startMeasure=origin==='selected'\?selectedBar.value:0/);assert.match(app,/selectedBar.value=i;overviewFocus.value=i/);});
test('playback offsets all notes and excludes earlier attacks',()=>{assert.match(app,/const seconds=arrangementEventTime\(n.start,window\)/);assert.match(app,/if\(seconds===null\)continue/);assert.match(app,/transport.schedule\(time=>/);});
test('transport stops after remaining measures, not entire song',()=>{assert.match(app,/project.value.bars.length\*project.value.beats-transportStartBeat\+0.25/);assert.match(app,/transport.position=0/);});
test('switching play buttons restarts playback instead of toggling stop',()=>{const fn=app.match(/async function play\(origin:PlaybackOrigin[^)]*\)\{[\s\S]*?\n\}/)?.[0];assert.ok(fn);assert.match(fn,/stopPlayback\(\)/);assert.doesNotMatch(fn,/if\(playing.value\)/);});
console.log(`${checks} arrangement playback checks passed`);
