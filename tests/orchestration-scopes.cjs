const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const root=path.join(__dirname,'..');const vue=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');const css=fs.readFileSync(path.join(root,'src/style.css'),'utf8');const checks=[
['three scope tabs',()=>{assert.match(vue,/orchestrationScope=ref<'instrument'\|'section'\|'all'>\('all'\)/);assert.match(vue,/role="tablist" aria-label="Orchestration editing scope"/);assert.match(vue,/\['all','section','instrument'\]/)}],
['map shown for all scopes',()=>assert.match(vue,/class="orchestration-instrument-scope" id="scope-map-panel"/)],
['song-part settings are separate',()=>assert.match(vue,/v-if="orchestrationScope==='all'" class="control-fold orchestration-song-part-settings"/)],
['rhythm shortcuts removed from orchestration',()=>{const section=vue.slice(vue.indexOf('<section v-else-if="active===\'arrange\'"'),vue.indexOf('<section v-else-if="active===\'rhythm\'"'));assert.doesNotMatch(section,/active='rhythm'/)}],
['grouped settings',()=>{for(const heading of ['Roles &amp; playing styles','Instrument techniques','Activity &amp; expression','Articulation &amp; gestures'])assert.ok(vue.includes(`<summary>${heading}</summary>`))}],
['responsive section controls',()=>assert.match(css,/\.orchestration-settings-grid\{display:grid/)],
['section key belongs in structure',()=>{const section=vue.slice(vue.indexOf('<section v-else-if="active===\'arrange\'"'),vue.indexOf('<section v-else-if="active===\'rhythm\'"'));assert.doesNotMatch(section,/setSectionKey\(/)}],
['version and docs',()=>{assert.equal(require('../package.json').version,require('../package-lock.json').version);assert.match(fs.readFileSync(path.join(root,'CHANGELOG.md'),'utf8'),/v5\.3\.0 \u2014 Orchestration scopes/)}]
];for(const [name,fn] of checks){fn();console.log('PASS',name)}console.log(checks.length,'orchestration scope checks passed');
