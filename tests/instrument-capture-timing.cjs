const assert=require('node:assert/strict');
const {createDomainLoader}=require('./load-domain.cjs');
const {quantizeInstrumentCapture:quantize}=createDomainLoader()('src/instrumentCaptureTiming.ts');
const settings=(onset=0.25,duration=0.25,extra={})=>({
 beatsPerMeasure:4,firstBar:5,lastBar:6,loop:false,
 onsetGrid:()=>onset,durationGrid:()=>duration,...extra
});
const event=(startBeat,durationBeats,pitch=60,extra={})=>({startBeat,durationBeats,pitch,...extra});
let count=0;
function check(label,fn){fn();count++;console.log('PASS '+label);}
check('start and held duration use independent grids',()=>{
 const notes=quantize([event(0.36,0.7)],settings(0.5,0.25));
 assert.deepEqual(notes,[{bar:5,beat:0.5,pitch:60,duration:0.75}]);
 assert.equal(quantize([event(0.36,0.7)],settings(0.25,0.5))[0].duration,0.5);
});
check('a raw duration is measured from the original attack, not its snapped start',()=>{
 assert.deepEqual(quantize([event(0.36,0.7)],settings(0.5,0)),[
  {bar:5,beat:0.5,pitch:60,duration:0.7}
 ]);
 assert.deepEqual(quantize([event(0.36,0.7)],settings(0,0.5)),[
  {bar:5,beat:0.36,pitch:60,duration:0.5}
 ]);
});
check('raw capture preserves short holds without adding a minimum note length',()=>{
 assert.deepEqual(quantize([event(1.037,0.019)],settings(0,0)),[
  {bar:5,beat:1.037,pitch:60,duration:0.019}
 ]);
 assert.equal(quantize([event(1.037,0.019)],settings(0,0.25))[0].duration,0.25);
});
check('simultaneous piano notes and overlapping different pitches remain polyphonic',()=>{
 const notes=quantize([event(0.36,2.12,60),event(0.36,1.22,64),event(1.07,2.43,67)],settings());
 assert.deepEqual(notes,[
  {bar:5,beat:0.25,pitch:60,duration:2},
  {bar:5,beat:0.25,pitch:64,duration:1.25},
  {bar:5,beat:1,pitch:67,duration:2.5}
 ]);
});
check('holds split at measure boundaries with string identity on every segment',()=>{
 const notes=quantize([event(3.6,1.2,74,{stringMidi:69,approachSlideFrom:69,vibrato:true})],settings());
 assert.deepEqual(notes,[
  {bar:5,beat:3.5,pitch:74,duration:0.5,stringMidi:69,approachSlideFrom:69,vibrato:true},
  {bar:6,beat:0,pitch:74,duration:0.75,stringMidi:69}
 ]);
});
check('gesture contours are copied and only annotate the initial segment',()=>{
 const gesture={kind:'sirena',contour:'rise_fall',points:[{at:0,pitch:69},{at:0.5,pitch:74},{at:1,pitch:69}]};
 const notes=quantize([event(3.75,1,69,{gesture})],settings());
 assert.deepEqual(notes[0].gesture,gesture);assert.equal(notes[1].gesture,undefined);
 notes[0].gesture.points[1].pitch=77;
 assert.equal(gesture.points[1].pitch,74);
});
check('a late final attack is clamped within the last measure in one-shot capture',()=>{
 const notes=quantize([event(7.94,0.8)],settings());
 assert.deepEqual(notes,[{bar:6,beat:3.75,pitch:60,duration:0.25}]);
 assert.equal(quantize([event(7.9,2)],settings(0,0))[0].duration,0.1);
 assert.deepEqual(quantize([event(8,1)],settings()),[]);
});
check('looping capture wraps starts and splits a sustained note across the range edge',()=>{
 assert.deepEqual(quantize([event(7.94,0.8)],settings(0.25,0.25,{loop:true})),[
  {bar:5,beat:0,pitch:60,duration:0.75}
 ]);
 assert.deepEqual(quantize([event(7.75,0.75)],settings(0.25,0.25,{loop:true})),[
  {bar:5,beat:0,pitch:60,duration:0.5},
  {bar:6,beat:3.75,pitch:60,duration:0.25}
 ]);
});
check('long looping holds are bounded to one written pass',()=>{
 const notes=quantize([event(8.5,100)],settings(0,0,{loop:true}));
 assert.equal(notes.reduce((sum,n)=>sum+n.duration,0),8);
 assert.ok(notes.every(n=>n.bar>=5&&n.bar<=6&&n.beat+n.duration<=4));
});
check('three-beat measures and measure-specific grids retain correct bar positions',()=>{
 const requested=[];
 const notes=quantize([event(2.68,1),event(3.37,0.6,62)],settings(0,0,{
  beatsPerMeasure:3,firstBar:2,lastBar:3,
  onsetGrid:bar=>{requested.push(bar);return bar===2?0.5:0.25;},durationGrid:()=>0
 }));
 assert.deepEqual(requested,[2,3]);
 assert.deepEqual(notes,[
  {bar:2,beat:2.5,pitch:60,duration:0.5},
  {bar:3,beat:0,pitch:60,duration:0.5},
  {bar:3,beat:0.25,pitch:62,duration:0.6}
 ]);
});
check('inferred tap lengths preserve rests, later attacks and simultaneous chords',()=>{
 const notes=quantize([event(0.1,undefined,60),event(0.1,undefined,64),event(0.6,undefined,67),event(3.8,undefined,72)],settings(0.25,1));
 assert.deepEqual(notes,[
  {bar:5,beat:0,pitch:60,duration:0.5,provisional:true},
  {bar:5,beat:0,pitch:64,duration:0.5,provisional:true},
  {bar:5,beat:0.5,pitch:67,duration:1,provisional:true},
  {bar:5,beat:3.75,pitch:72,duration:0.25,provisional:true}
 ]);
});
check('only identical pitch and snapped onset replace an earlier captured event',()=>{
 const notes=quantize([event(0.1,0.2),event(0.11,0.8),event(0.11,0.3,64)],settings());
 assert.deepEqual(notes,[{bar:5,beat:0,pitch:60,duration:0.75},{bar:5,beat:0,pitch:64,duration:0.25}]);
});
check('coarse then raw processing restores the original timing without mutating the source',()=>{
 const events=[event(0.36,0.7),event(2.41,0.93,67)];
 const saved=structuredClone(events);
 const raw=quantize(events,settings(0,0));
 quantize(events,settings(1,1));
 assert.deepEqual(quantize(events,settings(0,0)),raw);
 assert.deepEqual(events,saved);
});
check('invalid timing cannot create invalid notes or an unbounded split loop',()=>{
 assert.deepEqual(quantize([
  event(-1,1),event(NaN,1),event(Infinity,1),event(0,Infinity),event(0,-1),event(0,0),event(0,1,128)
 ],settings()),[]);
 assert.throws(()=>quantize([event(0,1)],settings(NaN)),/grid/);
 assert.throws(()=>quantize([event(0,1)],settings(0,-1)),/grid/);
 assert.throws(()=>quantize([],settings(0,0,{beatsPerMeasure:0})),/range/);
});
console.log(`${count} instrument capture timing checks passed`);
