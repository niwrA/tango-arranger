const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module');
const root=path.resolve(__dirname,'..'),fromRepo=createRequire(path.join(root,'package.json')),ts=fromRepo('typescript');
function createLoader(){
 const cache=new Map();
 function load(file){
  const absolute=path.resolve(root,file);
  if(cache.has(absolute))return cache.get(absolute).exports;
  if(absolute.endsWith('.json'))return JSON.parse(fs.readFileSync(absolute,'utf8'));
  const mod={exports:{}};cache.set(absolute,mod);
  const code=ts.transpileModule(fs.readFileSync(absolute,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const req=name=>{
   if(name.startsWith('.')){
    const base=path.resolve(path.dirname(absolute),name);
    const next=[base,base+'.ts',base+'.js',base+'.json'].find(fs.existsSync);
    if(!next)throw Error('Cannot resolve '+name+' from '+absolute);
    return load(next);
   }
   return fromRepo(name);
  };
  vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{filename:absolute})(req,mod,mod.exports);
  return mod.exports;
 }
 return load;
}
const load=createLoader();
const music=load('src/music.ts'),rhythm=load('src/rhythmEditor.ts'),
  snap=load('src/rhythmSnap.ts'),editions=load('src/editions.ts'),io=load('src/io.ts');
let count=0;
function check(name,run){run();count++;console.log('PASS',name);}
const make=()=>{
 const p=music.blankProject({title:'Rhythm snap study',sections:1,measuresPerSection:2,bpm:124,beats:4});
 p.bars.forEach(b=>{b.chord='Dm';b.melody=[{pitch:74,start:0,duration:1},{pitch:76,start:1,duration:1},{pitch:77,start:2,duration:2}];});
 return p;
};
const note=(pitch,start,duration)=>({pitch,start,duration,velocity:80});
check('14 named presets produce valid quantized onsets in 2/4, 3/4 and 4/4',()=>{
 assert.equal(rhythm.RHYTHM_PRESETS.length,14);
 for(const beats of [2,3,4])for(const preset of rhythm.RHYTHM_PRESETS){
  const slots=snap.presetRhythmSlots(preset.id,beats,'Piano','traditional');
  assert.ok(slots.length>0,preset.id);
  assert.ok(slots.every(s=>Math.abs(s.beat*4-Math.round(s.beat*4))<1e-7),preset.id);
  assert.ok(slots.every(s=>s.beat>=0&&s.beat<beats),preset.id);
 }
});
check('nearest attack uses a local tolerance and chooses the earlier beat on a tie',()=>{
 const close=snap.nearestRhythmSlot(.49,'marcato_four',4,'Piano','traditional',.5);
 assert.equal(close.beat,0);
 const tied=snap.nearestRhythmSlot(.5,'marcato_four',4,'Piano','traditional',.5);
 assert.equal(tied.beat,0);
 assert.equal(snap.nearestRhythmSlot(.5,'marcato_four',4,'Piano','traditional',.2),undefined);
});
check('preset snaps only the onset, preserving note pitch, duration and expression',()=>{
 const old={...note(74,1.35,.75),lyric:'tan',gate:.58,gesture:undefined};
 const next=snap.snapNoteToPreset(old,4,'Violin I','traditional','marcato_four');
 assert.equal(next.start,1);assert.equal(next.duration,.75);
 assert.equal(next.pitch,74);assert.equal(next.gate,.58);assert.equal(next.lyric,'tan');
 assert.equal(next.rhythmSource.kind,'preset');
 assert.equal(next.rhythmSource.originalBeat,1.35);
 assert.equal(next.rhythmSource.targetBeat,1);
 assert.equal(snap.rhythmAttachmentLabel(next.rhythmSource),'Marcato en cuatro');
 assert.ok(snap.rhythmAttachmentValid(next,4));
 assert.equal(old.rhythmSource,undefined);
});
check('outside tolerance leaves notes completely untouched and invents no provenance',()=>{
 const n=note(72,1.4,1);
 const free=snap.snapNoteToPreset(n,4,'Contrabass','traditional','marcato_two',.25);
 assert.strictEqual(free,n);
 assert.equal(free.rhythmSource,undefined);
});
check('time or length edits remove provenance, but pitch changes preserve it',()=>{
 const first=snap.snapNoteToPreset(note(75,2.2,1),4,'Violin I','traditional','marcato_four');
 const pitchOnly=snap.clearRhythmSourceIfRetimed(first,{...first,pitch:76},4);
 assert.equal(pitchOnly.rhythmSource.preset,'marcato_four');
 const moved=snap.clearRhythmSourceIfRetimed(first,{...first,start:2.5},4);
 assert.equal(moved.rhythmSource,undefined);
 const resized=snap.clearRhythmSourceIfRetimed(first,{...first,duration:.75},4);
 assert.equal(resized.rhythmSource,undefined);
 assert.equal(snap.rhythmAttachmentValid({...first,start:1.5},4),false);
});
check('rhythm-editor retiming marks preset source and preserves polyphonic chord onsets',()=>{
 const original=[note(48,0,1),note(72,0,1),note(76,0,1),note(48,2,1),note(74,2,1)];
 const slots=rhythm.rhythmSlots('marcato_two',4,'Piano');
 const treble=rhythm.rhythmSlots('marcato_two',4,'Bandoneon I');
 const result=rhythm.retimeMeasure(original,'Piano',0,4,slots,'rhythm',60,treble,'marcato_two');
 assert.ok(result.length>0);
 assert.ok(result.every(n=>n.rhythmSource?.preset==='marcato_two'));
 assert.ok(result.every(n=>snap.rhythmAttachmentValid(n,4)));
 assert.ok(result.some(n=>n.pitch<60)&&result.some(n=>n.pitch>=60));
 assert.ok(result.some(n=>n.pitch===72)&&result.some(n=>n.pitch===76));
});
check('edited rhythm grids are labeled honestly, not as the source preset',()=>{
 const result=rhythm.retimeMeasure([note(72,0,1),note(76,1,1)],'Violin I',0,4,
  [{beat:.5,duration:.5,accent:false},{beat:2,duration:1,accent:true}],'rhythm');
 assert.equal(result[0].rhythmSource.kind,'edited-grid');
 assert.equal(result[0].rhythmSource.preset,undefined);
 assert.equal(snap.rhythmAttachmentLabel(result[0].rhythmSource),'Edited rhythm pattern');
 assert.ok(result.every(n=>snap.rhythmAttachmentValid(n,4)));
});
check('accent-only changes do not claim timing was snapped',()=>{
 const result=rhythm.retimeMeasure([note(60,0,1),note(64,1,1)],'Piano',0,4,
 [{beat:0,duration:1,accent:true},{beat:1,duration:1,accent:false}],'accents');
 assert.deepEqual(result.map(n=>n.start),[0,1]);
 assert.ok(result.every(n=>n.rhythmSource===undefined));
});
check('manual source survives protected note edits, regeneration and JSON backup',()=>{
 let p=make(),score=music.generate(p);
 const snapped=snap.snapNoteToPreset(note(72,.8,1),4,'Violin I',p.profile,'marcato_four');
 p=music.replaceInstrumentMeasure(p,score,'Violin I',0,[snapped]);
 assert.ok(p.protectedBars['Violin I:0']);
 p={...p,generatedScore:music.mergeScores(p,music.generate(p))};
 const restored=JSON.parse(JSON.stringify(editions.snapshotActiveEditions(p)));
 const active=editions.assembleEditionScore(restored)['Violin I'].find(n=>n.start===1&&n.pitch===72);
 assert.ok(active?.rhythmSource);
 assert.ok(snap.rhythmAttachmentValid(active,4));
});
check('difficulty editions keep independent source information',()=>{
 let p=make(),score=music.generate(p);
 p=music.replaceInstrumentMeasure(p,score,'Piano',0,[snap.snapNoteToPreset(note(60,1.12,1),4,'Piano',p.profile,'offbeat')]);
 p=editions.switchInstrumentEdition(p,'Piano','easy');
 assert.ok(p.partEditions.Piano.advanced.notes.some(n=>n.rhythmSource));
 assert.equal(p.generatedScore.Piano.some(n=>n.rhythmSource),false);
 p=editions.switchInstrumentEdition(p,'Piano','advanced');
 assert.ok(editions.assembleEditionScore(p).Piano.some(n=>n.rhythmSource));
});
check('MusicXML duration coverage is unaffected; source is app-local metadata',()=>{
 let p=make();const first=music.generate(p),n=snap.snapNoteToPreset(note(72,.9,1),4,'Violin I',p.profile,'marcato_four');
 p=music.replaceInstrumentMeasure(p,first,'Violin I',0,[n]);
 const xml=io.exportMusicXml(p,editions.assembleEditionScore(p));
 assert.equal(io.validateMusicXmlDurations(xml,4,music.projectInstruments(p).length).length,0);
 assert.ok(!xml.includes('rhythmSource'));
});
check('Auto resolves only one unambiguous pattern from committed measure attachments',()=>{
 const named=snap.snapNoteToPreset(note(72,.9,1),4,'Violin I','traditional','marcato_four');
 const next={...named,pitch:77,start:4+named.start,rhythmSource:{...named.rhythmSource,preset:'marcato_two'}};
 const edited={...named,rhythmSource:{...named.rhythmSource,kind:'edited-grid',preset:undefined}};
 const mixed={...named,rhythmSource:{...named.rhythmSource,preset:'marcato_two'}};
 assert.equal(snap.committedNamedRhythmPreset([named,next],4,0),'marcato_four');
 assert.equal(snap.committedNamedRhythmPreset([named,next],4,1),'marcato_two');
 assert.equal(snap.committedNamedRhythmPreset([named,next],4,2),'off');
 assert.equal(snap.committedNamedRhythmPreset([named,mixed],4,0),'off');
 assert.equal(snap.committedNamedRhythmPreset([named,edited],4,0),'off');
 assert.equal(snap.committedNamedRhythmPreset([{...named,duration:2}],4,0),'off');
});
check('Vue source contains cues in both modes and accessible contextual map shortcuts',()=>{
 const app=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
 const required=[
  'note-rhythm-snap-bar','note-bar-rhythm','performance-rhythm-mark',
  'snapSelectedNoteNow','releaseSelectedRhythmSource',
  'instrument-context-dialog','openInstrumentContext(inst,$event)',
  'beginInstrumentHeaderHold(inst)','handleInstrumentContextKey(inst,$event)',
  'handleMapContextKey(inst,i,$event)','handleNoteBarContextKey($event,pitch','openRhythmFromMap(overviewInstrument)',
  '@contextmenu.prevent.stop','<Teleport to="body">','aria-modal="true"'
 ];
 for(const term of required)assert.ok(app.includes(term),'Missing UI integration: '+term);
 assert.match(app,/executeMusicalEdit\([^\n]+,'timing','geometry'\)/);
 const commands=fs.readFileSync(path.join(root,'src/musicalEdit.ts'),'utf8');
 assert.match(commands,/clearRhythmSourceIfRetimed\(original,n,beats\)/);
});
console.log(count+' rhythm and contextual-menu checks passed');
