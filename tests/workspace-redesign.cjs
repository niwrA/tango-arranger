const assert=require('node:assert/strict');
const fs=require('node:fs');
const app=fs.readFileSync('src/App.vue','utf8');
const css=fs.readFileSync('src/style.css','utf8');
const pkg=require('../package.json');
const tests=[
 ['version 4.8',()=>assert.equal(pkg.version,'5.5.0')],
 ['project drawer toggle',()=>assert.match(app,/projectDrawerOpen=!projectDrawerOpen/)],
 ['project drawer close',()=>assert.match(app,/projectDrawerOpen.value=false/)],
 ['drawer accessibility',()=>assert.match(app,/aria-controls="song-settings-modal"/)],
 ['map context toolbar',()=>assert.match(app,/class="map-context-toolbar"/)],
 ['map selected range',()=>assert.match(app,/Measures \{\{overviewStart\}\}–\{\{overviewEnd\}\}/)],
 ['map note editor action',()=>assert.match(app,/openNoteEditor\(overviewInstrument,overviewStart-1\)/)],
 ['compact note toolbar',()=>assert.match(app,/class="compact-note-toolbar"/)],
 ['sticky note toolbar',()=>assert.match(css,/\.compact-note-toolbar\{[^}]*position:sticky/)],
 ['contextual inspector',()=>assert.match(app,/noteInspectorOpen=!noteInspectorOpen/)],
 ['inspector below piano roll',()=>assert.match(css,/\.note-properties:not\(\.note-properties-popup\)\{position:static/)],
 ['responsive inspector',()=>assert.match(css,/@media\(max-width:1050px\)/)],
 ['full viewport note focus retained',()=>assert.match(css,/\.note-focus-mode\{position:fixed/)],
 ['rhythm editor retained',()=>assert.match(app,/active==='rhythm'/)],
 ['transport loop retained',()=>assert.match(app,/@click="toggleNoteLoop"/)],
];
for(const [name,fn] of tests){fn();console.log('PASS '+name)}
console.log(tests.length+' workspace redesign checks passed');
