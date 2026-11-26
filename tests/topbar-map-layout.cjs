const assert=require('node:assert/strict');
const fs=require('node:fs');
const app=fs.readFileSync('src/App.vue','utf8');
const css=fs.readFileSync('src/style.css','utf8');
const pkg=require('../package.json');
const checks=[
 ['version',()=>assert.match(pkg.version,/^5\.5\./)],
 ['local song picker in header',()=>assert.match(app,/<header class="app-topbar">[\s\S]*id="header-song-picker"[\s\S]*<\/header>/)],
 ['song picker switches local songs',()=>assert.match(app,/@change="chooseSongFromPicker"/)],
 ['selected song settings gear opens dialog',()=>assert.match(app,/<button class="secondary icon-action header-settings"[^>]*aria-controls="song-settings-modal"[^>]*@click="projectDrawerOpen=!projectDrawerOpen"/)],
 ['new song in File menu',()=>assert.match(app,/class="topbar-menu song-menu"[\s\S]*@click="newSongOpen=true"/)],
 ['save in File menu',()=>assert.match(app,/<button type="button" class="secondary" :disabled="!libraryReady" @click="saveNow"/)],
 ['project opening belongs to File',()=>{const file=app.split('class="topbar-menu song-menu"')[1].split('class="topbar-group topbar-arrange"')[0];assert.ok(file.includes("openContextImport('project')"));assert.doesNotMatch(app,/class="topbar-menu files-menu"/)}],
 ['pending MIDI/MusicXML imports open import options',()=>assert.match(app,/if\(pending.value.length\)importDialogOpen.value=true/)],
 ['MusicXML export in header',()=>assert.match(app,/<button type="button" class="secondary" @click="exportXml"/)],
 ['backup export in header',()=>assert.match(app,/<button type="button" class="secondary" @click="saveProject\(project\)"/)],
 ['duplicate and delete accessible in File menu',()=>{assert.match(app,/class="topbar-menu song-menu"/);assert.match(app,/@click="duplicateLocalSong"/);assert.match(app,/@click="deleteCurrentLocalSong"/)}],
 ['project operations and contextual imports separated',()=>{const file=app.split('class="topbar-menu song-menu"')[1].split('class="topbar-group topbar-arrange"')[0];for(const name of ['exportXml','exportMxl','exportMscz','exportAbcLead','exportForMobileSheets','exportDifficultyEditionPack','saveCompressedProject','deleteCurrentLocalSong'])assert.ok(file.includes(name),name);for(const context of ['lead','arrange','instrument']){assert.ok(app.includes("openContextImport('"+context+"'"));assert.ok(!file.includes("openContextImport('"+context+"'"));}assert.ok(app.includes(':initial-instrument="importDestination"'))}],
 ['measure editing is in taskbar, not full page',()=>{assert.match(app,/class="topbar-group topbar-measure-tools"/);assert.match(app,/class="icon-action measure-taskbar-trigger"/);assert.match(app,/class="measure-tools-backdrop"/)}],
 ['transport in header',()=>assert.match(app,/class="topbar-group topbar-playback transport-bar"[\s\S]*<\/header>/)],
 ['two start modes and stop in header',()=>{for(const x of ["play('beginning')","play('selected')",'stopPlayback'])assert.ok(app.includes('@click="'+x+'"'))}],
 ['tooltips and accessible names on icon controls',()=>{assert.match(app,/title="Play from beginning" aria-label="Play arrangement from beginning"/);assert.match(app,/title="Settings for selected song" aria-label="Song settings"/)}],
 ['map editor precedes map',()=>{const p=app.indexOf('<div class="editor overview-edit">');const m=app.indexOf('<div class="song-map-scroll">');assert.ok(p>0&&m>p)}],
 ['map instrument selection from clicked cell',()=>assert.match(app,/@click="selectOverviewMapCell\(inst,i,\$event\)"/)],
 ['no redundant instrument dropdown in map range editor',()=>{const p=app.split('<div class="editor overview-edit">')[1].split('</details></div>')[0];assert.doesNotMatch(p,/<label>Instrument<select/)}],
 ['from and to remain editable',()=>{assert.match(app,/v-model.number="overviewStart"/);assert.match(app,/v-model.number="overviewEnd"/)}],
 ['role articulation and techniques preserved',()=>{for(const v of ['overviewRole','overviewArt','overviewTechnique','overviewBassTechnique'])assert.match(app,new RegExp('v-model="'+v+'"'))}],
 ['apply is explicit',()=>assert.match(app,/aria-label="Apply to range" @click="applyOverviewRange\(\)(?:;[^"]+)?"/)],
 ['section and full-song operations preserved',()=>{assert.match(app,/@click="applyOverviewSection"/);assert.match(app,/overviewEnd=project.bars.length;mapRangeAnchor=0/)}],
 ['horizontal responsive controls',()=>assert.match(css,/\.overview-section \.overview-edit \.overview-controls\{display:flex!important;flex-wrap:wrap/)],
 ['topbar responsive',()=>assert.match(css,/@media\(max-width:620px\)\{\.app-topbar/)],
 ['legacy local song dropdown removed from drawer',()=>assert.doesNotMatch(app,/<summary>Local song library<\/summary>/)],
 ['settings still available',()=>assert.match(app,/id="song-settings-modal"/)],
 ['release notes load changelog data',()=>{assert.match(app,/import changelogMarkdown from '\.\.\/CHANGELOG\.md\?raw'/);assert.match(app,/<details v-for="release in majorReleases"/);assert.match(app,/<details v-for="day in dailyReleases"/);assert.doesNotMatch(app,/<details v-for="(?:release in majorReleases|day in dailyReleases)"[^>]*\s(?:open|:open)(?:\s|=|>)/)}],
 ['release notes include dated and numbered entries',()=>{
  const ts=require('typescript');
  const source=app.slice(app.indexOf('type ChangelogEntry='),app.indexOf('const active=ref',app.indexOf('type ChangelogEntry=')));
  const js=ts.transpileModule(source+'\nreturn {releaseHistory,majorReleases,dailyReleases};',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const parse=new Function('changelogMarkdown',js);
  const {releaseHistory,majorReleases,dailyReleases}=parse('## [Feature] New feature (2026-11-25)\n- New detail\n## Minor fix (2026-11-25)\n- Fix detail\n## Another fix (2026-11-25)\n- More detail\n## v5.5.3 — Old release\n- Old detail\n## v5.5.3 — Follow-up\n- Follow-up detail');
  assert.equal(releaseHistory.length,5);
  assert.deepEqual(majorReleases.map(e=>[e.title,e.date,e.details]),[['New feature','2026-11-25',['New detail']]]);
  assert.deepEqual(dailyReleases.map(d=>[d.date,d.entries.length]),[['2026-11-25',2],['archive',2]]);
  assert.equal(dailyReleases[1].entries[0].version,'5.5.3');
  const actual=parse(fs.readFileSync('CHANGELOG.md','utf8'));
  assert.ok(actual.releaseHistory.some(e=>!e.version&&e.details.length));
  assert.ok(actual.releaseHistory.some(e=>e.version==='5.5.3'));
  assert.equal(actual.majorReleases.length+actual.dailyReleases.reduce((sum,d)=>sum+d.entries.length,0),actual.releaseHistory.length);
 }],
];
for(const [name,fn] of checks){fn();console.log('PASS',name)}
console.log(checks.length+' topbar/map layout checks passed');
