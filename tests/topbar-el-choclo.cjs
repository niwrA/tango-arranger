const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const cp=require('node:child_process');
let ts;try{ts=require('typescript')}catch{ts=require(path.join(cp.execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim(),'typescript'));}
const root=path.resolve(__dirname,'..');
const app=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
const css=fs.readFileSync(path.join(root,'src/style.css'),'utf8');
const icon=fs.readFileSync(path.join(root,'src/AppIcon.vue'),'utf8');
const source=JSON.parse(fs.readFileSync(path.join(root,'src/presets/el-choclo-source.json'),'utf8'));
let passes=0;
function check(label,fn){fn();passes++;console.log('PASS',label)}
function load(file,imports={}){
  const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const mod={exports:{}};
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`,{console,Date,Math,JSON,Array,Map,Set,Number,Error,Blob,URL,setTimeout},{filename:file})((name)=>{
    if(name in imports)return imports[name];
    if(name==='jszip')return class JSZip{};
    if(name==='@tonejs/midi')return {Midi:class Midi{}};
    throw Error('Unexpected import '+name);
  },mod,mod.exports);
  return mod.exports;
}
const music=load('src/music.ts');
const preset=load('src/presets/el-choclo.ts',{'./el-choclo-source.json':{default:source},'../music':music});
const io=load('src/io.ts',{'./tempoExpressions':load('src/tempoExpressions.ts'),'./music':music});
const p=preset.createElChocloStudy();
check('header playback precedes song picker',()=>assert.ok(app.indexOf('topbar-playback')<app.indexOf('header-song-picker')));
check('song actions follow selector',()=>{const header=app.split('<header class="app-topbar">')[1].split('</header>')[0];assert.ok(header.indexOf('header-song-picker')<header.indexOf('aria-label="New blank song"'));assert.ok(header.indexOf('aria-label="New blank song"')<header.indexOf('aria-label="Save song now"'));assert.ok(header.indexOf('aria-label="Save song now"')<header.indexOf('song-menu'));});
check('generate button in header',()=>{const header=app.split('<header class="app-topbar">')[1].split('</header>')[0];assert.match(header,/class="primary icon-action generate-action"[^>]*@click="regenerate"/);assert.doesNotMatch(app,/<div v-if="active!=='about'" class="page-title">/)});
check('topic menus replace generic overflow',()=>{assert.match(app,/class="topbar-menu song-menu"/);assert.match(app,/class="topbar-menu files-menu"/);assert.match(app,/class="topbar-menu playback-menu"/);assert.match(app,/class="secondary icon-action help-icon-toggle"/);assert.doesNotMatch(app,/class="header-more"/)});
check('import/export grouped under files',()=>{const group=app.split('topbar-files"')[1].split('topbar-options"')[0];for(const x of ['importDialogOpen=true','exportXml','saveProject(project)'])assert.ok(group.includes(x),x)});
check('song settings gear still opens dialog',()=>assert.match(app,/aria-controls="song-settings-modal"[^>]*@click="projectDrawerOpen=!projectDrawerOpen"/));
check('responsive compact toolbar styles',()=>assert.match(css,/\.topbar-song\{order:2;flex:1 1 240px/));
check('consistent SVG topic icons',()=>{for(const name of ['folder-open','volume-2','chevron-down','sliders-horizontal'])assert.ok(icon.includes("'"+name+"':"),name)});
check('topic menus close on action, escape and outside click',()=>{for(const name of ['onTopbarMenuToggle','closeTopbarMenuOnAction','closeTopbarMenuFromKey','closeOpenTopbarMenusOnOutside'])assert.ok(app.includes('function '+name+'('),name);assert.match(app,/@toggle="onTopbarMenuToggle"/);assert.match(app,/@keydown.esc.stop.prevent="closeTopbarMenuFromKey\(\$event\)"/);assert.match(app,/@click="closeTopbarMenuOnAction\(\$event\)"/)});
check('El Choclo is offered as a new copy in selector',()=>{assert.match(app,/<optgroup label="Example songs">/);assert.match(app,/value="__example_el_choclo__"/);assert.match(app,/await adoptLocalSong\(study\)/)});
check('source is earlier 64-measure two-four transcription',()=>{assert.equal(source.bars.length,64);assert.equal(source.beats,2);assert.deepEqual([...new Set(source.bars.map(b=>b.section))],['A1','B1','A2','B2','C'])});
check('preset pairs 2/4 source measures into 4/4 without losing melody',()=>{assert.equal(p.bars.length,32);assert.equal(p.beats,4);for(let i=0;i<32;i++){const expected=[...source.bars[i*2].melody,...source.bars[i*2+1].melody.map(n=>({...n,start:n.start+2}))];assert.equal(JSON.stringify(p.bars[i].melody),JSON.stringify(expected));}});
check('preset uses modern settings',()=>{assert.equal(p.difficulty,'advanced');assert.equal(p.sectionKeys.A1,'Am');assert.equal(p.sectionKeys.C,'A');assert.equal(p.orchestration.contrabass.C,'habanera');assert.equal(p.pianoFigures.A2,'melody_response');assert.equal(p.melodyDucking.enabled,true);assert.ok(p.expressionRanges.length>0);assert.ok(Object.keys(p.measureDynamics).length>0)});
check('generated score contains all six instrumental parts',()=>{for(const inst of music.INSTRUMENTS.filter(i=>i!=='Voice'))assert.ok(p.generatedScore[inst].length>0,inst)});
check('generated score is deterministic',()=>{const a=preset.createElChocloStudy();for(const inst of music.INSTRUMENTS)assert.equal(JSON.stringify(a.generatedScore[inst]),JSON.stringify(p.generatedScore[inst]))});
check('MusicXML output has complete 4/4 measures',()=>{const xml=io.exportMusicXml(p,p.generatedScore);const errors=Array.from(io.validateMusicXmlDurations(xml,4));assert.equal(errors.length,0,JSON.stringify(errors.slice(0,5)));assert.match(xml,/<score-partwise/)});
check('preset instances do not share editable state',()=>{const other=preset.createElChocloStudy();other.bars[0].chord='Dm';assert.equal(p.bars[0].chord,'Am')});
console.log(`${passes} topbar and El Choclo checks passed`);
