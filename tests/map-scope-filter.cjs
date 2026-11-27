const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const root=path.join(__dirname,'..');const vue=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');const css=fs.readFileSync(path.join(root,'src/style.css'),'utf8');const checks=[
['map always available',()=>assert.match(vue,/class="orchestration-instrument-scope" id="scope-map-panel"/)],
['instrument scope filters independently of the edit target',()=>assert.match(vue,/orchestrationScope.value==='instrument'\?\[overviewMapInstrument.value\]:orchestrationScope.value==='section'/)],
['section scope filters instrumental group',()=>assert.match(vue,/instrumentsForGroup\(project.value,selectedInstrumentGroup.value,overviewInstruments.value\)/)],
['expanded groups show every measure; collapsed groups retain their first measure',()=>assert.match(vue,/return section\?\.collapsed&&index!==section.start\?\[\]:\[\{bar,index\}\]/)],
['original measure indices retained in both table axes',()=>{const map=vue.slice(vue.indexOf('<div class="song-map-scroll"><table'),vue.indexOf('</table></div>',vue.indexOf('<div class="song-map-scroll"><table')));assert.equal((map.match(/v-for="\(\{bar:b,index:i\}\) in mapVisibleMeasures"/g)||[]).length,2);assert.match(map,/@click="selectOverviewMapCell\(inst,i,\$event\)"/)}],
['row filter used by table',()=>assert.match(vue,/v-for="inst in mapVisibleInstruments"/)],
['instrument group picker beside scope tabs',()=>assert.match(vue,/aria-label="Orchestra group shown in orchestration map"/)],
['instrument picker beside scope tabs',()=>assert.match(vue,/aria-label="Instrument shown in orchestration map"/)],
['responsive selectors',()=>assert.match(css,/\.orchestration-map-filter/)],
['version and docs',()=>{assert.equal(require('../package.json').version,require('../package-lock.json').version);assert.match(fs.readFileSync(path.join(root,'CHANGELOG.md'),'utf8'),/v5\.4\.0 \u2014 Scope-filtered orchestration map/)}]
];for(const [name,fn] of checks){fn();console.log('PASS',name)}console.log(checks.length,'map scope filter checks passed');

const {createDomainLoader}=require('./load-domain.cjs');
const load=createDomainLoader();
const {blankProject}=load('src/music.ts');
const {orchestrationMeasureRange,readOrchestrationRangeSettings,applyOrchestrationRangeSettings}=load('src/orchestrationRangeSettings.ts');
const project=blankProject();
project.measureRoles={'Voice:3':'rest','Piano:3':'chords','Piano:4':'harmony'};
project.measureViolinTechniques={'Violin I:3':'pizzicato','Violin I:4':'arco'};
let voice=readOrchestrationRangeSettings(project,'Voice',3,3);
let piano=readOrchestrationRangeSettings(project,'Piano',3,4);
assert.equal(voice.role,'rest');
assert.equal(piano.role,'mixed');
const before=JSON.stringify(project);
assert.equal(applyOrchestrationRangeSettings(project,'Piano',3,4,voice,new Set()),false);
assert.equal(JSON.stringify(project),before);
assert.equal(applyOrchestrationRangeSettings(project,'Violin I',3,4,{...piano,role:'melody'},new Set(['role'])),true);
assert.equal(project.measureViolinTechniques['Violin I:3'],'pizzicato');
assert.equal(project.measureViolinTechniques['Violin I:4'],'arco');
assert.equal(project.measureRoles['Violin I:4'],'melody');
assert.equal(project.measureRoles['Piano:4'],'harmony');
assert.equal(applyOrchestrationRangeSettings(project,'Piano',3,4,{...piano,role:'inherit'},new Set(['role'])),true);
assert.equal(project.measureRoles['Piano:3'],undefined);
assert.equal(project.measureRoles['Piano:4'],undefined);
assert.equal(project.measureRoles['Voice:3'],'rest');
const bass=readOrchestrationRangeSettings(project,'Contrabass',3,4);
assert.equal(applyOrchestrationRangeSettings(project,'Contrabass',3,4,{...bass,bass:'pizzicato'},new Set(['bass'])),true);
assert.equal(project.measureBassTechniques['Contrabass:3'],'pizzicato');
assert.equal(project.measureBassTechniques['Contrabass:4'],'pizzicato');
assert.deepEqual(orchestrationMeasureRange(5,4,999),[3,4]);
assert.equal(orchestrationMeasureRange(5,NaN,4),null);
assert.match(vue,/v-model="overviewMapInstrument" aria-label="Instrument shown in orchestration map"/);
assert.doesNotMatch(vue,/focusOverview\(members\[0\]/);
console.log('PASS filters are view-only; range settings preserve untouched/mixed values and apply edits only to the selected part');
