const assert=require('node:assert/strict');
const fs=require('node:fs');
const app=fs.readFileSync('src/App.vue','utf8');
const css=fs.readFileSync('src/style.css','utf8');
const pkg=require('../package.json');
const tests=[
 ['package and lockfile agree',()=>assert.equal(pkg.version,require('../package-lock.json').version)],
 ['project drawer toggle',()=>assert.match(app,/projectDrawerOpen=!projectDrawerOpen/)],
 ['project drawer close',()=>assert.match(app,/projectDrawerOpen.value=false/)],
 ['drawer accessibility',()=>assert.match(app,/aria-controls="song-settings-modal"/)],
 ['map context toolbar',()=>assert.match(app,/class="orchestration-tools-popup"/)],
 ['map selected range',()=>assert.match(app,/selected range \{\{overviewStart\}\}\u2013\{\{overviewEnd\}\}/)],
 ['map note editor action',()=>assert.match(app,/@dblclick.stop="onMapCellDoubleClick\(inst,i,\$event\)"/)],
 ['compact and focused editor share a toolbar',()=>assert.match(app,/class="note-unified-toolbar" :class="noteFocusMode\?'note-focus-toolbar':'compact-note-toolbar'"/)],
 ['sticky note toolbar',()=>assert.match(css,/\.compact-note-toolbar\{[^}]*position:sticky/)],
 ['contextual inspector follows the selected event',()=>assert.match(app,/<div v-if="selectedEvent" :class="\['note-properties'/)],
 ['inspector below piano roll',()=>assert.match(css,/\.note-properties:not\(\.note-properties-popup\)\{position:static/)],
 ['responsive inspector',()=>assert.match(css,/@media\(max-width:1050px\)/)],
 ['full viewport note focus retained',()=>assert.match(css,/\.note-focus-mode\{position:fixed/)],
 ['rhythm editor retained',()=>assert.match(app,/active==='rhythm'/)],
 ['transport loop retained',()=>assert.match(app,/@click="toggleNoteLoop"/)],
];
for(const [name,fn] of tests){fn();console.log('PASS '+name)}
console.log(tests.length+' workspace redesign checks passed');
