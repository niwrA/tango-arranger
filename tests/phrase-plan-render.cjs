const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const {parse,compileScript}=require('vue/compiler-sfc');
const {createSSRApp}=require('vue');
const {renderToString}=require('vue/server-renderer');
const {createDomainLoader}=require('./load-domain.cjs');

// Compile the actual Vue component and render it with the real domain graph.
// This catches render-time failures that a domain validator alone cannot see.
const root=path.resolve(__dirname,'..');
const load=createDomainLoader();
const music=load('src/music.ts');
const planning=load('src/phrasePlan.ts');
const source=fs.readFileSync(path.join(root,'src/PhrasePlanEditor.vue'),'utf8');
const parsed=parse(source,{filename:'PhrasePlanEditor.vue'});
assert.deepEqual(parsed.errors,[]);
const script=compileScript(parsed.descriptor,{id:'phrase-plan-render',inlineTemplate:true});
const code=ts.transpileModule(script.content,{compilerOptions:{
 target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS
}}).outputText;
const mod={exports:{}};
vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{filename:'PhrasePlanEditor.vue'})(
 request=>request.startsWith('.')?load('src/'+request.slice(2)+'.ts'):require(request),mod,mod.exports
);
const Component=mod.exports.default;
const clone=value=>JSON.parse(JSON.stringify(value));
const project=music.blankProject({sections:1,measuresPerSection:4});
const plan=planning.createPhrasePlan(project,2);
const malformed=[
 {},
 {...clone(plan),phrases:[null]},
 {...clone(plan),phrases:{}},
 {...clone(plan),phrases:[{...clone(plan.phrases[0]),parts:null},clone(plan.phrases[1])]},
 {...clone(plan),phrases:[{...clone(plan.phrases[0]),parts:{}},clone(plan.phrases[1])]},
 {...clone(plan),phrases:[{...clone(plan.phrases[0]),parts:{...clone(plan.phrases[0].parts),Piano:null}},clone(plan.phrases[1])]}
];
const render=props=>renderToString(createSSRApp(Component,{startOpen:true,...props}));
let checks=0;
async function check(label,test){await test();checks++;console.log('PASS',label);}

(async()=>{
 await check('legacy songs render proposal controls without a phrase plan',async()=>{
  const html=await render({project});
  assert.match(html,/Using section settings/);
  assert.match(html,/>Create proposal<\/button>/);
  assert.ok(!html.includes('role="alert"'));
  assert.ok(!html.includes('Discard draft'));
 });
 await check('malformed imported plans render validation and recovery instead of crashing',async()=>{
  for(const invalid of malformed){
   const html=await render({project:{...project,phrasePlan:invalid}});
   assert.match(html,/Needs rebuilding/);
   assert.match(html,/role="alert"/);
   assert.match(html,/>Create proposal<\/button>/);
   assert.match(html,/>Use section settings<\/button>/);
   assert.ok(!html.includes('class="phrase-table"'));
  }
 });
 await check('invalid and structurally stale drafts remain discardable with Apply disabled',async()=>{
  const stale={...clone(plan),formSignature:'old-form'};
  for(const invalid of [...malformed,stale]){
   const html=await render({project:{...project,phrasePlan:plan},draft:invalid});
   assert.match(html,/role="alert"/);
   assert.match(html,/>Rebuild proposal<\/button>/);
   assert.match(html,/<button[^>]*disabled[^>]*>Apply phrase plan<\/button>/);
   assert.match(html,/>Discard draft<\/button>/);
   assert.ok(!html.includes('class="phrase-table"'));
  }
 });
 await check('valid draft and applied plans retain phrase controls and contextual entry points',async()=>{
  const draft=clone(plan);draft.phrases[0].parts.Piano.activity=.5;
  const html=await render({project,draft});
  assert.match(html,/class="phrase-table"/);
  assert.match(html,/aria-label="Phrase role for Piano"/);
  assert.match(html,/aria-label="More options for 1/);
  assert.match(html,/aria-label="Selected phrase"/);
  assert.match(html,/<button[^>]*class="primary"[^>]*>Apply phrase plan<\/button>/);
  assert.ok(!/<button[^>]*disabled[^>]*>Apply phrase plan<\/button>/.test(html));
  assert.ok(!html.includes('role="alert"'));
  const applied=await render({project:{...project,phrasePlan:plan}});
  assert.match(applied,/>Applied<\/span>/);
  assert.match(applied,/>Edit applied plan<\/button>/);
  assert.match(applied,/class="phrase-table"/);
 });
 console.log(checks+' phrase planner render checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
