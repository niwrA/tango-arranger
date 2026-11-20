const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..');
const app=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
const diagram=fs.readFileSync(path.join(root,'src/PerformanceChordDiagram.vue'),'utf8');
let count=0;function check(name,fn){fn();console.log('PASS',name);count++;}
check('card tap and expand are separate sibling buttons',()=>{
 const start=app.indexOf('class="performance-cue-grid performance-diagram-grid"');
 const end=app.indexOf('class="instrument-focus-overlay"',start);
 const grid=app.slice(start,end);
 assert.ok(grid.includes('class="performance-cue-card-wrap"'));
 assert.ok(grid.includes('@click="flipPerformanceCard(part.inst)"'));
 assert.match(grid,/<\/button>\s*<button type="button" class="performance-instrument-expand"/);
 assert.ok(grid.includes('@click="openPerformanceInstrument(part.inst,$event)"'));
});
check('focus is a modal with escape, tab trap and close focus restoration',()=>{
 assert.ok(app.includes('role="dialog" aria-modal="true"'));
 assert.ok(app.includes('@keydown.esc.stop.prevent="closePerformanceInstrument"'));
 assert.ok(app.includes('@keydown.tab="trapModalTab"'));
 assert.ok(app.includes('if(target?.isConnected)target.focus()'));
});
check('large diagram uses the same live measure, note and violin data',()=>{
 const start=app.indexOf('class="instrument-focus-overlay"');
 const end=app.indexOf(' </section>\n<div v-else class="layout">',start);
 assert.ok(start>0 && end>start);
 const modal=app.slice(start,end);
 for(const term of ['performanceCueParts',':focus="true"','performanceHarmony.chord','performanceChordBeats.current','performanceChordBeats.next','part.activePitches','part.violinPosition','performanceMeasureBeat','flipPerformanceCard(part.inst)'])assert.ok(modal.includes(term),term);
});
check('focus playback and rehearsal speed reuse existing state',()=>{
 assert.ok(app.includes("void play('selected')"));
 assert.ok(app.includes('@click="stopPlayback"'));
 assert.ok(app.includes('class="topbar-menu playback-speed-menu instrument-focus-speed-menu"'));
 assert.ok(app.includes('@click="setRehearsalSpeed(speed)"'));
 assert.ok(!app.includes('changePerformanceFocusSpeed('));
 assert.ok(app.includes('performanceBar+1'));
});
check('only focus class enlarges diagrams; normal fixed-height cards remain',()=>{
 assert.ok(diagram.includes('focus?:boolean'));
 assert.ok(diagram.includes("is-focus':props.focus"));
 assert.ok(diagram.includes('.performance-instrument-diagram.is-focus .diagram-fingerboard'));
 assert.ok(app.includes('height:270px!important;min-height:270px!important;max-height:270px!important'));
 assert.ok(app.includes('position:fixed;inset:0;z-index:2000'));
});
console.log(count+' focus-view checks passed');
