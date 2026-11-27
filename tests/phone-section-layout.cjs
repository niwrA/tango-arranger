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
for(const action of ['duplicateLeadSection(span.sectionIndex)','beginSectionCopy(span.sectionIndex)','copyChordsToSection(span.sectionIndex)','deleteLeadSection(span.sectionIndex)']){
 assert.ok(vue.includes('@click="'+action+'"'),'Existing section action preserved: '+action);
}
console.log('Phone header and section card responsiveness checks passed');

const narrowStage=vue.slice(vue.indexOf('/* Give the controls their own row on narrow phones.'));
assert.match(narrowStage,/@media\(max-width:420px\)/);
assert.match(narrowStage,/grid-template-areas:"home title title" "transport transport more"/);
assert.match(narrowStage,/\.topbar-playback\{\s*grid-area:transport!important;flex-wrap:wrap/);
assert.match(narrowStage,/\.topbar-compact-actions\{grid-area:more;justify-self:end/);
assert.match(vue,/<h1 id="home-title" tabindex="-1">/);
assert.match(vue,/function showHome\(\)\{[\s\S]*?nextTick\(\(\)=>document\.querySelector<HTMLElement>\('#home-title'\)\?\.focus/);
console.log('Narrow stage stays accessible and leaving a workspace hands keyboard focus to Home');
