const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {createDomainLoader}=require('./load-domain.cjs');
const load=createDomainLoader();
const music=load('src/music.ts');
const rhythm=load('src/rhythmEditor.ts');
const mine=load('src/customRhythms.ts');
const compare=load('src/rhythmPreview.ts');
let passed=0;
function check(name,fn){fn();passed++;console.log('PASS '+name);}
function storage(){
 const values=new Map();
 return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),values};
}
const edited=[{beat:0,duration:.5,accent:true},{beat:1.5,duration:.75,accent:false},{beat:3.25,duration:.75,accent:true}];
check('named rhythm is stored separately from songs and returned on a fresh read',()=>{
 const mem=storage();const saved=mine.saveCustomRhythm('My syncopa',4,edited,mem);
 assert.equal(saved.length,1);assert.equal(saved[0].name,'My syncopa');
 assert.ok(saved[0].id.startsWith('custom-rhythm-'));
 assert.deepEqual(mine.listCustomRhythms(mem).map(r=>r.slots),[edited]);
 assert.ok(mem.values.has(mine.CUSTOM_RHYTHM_STORAGE_KEY));
});
check('saving the same name updates only that meter and retains the id',()=>{
 const mem=storage(),first=mine.saveCustomRhythm('My syncopa',4,edited,mem)[0];
 const editedAgain=[{beat:.5,duration:1,accent:true}];
 const next=mine.saveCustomRhythm(' my SYNCOPA ',4,editedAgain,mem);
 assert.equal(next.length,1);assert.equal(next[0].id,first.id);
 assert.deepEqual(next[0].slots,editedAgain);
});
check('saved custom rhythms are meter-specific and survive across songs',()=>{
 const mem=storage();
 mine.saveCustomRhythm('Cadence',3,[{beat:0,duration:1,accent:true}],mem);
 mine.saveCustomRhythm('Cadence',4,[{beat:0,duration:1,accent:true}],mem);
 assert.deepEqual(mine.listCustomRhythms(mem).map(r=>r.beats),[3,4]);
});
check('deleting a custom rhythm does not mutate the score or other rhythms',()=>{
 const mem=storage(),a=mine.saveCustomRhythm('One',4,edited,mem)[0],b=mine.saveCustomRhythm('Two',4,edited,mem)[1];
 const rest=mine.deleteCustomRhythm(a.id,mem);
 assert.equal(rest.length,1);assert.equal(rest[0].id,b.id);
 assert.throws(()=>mine.deleteCustomRhythm(a.id,mem),/not found/i);
});
check('invalid name, meter, overlaps and empty pattern are rejected',()=>{
 const mem=storage();
 assert.throws(()=>mine.saveCustomRhythm('',4,edited,mem),/name/i);
 assert.throws(()=>mine.saveCustomRhythm('bad',5,edited,mem),/meter/i);
 assert.throws(()=>mine.saveCustomRhythm('bad',4,[],mem),/attack/i);
 assert.throws(()=>mine.saveCustomRhythm('bad',4,[{beat:0,duration:2,accent:true},{beat:1,duration:1,accent:false}],mem),/overlap/i);
});
check('corrupted browser storage yields no imaginary rhythms',()=>{
 const mem=storage();
 mem.setItem(mine.CUSTOM_RHYTHM_STORAGE_KEY,'not json');
 assert.deepEqual(mine.listCustomRhythms(mem),[]);
 mem.setItem(mine.CUSTOM_RHYTHM_STORAGE_KEY,JSON.stringify([{id:'custom-rhythm-1',name:'Nope',beats:4,slots:[{beat:9,duration:1,accent:true}]}]));
 assert.deepEqual(mine.listCustomRhythms(mem),[]);
});
function fixture(){
 const p=music.blankProject({title:'Rhythm preview test',sections:1,measuresPerSection:3,bpm:120,beats:4});
 const score=Object.fromEntries(music.INSTRUMENTS.map(inst=>[inst,[]]));
 score.Piano=[{pitch:48,start:0,duration:1,velocity:80},{pitch:60,start:0,duration:1,velocity:90},
  {pitch:64,start:0,duration:1,velocity:90},{pitch:48,start:2,duration:1,velocity:80},
  {pitch:72,start:4.5,duration:.5,velocity:100},{pitch:74,start:5,duration:1,velocity:80}];
 return {p,score};
}
const slots=[{beat:0,duration:1,accent:true},{beat:2,duration:1,accent:false}];
const signature=notes=>notes.map(n=>[n.pitch,n.start,n.duration,n.accent??false,n.articulation??'']);
check('visual proposed notes use exactly the same retiming as Apply for both piano registers',()=>{
 const {p,score}=fixture(),rows=compare.rhythmPreviewForSelection(p,score,'Piano',[0,1],slots,'rhythm');
 const applied=rhythm.applyRhythmPattern(p,score,{instruments:['Piano'],measures:[0,1],slots,mode:'rhythm'});
 assert.equal(rows.length,2);
 for(const row of rows){
  const notes=applied.project.generatedScore.Piano.filter(n=>Math.floor(n.start/4)===row.bar);
  assert.deepEqual(signature(row.after),signature(notes));
 }
 assert.equal(rows[0].before.length,4);
 assert.equal(rows[0].after.some(n=>n.pitch<60),true);
 assert.equal(rows[0].after.some(n=>n.pitch>=60),true);
});
check('protected and silent measures are unchanged in both score and preview',()=>{
 const {p,score}=fixture();p.protectedBars['Piano:0']=true;
 const rows=compare.rhythmPreviewForSelection(p,score,'Piano',[0,2],slots,'rhythm',false);
 assert.equal(rows[0].status,'protected');
 assert.deepEqual(signature(rows[0].before),signature(rows[0].after));
 assert.equal(rows[1].status,'silent');
 assert.equal(rows[1].after.length,0);
 const overwritten=compare.rhythmPreviewForSelection(p,score,'Piano',[0],slots,'rhythm',true);
 assert.equal(overwritten[0].status,'changed');
});
check('accent-only preview preserves pitch, onset and duration',()=>{
 const {p,score}=fixture();
 const rows=compare.rhythmPreviewForSelection(p,score,'Piano',[1],slots,'accents');
 assert.deepEqual(rows[0].before.map(n=>[n.start,n.duration,n.pitch]),rows[0].after.map(n=>[n.start,n.duration,n.pitch]));
 assert.ok(rows[0].after.some(n=>n.articulation==='marcato_staccato'));
});
check('audio A/B plan preserves rests and concatenates requested measures in order',()=>{
 const {p,score}=fixture();
 const rows=compare.rhythmPreviewForSelection(p,score,'Piano',[1,0],slots,'rhythm');
 const original=compare.rhythmPreviewAudioPlan(rows,p.beats,false);
 const proposed=compare.rhythmPreviewAudioPlan(rows,p.beats,true);
 assert.ok(original.some(n=>n.atBeat===.5));
 assert.ok(original.some(n=>n.atBeat>=4));
 assert.ok(proposed.some(n=>n.atBeat===0));
 assert.ok(proposed.some(n=>n.atBeat>=4));
 assert.ok(proposed.every(n=>n.durationBeats>0));
});
const app=fs.readFileSync(path.join(__dirname,'../src/App.vue'),'utf8');
check('rhythm workflow has one range used by capture, Apply and A/B audio',()=>{
 const part=app.slice(app.indexOf('<section v-else-if="active===\x27rhythm\x27"'),app.indexOf('<section v-else-if="active===\x27notes\x27"'));
 for(const value of ['v-model.number="rhythmStart"','v-model.number="rhythmEnd"',
  'aria-label="Rhythm settings"','optgroup label="My rhythms"','saveNamedRhythm',
  'rhythmPreviewVisible',"auditionRhythmComparison('before')","auditionRhythmComparison('after')",
  'applyRhythmSelection','<LiveCaptureTransport kind="rhythm"'])
  assert.ok(part.includes(value),'Missing rhythm integration '+value);
 assert.ok(!part.includes('v-model.number="captureFrom"'));
 assert.ok(!part.includes('v-model.number="captureTo"'));
 assert.ok(app.includes("active.value==='notes'?noteLoopFrom.value:rhythmStart.value"));
});
check('top bar keeps Performance visible and separates file operations from Import/Export',()=>{
 const header=app.slice(app.indexOf('<header class="app-topbar">'),app.indexOf('</header>'));
 const song=header.slice(header.indexOf('class="topbar-group topbar-song"'),header.indexOf('class="topbar-group topbar-arrange"'));
 const transfers=header.slice(header.indexOf('class="topbar-group topbar-files"'),header.indexOf('class="topbar-compact-actions"'));
 const overflow=header.slice(header.indexOf('class="topbar-menu compact-workspace-menu"'),header.indexOf('class="topbar-group topbar-options"'));
 assert.ok(header.includes('performance-topbar-button'));
 assert.ok(header.includes('song-tempo-edit'));
 assert.ok(header.includes('setSongBpm'));
 for(const x of ['newSongOpen=true','saveNow','duplicateLocalSong','deleteCurrentLocalSong'])assert.ok(song.includes(x),x);
 assert.ok(!song.includes('importDialogOpen=true'),'Import is not a file operation');
 assert.ok(transfers.includes('importDialogOpen=true'),'Import is grouped with export');
 assert.ok(!overflow.includes('duplicateLocalSong'));
 assert.ok(!overflow.includes('saveNow'));
 assert.ok(!overflow.includes('performanceMode=true'));
 assert.ok(header.includes('aria-label="Import and export"'));
 assert.ok(header.includes('topbar-measure-tools'));
});
check('empty note cells scroll vertically while note dragging and rhythm editing remain protected',()=>{
 const start=app.indexOf('/* On touch devices, empty note cells');
 const end=app.indexOf('/* One visible rhythm range',start);
 assert.ok(start>=0&&end>start,'Expected coarse-pointer touch rules');
 const touch=app.slice(start,end);
 const emptyCells=touch.split('.note-continuous-grid .note-grid-cell{')[1]?.split('}')[0]??'';
 const noteBars=touch.split('.note-continuous-grid .note-bar,')[1]?.split('}')[0]??'';
 assert.ok(emptyCells.includes('touch-action:pan-y!important;'),'Empty note cells must scroll vertically');
 assert.ok(noteBars.includes('touch-action:none!important;'),'Note bars must retain drag/resize gestures');
 assert.ok(noteBars.includes('.rhythm-track,.rhythm-step-cell,.rhythm-event'),'Rhythm controls must retain touch gestures');
 assert.ok(touch.includes('overscroll-behavior-y:auto;'),'Page scrolling must not be trapped at the grid boundary');
 assert.ok(app.includes('swipe vertically on empty note cells'),'Touch instructions must describe the new behavior');
});
console.log(passed+' rhythm, custom-library, comparison and mobile input checks passed');
