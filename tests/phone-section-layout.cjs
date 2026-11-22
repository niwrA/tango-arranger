const assert=require('node:assert/strict');
const fs=require('node:fs');
const css=fs.readFileSync('src/style.css','utf8');
const vue=fs.readFileSync('src/App.vue','utf8');
const final=css.slice(css.indexOf('/* Phone header and section cards: keep all actions inside the viewport. */'));
assert.ok(final.length>1200,'Mobile layout override must exist');
assert.match(final,/@media\(max-width:760px\)/);
assert.match(final,/grid-template-areas:"playback playback playback playback" "song files measures more"!important/);
for(const area of ['playback','song','files','measures','more']){
 assert.match(final,new RegExp('grid-area:'+area+'!important'),'Mobile header must explicitly place '+area);
}
assert.match(final,/\.topbar-song \.header-song-picker\{[\s\S]*?min-width:0!important/);
assert.match(final,/\.topbar-song-label\{\s*display:none!important/);
assert.match(final,/\.lead-sections \.lead-section-heading\{[\s\S]*?display:grid!important/);
assert.match(final,/\.lead-sections \.lead-section-actions\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
assert.match(final,/\.lead-section-start-control\{[\s\S]*?grid-column:1\/-1/);
assert.match(final,/\.lead-section-copy\{[\s\S]*?min-width:0/);
assert.match(final,/\.lead-section-heading>\.lead-key-label\{[\s\S]*?width:100%/);
for(const action of ['duplicateLeadSection(si)','beginSectionCopy(si)','copyChordsToSection(si)','deleteLeadSection(si)']){
 assert.ok(vue.includes('@click="'+action+'"'),'Existing section action preserved: '+action);
}
console.log('Phone header and section card responsiveness checks passed');
