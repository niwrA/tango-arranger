const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createDomainLoader}=require('./load-domain.cjs');
const load=createDomainLoader();
const {blankProject,sectionSpans}=load('src/music.ts');
const {moveLeadSectionStart}=load('src/leadSectionBoundary.ts');
const {readableLeadSheet,parseLeadLyrics}=load('src/leadLyrics.ts');
const app=fs.readFileSync('src/App.vue','utf8');
let checked=0;
function check(name,fn){fn();checked++;console.log('PASS '+name);}
check('moving section start retains absolute measures, chords and protected edits',()=>{
 const p=blankProject({sections:3,measuresPerSection:[4,4,4]});
 p.bars[4].chord='Gm';p.protectedBars={'Voice:4':true};
 p.generatedScore={Voice:[{pitch:62,start:16,duration:1,lyric:'hello'}]};
 const next=moveLeadSectionStart(p,1,6);
 assert.deepEqual(sectionSpans(next).map(s=>s.measures),[6,2,4]);
 assert.equal(next.bars[4].chord,'Gm');
 assert.equal(next.protectedBars['Voice:4'],true);
 assert.deepEqual(next.generatedScore.Voice,p.generatedScore.Voice);
 assert.deepEqual(sectionSpans(p).map(s=>s.measures),[4,4,4]);
});
check('section boundaries cannot collapse an adjacent section',()=>{
 const p=blankProject({sections:2,measuresPerSection:[4,4]});
 assert.throws(()=>moveLeadSectionStart(p,1,0),/at least one/);
 assert.throws(()=>moveLeadSectionStart(p,1,8),/at least one/);
 assert.strictEqual(moveLeadSectionStart(p,1,4),p);
});
check('readable leadsheet collapses instrumental measures but retains lyrics',()=>{
 const text=readableLeadSheet('[D] ||\n[Em] ||\n[Verse 1]\n[D]Donde el río se queda\n[B7]y la luna se va');
 assert.ok(text.includes('[Instrumental · 2 measures]'));
 assert.ok(text.includes('D  |  Em'));
 assert.ok(text.includes('[Verse 1]'));
 assert.ok(text.includes('Donde el río se queda'));
 assert.ok(!text.includes('||'));
});
check('timed source prints as chord-over-lyric rows without beat markers',()=>{
 const text=readableLeadSheet('@1 [D] ||\n@1 [Em] ||\n@1 [D] @3.5 Don-de ||\n@1 [A7] @1 el @2 río ||');
 assert.ok(text.includes('[Instrumental · 2 measures]'));
 assert.match(text,/Don-de.*\|.*el río/);
 assert.doesNotMatch(text,/@\d/);
});
check('section headings are not parsed as chord changes',()=>{
 const plan=parseLeadLyrics('[Verse 1]\n[D]Donde el río\n[Chorus]\n[A7]mi canción',4);
 assert.deepEqual(plan.chords.map(c=>c.chord),['D','A7']);
 assert.equal(plan.notes.length,5);
});
check('leadsheet view exposes print, text export and editable section start',()=>{
 assert.ok(app.includes('leadDisplayMode'));
 assert.ok(app.includes('printReadableLeadSheet'));
 assert.ok(app.includes('exportReadableLeadSheet'));
 assert.ok(app.includes('editLeadSectionStart'));
 assert.ok(app.includes('lead-section-start-control'));
});
console.log(checked+' printable leadsheet and section boundary tests passed');
