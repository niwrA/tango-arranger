const assert=require('node:assert/strict');
const {assessTimedMidi,normalizeMidiTargets,recordMidiPracticeKey}=require('./load-domain.cjs').createDomainLoader()('src/timedMidiPractice.ts');
const targets=normalizeMidiTargets([
 {pitch:64,beat:0,duration:.5},
 {pitch:60,beat:0,duration:2},
 {pitch:60,beat:0,duration:1},
 {pitch:60,beat:.75,duration:1},
 {pitch:60,beat:1.5,duration:.5}
]);
assert.deepEqual(targets.map(n=>[n.pitch,n.beat,n.duration]),[[60,0,.75],[64,0,.5],[60,.75,.75],[60,1.5,.5]]);
const held=new Map(), played=[];
function key(kind,pitch,time,channel=0){recordMidiPracticeKey(played,held,{kind,pitch,time,channel});}
key('on',60,1170); key('on',64,1000,1); key('off',64,1250,1);
key('on',60,1385);key('off',60,1400);key('off',60,1710);
key('on',60,1750);key('off',60,2000);
key('on',67,1800);
assert.deepEqual(played.filter(n=>n.pitch===60).map(n=>n.end-n.start),[215,325,250]);
assert.deepEqual(assessTimedMidi(targets,played,1000,500,2200),{matched:4,missed:0,extra:1,meanOnsetMs:45,meanDurationMs:53});
const repeated=normalizeMidiTargets([{pitch:60,beat:0,duration:.4},{pitch:60,beat:.6,duration:.4}]);
assert.equal(assessTimedMidi(repeated,[{pitch:60,start:780,end:990},{pitch:60,start:1190,end:1400}],1000,500,2000).matched,2);
console.log('PASS polyphonic MIDI targets, repeated pitches and timestamped take feedback');
