const assert=require('node:assert/strict');
const {createDomainLoader}=require('./load-domain.cjs');
const load=createDomainLoader();
const {parseLeadLyrics,leadLyricsFromSong,positionLeadChords,exportLeadLyricsTab}=load('src/leadLyrics.ts');
const {blankProject}=load('src/music.ts');
let checks=0;
function check(name,fn){fn();checks++;console.log('PASS '+name);}
check('natural lyrics do not require beat markers or measure delimiters',()=>{
 const plan=parseLeadLyrics('[D]Donde el río se queda\n[B7]y la luna se va',4);
 assert.deepEqual(plan.notes.map(n=>n.text),['Donde','el','río','se','queda','y','la','luna','se','va']);
 assert.equal(plan.lines.length,2);
 assert.deepEqual(plan.chords.map(c=>c.chord),['D','B7']);
 assert.equal(plan.notes[5].line,1);
});
check('explicit separators are optional and bar markers advance the measure',()=>{
 const plan=parseLeadLyrics('[D]Donde | el río | se queda ||\n[B7]y la luna se va',4);
 assert.equal(plan.notes[0].start,0);
 assert.equal(plan.notes[5].start,8);
 assert.equal(plan.chords[1].start,8);
});
check('existing Voice note positions place chords without requiring @ markers',()=>{
 const plan=parseLeadLyrics('[D]Donde el río\n[B7]se queda',4);
 const chords=positionLeadChords(plan,4,8,[0,1,2,4,5]);
 assert.deepEqual(chords.map(c=>[c.measure,c.beat,c.chord]),[[0,0,'D'],[1,0,'B7']]);
});
check('read-back prefers readable words and only marks instrumental measures',()=>{
 const p=blankProject({measures:4,sections:1,beats:4});
 p.bars[0].chord='D';p.bars[1].chord='B7';p.bars[2].chord='Em';p.bars[3].chord='A7';
 const score={Voice:[{pitch:60,start:0,duration:1,lyric:'Donde'},{pitch:62,start:1,duration:1,lyric:'el'},{pitch:64,start:4,duration:1,lyric:'río'}]};
 const text=leadLyricsFromSong(p,score,'Voice',1);
 assert.ok(text.includes('[D]Donde el'));
 assert.ok(text.includes('[B7]río'));
 assert.ok(text.includes('[Em] ||'));
 assert.ok(!text.includes('@1'));
 assert.equal(parseLeadLyrics(text,4).lines.length,4);
});
check('plain chord-over-lyrics export retains line breaks',()=>{
 const text=exportLeadLyricsTab('[D]Donde el río\n[B7]y la luna');
 assert.ok(text.includes('Donde el río\n'));
 assert.ok(text.includes('y la luna'));
});
console.log(checks+' natural leadsheet import tests passed');
