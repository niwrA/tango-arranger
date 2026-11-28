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

const load=createDomainLoader();
const formats=load('src/bandoneonLayoutFormat.ts'),models=load('src/bandoneon.ts');
const custom={schemaVersion:1,id:'fixture',name:'Custom',source:'test',buttons:synthetic.buttons};
const project={customBandoneonLayouts:[custom],customBandoneonParts:{'Bandoneon I':'fixture'}};
formats.validateProjectBandoneonLayouts(project);
const restored=JSON.parse(JSON.stringify(project));
formats.validateProjectBandoneonLayouts(restored);
assert.deepEqual(models.physicalBandoneonLayoutForPart(restored,'Bandoneon I').buttons,synthetic.buttons);
const profile=models.bandoneonProfileForPart(restored,'Bandoneon I');
assert.deepEqual(profile.range,[40,62]);
assert.equal(models.bandoneonHandForPitch(41,profile),'left');
assert.equal(models.bandoneonHandForPitch(61,profile),'right');
assert.equal(models.isBandoneonPitchPlayable(42,profile),false);
assert.equal(models.bandoneonProfileForPart(restored,'Bandoneon II').id,'rheinische-142');
assert.throws(()=>formats.validateProjectBandoneonLayouts({...restored,customBandoneonParts:{'Bandoneon I':'missing'}}),/selection/);
assert.throws(()=>formats.validateProjectBandoneonLayouts({...restored,customBandoneonLayouts:[custom,custom]}),/Duplicate/);
assert.throws(()=>formats.validateBandoneonLayout({...custom,buttons:[synthetic.buttons[0],synthetic.buttons[0]]}),/Duplicate/);
console.log('PASS custom layout round trip, profile, hand resolution and validation');

assert.deepEqual(formats.snappedButtonPosition(synthetic.buttons,'a',.37,-.13),{x:.25,y:-.25});
assert.equal(formats.snappedButtonPosition(synthetic.buttons,'b',1.03,0),undefined,'same hand collision');
assert.deepEqual(formats.snappedButtonPosition(synthetic.buttons,'a',1,0),{x:1,y:0},'other hand independent');
assert.deepEqual(formats.snappedButtonPosition(synthetic.buttons,'a',120,-110),{x:100,y:-100});
assert.equal(formats.snappedButtonPosition(synthetic.buttons,'a',NaN,0),undefined);
console.log('PASS editor snapping, coordinate limits and occupied positions');
