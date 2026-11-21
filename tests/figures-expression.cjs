const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const cp=require('node:child_process');
let ts;try{ts=require('typescript')}catch{ts=require(path.join(cp.execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim(),'typescript'));}
const root=path.resolve(__dirname,'..');
function load(file,imports={}){
  const source=fs.readFileSync(path.join(root,file),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const mod={exports:{}};
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`,{console},{filename:file})((name)=>{
    if(Object.prototype.hasOwnProperty.call(imports,name))return imports[name];
    throw Error('Unexpected import '+name);
  },mod,mod.exports);
  return mod.exports;
}
const music=load('src/music.ts');
const loop=load('src/measureLoop.ts',{'./music':music});
let count=0;
function test(name,fn){fn();count++;console.log('PASS',name);}
const p=music.blankProject({sections:2,measuresPerSection:[2,2]});
p.bars[0].chord='Dm,A7';p.bars[1].chord='G7';p.bars[2].chord='C';
p.roles.A.Piano='chords';
test('six deterministic figure kinds supported',()=>{
  assert.equal(music.FIGURE_KINDS.length,6);
  for(const kind of music.FIGURE_KINDS)assert.ok(music.figureMeasure(p,'Piano',0,kind,0).length);
});
test('rising notes follow active chord and ascend',()=>{
  const notes=music.figureMeasure(p,'Violin II',0,'notes_up',0);
  assert.equal(notes.length,4);
  for(let i=1;i<notes.length;i++)assert.ok(notes[i].pitch>notes[i-1].pitch);
  for(const n of notes)assert.ok(music.chordTones(music.chordAt(p.bars[0].chord,p.beats,n.start)).includes(n.pitch%12));
});
test('descending notes use chord tones and descend',()=>{
  const notes=music.figureMeasure(p,'Violin II',0,'notes_down',0);
  assert.equal(notes.length,4);
  for(let i=1;i<notes.length;i++)assert.ok(notes[i].pitch<notes[i-1].pitch);
});
test('piano inversion figures have separate bass and treble notes',()=>{
  const notes=music.figureMeasure(p,'Piano',0,'chords_up',0);
  assert.ok(notes.filter(n=>n.pitch<60).length>=2);
  assert.ok(notes.filter(n=>n.pitch>=60).length>=8);
});
test('variation changes pitches without changing harmony',()=>{
  const a=music.figureMeasure(p,'Piano',0,'chords_up',0);
  const b=music.figureMeasure(p,'Piano',0,'chords_up',1);
  assert.notEqual(JSON.stringify(a.map(n=>n.pitch)),JSON.stringify(b.map(n=>n.pitch)));
});
test('section piano figure used in generated score',()=>{
  p.pianoFigures={A:'notes_up'};
  const a=music.generate(p).Piano.filter(n=>n.start<4);
  assert.equal(a.length,6); // four treble notes plus two monophonic bass pulses
  assert.equal(a.filter(n=>n.pitch<60).length,2);
  p.pianoFigures={A:'chords_up'};
  const b=music.generate(p).Piano.filter(n=>n.start<4);
  assert.ok(b.length>a.length);
});
test('countermelody and response honor lead timing',()=>{
  p.bars[0].melody=[{pitch:74,start:0,duration:1},{pitch:76,start:1,duration:1}];
  const response=music.figureMeasure(p,'Violin I',0,'melody_response',0);
  assert.ok(response.every(n=>n.start>=2));
  assert.ok(music.figureMeasure(p,'Violin I',0,'countermelody',0).length>=2);
});
test('manual figure protects only selected measure',()=>{
  const score=music.generate(p),events=music.figureMeasure(p,'Piano',0,'notes_down',1);
  const next=music.replaceInstrumentMeasure(p,score,'Piano',0,events);
  assert.equal(next.protectedBars['Piano:0'],true);
  assert.equal(next.protectedBars['Piano:1'],undefined);
  assert.equal(music.mergeScores(next,music.generate(next)).Piano.filter(n=>n.start<4).length,events.length);
});
test('slides and note swells survive manual editing, and reject unsupported piano',()=>{
  const n={pitch:72,start:0,duration:1,slideTo:76,swellTo:105};
  const score=music.generate(p);
  const next=music.replaceInstrumentMeasure(p,score,'Violin I',0,[n]);
  assert.equal(next.importedScore['Violin I'][0].slideTo,76);
  assert.equal(next.importedScore['Violin I'][0].swellTo,105);
  assert.throws(()=>music.replaceInstrumentMeasure(p,score,'Piano',0,[n]),/Slide unsupported/);
  assert.throws(()=>music.replaceInstrumentMeasure(p,score,'Violin I',0,[{...n,technique:'pizzicato'}]),/Slide unsupported/);
});
test('expression range affects velocity progressively over multiple measures',()=>{
  const ranges=[{instrument:'Violin I',startMeasure:0,endMeasure:2,from:45,to:115}];
  const events=loop.measureLoopEvents([{pitch:70,start:0,duration:1,velocity:80},{pitch:71,start:4,duration:1,velocity:80},{pitch:72,start:8,duration:1,velocity:80}],2,4,120,0,ranges,'Violin I');
  assert.ok(events[0].velocity>80);
  assert.ok(events[0].endVelocity>=events[0].velocity);
  assert.equal(loop.measureLoopEvents([{pitch:70,start:8,duration:1,velocity:80}],2,4,120,0,ranges,'Violin II')[0].velocity,80);
});
test('loop exports slide target and note swell without changing note duration',()=>{
  const events=loop.measureLoopEvents([{pitch:70,start:0,duration:1,slideTo:73,swellTo:110,velocity:70}],0,4,120,2);
  assert.equal(events[0].slideTo,75);
  assert.equal(events[0].endVelocity,110);
  assert.equal(events[0].durationSeconds,0.45);
});
test('MusicXML exports hairpin range, gliss text and note swell without invalid durations',()=>{
  const io=load('src/io.ts',{'./tempoExpressions':load('src/tempoExpressions.ts'),'./music':music,'jszip':class JSZip{},'@tonejs/midi':{Midi:class Midi{}}});
  const example=music.blankProject({sections:1,measuresPerSection:2});
  example.bars[0].chord='Dm';example.bars[1].chord='G7';
  example.expressionRanges=[{instrument:'Violin I',startMeasure:0,endMeasure:1,from:55,to:112}];
  const score=music.generate(example);
  score['Violin I']=[{pitch:74,start:0,duration:1,slideTo:79,swellTo:110,velocity:72}];
  const xml=io.exportMusicXml(example,score);
  assert.match(xml,/gliss\. to G5/);
  assert.match(xml,/cresc\. to velocity 110/);
  assert.match(xml,/<wedge number="2" type="crescendo"/);
  assert.match(xml,/<wedge number="2" type="stop"/);
  assert.deepEqual(Array.from(io.validateMusicXmlDurations(xml,4)),[]);
});
test('section resizing preserves figure settings and clears stale expression ranges',()=>{
  const example=music.blankProject({sections:2,measuresPerSection:[2,2]});
  example.pianoFigures={A:'chords_down',B:'melody_response'};
  example.expressionRanges=[{instrument:'Piano',startMeasure:0,endMeasure:2,from:45,to:105}];
  const next=music.resizeSections(example,[3,2]);
  assert.equal(next.pianoFigures.A,'chords_down');
  assert.equal(next.pianoFigures.B,'melody_response');
  assert.equal(next.expressionRanges.length,0);
});
test('partial-measure crescendo affects only selected beat interval',()=>{
  const range=[{instrument:'Violin I',startMeasure:0,endMeasure:0,startBeat:1.5,endBeat:3,from:40,to:110}];
  const notes=[{pitch:70,start:0,duration:0.5,velocity:80},{pitch:71,start:2,duration:0.5,velocity:80},{pitch:72,start:3.5,duration:0.5,velocity:80}];
  const events=loop.measureLoopEvents(notes,0,4,120,0,range,'Violin I');
  assert.equal(events[0].velocity,80);
  assert.ok(events[1].velocity<80);
  assert.equal(events[2].velocity,80);
});
test('MusicXML hairpin offsets can begin and end inside one measure',()=>{
  const io=load('src/io.ts',{'./tempoExpressions':load('src/tempoExpressions.ts'),'./music':music,'jszip':class JSZip{},'@tonejs/midi':{Midi:class Midi{}}});
  const example=music.blankProject({sections:1,measuresPerSection:1});example.bars[0].chord='Dm';
  example.expressionRanges=[{instrument:'Violin II',startMeasure:0,endMeasure:0,startBeat:1,endBeat:3,from:50,to:105}];
  const xml=io.exportMusicXml(example,music.generate(example));
  assert.match(xml,/<wedge number="2" type="crescendo" spread="0"\/><\/direction-type><offset>480<\/offset>/);
  assert.match(xml,/<wedge number="2" type="stop"\/><\/direction-type><offset>-480<\/offset>/);
  assert.deepEqual(Array.from(io.validateMusicXmlDurations(xml,4)),[]);
});
test('UI exposes figure variations, expressive gestures and wide layout',()=>{
  const app=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
  const css=fs.readFileSync(path.join(root,'src/style.css'),'utf8');
  assert.match(app,/Another variation/);
  assert.match(app,/Slide to pitch/);
  assert.match(app,/Swell to velocity/);
  assert.match(app,/Expression across measures/);
  assert.match(app,/Piano accompaniment figure/);
  assert.match(css,/\.layout\{width:100%;max-width:none/);
});
console.log(`${count} figure/expression checks passed`);
