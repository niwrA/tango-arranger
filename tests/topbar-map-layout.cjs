const assert=require('node:assert/strict');
const fs=require('node:fs');
const app=fs.readFileSync('src/App.vue','utf8');
const css=fs.readFileSync('src/style.css','utf8');
const pkg=require('../package.json');
const checks=[
 ['version',()=>assert.equal(pkg.version,'5.2.0')],
 ['local song picker in header',()=>assert.match(app,/<header class="app-topbar">[\s\S]*id="header-song-picker"[\s\S]*<\/header>/)],
 ['song picker switches local songs',()=>assert.match(app,/@change="chooseSongFromPicker"/)],
 ['selected song settings gear opens dialog',()=>assert.match(app,/<button class="secondary icon-action header-settings"[^>]*aria-controls="song-settings-modal"[^>]*@click="projectDrawerOpen=!projectDrawerOpen"/)],
 ['new song in header',()=>assert.match(app,/<header class="app-topbar">[\s\S]*aria-label="New blank song"/)],
 ['save in header',()=>assert.match(app,/aria-label="Save song now"[^>]*@click="saveNow"/)],
 ['import in header keyboard accessible',()=>assert.match(app,/aria-label="Import and export actions"[\s\S]*@click="importDialogOpen=true"/)],
 ['pending MIDI/MusicXML imports open import options',()=>assert.match(app,/if\(pending.value.length\)importDialogOpen.value=true/)],
 ['MusicXML export in header',()=>assert.match(app,/<button type="button" class="secondary" @click="exportXml"/)],
 ['backup export in header',()=>assert.match(app,/<button type="button" class="secondary" @click="saveProject\(project\)"/)],
 ['duplicate and delete accessible in song menu',()=>{assert.match(app,/class="topbar-menu song-menu"/);assert.match(app,/@click="duplicateLocalSong"/);assert.match(app,/@click="deleteCurrentLocalSong"/)}],
 ['transport in header',()=>assert.match(app,/class="topbar-group topbar-playback transport-bar"[\s\S]*<\/header>/)],
 ['two start modes and stop in header',()=>{for(const x of ["play('beginning')","play('selected')",'stopPlayback'])assert.ok(app.includes('@click="'+x+'"'))}],
 ['tooltips and accessible names on icon controls',()=>{assert.match(app,/title="Play from beginning" aria-label="Play arrangement from beginning"/);assert.match(app,/title="Settings for selected song" aria-label="Song settings"/)}],
 ['map editor precedes map',()=>{const p=app.indexOf('<div class="editor overview-edit">');const m=app.indexOf('<div class="song-map-scroll">');assert.ok(p>0&&m>p)}],
 ['map instrument selection from clicked cell',()=>assert.match(app,/@click="selectOverviewMapCell\(inst,i,\$event\)"/)],
 ['no redundant instrument dropdown in map range editor',()=>{const p=app.split('<div class="editor overview-edit">')[1].split('</details></div>')[0];assert.doesNotMatch(p,/<label>Instrument<select/)}],
 ['from and to remain editable',()=>{assert.match(app,/v-model.number="overviewStart"/);assert.match(app,/v-model.number="overviewEnd"/)}],
 ['role articulation and techniques preserved',()=>{for(const v of ['overviewRole','overviewArt','overviewTechnique','overviewBassTechnique'])assert.match(app,new RegExp('v-model="'+v+'"'))}],
 ['apply is explicit',()=>assert.match(app,/aria-label="Apply to range" @click="applyOverviewRange"/)],
 ['section and full-song operations preserved',()=>{assert.match(app,/@click="applyOverviewSection"/);assert.match(app,/overviewEnd=project.bars.length;mapRangeAnchor=0/)}],
 ['horizontal responsive controls',()=>assert.match(css,/\.overview-section \.overview-edit \.overview-controls\{display:flex!important;flex-wrap:wrap/)],
 ['topbar responsive',()=>assert.match(css,/@media\(max-width:620px\)\{\.app-topbar/)],
 ['legacy local song dropdown removed from drawer',()=>assert.doesNotMatch(app,/<summary>Local song library<\/summary>/)],
 ['settings still available',()=>assert.match(app,/id="song-settings-modal"/)],
 ['release note',()=>assert.match(app,/v4\.7\.0 · Compact song toolbar/)],
];
for(const [name,fn] of checks){fn();console.log('PASS',name)}
console.log(checks.length+' topbar/map layout checks passed');
