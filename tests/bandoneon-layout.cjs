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

console.log('PASS physical keyboard and shared direction assignment');

const load=createDomainLoader();
const formats=load('src/bandoneonLayoutFormat.ts'),models=load('src/bandoneon.ts');
const factorySpecs={
 'rheinische-142':[[33,38],[5,7,6,7,8],[4,5,6,7,8,8]],
 'rheinische-152-gutjahr':[[37,39],[6,7,7,8,9],[4,5,6,7,8,9]],
 'einheits-144':[[35,37],[5,7,7,8,8],[6,7,7,8,9]],
 'peguri-146':[[33,40],[5,7,6,7,8],[4,5,6,8,8,9]]
};
assert.deepEqual(b.PHYSICAL_LAYOUTS.map(l=>l.model),Object.keys(factorySpecs));
for(const [id,[counts,leftRows,rightRows]] of Object.entries(factorySpecs)){
 const layout=b.physicalBandoneonLayout(id);
 assert.equal(layout.verified,true,id);
 assert.match(layout.source,/^https:\/\//);
 assert.equal(new Set(layout.buttons.map(n=>n.id)).size,counts[0]+counts[1]);
 for(const [index,hand] of ['left','right'].entries()){
  const buttons=layout.buttons.filter(button=>button.hand===hand);
  assert.equal(buttons.length,counts[index],id+':'+hand);
  const rows=index===0?leftRows:rightRows;
  for(const [y,count] of rows.entries())assert.equal(buttons.filter(button=>button.y===y).length,count,id+':'+hand+' row '+y);
  assert.equal(new Set(buttons.map(n=>n.x+':'+n.y)).size,buttons.length,'no coincident buttons within a hand');
  assert.deepEqual(models.bandoneonProfile(id)[hand],formats.layoutPitchSet(layout,hand));
 }
}
function pair(model,id){
 const button=b.physicalBandoneonLayout(model).buttons.find(button=>button.id===id);
 return [button.pull,button.push];
}
assert.deepEqual(pair('rheinische-142','left:5/0'),[38,40],'D2/E2 differ across directions');
assert.deepEqual(pair('rheinische-142','right:15'),[95,93],'142 rightmost top register runs to B6 on pull');
assert.deepEqual(pair('rheinische-152-gutjahr','left:ext-1'),[35,39],'Gutjahr underlined H is B1, not B2');
assert.deepEqual(pair('rheinische-152-gutjahr','left:ext-2'),[70,69]);
assert.deepEqual(pair('rheinische-152-gutjahr','left:ext-3'),[37,36]);
assert.deepEqual(pair('rheinische-152-gutjahr','left:ext-4'),[71,70]);
assert.deepEqual(pair('rheinische-152-gutjahr','right:ext-1'),[56,56]);
assert.deepEqual(pair('einheits-144','left:r1c2'),[70,66]);
assert.deepEqual(pair('einheits-144','left:r5c1'),[37,37]);
assert.deepEqual(pair('einheits-144','right:r1c6'),[93,91]);
assert.ok(!models.isBandoneonPitchPlayable(92,'einheits-144','right'),'no G-sharp 6 on this 144 chart');
assert.ok(b.physicalBandoneonLayout('peguri-146').buttons.every(button=>button.pull===button.push));
assert.deepEqual(pair('peguri-146','left:r1c1'),[73,73]);
assert.deepEqual(pair('peguri-146','right:r1c4'),[95,95]);
assert.equal(b.physicalBandoneonLayout('unknown-model'),undefined);
console.log('PASS four source-checked factory keyboards, chart counts, schematic rows, pitch exceptions and directions');

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
assert.ok(playback.bandoneonPlaybackPlan({bpm:120},'Bandoneon I',notes).assignments.size>0,'verified factory chart actively guides playback');
assert.equal(playback.bandoneonPlaybackPlan({},'Piano',notes).assignments.size,0);
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

// A note sounds on two different physical buttons in opposite directions.
// Its pitch cannot be held on the pull button once the bellows reverse.
const reversalButtons=[
 {id:'a',hand:'left',x:0,y:0,pull:38,push:40},
 {id:'b',hand:'left',x:1,y:0,pull:40,push:38},
 {id:'c',hand:'left',x:2,y:0,pull:39,push:37},
 {id:'d',hand:'left',x:3,y:0,pull:41,push:42},
];
const reversalFixture={...custom,id:'reversal',buttons:reversalButtons};
const reversalProject={...project,bpm:120,customBandoneonLayouts:[reversalFixture],customBandoneonParts:{'Bandoneon I':'reversal'}};
const held={pitch:38,start:0,duration:2,gate:1,staffOverride:2};
const pullOnly={pitch:39,start:0,duration:1,gate:1,staffOverride:2};
const pushOnly={pitch:37,start:1,duration:1,gate:1,staffOverride:2,bellowsPressure:1.35};
const reattackNotes=[held,pullOnly,pushOnly];
const reattack=playback.bandoneonPlaybackPlan(reversalProject,'Bandoneon I',reattackNotes);
assert.deepEqual(reattack.decisions.map(f=>f.direction),['pull','push']);
assert.deepEqual(reattack.decisions[1].rearticulated,['0']);
assert.ok(Math.abs(reattack.decisions[0].reversalGap-.05)<1e-7);
assert.deepEqual(reattack.segments.get(held).map(f=>[f.start,f.end,f.button.id,!!f.quickRelease]),[[0,.95,'a',true],[1,2,'b',false]]);
assert.equal(reattack.segments.get(pullOnly)[0].end,.95,'all reeds must release before change of direction');
assert.ok(reattack.decisions[1].pressure>reattack.decisions[0].pressure,'explicit pressure informs travel demand');
assert.deepEqual(playback.bellowsGuideMarks(reattack.decisions),[{beat:0,direction:'pull',reversal:false},{beat:1,direction:'push',reversal:true,rearticulated:true}]);
const pinned={...held,bandoneonButtonId:'a'};
assert.ok(playback.bandoneonPlaybackPlan(reversalProject,'Bandoneon I',[pinned,pullOnly,pushOnly]).decisions.every(f=>f.direction===null),'forced button cannot change under a held note');
const gliding={...held,slideTo:40};
assert.ok(playback.bandoneonPlaybackPlan(reversalProject,'Bandoneon I',[gliding,pullOnly,pushOnly]).decisions.every(f=>f.direction===null),'continuous gesture is not silently restarted');
const shortPull={...pullOnly,duration:.04};
const shortPush={...pushOnly,start:.04};
assert.ok(playback.bandoneonPlaybackPlan(reversalProject,'Bandoneon I',[held,shortPull,shortPush]).decisions.every(f=>f.direction===null),'no abrupt reversal faster than release gap and reed attack');
const loop=load('src/measureLoop.ts');
const controls=loop.measureLoopEvents([{...pushOnly,bellowsDirection:'push',bellowsShake:8}],0,4,120,0,[],'Bandoneon I',{...reversalProject,beats:4,bars:[]})[0];
assert.deepEqual([controls.bandoneonDirection,controls.bandoneonPressure,controls.bellowsShake],['push',1.35,8]);
console.log('PASS released/rearticulated held reeds keep pitch; tight or pinned reversals stay conflicts');

const factoryHold={pitch:38,start:0,duration:2,gate:1,staffOverride:2};
const factoryReversal=playback.bandoneonPlaybackPlan({bpm:120},'Bandoneon I',[factoryHold,{...factoryHold,pitch:36,duration:1},{...factoryHold,pitch:37,start:1,duration:1}]);
assert.deepEqual(factoryReversal.segments.get(factoryHold).map(segment=>[segment.direction,segment.button.id]),[['pull','left:5/0'],['push','left:1/1']]);
assert.deepEqual(factoryReversal.decisions[1].rearticulated,['0'],'do not claim the pull button can be held on a 142 when it would sound E2');
console.log('PASS real Rheinische 142 bass reversal preserves D2 by moving to the other button');
