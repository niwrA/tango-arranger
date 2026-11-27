const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const root=path.join(__dirname,'..');const vue=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');const music=fs.readFileSync(path.join(root,'src/music.ts'),'utf8');const css=fs.readFileSync(path.join(root,'src/style.css'),'utf8');const checks=[
['functional groups named',()=>{for(const name of ['rhythm','melody','harmony'])assert.match(music,new RegExp(`\\b${name}:\\[`))}],
['rhythm defaults',()=>assert.match(music,/rhythm:\['Piano','Contrabass'\]/)],
['melody defaults',()=>assert.match(music,/melody:\['Violin I','Bandoneon I','Voice'\]/)],
['harmony defaults',()=>assert.match(music,/harmony:\['Violin II','Bandoneon II'\]/)],
['song-scoped group membership',()=>assert.match(music,/orchestralGroups\?:Partial<Record<InstrumentGroup,Instrument\[\]>>/)],
['group membership can be changed',()=>assert.match(vue,/function toggleGroupMember\(inst:Instrument,checked:boolean\)/)],
['empty groups prevented',()=>assert.match(vue,/current.length<=1/)],
['group selector chooses instrumental group',()=>assert.match(vue,/aria-label="Orchestra group shown in orchestration map"/)],
['no song-part measure filtering',()=>assert.doesNotMatch(vue,/bar.section===chosenSection.value\)\)/)],
['all measures retain original indexes',()=>assert.match(vue,/mapVisibleMeasures=computed\(\(\)=>project.value.bars.flatMap\(\(bar,index\)=>\{[\s\S]*?return section\?\.collapsed&&index!==section.start\?\[\]:\[\{bar,index\}\]/)],
['all map rows use selected group',()=>assert.match(vue,/instrumentsForGroup\(project.value,selectedInstrumentGroup.value,overviewInstruments.value\)/)],
['A B C settings reachable from every filter',()=>assert.match(vue,/<details class="control-fold orchestration-song-part-settings"/)],
['mobile membership controls',()=>assert.match(css,/@media\(max-width:520px\)\{\.orchestration-group-checks/)],
['version',()=>assert.equal(require('../package.json').version,require('../package-lock.json').version)]
];for(const [name,fn] of checks){fn();console.log('PASS',name)}console.log(checks.length,'instrumental section group checks passed');
