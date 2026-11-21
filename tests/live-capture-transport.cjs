const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
const toolbar=fs.readFileSync(path.join(root,'src/LiveCaptureTransport.vue'),'utf8');
const icons=fs.readFileSync(path.join(root,'src/AppIcon.vue'),'utf8');
const css=fs.readFileSync(path.join(root,'src/style.css'),'utf8');
let checks=0;
function check(label,fn){fn();checks++;console.log('PASS '+label);}
check('Voice notes show their active verse syllable instead of beat count',()=>{
 assert.ok(app.includes('noteInst.startsWith(\'Voice\')" class="note-bar-label note-bar-lyric"'));
 assert.ok(app.includes('lyricVerse===1?n.lyric:n.lyric2'));
 assert.ok(app.includes('lyricVerse===1?n.melisma:n.melisma2'));
 assert.ok(app.includes('class="note-bar-lyric"')||css.includes('.note-bar-lyric'));
 assert.ok(app.includes('<span v-else class="note-bar-label">{{n.duration}} beats</span>'));
});
check('Transport buttons are independent, accessible and share one component',()=>{
 for(const kind of ['melody','rhythm'])assert.ok(app.includes('<LiveCaptureTransport kind="'+kind+'"'));
 for(const action of ['play','record','loop','metronome','count-in'])assert.ok(toolbar.includes("$emit('"+action+"')"),action);
 for(const label of ['Play arrangement','Record and play','Loop on','Metronome on','Count-in on'])assert.ok(toolbar.includes(label),label);
 for(const icon of ["'metronome'","'count-in'","'repeat'","'record'"])assert.ok(icons.includes(icon),icon);
});
check('Play is audition only, record starts playback and captures',()=>{
 assert.ok(app.includes('async function startCaptureTransport(recording:boolean'));
 assert.ok(app.includes('void startCaptureTransport(false)'));
 assert.ok(app.includes('void startCaptureTransport(true)'));
 assert.ok(app.includes('captureRecording.value=recording'));
 assert.ok(app.includes("if(!captureRecording.value){captureFeedback.value='Press Record"));
 assert.ok(app.includes("const started=captureRecording.value?captureElapsedBeats():-1"));
});
check('Loop off stops after the selected range and finalizes held notes',()=>{
 assert.ok(app.includes('if(!captureLoopEnabled.value){'));
 assert.ok(app.includes('transport.scheduleOnce(time=>{'));
 assert.ok(app.includes("releaseCapturePianoKey({pointerId:id,type:'transport-end'} as PointerEvent)"));
 assert.ok(app.includes('captureRecording.value=false;captureCountingIn.value=false'));
 assert.ok(app.includes('const countInBeats=recording&&captureCountIn.value?project.value.beats:0'));
});
check('Recording settings and draft stay out of the primary playing surface',()=>{
 assert.ok(toolbar.includes('<slot name="settings"/>'));
 assert.ok(toolbar.includes('<slot name="extras"/>'));
 assert.ok(app.includes('capture-draft-review'));
 assert.ok(css.includes('.capture-settings-panel'));
});
console.log(checks+' live input transport and lyric checks passed');
