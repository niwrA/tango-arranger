import {bandoneonModelForPart,bandoneonProfile,isBandoneonPitchPlayable} from './bandoneon';
import {choosePlayablePianoVoicing,bassTechniqueFor,partStaffForNote,writtenInstrumentPitchPlayable,writtenInstrumentRange,assessPianoPlayability,adaptTransposedScore,projectInstruments,instrumentPitchPlayable,instrumentFamily,chordAt,chordTones,noteSoundingVelocity,noteSoundingDuration,measureDynamicVelocity,melodyDuckingFactor,replaceInstrumentMeasure,type Project,type Score,type Instrument,type Note} from './music';
import {effectiveRole,phraseMeasureMap} from './phrasePlan';
import {orchestraStyle,orchestraPulses,styleForMeasure,phraseStyleKey,styleStrength,isOrchestraStyle} from './orchestraStyle';

export type DiagnosticCategory='pitch'|'harmony'|'dynamics'|'balance'|'playability'|'style';
export type Diagnostic={id:string;category:DiagnosticCategory;severity:'error'|'warning'|'suggestion';instrument:Instrument;measure:number;message:string;noteIndex?:number;voicing?:{indices:number[];pitches:number[]};patch?:Partial<Pick<Note,'velocity'|'gate'|'accent'|'articulation'|'pitch'|'start'>>};
export const dismissedReviewIds=(p:Project):readonly string[]=>Array.isArray(p.dismissedArrangementFindings)?p.dismissedArrangementFindings.filter(id=>typeof id==='string'):[];
export type ReviewScope={from?:number;to?:number;instrument?:Instrument;includeStyle?:boolean;includeStructural?:boolean;showDismissed?:boolean};
const clamp=(n:number)=>Math.max(1,Math.min(127,Math.round(n)));
const median=(values:number[])=>{const sorted=[...values].sort((a,b)=>a-b);return sorted.length?sorted[Math.floor(sorted.length/2)]:80;};
/** Read-only analysis. Balance is a score proxy, not measured acoustic loudness. */
export function diagnoseArrangement(p:Project,score:Score,scope:ReviewScope={}):Diagnostic[]{
 const issues:Diagnostic[]=[],phrases=phraseMeasureMap(p),roster=projectInstruments(p),dismissed=new Set(dismissedReviewIds(p));
 const from=Math.max(0,scope.from??0),to=Math.min(p.bars.length-1,scope.to??p.bars.length-1);
 const add=(instrument:Instrument,measure:number,category:DiagnosticCategory,severity:Diagnostic['severity'],message:string,noteIndex?:number,patch?:Diagnostic['patch'])=>{
  if(measure<from||measure>to||scope.instrument&&scope.instrument!==instrument)return;
  const note=noteIndex===undefined?undefined:score[instrument]?.[noteIndex];
  const id=JSON.stringify([instrument,measure,category,message,note?[note.editId??null,note.pitch,note.start,note.duration,note.velocity??80,note.gate??null,note.articulation??null]:null]);
  if(!scope.showDismissed&&dismissed.has(id))return;
  issues.push({id,instrument,measure,category,severity,message,noteIndex,patch});
 };
 const soundingScore=adaptTransposedScore(score,p),transpose=p.transposeSemitones??0;
 const soundingPitch=(inst:Instrument,i:number,n:Note)=>(soundingScore[inst]?.[i]?.pitch??n.pitch)+transpose;
 const byMeasure=new Map<string,{n:Note;i:number}[]>();
 for(const inst of roster){
  const notes=score[inst]??[];
  if(instrumentFamily(inst)==='Piano')for(const issue of assessPianoPlayability(notes,p,inst,'human'))
   add(inst,issue.measure,'playability','warning',issue.message+' · beat '+(Math.round((issue.beat+1)*100)/100));
  if(instrumentFamily(inst)==='Bandoneon'){
   const model=bandoneonModelForPart(p,inst),layout=bandoneonProfile(model);
   const sounding=soundingScore[inst]??[];
   // Current layouts combine both bellows directions. Check explicit hand
   // availability only; do not claim a simultaneous direction/fingering solution.
   sounding.forEach((n,i)=>{
    const staff=n.staffOverride??n.xmlStaff;
    const hand=staff===1?'right':staff===2?'left':undefined;
    const pitch=n.pitch+transpose;
    if(hand&&!isBandoneonPitchPlayable(pitch,model,hand)&&isBandoneonPitchPlayable(pitch,model))
     add(inst,Math.floor((n.start+1e-7)/p.beats),'playability','warning',layout.label+': pitch unavailable on assigned '+hand+' hand (both bellows directions combined)',i);
   });
  }
  notes.forEach((n,i)=>{
   const bar=Math.floor((n.start+1e-7)/p.beats);if(!p.bars[bar])return;
   const key=inst+':'+bar,list=byMeasure.get(key)??[];list.push({n,i});byMeasure.set(key,list);
   if(!instrumentPitchPlayable(inst,soundingPitch(inst,i,n),p))add(inst,bar,'pitch','error','Pitch outside configured sounding instrument range',i);
  });
 }
 for(let bar=from;bar<=to;bar++){
  const measure=p.bars[bar];if(!measure)continue;
  const phrase=phrases[bar],styleId=styleForMeasure(p,measure.section,phrase?phraseStyleKey(phrase):undefined);
  const style=orchestraStyle(styleId),strength=styleStrength(p);
  const energy:{inst:Instrument;role:string;value:number}[]=[];
  for(const inst of roster){
   const entries=byMeasure.get(inst+':'+bar)??[],role=effectiveRole(p,inst,bar,phrase);
   if(!entries.length)continue;
   const velocities=entries.map(({n})=>n.velocity??80),center=median(velocities);
   let proxy=0;
   for(const {n,i} of entries){
    const local=n.start-bar*p.beats,v=n.velocity??80;
    const chord=chordAt(measure.chord,p.beats,local);
    if(chord.trim()&&n.duration>=1.5&&(role==='chords'||role==='bass')&&!chordTones(chord).includes(((n.pitch%12)+12)%12)){
     const candidate=[n.pitch-1,n.pitch+1,n.pitch-2,n.pitch+2].find(pitch=>chordTones(chord).includes(((pitch%12)+12)%12)&&writtenInstrumentPitchPlayable(inst,pitch,p)&&instrumentPitchPlayable(inst,pitch+transpose,p)&&!entries.some(x=>x.i!==i&&x.n.pitch===pitch&&Math.abs(x.n.start-n.start)<1e-7));
     const safe=scope.includeStructural&&candidate!==undefined&&!n.gesture&&!n.stringGlissando&&!n.pianoGlissando&&!n.slideTo&&!n.approachSlideFrom&&!n.xmlTieContinuation&&!n.pianoPedalBeats&&!['Piano','Bandoneon'].includes(instrumentFamily(inst));
     add(inst,bar,'harmony','suggestion','Sustained accompaniment note outside the current chord; review resolution',i,safe?{pitch:candidate}:undefined);
    }
    const previous=entries.filter(x=>x.n.start<n.start&&n.start-x.n.start<=1.5).sort((a,b)=>b.n.start-a.n.start)[0];
    const following=entries.filter(x=>x.n.start>n.start&&x.n.start-n.start<=1.5).sort((a,b)=>a.n.start-b.n.start)[0];
    if(entries.length>=4&&Math.abs(v-center)>=30&&previous&&following&&Math.abs((previous.n.velocity??80)-(following.n.velocity??80))<=15&&!n.accent&&!n.subito&&!n.swellTo&&!p.measureDynamics?.[inst+':'+bar])
     add(inst,bar,'dynamics','warning','Isolated velocity deviation from measure median',i,{velocity:clamp(center)});
    const family=instrumentFamily(inst);
    const styleApplicable=(family==='Piano'&&!p.pianoFigures?.[measure.section])||(family==='Contrabass'&&bassTechniqueFor(p,bar,inst,phrase)==='traditional')||family==='Bandoneon';
    if(styleApplicable&&scope.includeStyle!==false&&strength>0&&p.beats===4&&isOrchestraStyle(styleId)&&styleId!=='traditional'&&(role==='chords'||role==='bass')&&!n.gesture&&!n.stringGlissando&&!n.pianoGlissando&&!n.bowedTremolo&&!n.swellTo&&!n.subito&&!p.articulation?.overrides?.[inst+':'+bar]&&!phrase?.parts[inst]?.articulation){
     const bass=role==='bass'||instrumentFamily(inst)==='Piano'&&partStaffForNote(n,inst,p.pianoSplitPitch??60)===2;
     const slots=orchestraPulses(styleId,p.beats,bass?'bass':'chords');
     const slot=slots.find(s=>Math.abs(s.beat-local)<.126);
     if(!slot){
      const nearest=[...slots].sort((a,b)=>Math.abs(a.beat-local)-Math.abs(b.beat-local))[0];
      const start=bar*p.beats+nearest.beat;
      const safe=scope.includeStructural&&chordAt(measure.chord,p.beats,nearest.beat)===chord&&Math.abs(start-n.start)<=.5&&start+n.duration<=(bar+1)*p.beats+1e-7&&!n.xmlTieContinuation&&!n.rhythmSource&&!n.slideTo&&!n.approachSlideFrom&&!n.pianoPedalBeats&&entries.every(x=>x.i===i||x.n.start===n.start||x.n.start>=start+n.duration||x.n.start+x.n.duration<=start)&&entries.filter(x=>x.n.start===n.start).length===1;
      add(inst,bar,'style','suggestion','Attack differs from typical style pulse; review rhythm',i,safe?{start}:undefined);
     }
     else {
      const expected=slot.accent?style.accentVelocity:style.plainVelocity;
      const velocity=clamp(v+(expected-v)*strength),gate=(n.gate??.9)+(style.gate-(n.gate??.9))*strength;
      if(Math.abs(velocity-v)>=12||Math.abs(gate-(n.gate??.9))>=.2)
       add(inst,bar,'style','suggestion','Expression differs from selected style heuristic',i,{velocity,gate,accent:slot.accent});
     }
    }
    const sounding=measureDynamicVelocity(p,inst,n.start,noteSoundingVelocity(n))*melodyDuckingFactor(p,inst,n.start);
    proxy+=Math.pow(sounding/127,2)*Math.min(p.beats,Math.max(0,(Number.isFinite(n.gate)&&n.gate!>0&&n.gate!<=1||n.gate===undefined?noteSoundingDuration(n):n.duration)));
   }
   if(scope.includeStructural&&instrumentFamily(inst)==='Piano'&&role==='chords'){
    const split=p.pianoSplitPitch??60,[lo,hi]=writtenInstrumentRange(inst,p),groups=new Map<number,typeof entries>();
    for(const entry of entries)if(partStaffForNote(entry.n,inst,split)===1){
     const key=entry.n.start;groups.set(key,[...(groups.get(key)??[]),entry]);
    }
    for(const [onset,group] of groups){
     if(group.length<2||group.length>3||group.some(({n})=>n.gesture||n.pianoGlissando||n.slideTo!==undefined||n.approachSlideFrom!==undefined||n.xmlTieContinuation||n.pianoPedalBeats))continue;
     const ordered=[...group].sort((a,b)=>a.n.pitch-b.n.pitch),original=ordered.map(x=>x.n.pitch);
     if(new Set(original.map(n=>n%12)).size!==original.length||original.at(-1)!-original[0]<=14)continue;
     const target=original.reduce((a,b)=>a+b,0)/original.length;
     const pitches=choosePlayablePianoVoicing(original,target,p.instrumentSettings?.[inst]?.difficulty??p.difficulty??'advanced',Math.max(split,lo),hi,undefined,onset,p.bpm);
     if(pitches.length!==original.length||pitches.some(pitch=>!original.some(n=>n%12===pitch%12))||pitches.some(pitch=>!instrumentPitchPlayable(inst,pitch+(p.transposeSemitones??0),p)))continue;
     const candidate=(score[inst]??[]).map((n,i)=>{const index=ordered.findIndex(x=>x.i===i);return index<0?n:{...n,pitch:pitches[index]};});
     if(assessPianoPlayability(candidate,p,inst,'human').some(issue=>issue.measure===bar&&Math.abs(issue.beat-(onset-bar*p.beats))<1e-6))continue;
     const count=issues.length;
     add(inst,bar,'playability','suggestion','Compact piano chord voicing retaining all pitch classes',ordered[0].i);
     if(issues.length>count)issues[issues.length-1].voicing={indices:ordered.map(x=>x.i),pitches};
    }
   }
   energy.push({inst,role,value:proxy/p.beats});
   if(!['Piano','Bandoneon','Guitar'].includes(instrumentFamily(inst))){
    const sorted=[...entries].sort((a,b)=>a.n.start-b.n.start);
    for(let i=1;i<sorted.length;i++)if(sorted[i].n.start<sorted[i-1].n.start+sorted[i-1].n.duration-.125&&sorted[i].n.pitch!==sorted[i-1].n.pitch&&instrumentFamily(inst)!=='Violin')
     add(inst,bar,'playability','warning','Overlapping distinct notes on normally monophonic instrument',sorted[i].i);
   }
  }
  const lead=energy.filter(e=>e.role==='melody').reduce((n,e)=>n+e.value,0);
  if(lead>0)for(const e of energy)if(e.role!=='melody'&&e.value>lead*1.8)
   add(e.inst,bar,'balance','suggestion','Accompaniment score-energy proxy exceeds melody; audition balance');
 }
 return issues;
}
/** Use the same protection rule in the dialog and at the mutation boundary. */
export function canRefineArrangementFinding(p:Project,score:Score,issue:Diagnostic,allowProtected=false):boolean{
 if((!issue.patch&&!issue.voicing)||issue.noteIndex===undefined||dismissedReviewIds(p).includes(issue.id))return false;
 const indices=new Set([issue.noteIndex,...(issue.voicing?.indices??[])]);
 return [...indices].every(i=>{
  const n=score[issue.instrument]?.[i];
  if(!n||!p.bars[issue.measure]||Math.floor((n.start+1e-7)/p.beats)!==issue.measure)return false;
  const starts=[n.start,...(i===issue.noteIndex&&issue.patch?.start!==undefined?[issue.patch.start]:[])];
  const pedalStart=n.start+(n.pianoPedalOffset??0);
  if(n.pianoPedalBeats)starts.push(pedalStart);
  const from=Math.floor((Math.min(...starts)+1e-7)/p.beats);
  const end=Math.max(...starts.map(start=>start+Math.max(n.duration,n.stringGlissando?.beats??0,n.pianoGlissando?.beats??0)),pedalStart+(n.pianoPedalBeats??0));
  const through=Math.min(p.bars.length-1,Math.floor((end-1e-8)/p.beats));
  if(!allowProtected)for(let bar=from;bar<=through;bar++)if(p.protectedBars[issue.instrument+':'+bar])return false;
  return true;
 });
}

/** Apply only explicitly selected patches; positions are from the analyzed source,
 * not from the sorted score returned after the first measure edit. */
export function refineArrangement(p:Project,score:Score,findings:readonly Diagnostic[],allowProtected=false):Project{
 let next=p,current=score;
 const groups=new Map<string,Diagnostic[]>();
 for(const issue of findings){
  if(!canRefineArrangementFinding(p,score,issue,allowProtected))continue;
  const key=issue.instrument+':'+issue.measure;
  const list=groups.get(key)??[];list.push(issue);groups.set(key,list);
 }
 for(const list of groups.values()){
  const {instrument,measure}=list[0],source=score[instrument]??[];
  const patches=new Map<number,NonNullable<Diagnostic['patch']>>();
  const addPatch=(i:number,patch:NonNullable<Diagnostic['patch']>)=>{
   const previous=patches.get(i);
   if(previous&&(['pitch','start'] as const).some(key=>previous[key]!==undefined&&patch[key]!==undefined&&previous[key]!==patch[key]))
    throw Error('Selected structural fixes conflict. Select one fix for this note and try again.');
   patches.set(i,{...previous,...patch});
  };
  for(const issue of list){
   if(issue.patch)addPatch(issue.noteIndex!,issue.patch);
   if(issue.voicing)issue.voicing.indices.forEach((index,j)=>addPatch(index,{pitch:issue.voicing!.pitches[j]}));
  }
  const unchanged=new Set<Note>();
  const notes=source.flatMap((n,i)=>{
   if(Math.floor((n.start+1e-7)/p.beats)!==measure)return [];
   const patch=patches.get(i);if(!patch){unchanged.add(n);return [n];}
   const edited={...n,...patch};if(patch.start!==undefined)delete edited.rhythmSource;return [edited];
  });
  // Individual suggestions may be safe in isolation but collide in a batch.
  const original=source.filter(n=>Math.floor((n.start+1e-7)/p.beats)===measure);
  if(notes.some((n,i)=>!unchanged.has(n)&&(n.start!==original[i].start||n.pitch!==original[i].pitch)&&notes.some((other,j)=>i!==j&&other.pitch===n.pitch&&Math.abs(other.start-n.start)<1e-7)))
   throw Error('Selected fixes would create a duplicate attack. Apply fewer fixes and rescan.');
  next=replaceInstrumentMeasure(next,current,instrument,measure,notes,unchanged);
  current=next.generatedScore!;
 }
 return next;
}
