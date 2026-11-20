const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {createDomainLoader}=require('./load-domain.cjs');
const {parseLeadLyrics,positionLeadChords,lyricLineStarts,exportLeadLyricsTab}=createDomainLoader()('src/leadLyrics.ts');
const root=path.resolve(__dirname,'..');
const app=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
const karaoke=fs.readFileSync(path.join(root,'src/PerformanceLyricLine.vue'),'utf8');
let checks=0;
function check(name,run){run();checks++;console.log('PASS '+name);}

check('song source preserves lyric line breaks and explicit measure boundaries',()=>{
 const plan=parseLeadLyrics('[Am]Yo | no ||\n[E7]sé',[4][0]);
 assert.deepEqual(plan.lines,['[Am]Yo | no ||','[E7]sé']);
 assert.deepEqual(plan.notes.map(n=>[n.text,n.start,n.line]),[['Yo',0,0],['no',1,0],['sé',4,1]]);
 assert.deepEqual(plan.chords.map(c=>[c.chord,c.start]),[['Am',0],['E7',4]]);
});
check('existing melody positions anchor harmony and karaoke lines',()=>{
 const plan=parseLeadLyrics('[Am]Yo | no ||\n[E7]sé',4);
 const positions=[0,1.5,4.5];
 assert.deepEqual(lyricLineStarts(plan,positions),[0,4.5]);
 const chords=positionLeadChords(plan,4,8,positions);
 assert.deepEqual(chords.map(c=>[c.measure,c.beat,c.chord,c.snapped]),[[0,0,'Am',false],[1,1,'E7',true]]);
});
check('chord markers at invalid positions or with invalid names are rejected',()=>{
 assert.throws(()=>positionLeadChords(parseLeadLyrics('[H7]la',4),4,4),/Invalid chord marker/);
 assert.throws(()=>positionLeadChords(parseLeadLyrics('|| || [Dm]la',4),4,2),/beyond the song/);
});
check('text export retains original line breaks with chords above lyrics',()=>{
 const text=exportLeadLyricsTab('[Am]Yo no\n[E7]sé por qué');
 assert.ok(text.includes('Am\nYo no'));
 assert.ok(text.includes('E7\nsé por qué'));
});
check('lead sheet applies anchored chords to the existing measure harmony',()=>{
 assert.ok(app.includes('positionLeadChords(plan,project.value.beats,project.value.bars.length,written.map(n=>n.start))'));
 assert.ok(app.includes('chordSequenceFromBeats('));
 assert.ok(app.includes('leadToken'));
 assert.ok(app.includes('const oldGenerated=all.filter('));
 assert.ok(app.includes('source:leadLyricsSource.value'));
});
check('karaoke receives original line boundaries without changing note timings',()=>{
 assert.equal((app.match(/:line-starts="performanceVocalCue.lineStarts"/g)||[]).length,2);
 assert.ok(karaoke.includes('lineStarts?:number[]'));
 assert.ok(karaoke.includes('const lyricRows=computed('));
 assert.ok(karaoke.includes('class="stage-lyric-row"'));
});
console.log(checks+' lead sheet and lyric source tests passed');
