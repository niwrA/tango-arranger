const assert=require('node:assert/strict');
const {createDomainLoader}=require('./load-domain.cjs');
const b=createDomainLoader()('src/bandoneonLayout.ts');
const l=b.physicalBandoneonLayout('rheinische-142');
assert.equal(l.buttons.length,71);
assert.equal(l.buttons.filter(x=>x.hand==='left').length,33);
assert.equal(l.buttons.filter(x=>x.hand==='right').length,38);
assert.equal(new Set(l.buttons.map(x=>x.id)).size,71);
assert.ok(l.buttons.some(x=>x.pull!==x.push));
assert.ok(l.buttons.every(x=>Number.isInteger(x.pull)&&Number.isInteger(x.push)));
const synthetic={model:'peguri-146',source:'test fixture only',buttons:[
 {id:'a',hand:'left',x:0,y:0,pull:40,push:41},
 {id:'b',hand:'right',x:0,y:0,pull:60,push:61},
 {id:'c',hand:'right',x:1,y:0,pull:62,push:62}
]};
assert.deepEqual(b.feasibleBellowsDirections(synthetic,[{pitch:40},{pitch:60}]),['pull']);
assert.deepEqual(b.feasibleBellowsDirections(synthetic,[{pitch:40},{pitch:61}]),[]);
assert.deepEqual(b.feasibleBellowsDirections(synthetic,[{pitch:62},{pitch:62}]),[]);
assert.deepEqual(b.feasibleBellowsDirections(synthetic,[{pitch:62}]),['pull','push']);
assert.deepEqual(b.planBellows(synthetic,[{start:0,end:1,targets:[{pitch:61}]},{start:1,end:2,targets:[{pitch:62}]},{start:2,end:3,targets:[{pitch:40},{pitch:61}]}]).map(x=>x.direction),['push','push',null]);
assert.equal(b.physicalBandoneonLayout('peguri-146'),undefined,'no fabricated physical layouts');
console.log('PASS physical keyboard and shared direction assignment');
