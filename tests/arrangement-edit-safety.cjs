const assert=require('node:assert/strict');
const load=require('./load-domain.cjs').createDomainLoader();
const {verifyArrangementReshape}=load('src/arrangementEditSafety.ts');
const {blankProject}=load('src/music.ts');
const project=blankProject({sections:1,measuresPerSection:4,beats:4});
const check=(score,range,kind='rhythm')=>verifyArrangementReshape(project,score,['Piano','Violin I'],range,kind);
const note=(start,duration=1,extras={})=>({start,duration,pitch:60,...extras});
assert.doesNotThrow(()=>check({Piano:[note(4)]},[1,1]));
assert.throws(()=>check({Piano:[note(4)],'Violin I':[note(7,2)]},[1,1]),/Violin I, measure 2.*sustained/);
assert.throws(()=>check({Piano:[note(3,2),note(5)]},[1,1]),/sustained/);
assert.throws(()=>check({Piano:[note(7),note(8,1,{xmlTieContinuation:true})]},[1,1]),/tie/);
assert.throws(()=>check({Piano:[note(7),note(8,1,{xmlTieContinuation:true})]},[2,2]),/tie/);
assert.doesNotThrow(()=>check({Piano:[note(7),note(8,1,{xmlTieContinuation:true,xmlStaff:2})]},[1,1]));
assert.throws(()=>check({'Violin I':[note(4,1,{source:'manual'})]},[1,1],'replace'),/manually edited/);
project.protectedBars['Piano:1']=true;
assert.doesNotThrow(()=>check({Piano:[note(7,2)]},[1,1]));
assert.throws(()=>check({Piano:[]},[1,1],'replace'),/protected/);
console.log('PASS bulk replace and reshape guard protected notes, ties and boundary-crossing sustains');

// The Rhythm Designer can still apply directly. Register adaptation is derived display
// data and must never become the written pitches of either the target or other parts.
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const {adaptTransposedScore}=load('src/music.ts');
const {applyRhythmPattern,validateRhythmPattern}=load('src/rhythmEditor.ts');
const app=fs.readFileSync('src/App.vue','utf8');
const written={'Violin I':[{...note(0),pitch:55}],Piano:[note(0)]};
const p={...project,generatedScore:written,importedScore:written,protectedBars:{'Violin I:0':true},
 transposeSemitones:-2,adaptiveTranspose:{enabled:true,chordToneRhythm:false,semitones:-2,
  parts:{'Violin I':{strategy:'whole',octaves:12}}}};
const adapted=adaptTransposedScore(written,p);
assert.equal(adapted['Violin I'][0].pitch,67);
const selectionContext={
 project:{value:p},score:{value:adapted},sourceScore:{value:written},
 rhythmTargets:{value:['Violin I']},rhythmMeasures:{value:[0]},
 rhythmPattern:{value:[{beat:0,duration:1,accent:true}]},rhythmGridStep:.25,
 rhythmMode:{value:'accents'},rhythmOverwrite:{value:true},rhythmProtectedCount:{value:1},
 rhythmFeedback:{value:''},message:{value:''},effectiveRole:()=> 'chords',
 window:{confirm:()=>true},rhythmFollowsStyle:{value:false},applyRhythmPattern,validateRhythmPattern
};
function runHandler(name,context){
 const source=app.match(new RegExp('function '+name+'\\(\\)\\{[\\s\\S]*?\\n}'))?.[0];
 assert.ok(source,name);
 vm.runInNewContext(ts.transpileModule(source,{}).outputText+'\n'+name+'();',context);
}
runHandler('applyRhythmSelection',selectionContext);
assert.equal(selectionContext.project.value.generatedScore['Violin I'][0].pitch,55);
assert.equal(selectionContext.project.value.generatedScore['Violin I'][0].accent,true);
assert.equal(selectionContext.project.value.protectedBars['Violin I:0'],true);
assert.equal(adaptTransposedScore(selectionContext.project.value.generatedScore,p)['Violin I'][0].pitch,67);
const captureContext={...selectionContext,project:{value:p},capturePlaying:{value:false},
 captureBarNumbers:{value:[0]},captureBarRhythm:()=>[{beat:1,duration:1,accent:true}],captureFeedback:{value:''},
 rhythmMode:{value:'rhythm'}};
runHandler('applyCapturedRhythm',captureContext);
assert.equal(captureContext.project.value.generatedScore['Violin I'][0].pitch,55);
assert.equal(captureContext.project.value.generatedScore['Violin I'][0].start,1);
assert.equal(captureContext.project.value.protectedBars['Violin I:0'],true);
console.log('PASS direct and recorded rhythm edits retain original written pitches under register adaptation');
