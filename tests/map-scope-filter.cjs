const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const root=path.join(__dirname,'..');const vue=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');const css=fs.readFileSync(path.join(root,'src/style.css'),'utf8');const checks=[
['map always available',()=>assert.match(vue,/class="orchestration-instrument-scope" id="scope-map-panel"/)],
['instrument scope filters to one selected instrument',()=>assert.match(vue,/orchestrationScope.value==='instrument'\?\[overviewInstrument.value\]:orchestrationScope.value==='section'/)],
['section scope filters instrumental group',()=>assert.match(vue,/instrumentsForGroup\(project.value,selectedInstrumentGroup.value,overviewInstruments.value\)/)],
['all scope includes all measures',()=>assert.match(vue,/project.value.bars.map\(\(bar,index\)=>\(\{bar,index\}\)\)/)],
['original measure indices retained in both table axes',()=>{const map=vue.slice(vue.indexOf('<div class="song-map-scroll"><table'),vue.indexOf('</table></div>',vue.indexOf('<div class="song-map-scroll"><table')));assert.equal((map.match(/v-for="\(\{bar:b,index:i\}\) in mapVisibleMeasures"/g)||[]).length,2);assert.match(map,/@click="selectOverviewMapCell\(inst,i,\$event\)"/)}],
['row filter used by table',()=>assert.match(vue,/v-for="inst in mapVisibleInstruments"/)],
['instrument group picker beside scope tabs',()=>assert.match(vue,/aria-label="Orchestra group shown in orchestration map"/)],
['instrument picker beside scope tabs',()=>assert.match(vue,/aria-label="Instrument shown in orchestration map"/)],
['responsive selectors',()=>assert.match(css,/\.orchestration-map-filter/)],
['version and docs',()=>{assert.equal(require('../package.json').version,'5.5.0');for(const name of ['README.MD','PROJECT-GOALS.MD','PROJECT-BOARD.MD'])assert.ok(fs.readFileSync(path.join(root,name),'utf8').includes('v5.4.0'))}]
];for(const [name,fn] of checks){fn();console.log('PASS',name)}console.log(checks.length,'map scope filter checks passed');
