const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const cp=require('node:child_process');
let ts;try{ts=require('typescript')}catch{ts=require(path.join(cp.execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim(),'typescript'));}
const root=path.join(__dirname,'..');
function load(file,imports={}){
 const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const mod={exports:{}};vm.runInNewContext(`(function(require,module,exports){${code}\n})`,{console})((name)=>{
  if(name in imports)return imports[name];if(name==='jszip')return class JSZip{};if(name==='@tonejs/midi')return {Midi:class Midi{}};throw Error(name);
 },mod,mod.exports);return mod.exports;
}
const music=load('src/music.ts');const io=load('src/io.ts',{'./tempoExpressions':load('src/tempoExpressions.ts'),'./music':music});
let count=0;function test(name,fn){fn();count++;console.log('PASS',name);}
function project(beats=4){const p=music.blankProject({sections:1,measuresPerSection:2,beats});p.bars[0].chord='Dm,A7';p.bars[1].chord='Dm';p.roles.A.Contrabass='bass';p.instrumentSettings.Contrabass.activity=1;return p;}
const notes=(p,bar=0)=>music.generate(p).Contrabass.filter(n=>n.start>=bar*p.beats&&n.start<(bar+1)*p.beats);
test('all six techniques are available',()=>assert.deepEqual(Array.from(music.BASS_TECHNIQUES),['traditional','pizzicato','arco_legato','marcato','walking','habanera']));
test('legacy projects use traditional bass by default',()=>{const p=project();assert.equal(music.bassTechniqueFor(p,0),'traditional');assert.ok(notes(p).length>0);});
test('section-level pizzicato produces plucked short notes',()=>{const p=project();p.orchestration.contrabass.A='pizzicato';const n=notes(p);assert.deepEqual(Array.from(n.map(x=>x.start)),[0,2]);assert.ok(n.every(x=>x.technique==='pizzicato'&&x.gate===0.32));});
test('arco legato uses longer sustained notes',()=>{const p=project();p.orchestration.contrabass.A='arco_legato';const n=notes(p);assert.deepEqual(Array.from(n.map(x=>x.duration)),[2,2]);assert.ok(n.every(x=>x.technique==='arco'&&x.articulation==='legato'));});
test('marcato creates four accented pulses',()=>{const p=project();p.orchestration.contrabass.A='marcato';const n=notes(p);assert.deepEqual(Array.from(n.map(x=>x.start)),[0,1,2,3]);assert.ok(n.every(x=>x.articulation==='marcato_staccato'&&x.accent));});
test('walking has one note per beat',()=>{const p=project();p.orchestration.contrabass.A='walking';assert.deepEqual(Array.from(notes(p).map(n=>n.start)),[0,1,2,3]);});
test('habanera has syncopated onset and written durations',()=>{const p=project();p.orchestration.contrabass.A='habanera';const n=notes(p);assert.deepEqual(Array.from(n.map(x=>x.start)),[0,0.75,2,3]);assert.deepEqual(Array.from(n.map(x=>x.duration)),[0.75,0.25,1,1]);});
test('2/4 and 3/4 styles never exceed bar boundary',()=>{for(const beats of [2,3])for(const style of music.BASS_TECHNIQUES){const p=project(beats);p.bars[0].chord='Dm';p.orchestration.contrabass.A=style;assert.ok(notes(p).every(n=>n.start+n.duration<=beats+1e-8),`${beats}/${style}`);}});
test('measure override takes precedence over section style',()=>{const p=project();p.orchestration.contrabass.A='walking';p.measureBassTechniques={'Contrabass:0':'arco_legato'};assert.equal(music.bassTechniqueFor(p,0),'arco_legato');assert.equal(music.bassTechniqueFor(p,1),'walking');assert.equal(notes(p,0).length,2);assert.equal(notes(p,1).length,4);});
test('generated bass notes follow the active chord at each beat',()=>{const p=project();p.orchestration.contrabass.A='walking';for(const n of notes(p)){const chord=music.chordAt(p.bars[0].chord,p.beats,n.start);assert.ok(music.chordTones(chord).includes(n.pitch%12));}});
test('protected manually edited bass measure survives regeneration',()=>{let p=project();p.orchestration.contrabass.A='walking';const score=music.generate(p);p=music.replaceInstrumentMeasure(p,score,'Contrabass',0,[{pitch:38,start:0,duration:1,technique:'pizzicato'}]);p.orchestration.contrabass.A='arco_legato';const result=music.mergeScores(p,music.generate(p));assert.equal(result.Contrabass.filter(n=>n.start<4).length,1);assert.equal(result.Contrabass[0].pitch,38);});
test('section resize preserves bass settings and remaps overrides',()=>{const p=project();p.orchestration.contrabass.A='marcato';p.measureBassTechniques={'Contrabass:1':'pizzicato'};const q=music.resizeSections(p,[3]);assert.equal(q.orchestration.contrabass.A,'marcato');assert.equal(q.measureBassTechniques['Contrabass:1'],'pizzicato');});
test('note editor defaults reflect bass playing technique',()=>{const p=project();p.orchestration.contrabass.A='pizzicato';const n=music.suggestedEditorNote(p,'Contrabass',0,0,40);assert.equal(n.technique,'pizzicato');});
test('MusicXML exports pizzicato and arco directions',()=>{const p=project();p.orchestration.contrabass.A='pizzicato';p.measureBassTechniques={'Contrabass:1':'arco_legato'};const xml=io.exportMusicXml(p,music.generate(p));assert.match(xml,/<words>pizz\.<\/words>/);assert.match(xml,/<words>arco<\/words>/);});
test('all bass styles export valid MusicXML rhythmic totals',()=>{for(const style of music.BASS_TECHNIQUES){const p=project();p.orchestration.contrabass.A=style;const xml=io.exportMusicXml(p,music.generate(p));assert.deepEqual(Array.from(io.validateMusicXmlDurations(xml,p.beats)),[],style);}});
test('Song Overview and Orchestration expose bass technique selectors',()=>{const app=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');assert.match(app,/Contrabass playing style/);assert.match(app,/v-model="overviewBassTechnique"/);assert.match(app,/measureBassTechniques\[key\]/);assert.match(app,/bassTechniqueFor\(project.value,i\)/);});
console.log(`Contrabass styles: ${count} checks passed`);
