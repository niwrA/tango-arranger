const assert=require('node:assert/strict');
const fs=require('node:fs');
const app=fs.readFileSync('src/App.vue','utf8');
const css=fs.readFileSync('src/style.css','utf8');
const icon=fs.readFileSync('src/AppIcon.vue','utf8');
const pkg=require('../package.json');
const checks=[
 ['version',()=>assert.equal(pkg.version,'5.0.0')],
 ['settings modal aria semantics',()=>assert.match(app,/id="song-settings-modal"[^>]*role="dialog" aria-modal="true"/)],
 ['settings close and escape',()=>{assert.match(app,/@click.self="closeSongSettings"/);assert.match(app,/@keydown.esc.stop.prevent="closeSongSettings"/)}],
 ['settings scoped to song',()=>{const block=app.split('id="song-settings-modal"')[1].split('id="import-workflow-modal"')[0];for(const x of ['project.title','project.bpm','project.beats','project.profile','project.difficulty'])assert.ok(block.includes(x));assert.ok(!block.includes('Apply import'))}],
 ['import dialog separate',()=>assert.match(app,/id="import-workflow-modal"[^>]*role="dialog" aria-modal="true"/)],
 ['roundtrip import choices',()=>{const block=app.split('id="import-workflow-modal"')[1].split('<div class="layout">')[0];for(const x of ['@change="importFile"','v-model="importMode"','v-model.number="selectedTrack"','@click="applyImport"'])assert.ok(block.includes(x))}],
 ['file import opens dialog after parsing',()=>assert.match(app,/if\(pending.value.length\)importDialogOpen.value=true/)],
 ['roundtrip dialog closes on apply',()=>assert.match(app,/pending.value=\[\];pendingChords.value=\[\];pendingKeys.value=\[\];importDialogOpen.value=false/)],
 ['MusicXML chords are staged until confirmation',()=>{const load=app.split('async function importFile(e:Event)')[1].split('function applyImport()')[0];assert.doesNotMatch(load,/project.value.bars\[i\].chord=/);assert.match(app,/pendingChords.value.forEach/)}],
 ['focus trap',()=>assert.match(app,/function trapModalTab\(event:KeyboardEvent\)/)],
 ['header has consistent icons',()=>{const head=app.split('<header class="app-topbar">')[1].split('</header>')[0];for(const x of ['plus','save','settings','play-from-start','square','folder-open','refresh-cw'])assert.ok(head.includes('name="'+x+'"'),x)}],
 ['icon component uses SVG and accessible hidden graphic',()=>{assert.match(icon,/<svg class="app-icon"/);assert.match(icon,/aria-hidden="true"/)}],
 ['tab titles unnumbered',()=>{const nav=app.split('<nav class="tabs"')[1].split('</nav>')[0];assert.doesNotMatch(nav,/\d+ ·/);assert.doesNotMatch(nav,/Song overview/)}],
 ['map under orchestration',()=>{const arrange=app.indexOf('<section v-else-if="active===\'arrange\'"'),rhythm=app.indexOf('<section v-else-if="active===\'rhythm\'"');assert.ok(arrange>0&&rhythm>arrange);const block=app.slice(arrange,rhythm);assert.match(block,/class="song-map-scroll"/);assert.match(block,/class="editor overview-edit"/);assert.match(block,/orchestration-section-settings/)}],
 ['no overview tab',()=>assert.doesNotMatch(app,/<section v-else-if="active===\'overview\'"/)],
 ['structure summary removed',()=>assert.doesNotMatch(app,/class="overview-section-strip"/)],
 ['map still supports range selection',()=>{assert.match(app,/@click="selectOverviewMapCell\(inst,i,\$event\)"/);assert.match(app,/@click="applyOverviewRange"/)}],
 ['modals responsive',()=>assert.match(css,/@media\(max-width:620px\)\{\.app-modal-backdrop/)],
];
for(const [label,fn] of checks){fn();console.log('PASS',label)}
console.log(checks.length+' dialog and workspace checks passed');
