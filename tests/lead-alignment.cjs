const assert=require('node:assert/strict');
const {createDomainLoader}=require('./load-domain.cjs');
const load=createDomainLoader();
const {blankProject}=load('src/music.ts');
const {createLeadAlignment,moveAlignmentChord,alignmentBars,importAlignmentChords,serializeVisualAlignment,applyAlignmentVoice,moveAlignmentSyllable}=load('src/leadAlignment.ts');
const {parseLeadLyrics,readableLeadSheet}=load('src/leadLyrics.ts');
const make=(chords,beats=4)=>{const p=blankProject({beats,measures:chords.length}); return {...p,bars:p.bars.map((bar,i)=>({...bar,chord:chords[i]}))};};
const lyric=(start,text,syllabic='single')=>({id:start,start,text,syllabic,line:0,anchor:true});
const note=(start,extra={})=>({pitch:62,start,duration:.5,velocity:99,source:'imported',...extra});
{
 const p=make(['Dm','','A7',' C , C ']);
 const stale='@1 [G7] @1 ~single:la || @1 [F] || @1 [C]';
 const d=createLeadAlignment(p,stale,[],2,false);
 assert.deepEqual(d.chords.map(c=>c.symbol),['Dm','A7','C']);
 assert.ok(alignmentBars(d,p).every((b,i)=>b===p.bars[i]));
 const changed=moveAlignmentChord(d,d.chords[1].id,9);
 // Music for the silent preceding bar cannot be invented to fill a beat.
 assert.throws(()=>alignmentBars(changed,p),/silent measure/);
 const moved=moveAlignmentChord(d,d.chords[1].id,4);
 assert.deepEqual(alignmentBars(moved,p).map(b=>b.chord),['Dm','A7','',' C , C ']);
 const optIn=importAlignmentChords(d,p,stale);
 assert.deepEqual(alignmentBars(optIn,p).map(b=>b.chord),['G7','F','C',' C , C ']);
 assert.throws(()=>moveAlignmentChord(d,d.chords[1].id,0),/already a chord/);
 console.log('PASS unchanged shared harmony and intentional silence, explicit timeline moves and opt-in chord import');
}
{
 const p=make(['Dm','A7']);
 const d=createLeadAlignment(p,'',[],1,false);
 d.syllables=[lyric(3.5,'Pe','begin'),lyric(4,'que','middle'),{...lyric(4.5,'ña','end'),melisma:true}];
 const source=serializeVisualAlignment(d);
 assert.deepEqual(parseLeadLyrics(source,4).notes.map(n=>n.start),[3.5,4,4.5]);
 assert.deepEqual(parseLeadLyrics(source,4).chords.map(n=>n.start),[0,4]);
 assert.match(readableLeadSheet(source),/Pequeña/);
 assert.doesNotMatch(readableLeadSheet(source),/ña_/);
 assert.deepEqual(parseLeadLyrics('one two three four five || six',4).notes.map(n=>n.start),[0,1,2,3,4,8]);
 d.syllables=[lyric(4,'A | B_')];
 assert.equal(parseLeadLyrics(serializeVisualAlignment(d),4).notes[0].text,'A | B_');
 const example=load('src/presets/pequena-2.json');
 const sung=example.generatedScore.Voice.filter(n=>n.start>=299&&n.start<=300)
  .map(n=>({...lyric(n.start,n.lyric,n.syllabic),melisma:n.melisma}));
 const songSource=serializeVisualAlignment({beats:3,syllables:sung,chords:[]});
 assert.deepEqual(parseLeadLyrics(songSource,3).notes.map(n=>n.start),[299,299.5,300]);
 assert.equal(readableLeadSheet(songSource),'pequeña');
 console.log('PASS exact visual serialization across 4/4 and Pequeña’s 3/4 barline; legacy source and readable export');
}
{
 const p=make(['Dm','','A7']);
 const all=[note(0,{lyric:'one',lyric2:'uno',duration:1.25}),note(1,{lyric2:'dos',pitch:65}),note(8,{lyric:'end',lyric2:'fin',pitch:71})];
 const d=createLeadAlignment(p,'',all,1,true);
 const current={Voice:all};
 assert.equal(applyAlignmentVoice(p,current,'Voice',d,1),p);
 const edited=moveAlignmentSyllable(d,d.syllables[0].id,1,all);
 const result=applyAlignmentVoice(p,current,'Voice',edited,1);
 assert.deepEqual(result.generatedScore.Voice.map(n=>[n.start,n.pitch,n.duration,n.lyric,n.lyric2,n.source]),[
  [0,62,1.25,undefined,'uno','imported'],[1,65,.5,'one','dos','imported'],[8,71,.5,'end','fin','imported']
 ]);
 const partial=createLeadAlignment(p,'@2 ~single:replacement',all,1,true);
 const merged=applyAlignmentVoice(p,current,'Voice',partial,1,true);
 assert.deepEqual(merged.generatedScore.Voice.map(n=>n.lyric),['one','replacement','end']);
 assert.equal(p.generatedScore,undefined);
 assert.deepEqual(Object.keys(result.protectedBars),['Voice:0']);
 const overlap=createLeadAlignment(p,'@1 ~single:other',all,1,false);
 assert.throws(()=>applyAlignmentVoice(p,current,'Voice',overlap,1),/overlap/);
 const shared={Voice:[note(0,{leadToken:'lead:1:0',lyric:'one',lyric2:'uno'})]};
 const moveShared=createLeadAlignment(p,'@2 ~single:one',shared.Voice,1,false);
 assert.throws(()=>applyAlignmentVoice(p,shared,'Voice',moveShared,1),/shared by both verses/);
 assert.equal(shared.Voice[0].lyric2,'uno');
 assert.equal(all[0].lyric,'one');
 const invalid=createLeadAlignment(p,'@1.5 ~single:other',all,1,true);
 assert.throws(()=>applyAlignmentVoice(p,current,'Voice',invalid,1),/different vocal onset/);
 console.log('PASS atomic written-Voice edits preserve the other verse, pitches, durations, source, and untouched measures');
}
