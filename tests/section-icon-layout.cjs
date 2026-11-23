const assert=require('node:assert/strict');
const fs=require('node:fs');
const vue=fs.readFileSync('src/App.vue','utf8');
const css=fs.readFileSync('src/style.css','utf8');
const lead=vue.slice(vue.indexOf('<div v-if="leadDisplayMode===\'edit\'" class="lead-sections">'),vue.indexOf('class="lead-measure-grid"'));
assert.match(lead,/lead-section-collapsed':collapsedLeadSections\.includes\(span\.label\)/);
assert.match(lead,/v-if="span\.sectionIndex>0&&!collapsedLeadSections\.includes\(span\.label\)"/);
assert.match(lead,/v-if="!collapsedLeadSections\.includes\(span\.label\)" class="lead-key-label"/);
const actions=lead.match(/<div class="lead-section-actions"[\s\S]*?<\/div>/)?.[0]??'';
assert.ok(actions,'Section actions remain available');
for(const name of ['copy','clipboard-copy','clipboard-paste','trash','x']){
 assert.ok(actions.includes('<AppIcon name="'+name+'"/>'),'Expected '+name+' icon');
}
for(const action of ['duplicateLeadSection(span.sectionIndex)','beginSectionCopy(span.sectionIndex)','cancelSectionCopy','copyChordsToSection(span.sectionIndex)','deleteLeadSection(span.sectionIndex)']){
 assert.ok(actions.includes('@click="'+action+'"'),'Action still wired: '+action);
}
for(const word of ['Copy section</button>','Copy chords</button>','Delete section</button>','Paste into {{sectionLetter(span.sectionIndex)}}</button>']){
 assert.ok(!actions.includes(word),'No text button: '+word);
}
assert.match(actions,/:aria-label="`Duplicate section/);
assert.match(actions,/:aria-label="`Copy chords from section/);
assert.match(actions,/:aria-label="`Paste copied chords into section/);
assert.match(actions,/:aria-label="`Delete section/);
assert.match(actions,/aria-label="Cancel chord copying"/);
const style=css.slice(css.lastIndexOf('/* Compact section actions:'));
assert.match(style,/\.lead-section-collapsed\{padding:5px 8px\}/);
assert.match(style,/grid-template-columns:minmax\(0,1fr\) auto/);
assert.match(style,/\.lead-section-icon\{/);
assert.match(style,/display:flex!important;flex-wrap:nowrap!important/);
console.log('Compact collapsed section icons and retained operations passed');
