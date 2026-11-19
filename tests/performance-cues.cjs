const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'src/performanceCues.ts'),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const mod={exports:{}};vm.runInNewContext(`(function(module,exports){${js}\n})`,{})(mod,mod.exports);
const split=mod.exports.splitAtMeasureBoundaries;
let count=0;function check(name,fn){fn();count++;console.log('PASS',name);}
check('one note crossing a bar boundary is sliced without shortening',()=>{
 const n={start:3.5,duration:1.25,pitch:60};
 const output=split([n],4,0,8);
 assert.equal(output.length,2);
 assert.deepEqual(output.map(s=>[s.start,s.duration,s.continued,s.continues]),[[3.5,0.5,false,true],[4,0.75,true,false]]);
 assert.equal(output[0].note,n);assert.equal(n.duration,1.25);
});
check('visible window clips a spanning note and preserves continuation',()=>{
 const output=split([{start:1,duration:12}],4,4,4);
 assert.equal(output.length,1);
 assert.deepEqual([output[0].start,output[0].duration,output[0].continued,output[0].continues],[4,4,true,true]);
});
check('note exactly at measure boundary remains in its own bar',()=>{
 const output=split([{start:4,duration:2}],4,0,12);
 assert.equal(output.length,1);assert.equal(output[0].start,4);assert.equal(output[0].duration,2);
});
check('out of window and invalid notes are ignored',()=>{
 const output=split([{start:10,duration:2},{start:0,duration:-1},{start:1,duration:1}],4,0,4);
 assert.equal(output.length,1);assert.equal(output[0].start,1);
 assert.equal(split([{start:0,duration:2}],0,0,4).length,0);
});
const app=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
check('difficulty edition controls live in the instrument context only',()=>{
 assert.doesNotMatch(app,/class="orchestration-editions-bar"/);
 assert.match(app,/class="instrument-context-edition-actions"/);
 assert.match(app,/regenerateCurrentEdition\(instrumentContext!\)/);
 assert.match(app,/exportDifficultyEditionPack\(\);closeInstrumentContext/);
});
check('performance exposes ensemble, karaoke, harmony and split note slices',()=>{
 for(const needle of ["performanceView==='ensemble'","performanceVocalCue.count","performanceHarmony.upcomingKey","performanceCueParts","performanceRoll.slices","splitAtMeasureBoundaries(notes,beats,first,length)"])
  assert.ok(app.includes(needle),needle);
});
console.log(count+' performance cue checks passed');
