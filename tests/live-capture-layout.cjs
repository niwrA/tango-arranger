const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../src/App.vue'),'utf8');
let count=0;
function check(name,fn){fn();count++;console.log('PASS '+name);}
const panel=app.slice(app.indexOf('id="note-panel-capture"'),app.indexOf('id="note-panel-notes"'));
check('Note Editor toolbar determines melody capture range',()=>{
 assert.ok(app.includes("active.value==='notes'?noteLoopFrom.value:rhythmStart.value"));
 assert.ok(app.includes("active.value==='notes'?noteLoopTo.value:rhythmEnd.value"));
 assert.ok(panel.includes('captureFirst+1'));
 assert.ok(panel.includes('captureLast+1'));
 assert.ok(!panel.includes('v-model.number="captureFrom"'));
 assert.ok(!panel.includes('v-model.number="captureTo"'));
});
check('Rhythm Editor shares one visible range for apply, comparison and tap capture',()=>{
 const rhythm=app.slice(app.indexOf('<section v-else-if="active===\'rhythm\'"'),app.indexOf('<section v-else-if="active===\'notes\'"'));
 assert.ok(rhythm.includes('v-model.number="rhythmStart"'));
 assert.ok(rhythm.includes('v-model.number="rhythmEnd"'));
 assert.ok(!rhythm.includes('v-model.number="captureFrom"'));
 assert.ok(!rhythm.includes('v-model.number="captureTo"'));
 assert.ok(app.includes('rhythmStart.value=b;rhythmEnd.value=b;'));
});
check('Violin touch gestures cannot pan the board',()=>{
 assert.ok(panel.includes('capture-violin-gesture-surface'));
 assert.ok(panel.includes('@pointermove.prevent.stop="captureViolinFingerMove($event)"'));
 assert.ok(app.includes('.capture-fingerboard-scroll.capture-violin-gesture-surface'));
 assert.ok(app.includes('touch-action:none!important'));
});
check('Live recording transport is compact with advanced settings',()=>{
 assert.ok(panel.includes('<LiveCaptureTransport kind="melody"'));
 assert.ok(app.includes('<LiveCaptureTransport kind="rhythm"'));
 for(const item of ['captureTakeMode','captureQuantize','captureSpeed','captureMetronome','captureCountIn','toggleCaptureRecord','toggleCapturePlay','captureLoopEnabled'])assert.ok(panel.includes(item)||app.includes(item),item);
 assert.ok(panel.includes('<template #settings>'));
 assert.ok(panel.includes('capture-draft-review'));
});
check('Compact menu does not repeat the song picker',()=>{
 const menu=app.slice(app.indexOf('class="topbar-menu compact-workspace-menu"'),app.indexOf('class="topbar-group topbar-options"'));
 assert.ok(!menu.includes('Choose song from local library'));
 assert.ok(app.includes('id="header-song-picker"'));
});
console.log(count+' capture layout checks passed');
