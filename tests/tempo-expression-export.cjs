const assert=require('node:assert/strict');
const fs=require('node:fs');
const {DOMParser}=require('@xmldom/xmldom');
const {createDomainLoader}=require('./load-domain.cjs');
class TestZip{constructor(){this.files={};}file(path,content){this.files[path]=content;return this;}async generateAsync(){return {files:this.files};}}
const load=createDomainLoader({imports:{'jszip':{default:TestZip},'@tonejs/midi':{Midi:class Midi{}}}});
const {blankProject,generate,projectInstruments,sectionSpans,resizeSections}=load('src/music.ts');
const {normalizedTempoExpressions,validateTempoExpressions,tempoAutomationPoints,writtenTempoAtBeat,performanceTempoAtBeat,soundingSeconds,duplicateTempoExpressions,moveTempoExpressions}=load('src/tempoExpressions.ts');
const {exportMusicXml,exportMuseScoreMscz,validateMusicXmlDurations}=load('src/io.ts');
const {scoreNoteheadColors}=load('src/scoreNoteheads.ts');
const {duplicateProjectSection}=load('src/sectionDuplication.ts');
const {deleteProjectSection}=load('src/sectionDeletion.ts');
const {insertBlankMeasures,deleteMeasureRange,copyMeasureRange,pasteMeasureRange}=load('src/measureClipboard.ts');
let checked=0;
function test(name,fn){fn();checked++;console.log('PASS '+name);}
async function check(name,fn){await fn();checked++;console.log('PASS '+name);}
function project(){
 const p=blankProject({sections:2,measuresPerSection:[3,4],beats:3,title:'Rubato test',bpm:120});
 p.instruments=projectInstruments(p);
 p.tempoExpressions={
  ritardandos:[{startMeasure:3,endMeasure:5,toPercent:60}],
  fermatas:[{measure:5,instrument:'Voice',stretch:2,waitForCue:true}],
  aTempoMeasures:[6]
 };
 return p;
}
test('score preview identifies individual piano notes and tied heads without changing the download',()=>{
 const p=blankProject({sections:1,measuresPerSection:2,beats:4});
 p.transposeSemitones=2;
 const bass={pitch:48,start:3.5,duration:1.25};
 const middle={pitch:60,start:3.5,duration:0.5};
 const high={pitch:65,start:3.5,duration:0.5};
 const repeat={pitch:65,start:4,duration:0.25};
 const unison={pitch:68,start:5,duration:1};
 const duplicate={...unison};
 const notes=[bass,middle,high,repeat,unison,duplicate];
 const score={Piano:notes};
 const {byNote}=scoreNoteheadColors(notes);
 const plain=exportMusicXml(p,score,{onlyInstrument:'Piano'});
 const preview=exportMusicXml(p,score,{onlyInstrument:'Piano',previewNoteheadColors:byNote});
 const doc=new DOMParser().parseFromString(preview,'application/xml');
 const owners=Array.from(doc.getElementsByTagName('notehead')).map(head=>head.getAttribute('color'));
 assert.ok(owners.filter(color=>color===byNote.get(bass)).length>=2);
 for(const note of [middle,high,repeat])assert.ok(owners.includes(byNote.get(note)));
 for(const note of [unison,duplicate])assert.ok(!owners.includes(byNote.get(note)));
 assert.equal(preview.replace(/<notehead color="#[0-9a-f]{6}">normal<\/notehead>/g,''),plain);
 assert.deepEqual(Array.from(validateMusicXmlDurations(preview,4,1)),[]);
});
test('the first short measure is separate from section A and remains so after resizing',()=>{
 const p=blankProject({sections:2,measuresPerSection:[3,3],beats:3});
 p.bars[0].pickupBeats=1;
 assert.equal(sectionSpans(p)[0].start,1);
 assert.equal(sectionSpans(p)[0].measures,2);
 const resized=resizeSections(p,[2,3]);
 assert.equal(resized.bars.length,6);
 assert.equal(resized.bars[0].pickupBeats,1);
 assert.equal(sectionSpans(deleteProjectSection(p,0))[0].start,1);
 assert.throws(()=>deleteMeasureRange(p,{start:1,end:2}),/complete section/);
});
test('MusicXML writes short pickup voices, keeps surviving pickups tied, and marks section A at measure 1',()=>{
 const p=blankProject({sections:1,measuresPerSection:3,beats:3});
 p.bars[0].pickupBeats=1;
 p.bars[0].chord='D,D,A7';
 const score={Piano:[{pitch:70,start:0,duration:4},{pitch:60,start:2,duration:2},{pitch:46,start:2,duration:1}]};
 const xml=exportMusicXml(p,score,{onlyInstrument:'Piano'});
 assert.equal(validateMusicXmlDurations(xml,3,1,1).length,0);
 const measures=xml.split('<measure ');
 assert.match(measures[1],/^implicit="yes" number="0"/);
 assert.match(measures[1],/<duration>480<\/duration><\/backup>/);
 assert.match(measures[1],/<kind text="7">dominant<\/kind>/);
 assert.doesNotMatch(measures[1],/<rehearsal/);
 assert.match(measures[2],/^implicit="no" number="1"/);
 assert.match(measures[2],/<rehearsal[^>]*>A<\/rehearsal>/);
 assert.match(measures[1],/<tie type="start"/);
 assert.match(measures[2],/<tie type="stop"/);
});
test('ritardando slows progressively, holds speed, and a tempo restores original BPM',()=>{
 const p=project();
 const t=normalizedTempoExpressions(p);
 assert.equal(t.fermatas.length,1);
 assert.equal(writtenTempoAtBeat(p,3*3),120);
 assert.ok(writtenTempoAtBeat(p,4*3)<120);
 assert.ok(Math.abs(writtenTempoAtBeat(p,6*3-1)-72)<1e-4);
 assert.ok(Math.abs(writtenTempoAtBeat(p,6*3-0.1)-72)<1e-4);
 assert.equal(writtenTempoAtBeat(p,6*3),120);
 assert.equal(performanceTempoAtBeat(p,6*3-1),36);
 const marks=tempoAutomationPoints(p,true);
 assert.ok(marks.find(x=>x.label==='rit.'&&x.beat===9));
 assert.ok(marks.find(x=>x.label==='a tempo'&&x.beat===18));
 assert.ok(marks.every(x=>x.bpm>=36&&x.bpm<=120));
 assert.ok(marks.some(x=>x.beat===17&&x.bpm===36),'Fermata playback stretch is exported as a hidden tempo change');
 assert.ok(marks.some(x=>x.beat===18&&x.bpm===120),'A tempo restores timing after the hold');
 assert.ok(soundingSeconds(p,16,2)>2*60/120);
});
test('cue marks validate instrument and overlap while serializing unchanged',()=>{
 const p=project();
 assert.deepEqual(JSON.parse(JSON.stringify(p)).tempoExpressions,p.tempoExpressions);
 assert.throws(()=>validateTempoExpressions(p,{...p.tempoExpressions,fermatas:[{...p.tempoExpressions.fermatas[0],instrument:'Unknown'}]}),/instrument/);
 assert.throws(()=>validateTempoExpressions(p,{...p.tempoExpressions,ritardandos:[{startMeasure:3,endMeasure:5,toPercent:65},{startMeasure:5,endMeasure:6,toPercent:50}]}),/overlap/);
});
test('duplicate/insert/delete preserve timing marks in musical position',()=>{
 const p=project(),dup=duplicateProjectSection(p,1).project;
 assert.equal(dup.bars.length,11);
 assert.ok(dup.tempoExpressions.fermatas.some(f=>f.measure===9));
 assert.ok(dup.tempoExpressions.ritardandos.some(r=>r.startMeasure===7&&r.endMeasure===9));
 const ins=insertBlankMeasures(p,3,2);
 assert.equal(ins.tempoExpressions.fermatas[0].measure,7);
 assert.equal(ins.tempoExpressions.ritardandos[0].startMeasure,5);
 assert.equal(ins.tempoExpressions.aTempoMeasures[0],8);
 const del=deleteMeasureRange(ins,{start:3,end:4});
 assert.equal(del.tempoExpressions.fermatas[0].measure,5);
 assert.equal(del.tempoExpressions.ritardandos[0].startMeasure,3);
 const sectionGone=deleteProjectSection(p,1);
 assert.equal(sectionGone.tempoExpressions.fermatas.length,0);
 assert.equal(sectionGone.tempoExpressions.ritardandos.length,0);
});
test('copy/paste of every instrument setting carries complete tempo and fermata marks',()=>{
 const p=project(),score=generate(p);
 const options={chords:false,melody:false,notes:false,lyrics:false,settings:true};
 const clip=copyMeasureRange(p,score,{start:3,end:6},projectInstruments(p),options);
 assert.equal(clip.tempoExpressions.ritardandos.length,1);
 const next=pasteMeasureRange(p,score,clip,7,'insert',options);
 assert.equal(next.bars.length,11);
 assert.ok(next.tempoExpressions.ritardandos.some(r=>r.startMeasure===7&&r.endMeasure===9));
 assert.ok(next.tempoExpressions.fermatas.some(f=>f.measure===9));
 assert.ok(next.tempoExpressions.aTempoMeasures.includes(10));
});
function xmlParts(xml){
 const doc=new DOMParser().parseFromString(xml,'application/xml');
 const parts=Array.from(doc.getElementsByTagName('part'));
 return parts.map(part=>Array.from(part.getElementsByTagName('measure')).map(m=>m));
}
test('MusicXML exposes rit./a tempo, discrete tempo, attached fermata and colla voce',()=>{
 const p=project(),score=generate(p);
 const xml=exportMusicXml(p,score);
 assert.match(xml,/<words>rit\.<\/words>/);
 assert.match(xml,/<words>a tempo<\/words>/);
 assert.match(xml,/<sound tempo="36"/);
 assert.match(xml,/<sound tempo="120"/);
 assert.match(xml,/<fermata type="upright"\/>/);
 assert.match(xml,/colla voce · wait for cue/);
 assert.deepEqual(Array.from(validateMusicXmlDurations(xml,p.beats,projectInstruments(p).length)),[]);
 const parts=xmlParts(xml);
 const voiceIndex=projectInstruments(p).indexOf('Voice');
 assert.ok(parts[voiceIndex][5].toString().includes('<fermata'),'fermata belongs to Voice measure 6');
 for(const [i,part] of parts.entries())if(i!==voiceIndex)assert.ok(!part[5].toString().includes('<fermata'),'fermata must not bleed into another part');
});
test('legato directions follow passages across barlines and respect rests and staccato',()=>{
 const p=blankProject({sections:1,measuresPerSection:4,beats:3});
 const voice=[
  {pitch:67,start:0,duration:1.5,articulation:'legato'},
  {pitch:69,start:1.5,duration:1.5,articulation:'legato'},
  {pitch:71,start:3,duration:1,articulation:'legato'},
  {pitch:72,start:4,duration:1,articulation:'staccato'},
  {pitch:74,start:4,duration:1,articulation:'legato'},
  {pitch:69,start:5,duration:1,articulation:'legato'},
  {pitch:67,start:7,duration:1,articulation:'legato'},
 ];
 const xml=exportMusicXml(p,{Voice:voice},{onlyInstrument:'Voice'});
 const measures=xmlParts(xml)[0].map(measure=>measure.toString());
 assert.deepEqual(measures.map(m=>(m.match(/<words>legato<\/words>/g)||[]).length),[1,1,1,0]);
 assert.match(measures[0],/<type>quarter<\/type><dot\/>/);
 assert.doesNotMatch(measures[0],/<staccato\/>/);
 assert.match(measures[1],/<staccato\/>[\s\S]*<words>legato<\/words>/);
 assert.doesNotMatch(measures[1],/<words>legato<\/words>[\s\S]*<staccato\/>/);
 assert.equal(validateMusicXmlDurations(xml,3,1).length,0);
});
test('independent piano staves can carry different articulations at the same beat',()=>{
 const p=blankProject({sections:1,measuresPerSection:2,beats:3});
 const notes=[
  {pitch:45,start:0,duration:3,articulation:'legato'},
  {pitch:48,start:3,duration:3,articulation:'legato'},
  {pitch:72,start:0,duration:1,articulation:'staccato'},
 ];
 const xml=exportMusicXml(p,{Piano:notes},{onlyInstrument:'Piano'});
 assert.equal((xml.match(/<words>legato<\/words>/g)||[]).length,1);
 assert.match(xml,/<words>legato<\/words><\/direction-type><staff>2<\/staff>/);
 assert.match(xml,/<staff>1<\/staff><notations><articulations><staccato\/>/);
 assert.equal(validateMusicXmlDurations(xml,3,1).length,0);
});
test('Pequeña closing vocal passage shows one legato direction across 19 measures',()=>{
 const p=JSON.parse(fs.readFileSync('src/presets/pequena-2.json','utf8'));
 const notes=p.generatedScore.Voice.filter(n=>n.start>=440);
 const xml=exportMusicXml(p,{Voice:notes},{onlyInstrument:'Voice',engravingPreview:true});
 assert.equal((xml.match(/<words>legato<\/words>/g)||[]).length,1);
 assert.match(xml,/<dot\/>/);
});
test('score engraving keeps written tempo markings and omits automation text',()=>{
 const p=project(),score=generate(p);
 const xml=exportMusicXml(p,score,{onlyInstrument:'Voice',engravingPreview:true});
 assert.equal((xml.match(/<words>rit\.<\/words>/g)||[]).length,1);
 assert.match(xml,/<words>a tempo<\/words>/);
 assert.match(xml,/<fermata type="upright"\/>/);
 assert.doesNotMatch(xml,/<words>tempo<\/words>/);
 assert.match(exportMusicXml(p,score),/<words>tempo<\/words>/);
});
function notesInNativeScore(mscx,beats){
 const doc=new DOMParser().parseFromString(mscx,'application/xml');
 const score=doc.getElementsByTagName('Score').item(0);
 const result=new Map();
 const duration={whole:1920,half:960,quarter:480,eighth:240,'16th':120,'32nd':60};
 const direct=(node,tag)=>Array.from(node.childNodes).filter(ch=>ch.nodeType===1&&ch.nodeName===tag);
 const text=(node,tag)=>direct(node,tag)[0]?.textContent??'';
 for(const staff of direct(score,'Staff')){
  const staffId=staff.getAttribute('id');
  const notes=[];
  direct(staff,'Measure').forEach((measure,bar)=>{
   direct(measure,'voice').forEach((voice,voiceIndex)=>{
    let cursor=bar*beats*480;
    for(const event of Array.from(voice.childNodes).filter(x=>x.nodeType===1)){
     if(event.nodeName!=='Chord'&&event.nodeName!=='Rest')continue;
     const ticks=duration[text(event,'durationType')];
     assert.ok(ticks,'valid native duration');
     if(event.nodeName==='Chord')for(const note of direct(event,'Note')){
      const pitch=Number(text(note,'pitch'));
      const spans=direct(note,'Spanner').filter(x=>x.getAttribute('type')==='Tie');
      notes.push({staffId,voiceIndex,bar,beat:cursor,pitch,ticks,spans:spans.map(sp=>{
       const side=direct(sp,'next').length?'next':'prev';
       const raw=direct(sp,side)[0]?.getElementsByTagName('fractions').item(0)?.textContent;
       assert.ok(raw,'tie endpoint has fraction');
       const [a,b]=raw.split('/').map(Number);
       return {side,to:cursor+Math.round(a*4*480/b)};
      })});
     }
     cursor+=ticks;
    }
   });
  });
  result.set(staffId,notes);
 }
 return result;
}
(async()=>{
 await check('native MuseScore writes a short opening measure with rebased chord ticks',async()=>{
  const p=blankProject({sections:1,measuresPerSection:3,beats:3});
  p.bars[0].pickupBeats=1;
  p.bars[0].chord='D,D,A7';
  p.bars[1].chord='G';
  const result=await exportMuseScoreMscz(p,{Piano:[{pitch:60,start:2,duration:2}]},'Piano');
  const xml=result.files['score.mscx'];
  assert.match(xml,/<Measure len="1\/4">/);
  assert.match(xml,/<tick>0<\/tick><StaffText><text>A7<\/text>/);
  assert.match(xml,/<tick>480<\/tick><StaffText><text>G<\/text>/);
 });
 await check('native MSCX uses readable rit and a tempo labels, tempo values and real fermata',async()=>{
  const p=project(),score=generate(p);
  const mscx=(await exportMuseScoreMscz(p,score)).files['score.mscx'];
  assert.match(mscx,/<StaffText><text>rit\.<\/text><\/StaffText>/);
  assert.match(mscx,/<StaffText><text>a tempo<\/text><\/StaffText>/);
  assert.match(mscx,/<Articulation><subtype>fermata<\/subtype><\/Articulation>/);
  assert.match(mscx,/colla voce · wait for cue/);
  assert.ok((mscx.match(/<Tempo>/g)||[]).length>2);
  const single=(await exportMuseScoreMscz(p,score,'Voice')).files['score.mscx'];
  assert.match(single,/<Articulation><subtype>fermata<\/subtype><\/Articulation>/);
  assert.match(single,/<Tempo>/);
 });
 await check('native ties end at same pitch, in same staff and same voice, with correct backward distances',async()=>{
  const p=blankProject({sections:1,measuresPerSection:4,beats:3});
  const score=generate(p);
  score['Violin I']=[{pitch:72,start:0.5,duration:2.75},{pitch:75,start:3.25,duration:3.5},{pitch:72,start:7,duration:1}];
  score['Bandoneon I']=[{pitch:60,start:0.5,duration:2.75},{pitch:63,start:3.25,duration:3.5}];
  score.Piano=[{pitch:64,start:0,duration:2.5},{pitch:67,start:0.5,duration:1.5},{pitch:65,start:3.25,duration:3.5},{pitch:53,start:0,duration:3}];
  const mscx=(await exportMuseScoreMscz(p,score)).files['score.mscx'];
  const staves=notesInNativeScore(mscx,p.beats);
  let starts=0,stops=0;
  for(const [staffId,notes] of staves)for(const note of notes)for(const span of note.spans){
   assert.ok(notes.some(target=>target.voiceIndex===note.voiceIndex&&target.pitch===note.pitch&&target.beat===span.to),
     'Tie '+span.side+' from '+note.pitch+' on staff '+staffId+' must point to identical pitch and voice at tick '+span.to);
   if(span.side==='next')starts++;else stops++;
  }
  assert.ok(starts>0);
  assert.equal(starts,stops);
 });
 await check('built-in song copies retain their uploaded rosters, editions and expressive ending',async()=>{
  const loadPreset=name=>JSON.parse(fs.readFileSync('src/presets/'+name+'.json','utf8'));
  const pequena=loadPreset('pequena-2');
  const melodia=loadPreset('la-melodia-de-nuestros-adios');
  assert.equal(pequena.bars.length,165);
  assert.equal(pequena.tempoExpressions.fermatas[0].measure,164);
  assert.equal(pequena.tempoExpressions.fermatas[0].waitForCue,true);
  assert.ok(pequena.partEditions['Bandoneon I'].advanced);
  assert.equal(melodia.bars.length,94);
  assert.ok(projectInstruments(melodia).includes('Trumpet'));
  assert.ok(melodia.partEditions.Voice.intermediate);
  for(const p of [pequena,melodia]){
   const xml=exportMusicXml(p,p.generatedScore,{onlyInstrument:'Voice'});
   assert.equal(validateMusicXmlDurations(xml,p.beats,1).length,0);
  }
 });
 await check('Pequeña full native MuseScore score has no ties to different staves, voices or pitches',async()=>{
  const p=JSON.parse(fs.readFileSync('tests/fixtures/pequena-2-original.json','utf8'));
  const mscx=(await exportMuseScoreMscz(p,p.generatedScore)).files['score.mscx'];
  const staves=notesInNativeScore(mscx,p.beats);
  let starts=0,stops=0;
  for(const [staffId,notes] of staves)for(const note of notes)for(const span of note.spans){
   assert.ok(notes.some(target=>target.voiceIndex===note.voiceIndex&&target.pitch===note.pitch&&target.beat===span.to),
    'Pequeña tie '+span.side+' from '+note.pitch+' on staff '+staffId+' to tick '+span.to+' has no matching note in same voice');
   if(span.side==='next')starts++;else stops++;
  }
  assert.ok(starts>0,'Pequeña should contain genuine sustained notes and native ties');
  assert.equal(starts,stops);
 });
 await check('unison rearticulation does not invent an extra MusicXML tie',async()=>{
  const p=blankProject({sections:1,measuresPerSection:2,beats:3});
  const score=generate(p);score['Violin I']=[{pitch:72,start:0,duration:1.5},{pitch:72,start:1,duration:0.5}];
  const xml=exportMusicXml(p,score,{onlyInstrument:'Violin I'});
  assert.doesNotMatch(xml,/<tie type="start"/);
 });
 await check('MusicXML has balanced same-part ties over barlines and breaks at a repeated pitch attack',async()=>{
  const p=blankProject({sections:1,measuresPerSection:3,beats:3});
  const score=generate(p);
  score['Violin I']=[{pitch:72,start:2,duration:2}];
  const joined=exportMusicXml(p,score,{onlyInstrument:'Violin I'});
  assert.equal((joined.match(/<tie type="start"\/>/g)||[]).length,1);
  assert.equal((joined.match(/<tie type="stop"\/>/g)||[]).length,1);
  assert.deepEqual(Array.from(validateMusicXmlDurations(joined,3,1)),[]);
  score['Violin I'].push({pitch:72,start:3,duration:1});
  const reattacked=exportMusicXml(p,score,{onlyInstrument:'Violin I'});
  assert.doesNotMatch(reattacked,/<tie type="start"\/>/,'A note reattacked at the barline must not connect to its predecessor');
  assert.doesNotMatch(reattacked,/<tie type="stop"\/>/,'A fresh note at the barline must not inherit a tie');
 });
 const app=fs.readFileSync('src/App.vue','utf8');
 test('user can edit timing and resume a singer cue without ending transport',()=>{
  for(const key of ['expressive-timing-editor','addRitardando','setFermataCue','continueAfterSingerCue','transport.pause(time)','tempoAutomationPoints(project.value)','soundingSeconds(project.value'])assert.ok(app.includes(key),key);
 });
 console.log(checked+' expressive tempo, fermata and tie export checks passed');
})().catch(err=>{console.error(err);process.exitCode=1;});
