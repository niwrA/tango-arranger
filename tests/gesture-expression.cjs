const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),cp=require('node:child_process');
let ts;try{ts=require('typescript')}catch{ts=require(path.join(cp.execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim(),'typescript'));}
const root=path.resolve(__dirname,'..');
class TestZip{constructor(){this.files={};}file(name,content){this.files[name]=content;return this;}async generateAsync(){return {files:this.files};}}
function load(file,imports={}){
 const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const mod={exports:{}};
 vm.runInNewContext('(function(require,module,exports){'+code+'\n})',{console,Blob,URL,setTimeout},{filename:file})(
  name=>{if(imports[name])return imports[name];if(name==='jszip')return {default:TestZip};if(name==='@tonejs/midi')return {Midi:class Midi{}};throw Error('Unexpected import '+name);},mod,mod.exports);
 return mod.exports;
}
const gestures=load('src/tangoGestures.ts');
const phrases=load('src/phrasePlan.ts');
const music=load('src/music.ts',{'./tangoGestures':gestures,'./phrasePlan':phrases});
const measure=load('src/measureLoop.ts',{'./music':music,'./tangoGestures':gestures});
const audio=load('src/expressiveAudio.ts');
const editions=load('src/editions.ts',{'./music':music,'./phrasePlan':phrases});
const io=load('src/io.ts',{'./music':music,'./editions':editions,'./tangoGestures':gestures,'./musicXmlImport':{parseMusicXmlDetailed(){throw Error('Not used in export tests');}}});
let count=0;function check(name,fn){fn();count++;console.log('PASS',name);}
const violin={pitch:72,start:0,duration:2,velocity:95};
const range=music.instrumentRange('Violin I');
check('all 13 tango gesture presets construct and validate on a violin',()=>{
 assert.equal(gestures.GESTURE_PRESETS.length,13);
 for(const {value} of gestures.GESTURE_PRESETS){
  const gesture=gestures.createTangoGesture(violin,'Violin I',value,range);
  gestures.validateGesture(violin,'Violin I',gesture,range);
  assert.equal(gesture.points[0].pitch,violin.pitch);
  assert.equal(gesture.points.at(-1).at,1);
 }
});
check('both sirena directions, turnarounds and double-stop motion are distinct',()=>{
 const up=gestures.createTangoGesture(violin,'Violin I','sirena_double_up',range);
 const down=gestures.createTangoGesture(violin,'Violin I','sirena_double_down',range);
 const reverse=gestures.createTangoGesture(violin,'Violin I','sirena_double_rise_fall',range);
 assert.ok(up.points.at(-1).pitch>up.points[0].pitch);
 assert.ok(down.points.at(-1).pitch<down.points[0].pitch);
 assert.equal(reverse.points.length,3);
 assert.equal(reverse.partner.length,3);
 assert.ok(gestures.gestureLabel(reverse).includes('↑↓'));
});
check('invalid pizzicato and impossible double violin reaches are rejected',()=>{
 assert.throws(()=>gestures.createTangoGesture({...violin,technique:'pizzicato'},'Violin I','sirena_single_up',range),/plausible/);
 const tooFar=gestures.createTangoGesture(violin,'Violin I','sirena_double_down',range);
 tooFar.partner[0].pitch=55;
 assert.throws(()=>gestures.validateGesture(violin,'Violin I',tooFar,range),/reachable/);
 assert.throws(()=>gestures.createTangoGesture(violin,'Bandoneon I','sirena_double_up',music.instrumentRange('Bandoneon I')),/plausible/);
});
check('legacy slides remain valid while gesture edits survive project serialization',()=>{
 const p=music.blankProject({sections:1,measuresPerSection:2});
 const score=music.generate(p);
 const n={...violin,gesture:gestures.createTangoGesture(violin,'Violin I','sirena_double_down_tremolo',range)};
 const next=music.replaceInstrumentMeasure(p,score,'Violin I',0,[n]);
 const recovered=JSON.parse(JSON.stringify(next));
 assert.ok(recovered.importedScore['Violin I'][0].gesture.partner.length===2);
 assert.ok(recovered.protectedBars['Violin I:0']);
 assert.throws(()=>music.replaceInstrumentMeasure(p,score,'Violin I',0,[{...n,slideTo:70}]),/either/);
 const legacy={pitch:72,start:0,duration:1,slideTo:74};
 assert.doesNotThrow(()=>music.replaceInstrumentMeasure(p,score,'Violin I',0,[legacy]));
});
check('global transpose carries every gesture pitch including second voice',()=>{
 const g=gestures.createTangoGesture(violin,'Violin I','sirena_double_rise_fall',range);
 const score={'Violin I':[{...violin,gesture:g}]};
 const shifted=music.transposeScore(score,2)['Violin I'][0];
 assert.equal(shifted.pitch,74);
 assert.equal(shifted.gesture.points[0].pitch,74);
 assert.equal(shifted.gesture.partner[0].pitch,g.partner[0].pitch+2);
});
check('measure-loop events include transposed gestures and sounding lengths',()=>{
 const p=music.blankProject({sections:1,measuresPerSection:2});
 const n={...violin,gesture:gestures.createTangoGesture(violin,'Violin I','latigo_up',range)};
 const event=measure.measureLoopEvents([n],0,4,120,1,[],'Violin I',p)[0];
 assert.equal(event.pitch,73);assert.equal(event.gesture.points[0].pitch,73);
 assert.ok(event.durationSeconds>0);
});
check('audio plays double sirenas as two voices with independent pitch ramps',()=>{
 const oscillators=[],ramps=[];
 const ctx={
  currentTime:0,
  destination:{},
  createOscillator(){
   const osc={frequency:{setValueAtTime(){},exponentialRampToValueAtTime(f,t){ramps.push([f,t]);},value:0},connect(){},disconnect(){},start(){},stop(){},type:'triangle'};
   oscillators.push(osc);return osc;
  },
  createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},value:0},connect(){},disconnect(){}};}
 };
 const gesture=gestures.createTangoGesture(violin,'Violin I','sirena_double_down_tremolo',range);
 audio.playExpressiveEvent(ctx,{pitch:72,durationSeconds:1.2,velocity:80,gesture},.2);
 assert.equal(oscillators.length,4); // Two pitch voices plus two tremolo modulators
 assert.ok(ramps.length>=2);
});
(async()=>{
 const p=music.blankProject({sections:1,measuresPerSection:2});p.bars[0].chord='C';
 const score=music.generate(p),g=gestures.createTangoGesture(violin,'Violin I','sirena_double_down',range);
 score['Violin I']=[{...violin,gesture:g}];
 const xml=io.exportMusicXml(p,score);
 assert.match(xml,/sirena ×2 ↓/);
 const xmlPart=xml.match(/<part id="P3">([\s\S]*?)<\/part>/)?.[1]||xml;
 assert.ok(xmlPart.includes('<chord/>'),'Double gesture needs an additional starting pitch');
 const native=await io.exportMuseScoreMscz(p,score,'Violin I');
 const mscx=native.files['score.mscx'];
 assert.match(mscx,/sirena ×2 ↓/);
 assert.ok((mscx.match(/<Note>/g)||[]).length>=2);
 const app=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
 assert.match(app,/performanceGesturePaths=computed/);
 assert.match(app,/note-gesture-mini/);
 assert.match(app,/setSelectedGesturePreset/);
 assert.match(app,/instrumentSkillShort/);
 console.log('PASS score export and editor/performance visual wiring');
 console.log((count+1)+' gesture/expression checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
