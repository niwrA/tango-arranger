const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../src/App.vue'),'utf8');
let count=0;
function check(name,fn){fn();count++;console.log('PASS '+name);}
const panel=app.slice(app.indexOf('id="note-panel-capture"'),app.indexOf('id="note-panel-notes"'));
check('Note Editor toolbar determines melody capture range',()=>{
 assert.ok(app.includes("active.value==='notes'?noteLoopFrom.value:captureFrom.value"));
 assert.ok(app.includes("active.value==='notes'?noteLoopTo.value:captureTo.value"));
 assert.ok(panel.includes('captureFirst+1'));
 assert.ok(panel.includes('captureLast+1'));
 assert.ok(!panel.includes('v-model.number="captureFrom"'));
 assert.ok(!panel.includes('v-model.number="captureTo"'));
});
check('Rhythm Editor retains independent capture range',()=>{
 assert.ok(app.includes("else{captureFrom.value=b;captureTo.value=b;}"));
 assert.ok(app.includes('const captureFrom=ref(1)'));
 assert.ok(app.includes('const captureTo=ref(1)'));
});
check('Violin touch gestures cannot pan the board',()=>{
 assert.ok(panel.includes('capture-violin-gesture-surface'));
 assert.ok(panel.includes('@pointermove.prevent.stop="captureViolinFingerMove($event)"'));
 assert.ok(app.includes('.capture-fingerboard-scroll.capture-violin-gesture-surface'));
 assert.ok(app.includes('touch-action:none!important'));
});
check('Live recording controls are compact and keep mode, quantization and tempo',()=>{
 assert.ok(panel.includes('live-capture-recording-options'));
 for(const item of ['captureTakeMode','captureQuantize','captureSpeed','captureMetronome','captureCountIn','toggleCaptureLoop'])assert.ok(panel.includes(item),item);
});
check('Compact menu does not repeat the song picker',()=>{
 const menu=app.slice(app.indexOf('class="topbar-menu compact-workspace-menu"'),app.indexOf('class="topbar-group topbar-options"'));
 assert.ok(!menu.includes('Choose song from local library'));
 assert.ok(app.includes('id="header-song-picker"'));
});
console.log(count+' capture layout checks passed');
