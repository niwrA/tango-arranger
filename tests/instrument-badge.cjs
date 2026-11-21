const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('typescript');
const source=fs.readFileSync(path.join(__dirname,'../src/instrumentBadge.ts'),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};
vm.runInNewContext(compiled,{exports:mod.exports,module:mod},{filename:'instrumentBadge.js'});
const {instrumentBadgeIdentity:badge,INSTRUMENT_BADGE_ICONS:icons}=mod.exports;
let checks=0;
function check(name,fn){fn();checks++;console.log('PASS '+name);}
check('each supported instrument family has a distinct vector icon',()=>{
 const families=['Piano','Contrabass','Violin','Bandoneon','Voice','Guitar','Clarinet','Flute','Trumpet','Trombone'];
 assert.deepEqual(Object.keys(icons).sort(),families.sort());
 assert.equal(new Set(families.map(family=>badge(family,[family]).icon.outline)).size,families.length);
 for(const family of families){assert.equal(badge(family,[family]).family,family);assert.ok(badge(family,[family]).icon.outline.startsWith('M'));}
});
check('part numerals are retained independently of roster order and visible filtering',()=>{
 const roster=['Voice','Violin I','Bandoneon II','Voice II','Violin III','Violin XI'];
 for(const ordered of [roster,[...roster].reverse()]){
  assert.equal(badge('Voice',ordered).number,1);
  assert.equal(badge('Voice II',ordered).number,2);
  assert.equal(badge('Violin I',ordered).number,1);
  assert.equal(badge('Violin III',ordered).number,3);
  assert.equal(badge('Violin XI',ordered).number,11);
 }
 assert.equal(badge('Violin III',['Violin III']).number,3);
 assert.equal(badge('Bandoneon II',['Bandoneon II']).number,2);
 assert.equal(badge('Piano',['Piano']).number,null);
});
check('colliding or nonstandard imported identities get unique stable numbers',()=>{
 const roster=['Voice II','Voice I','Voice','Voice Alt'];
 const numbers=roster.map(part=>badge(part,roster).number);
 assert.equal(new Set(numbers).size,roster.length);
 for(const part of roster)assert.equal(badge(part,roster).number,badge(part,[...roster].reverse()).number);
 assert.equal(badge('Voice',roster).number,1);
 assert.equal(badge('Voice II',roster).number,2);
});
check('unknown instruments use a neutral fallback without throwing',()=>{
 for(const part of ['Unknown','Voiceover','']){
  const result=badge(part,[part]);assert.equal(result.family,null);assert.equal(result.number,null);assert.ok(result.icon.outline);
 }
});
console.log(checks+' instrument badge checks passed');
