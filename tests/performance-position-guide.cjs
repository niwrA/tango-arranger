const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
function load(file,resolve=()=>({})){
 const code=fs.readFileSync(path.join(root,file),'utf8');
 const js=ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};
 vm.runInNewContext('(function(require,module,exports){'+js+'\n})',{})(resolve,module,module.exports);
 return module.exports;
}
const names=load('src/stageInstrumentName.ts');
const board=load('src/stringFingerboard.ts');
const pos=load('src/stringPositionGuide.ts',spec=>{
 assert.equal(spec,'./stringFingerboard');
 return board;
});
const app=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
const diagram=fs.readFileSync(path.join(root,'src/PerformanceChordDiagram.vue'),'utf8');
let count=0;function check(label,fn){fn();count++;console.log('PASS '+label);}
check('short names drop bracketed part qualifiers but not source roster names',()=>{
 assert.equal(names.stageInstrumentName('Violin I (original part)'),'Violin I');
 assert.equal(names.stageInstrumentName('Violin II [alternate] (from score)'),'Violin II');
 assert.equal(names.stageInstrumentName('Contrabass {source} <old>'),'Contrabass');
 assert.equal(names.stageInstrumentName('Violin (old (original))'),'Violin');
 assert.equal(names.stageInstrumentName('Violin I'),'Violin I');
 assert.equal(names.stageInstrumentName('[demo]'),'Instrument');
});
check('stage-only labels are used in ensemble, notes, vocal and focus modes',()=>{
 assert.ok(app.includes('display:stageInstrumentName(rosterDisplayName(part.inst))'));
 assert.ok(app.includes('stageInstrumentName(rosterDisplayName(performanceVocalCue.instrument))'));
 assert.ok(app.includes('stageInstrumentName(rosterDisplayName(performanceDisplayedPart))'));
 assert.ok(app.includes('<strong>{{stageInstrumentName(rosterDisplayName(part.inst))}}</strong>'));
 assert.ok(app.includes('part.display'));
 assert.ok(app.includes('function renameRosterPart('));
});
check('violin fingering prefers coherent low positions when a single high outlier occurs',()=>{
 const guide=pos.suggestStringMeasurePosition('Violin',[
  {pitch:76,start:0},{pitch:78,start:1},{pitch:79,start:2},{pitch:80,start:3},{pitch:96,start:3.5}
 ]);
 assert.ok(guide);
 assert.equal(guide.position,'I');
 assert.equal(guide.thumb,false);
 assert.equal(guide.fingerings.some(f=>f.pitch===96),false);
 assert.deepEqual(Array.from(pos.positionWindow(guide)),[1,2,3,4,5,6,7,8]);
});
check('violin higher passage provides roman position and mapped string/fingers',()=>{
 const guide=pos.suggestStringMeasurePosition('Violin',[{pitch:84,start:0},{pitch:86,start:1}]);
 assert.ok(guide);
 assert.equal(guide.position,'III');
 assert.equal(guide.anchorMidi,guide.anchorStringMidi+guide.firstFingerOffset);
 assert.ok(guide.fingerings.some(f=>f.openMidi===76));
 assert.ok(guide.fingerings.every(f=>['0','1','2','3','4'].includes(f.finger)));
});
check('bass lower positions use 1-2-4 and never invent a third finger',()=>{
 assert.equal(pos.fingerAtPosition('Contrabass',1,1,false),'1');
 assert.equal(pos.fingerAtPosition('Contrabass',1,2,false),'2');
 assert.equal(pos.fingerAtPosition('Contrabass',1,3,false),'4');
 assert.equal(pos.fingerAtPosition('Contrabass',1,4,false),null);
 const guide=pos.suggestStringMeasurePosition('Contrabass',[{pitch:28},{pitch:29},{pitch:30},{pitch:31}]);
 assert.ok(guide);
 assert.equal(guide.position,'½');
 assert.ok(guide.fingerings.some(f=>f.finger==='4'));
});
check('bass tango accompaniment prefers open strings and first finger without losing coverage',()=>{
 const guide=pos.suggestStringMeasurePosition('Contrabass',[{pitch:28},{pitch:31},{pitch:33},{pitch:36},{pitch:38},{pitch:41},{pitch:31}]);
 assert.ok(guide);
 assert.equal(guide.thumb,false);
 assert.equal(guide.fingerings.length,6);
 assert.ok(guide.fingerings.every(f=>f.finger==='0'||f.finger==='1'));
 assert.equal(guide.fingerings.filter(f=>f.pitch===31).length,1);
 const forced=pos.suggestStringMeasurePosition('Contrabass',[{pitch:31,stringMidi:28},{pitch:32,stringMidi:28}]);
 assert.ok(forced.fingerings.every(f=>f.openMidi===28));
 assert.deepEqual(Array.from(forced.fingerings,f=>f.finger),['1','2']);
});
check('bass higher thumb range uses thumb and 1-2-3',()=>{
 assert.equal(pos.fingerAtPosition('Contrabass',12,12,true),'T');
 assert.equal(pos.fingerAtPosition('Contrabass',12,15,true),'3');
 const guide=pos.suggestStringMeasurePosition('Contrabass',[{pitch:57},{pitch:58},{pitch:59}]);
 assert.ok(guide&&guide.thumb);
 assert.ok(guide.fingerings.some(f=>f.finger==='T'||f.finger==='1'||f.finger==='2'||f.finger==='3'));
});
check('no notes produces no position and impossible notes are not assigned',()=>{
 assert.equal(pos.suggestStringMeasurePosition('Violin',[]),null);
 assert.equal(pos.suggestStringMeasurePosition('Contrabass',[{pitch:10}]),null);
});
check('diagram position labels and finger cells preserve fixed-height cards',()=>{
 assert.ok(diagram.includes('props.positionGuide?positionWindow(props.positionGuide)'));
 assert.ok(diagram.includes('diagram-guided-string-row'));
 assert.ok(diagram.includes('.filter(offset=>offset>0)'), 'open string must not be duplicated as stop zero');
 assert.ok(diagram.includes('diagram-stop-header'), 'the open and stopped positions should be labeled');
 assert.ok(diagram.includes('fingerboardColumns'), 'open and stopped cells should use the same grid geometry');

 assert.ok(diagram.includes('isPlannedStringPitch('));
 assert.ok(diagram.includes('stringAnchorLabel('));
 assert.ok(diagram.includes('diagram-bass-fingerboard'));
 assert.ok(diagram.includes('positionGuide?:StringPositionGuide|null'));
 assert.ok(app.includes(':position-guide="part.positionGuide"'));
 assert.ok(app.includes('height:270px!important;min-height:270px!important;max-height:270px!important'));
});
console.log(count+' performance stage naming/fingering checks passed');

check('performance and capture share compact violin geometry and sounding finger cues',()=>{
 assert.ok(diagram.includes("'--fingerboard-columns':'minmax(0,1.1fr) '"));
 assert.match(diagram,/offsets\.map\(\(n,i\)=>.*Math\.pow\(2,-/);
 assert.match(diagram,/weights\.map\(w=>.*w\.toFixed/);
 assert.ok(diagram.includes('(!props.learn&&isPlayingStringPitch(string.midi,string.midi+offset))'));
 assert.ok(diagram.includes('props.learn||props.focus'));
 assert.ok(app.includes('capture-violin-geometry'));
 assert.ok(app.includes('minmax(44px,'));
});

check('practice position planner preserves a playable hand position and budgets shift time',()=>{
 const guide=require('node:fs').readFileSync(path.join(root,'src/stringPositionGuide.ts'),'utf8');
 assert.ok(guide.includes('planPracticePositions'));
 assert.ok(guide.includes('prior&&fits(prior,note)'));
 assert.ok(guide.includes('practiceShiftDurationMs'));
 assert.ok(diagram.includes('diagram-position-roman'));
 assert.ok(diagram.includes('boardShift'));
});

check('violin practice uses adjacent strings rather than extreme shifts for ordinary string hints',()=>{
 const notes=[76,79,81,83,79,76,78,81].map((pitch,index)=>({pitch,start:index*.5,duration:.5,stringMidi:55}));
 const route=pos.planPracticePositions('Violin',notes);
 assert.ok(route.every(g=>g&&g.position==='I'));
 assert.ok(route.every((g,i)=>g.fingerings[0].pitch===notes[i].pitch));
 assert.ok(route.every(g=>g.fingerings[0].openMidi>=69));
});
check('explicit slide string remains respected',()=>{
 const route=pos.planPracticePositions('Violin',[{pitch:76,stringMidi:62,lockString:true}]);
 assert.equal(route[0].fingerings[0].openMidi,62);
});
check('open string between stopped notes does not force a position reset',()=>{
 const route=pos.planPracticePositions('Violin',[{pitch:86},{pitch:76},{pitch:86}]);
 assert.equal(route[0].position,route[1].position);
 assert.equal(route[1].position,route[2].position);
});
