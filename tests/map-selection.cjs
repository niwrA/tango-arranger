const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const cp=require('node:child_process');
let ts;try{ts=require('typescript')}catch{ts=require(path.join(cp.execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim(),'typescript'));}
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'src/mapSelection.ts'),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const mod={exports:{}};vm.runInNewContext(`(function(module,exports){${code}\n})`,{})(mod,mod.exports);
const select=mod.exports.selectMapMeasure;
let count=0;function test(name,fn){fn();console.log('PASS',name);count++;}
test('first ordinary click anchors a single measure',()=>assert.deepEqual({...select(null,4,80,false)},{anchor:4,start:5,end:5}));
test('Shift+click selects ascending inclusive range',()=>assert.deepEqual({...select(4,11,80,true)},{anchor:4,start:5,end:12}));
test('Shift+click selects descending inclusive range',()=>assert.deepEqual({...select(11,4,80,true)},{anchor:11,start:5,end:12}));
test('Shift+click without anchor starts at clicked measure',()=>assert.deepEqual({...select(null,8,80,true)},{anchor:8,start:9,end:9}));
test('second Shift+click extends from first Shift+click anchor',()=>{const a=select(null,8,80,true);assert.deepEqual({...select(a.anchor,14,80,true)},{anchor:8,start:9,end:15});});
test('new ordinary click resets old anchor',()=>assert.deepEqual({...select(8,2,80,false)},{anchor:2,start:3,end:3}));
test('range clamps to last available measure',()=>assert.deepEqual({...select(3,99,10,true)},{anchor:3,start:4,end:10}));
test('stale anchor after shortening song is clamped',()=>assert.deepEqual({...select(30,1,8,true)},{anchor:7,start:2,end:8}));
test('empty song is rejected',()=>assert.throws(()=>select(null,0,0,false),/at least one measure/));
const app=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
const css=fs.readFileSync(path.join(root,'src/style.css'),'utf8');
test('map cell click, shift+Enter and shift+Space use range handler',()=>{
 assert.match(app,/@click="selectOverviewMapCell\(inst,i,\$event\)"/);
 assert.match(app,/@keydown\.enter\.stop\.prevent="onMapCellEnter\(inst,i,\$event\)"/);
 assert.match(app,/@keydown\.space\.stop\.prevent="selectOverviewMapCell\(inst,i,\$event\)"/);
 assert.match(app,/if\(event\.shiftKey\)selectOverviewMapCell\(inst,i,event\)/);
});
test('measure headings support Shift+click and keyboard selection',()=>{
 assert.match(app,/@click="selectOverviewMeasureHeading\(i,\$event\)"/);
 assert.match(app,/@keydown\.shift\.enter\.stop\.prevent="selectOverviewMeasureHeading\(i,\$event\)"/);
});
test('shift selection retains role controls instead of resetting to endpoint',()=>{
 const match=app.match(/function selectOverviewMapCell\([\s\S]*?\n}/);
 assert.ok(match);assert.match(match[0],/if\(!event\.shiftKey\)focusOverview\(inst,i\)/);
 assert.match(match[0],/overviewStart\.value=selection\.start/);
 assert.match(match[0],/overviewEnd\.value=selection\.end/);
});
test('map highlights selected range and does not apply edits on selection',()=>{
 assert.match(app,/\'range-selected\':overviewInstrument===inst/);
 assert.match(app,/class="map-range-summary" role="status"/);
 assert.match(css,/\.song-cell\.range-selected\{/);
 const handler=app.match(/function selectOverviewMapCell\([\s\S]*?\n}/)[0];
 assert.doesNotMatch(handler,/applyOverviewRange\(/);
});
test('real map click handler updates editor From/To and preserves settings on Shift+click',()=>{
 const handlerSource=app.match(/function selectOverviewMapCell\([\s\S]*?\n}/)?.[0];assert.ok(handlerSource);
 const js=ts.transpileModule(handlerSource,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const mapRangeAnchor={value:null},overviewStart={value:1},overviewEnd={value:1},overviewInstrument={value:'Piano'},overviewFocus={value:0},selectedBar={value:0},chosenSection={value:'A'},overviewNotice={value:''},overviewRole={value:'inherit'};
 const project={value:{bars:Array.from({length:20},(_,i)=>({section:i<10?'A':'B'}))}};
 const context={mapRangeAnchor,overviewStart,overviewEnd,overviewInstrument,overviewFocus,selectedBar,chosenSection,overviewNotice,overviewRole,project,selectMapMeasure:select,
   focusOverview(inst,i){overviewInstrument.value=inst;overviewFocus.value=i;selectedBar.value=i;chosenSection.value=project.value.bars[i].section;overviewRole.value='chords';}};
 const click=vm.runInNewContext(`${js};selectOverviewMapCell`,context);
 click('Violin II',4,{shiftKey:false});
 assert.equal(mapRangeAnchor.value,4);assert.equal(overviewStart.value,5);assert.equal(overviewEnd.value,5);assert.equal(overviewRole.value,'chords');
 overviewRole.value='melody';
 click('Violin II',11,{shiftKey:true});
 assert.equal(overviewStart.value,5);assert.equal(overviewEnd.value,12);assert.equal(overviewRole.value,'melody');assert.equal(chosenSection.value,'B');
 click('Violin II',2,{shiftKey:true});
 assert.equal(overviewStart.value,3);assert.equal(overviewEnd.value,5);assert.equal(mapRangeAnchor.value,4);
});
test('changing songs resets selection anchor',()=>assert.match(app,/mapRangeAnchor\.value=null;/));
console.log(`${count} map range selection checks passed`);
