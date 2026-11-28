const assert=require('node:assert/strict');
const {createDomainLoader}=require('./load-domain.cjs');
const load=createDomainLoader({globals:{DOMParser:require('@xmldom/xmldom').DOMParser}});
const {parseMusicXmlDetailed}=load('src/musicXmlImport.ts');
const {blankProject}=load('src/music.ts');
const {exportMusicXml,exportCompressedMusicXml,exportMuseScoreMscz,validateMusicXmlDurations}=load('src/io.ts');
const JSZip=require('jszip');
const inst='Bandoneon I';
const project=blankProject({title:'Bellows engraving fixture',measures:2,beats:4,bpm:100});
project.instruments=[inst,'Piano'];
project.bandoneonGrandStaff={[inst]:true};
project.customBandoneonLayouts=[{schemaVersion:1,id:'test-rhe',name:'Test bisonoric layout',source:'Synthetic fixture',buttons:[
 {id:'L1',hand:'left',x:0,y:0,pull:36,push:37},
 {id:'R1',hand:'right',x:0,y:0,pull:72,push:73},
]}];
project.customBandoneonParts={[inst]:'test-rhe'};
project.transposeSemitones=2;
const note=(pitch,start,duration=1,extra={})=>({pitch,start,duration,velocity:80,gate:1,...extra});
const score={
 [inst]:[note(34,0),note(70,0),note(35,1.5),note(71,1.5),note(35,4,1)],
 Piano:[note(58,0),note(62,1.5)],
};
const snapshot=JSON.stringify({project,score});
const xml=exportMusicXml(project,score);
assert.match(xml,/<words>\[Pull\]<\/words><\/direction-type><staff>1<\/staff>/);
assert.match(xml,/<words>\[Push\]<\/words><\/direction-type><offset>720<\/offset><staff>1<\/staff>/);
assert.equal((xml.match(/\[(?:Push|Pull)\]/g)||[]).length,2,'one marker per change, never per note or staff');
assert.doesNotMatch(xml,/tango-bellows:/,'inferences are only printable words, not permanent note attributes');
assert.deepEqual(validateMusicXmlDurations(xml,4,2),[]);
assert.equal(JSON.stringify({project,score}),snapshot);
assert.doesNotMatch(exportMusicXml(project,score,{onlyInstrument:'Piano'}),/\[(?:Push|Pull)\]/);
const explicit={[inst]:[note(34,0,1,{bellowsDirection:'pull',bandoneonButtonId:'L1',bellowsPressure:1.35,bellowsShake:8}),note(35,1.5)]};
const authored=exportMusicXml(project,explicit,{onlyInstrument:inst});
assert.match(authored,/<words>Pull \(open\) · Button L1<\/words>/);
assert.match(authored,/<other-technical print-object="no">tango-bellows:pull<\/other-technical>/);
assert.match(authored,/<other-technical print-object="no">tango-button:L1<\/other-technical>/);
assert.doesNotMatch(authored,/\[Pull\]/,'identical explicit directions do not get a redundant automatic label');
assert.match(authored,/\[Push\]/);
const reimported=parseMusicXmlDetailed(authored).parts[0].notes;
assert.deepEqual(reimported.map(n=>[n.bellowsDirection,n.bandoneonButtonId,n.bellowsPressure,n.bellowsShake]),[['pull','L1',1.35,8],[undefined,undefined,undefined,undefined]],'only authored metadata survives MusicXML reimport');
const withoutGuide=exportMusicXml(project,explicit,{onlyInstrument:inst,automaticBellows:false});
assert.match(withoutGuide,/Pull \(open\)/);
assert.doesNotMatch(withoutGuide,/\[Push\]/);
const clipped=exportMusicXml(project,score,{onlyInstrument:inst,bellowsFirstVisibleMeasure:2});
assert.match(clipped,/<measure implicit="no" number="2">.*?<words>\[Push\]<\/words><\/direction-type><staff>1<\/staff>/);
const impossible=exportMusicXml(project,{[inst]:[note(34,0),note(71,0)]},{onlyInstrument:inst});
assert.doesNotMatch(impossible,/\[(?:Push|Pull)\]/,'no direction assigned to an impossible chord');
const pickupProject={...project,bars:[{...project.bars[0],pickupBeats:2},project.bars[1]]};
const pickupXml=exportMusicXml(pickupProject,{[inst]:[note(34,2.5)]},{onlyInstrument:inst});
assert.match(pickupXml,/<measure implicit="yes" number="0">.*?<words>\[Pull\]<\/words><\/direction-type><offset>240<\/offset>/);
assert.deepEqual(validateMusicXmlDurations(pickupXml,4,1,2),[]);
console.log('PASS bellows guidance on concert pitches, shared staves, beat offsets, selected ranges and pickups');
(async()=>{
 const archive=await exportCompressedMusicXml(project,score);
 const mxl=await JSZip.loadAsync(await archive.arrayBuffer());
 assert.equal(await mxl.file('score.musicxml').async('string'),xml);
 const native=await exportMuseScoreMscz(project,score,inst);
 const mscz=await JSZip.loadAsync(await native.arrayBuffer());
 const mscx=await mscz.file('score.mscx').async('string');
 assert.match(mscx,/<tick>0<\/tick><StaffText><text>\[Pull\]<\/text><\/StaffText>/);
 assert.match(mscx,/<tick>720<\/tick><StaffText><text>\[Push\]<\/text><\/StaffText>/);
 assert.equal((mscx.match(/\[(?:Push|Pull)\]/g)||[]).length,2);
 console.log('PASS compressed MusicXML and native MSCZ include bracketed bellows advice');
})().catch(error=>{console.error(error);process.exitCode=1;});
if(process.env.BELLOWS_BROWSER_FIXTURE){
 require('node:fs').writeFileSync(process.env.BELLOWS_BROWSER_FIXTURE,JSON.stringify({...project,generatedScore:score}));
}
