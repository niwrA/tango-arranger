const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {createDomainLoader}=require('./load-domain.cjs');
const model=createDomainLoader()('src/performanceLyrics.ts');
const root=path.resolve(__dirname,'..');
const app=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
const component=fs.readFileSync(path.join(root,'src/PerformanceLyricLine.vue'),'utf8');
let checks=0;function check(name,fn){fn();checks++;console.log('PASS '+name);}
const notes=Array.from({length:16},(_,i)=>({start:i,duration:.9,lyric:'word'+i}));
check('default karaoke keeps exactly two full measures stable across every beat',()=>{
 const before=Array.from({length:8},(_,i)=>model.performanceLyricPage(notes,i+.5,4,4,800,120));
 for(const page of before){
   assert.equal(page.startMeasure,0);
   assert.equal(page.endMeasure,2);
   assert.deepEqual(Array.from(page.tokens,x=>x.text),notes.slice(0,8).map(n=>n.lyric));
 }
 assert.equal(before[0].tokens.filter(n=>n.active).length,1);
 assert.equal(before[6].tokens.filter(n=>n.active)[0].text,'word6');
 const next=model.performanceLyricPage(notes,8,4,4,800,120);
 assert.equal(next.startMeasure,2);
 assert.equal(next.endMeasure,4);
 assert.equal(next.tokens[0].text,'word8');
});
check('space and speed can change measures per page without changing it mid-measure',()=>{
 assert.equal(model.lyricMeasureSpan(notes,4,800,120),2);
 const dense=Array.from({length:24},(_,i)=>({start:i/3,duration:1/3,lyric:'extra-long-syllable-'+i}));
 assert.equal(model.lyricMeasureSpan(dense,4,390,100),1);
 const sparse=Array.from({length:5},(_,i)=>({start:i*4,duration:1,lyric:'hey'}));
 assert.equal(model.lyricMeasureSpan(sparse,8,1200,155),3);
 assert.equal(model.lyricMeasureSpan(sparse,8,1200,100),2);
 assert.equal(model.performanceLyricPage(sparse,7.7,4,8,1200,155).startMeasure,0);
});
check('a crossing-bar vocal note is held visible when the new measure page begins',()=>{
 const score=[{start:7.4,duration:1.2,lyric:'held'},{start:8.7,duration:.6,lyric:'after'}];
 const page=model.performanceLyricPage(score,8.1,4,4,800,120);
 assert.equal(page.startMeasure,2);
 assert.deepEqual(Array.from(page.tokens,x=>x.text),['held','after']);
 assert.equal(page.tokens[0].active,true);
 assert.equal(model.performanceLyricPage(score,8.9,4,4,800,120).tokens[1].active,true);
});
check('blank measures and non-lyric notes do not insert moving placeholders',()=>{
 const score=[{start:0,duration:1,lyric:'sing'},{start:2,duration:1},{start:12,duration:1,lyric2:'verse two'}];
 const first=model.performanceLyricPage(score,0,4,4);
 assert.deepEqual(Array.from(first.tokens,x=>x.text),['sing']);
 const second=model.performanceLyricPage(score,9,4,4);
 assert.deepEqual(Array.from(second.tokens,x=>x.text),['verse two']);
});
check('both ensemble and notes stages use one shared component, not sliding lyric windows',()=>{
 assert.equal((app.match(/<PerformanceLyricLine /g)||[]).length,2);
 assert.ok(app.includes("performanceView==='ensemble' && performanceVocalCue"));
 assert.ok(app.includes(':notes="performanceVocalCue.notes"'));
 assert.ok(app.includes('class="performance-lyrics-overlay"'));
 assert.ok(!app.includes('performanceLyricWindow'));
 assert.ok(!app.includes('performanceVocalCue.words'));
 assert.ok(app.includes(':effective-bpm="effectivePlaybackBpm"'));
});
check('lyric color is unified and changing highlight does not change token width',()=>{
 assert.ok(component.includes('background:linear-gradient(145deg,#243750,#172337 75%)'));
 assert.ok(component.includes('background:rgba(37,99,235,.83)'));
 assert.ok(component.includes('.stage-lyric-token{display:inline-block;padding:1px 6px;border:1px solid transparent'));
 assert.ok(component.includes('opacity:1;font-weight:650'));
 assert.ok(component.includes('aria-live="off"'));
 assert.ok(component.includes('ResizeObserver'));
 assert.ok(component.includes('prefers-reduced-motion:reduce'));
 const old=app.slice(app.indexOf('<div v-if="performanceView===\'notes\'" class="performance-roll-panel"'));
 assert.ok(old.includes('<PerformanceLyricLine :overlay="true"'));
});
console.log(checks+' stable karaoke lyric tests passed');
