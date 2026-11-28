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

const timed=(id,pitch,start,end,hand)=>({id,pitch,start,end,hand});
const lookahead=b.planSustainedBellows(synthetic,[timed('hold',62,0,3),timed('later',61,1,2)]);
assert.deepEqual(lookahead.map(d=>d.direction),['push','push','push']);
assert.ok(lookahead.every(d=>d.buttons[0].id==='c'));
const conflict=b.planSustainedBellows(synthetic,[timed('bass',40,0,3),timed('treble',61,1,2)]);
assert.ok(conflict.every(d=>d.direction===null));
const release=b.planSustainedBellows(synthetic,[timed('bass',40,0,1),timed('treble',61,1,2)]);
assert.deepEqual(release.map(d=>d.direction),['pull','push']);
assert.ok(b.planSustainedBellows(synthetic,[timed('a',62,0,2),timed('b',62,1,3)]).every(d=>d.direction===null));
const playback=load('src/arrangementPlayback.ts');
const notes=[{pitch:62,start:0,duration:3,gate:1},{pitch:61,start:1,duration:1,gate:1}];
const plan=playback.bandoneonPlaybackPlan(restored,'Bandoneon I',notes);
assert.equal(plan.assignments.get(notes[0]).direction,'push');
assert.equal(plan.assignments.get(notes[1]).button.id,'b');
assert.equal(playback.bandoneonPlaybackPlan({},'Bandoneon I',notes).assignments.size,0);
console.log('PASS sustained bellows lookahead, held buttons, release boundaries and playback mapping');

assert.ok(b.planSustainedBellows(synthetic,[{...timed('hold',62,0,3),direction:'pull'},timed('later',61,1,2)]).every(d=>d.direction===null));
assert.ok(b.planSustainedBellows(synthetic,[{...timed('hold',62,0,3),buttonId:'b'}]).every(d=>d.direction===null));
const marked=[{pitch:62,start:0,duration:1,gate:1,bellowsDirection:'push',bandoneonButtonId:'c'}];
assert.equal(playback.bandoneonPlaybackPlan(restored,'Bandoneon I',marked).assignments.get(marked[0]).direction,'push');
console.log('PASS explicit bellows and button constraints');

assert.deepEqual(playback.bellowsGuideMarks(release),[{beat:0,direction:'pull',reversal:false},{beat:1,direction:'push',reversal:true}]);
assert.deepEqual(playback.bellowsGuideMarks(conflict),[]);
assert.deepEqual(playback.bellowsGuideMarks(lookahead),[{beat:0,direction:'push',reversal:false}]);
console.log('PASS derived direction and reversal guide marks');

const capacity=b.simulateBellowsCapacity(lookahead,1,{capacitySeconds:4,initialExtension:.5});
assert.equal(capacity[0].extensionEnd,.25);
assert.equal(capacity[1].extensionEnd,0);
assert.equal(capacity[1].capacityExceeded,true);
const refill=b.simulateBellowsCapacity(release,1,{capacitySeconds:4,initialExtension:.5});
assert.equal(refill[0].extensionEnd,.75);
assert.equal(refill[1].extensionEnd,.5);
assert.throws(()=>formats.validateBandoneonLayout({...custom,bellowsCapacity:{capacitySeconds:0,initialExtension:.5}}),/capacity/);
console.log('PASS estimated capacity, direction, polyphony and calibration validation');

const capacityAware=b.planCapacityAwareBellows(synthetic,[timed('flexible',62,0,2),timed('forced',40,2,4)],1,{capacitySeconds:4,initialExtension:.5});
assert.deepEqual(capacityAware.map(f=>f.direction),['push','pull']);
assert.ok(capacityAware.every(f=>!f.capacityExceeded));
const forcedCapacity=b.planCapacityAwareBellows(synthetic,[{...timed('flexible',62,0,2),direction:'pull'},timed('forced',40,2,4)],1,{capacitySeconds:4,initialExtension:.5});
assert.deepEqual(forcedCapacity.map(f=>f.direction),['pull','pull']);
assert.equal(forcedCapacity[1].capacityExceeded,true);
const impossibleCapacity=b.planCapacityAwareBellows(synthetic,[timed('bass',40,0,3),timed('treble',61,1,2)],1);
assert.ok(impossibleCapacity.every(f=>f.direction===null));
console.log('PASS capacity lookahead preserves explicit markings and physical conflicts');
