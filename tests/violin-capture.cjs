const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {createDomainLoader}=require('./load-domain.cjs');
const decide=createDomainLoader()('src/violinCapture.ts').classifyViolinCapture;
const root=path.resolve(__dirname,'..'),app=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
const xml=fs.readFileSync(path.join(root,'src/io.ts'),'utf8'),notes=fs.readFileSync(path.join(root,'src/music.ts'),'utf8');
const sample=(pitches,xs)=>pitches.map((pitch,i)=>({pitch,x:xs[i],t:i*90}));
let count=0;function check(label,fn){fn();console.log('PASS '+label);count++;}
check('short held note remains ordinary without expression',()=>assert.equal(decide(sample([69,69],[50,51])).kind,'note'));
check('same-string slide records starting and ending pitches',()=>{
 const d=decide(sample([69,71,72,74],[40,55,70,86]));
 assert.equal(d.kind,'slide');assert.equal(d.startPitch,69);assert.equal(d.endPitch,74);
});
check('back-and-forth small fingertip motion registers vibrato without extra notes',()=>{
 const d=decide(sample([69,69,69,69,69,69,69],[40,59,41,60,39,58,40]));
 assert.equal(d.kind,'vibrato');assert.equal(d.endPitch,69);
});
check('large returning pitch contour is marked sirena and records its peak',()=>{
 const d=decide(sample([69,71,74,72,69],[40,55,70,55,40]));
 assert.equal(d.kind,'sirena');assert.equal(d.peakPitch,74);
});
check('small tremor or short gestures do not become vibrato',()=>{
 assert.equal(decide(sample([69,69,69,69,69,69],[40,41,40,41,40,41])).kind,'note');
 assert.equal(decide(sample([69,69,69],[40,60,40])).kind,'note');
});
check('explicit capture modes are predictable',()=>{
 assert.equal(decide(sample([69,74],[40,70]),'notes').kind,'note');
 assert.equal(decide(sample([69],[40]),'vibrato').kind,'vibrato');
 assert.equal(decide(sample([69],[40]),'slide').kind,'note');
});
check('invalid traces do not silently generate notation',()=>assert.throws(()=>decide([{pitch:128,x:0,t:0}]),/Invalid/));
check('editor supports held multi-touch, violin drag, auto-fit and draft expression',()=>{
 for(const f of ['captureViolinFingerMove','captureViolinTraces','classifyViolinCapture','captureHeldDisplay','@pointermove.prevent.stop="captureViolinFingerMove($event)"',
  'captureAutoFit.value','applyCapturedMelody','approachSlideFrom','vibrato'])
  assert.ok(app.includes(f),'missing '+f);
 assert.ok(app.includes('heldCaptureKeys.set(id,{pitch,started})'));
 assert.ok(app.includes("releaseCaptureMonitorPitch(held.pitch)"));
});
check('MusicXML and MuseScore retain slide-into-end-note and vibrato annotations',()=>{
 assert.ok(notes.includes('approachSlideFrom?:number'));
 assert.ok(notes.includes('vibrato?:boolean'));
 assert.ok(xml.includes('approachSlideFrom:n.approachSlideFrom'));
 assert.ok(xml.includes('vibrato:n.vibrato'));
 assert.ok(xml.includes('port. from '));
 assert.ok(xml.includes('vibrato'));
});
check('recorded violin expression persists, transposes and exports with final written pitch',()=>{
 const load=createDomainLoader();
 const music=load('src/music.ts'),io=load('src/io.ts');
 const project=music.demoProject(),score=music.generate(project);
 const note={pitch:72,start:0,duration:1,technique:'arco',articulation:'legato',source:'manual',approachSlideFrom:69,vibrato:true};
 const next=music.replaceInstrumentMeasure(project,score,'Violin I',0,[note]);
 const stored=next.generatedScore['Violin I'].find(n=>n.start===0&&n.pitch===72);
 assert.equal(stored.approachSlideFrom,69);
 assert.equal(stored.vibrato,true);
 const moved=music.transposeScore({'Violin I':[note]},2)['Violin I'][0];
 assert.equal(moved.pitch,74);assert.equal(moved.approachSlideFrom,71);assert.equal(moved.vibrato,true);
 assert.throws(()=>music.replaceInstrumentMeasure(project,score,'Violin I',0,[{...note,technique:'pizzicato'}]),/Violin approach slide/);
 const xml=io.exportMusicXml(next,next.generatedScore);
 assert.ok(xml.includes('port. from A4 to C5'),'MusicXML must identify both the source and final pitch');
 assert.ok(xml.includes('<words>vibrato</words>'),'Vibrato must survive MusicXML export');
 assert.ok(xml.includes('<step>C</step>'),'Final written pitch is C, not the approach note');
});
check('string identity survives capture, draft, and note application',()=>{
 for(const token of ['held.stringMidi=stringMidi','stringMidi?:number','stringMidi:t.stringMidi','stringMidi:held.stringMidi','note.stringMidi=t.stringMidi'])
  assert.ok(app.includes(token),'missing string identity path: '+token);
 assert.ok(app.includes('captureViolinFingerDown($event,string.midi+fret,string.midi)'));
});
check('expanded recording surface and focus monitoring are wired',()=>{
 for(const token of ['captureLargeView','capture-large-instrument','focusMonitorMode','focusInstrumentAudible(inst)','setFocusMonitorMode(\'solo\')','setFocusMonitorMode(\'mute\')'])
  assert.ok(app.includes(token),'missing '+token);
 assert.ok(app.includes("if(!focusInstrumentAudible(inst))return;"));
});
console.log(count+' violin capture, multitouch, and notation checks passed');
