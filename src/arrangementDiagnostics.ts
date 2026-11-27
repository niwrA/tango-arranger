import {projectInstruments,instrumentPitchPlayable,instrumentFamily,chordAt,chordTones,noteSoundingVelocity,noteSoundingDuration,measureDynamicVelocity,melodyDuckingFactor,replaceInstrumentMeasure,type Project,type Score,type Instrument,type Note} from './music';
import {effectiveRole,phraseMeasureMap} from './phrasePlan';
import {orchestraStyle,orchestraPulses,resolvePhraseStyle,styleStrength,isOrchestraStyle} from './orchestraStyle';

export type DiagnosticCategory='pitch'|'harmony'|'dynamics'|'balance'|'playability'|'style';
export type Diagnostic={id:string;category:DiagnosticCategory;severity:'error'|'warning'|'suggestion';instrument:Instrument;measure:number;message:string;noteIndex?:number;patch?:Partial<Pick<Note,'velocity'|'gate'|'accent'|'articulation'>>};
export type ReviewScope={from?:number;to?:number;instrument?:Instrument;includeStyle?:boolean};
const clamp=(n:number)=>Math.max(1,Math.min(127,Math.round(n)));
const median=(values:number[])=>{const sorted=[...values].sort((a,b)=>a-b);return sorted.length?sorted[Math.floor(sorted.length/2)]:80;};
/** Read-only analysis. Balance is a score proxy, not measured acoustic loudness. */
export function diagnoseArrangement(p:Project,score:Score,scope:ReviewScope={}):Diagnostic[]{
 const issues:Diagnostic[]=[],phrases=phraseMeasureMap(p),roster=projectInstruments(p);
 const from=Math.max(0,scope.from??0),to=Math.min(p.bars.length-1,scope.to??p.bars.length-1);
 const add=(instrument:Instrument,measure:number,category:DiagnosticCategory,severity:Diagnostic['severity'],message:string,noteIndex?:number,patch?:Diagnostic['patch'])=>{
  if(measure<from||measure>to||scope.instrument&&scope.instrument!==instrument)return;
  issues.push({id:[instrument,measure,category,noteIndex??'measure',message].join(':'),instrument,measure,category,severity,message,noteIndex,patch});
 };
 const byMeasure=new Map<string,{n:Note;i:number}[]>();
 for(const inst of roster){
  const notes=score[inst]??[];
  notes.forEach((n,i)=>{
   const bar=Math.floor((n.start+1e-7)/p.beats);if(!p.bars[bar])return;
   const key=inst+':'+bar,list=byMeasure.get(key)??[];list.push({n,i});byMeasure.set(key,list);
   if(!instrumentPitchPlayable(inst,n.pitch+(p.transposeSemitones??0),p))add(inst,bar,'pitch','error','Pitch outside configured sounding instrument range',i);
  });
 }
 for(let bar=from;bar<=to;bar++){
  const measure=p.bars[bar];if(!measure)continue;
  const phrase=phrases[bar],styleId=resolvePhraseStyle(p,measure.section,phrase?String(phrase.startMeasure):undefined);
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
    if(chord.trim()&&n.duration>=1.5&&(role==='chords'||role==='bass')&&!chordTones(chord).includes(((n.pitch%12)+12)%12))
     add(inst,bar,'harmony','suggestion','Sustained accompaniment note outside the current chord; review resolution',i);
    if(entries.length>=4&&Math.abs(v-center)>=30&&!n.accent&&!n.subito&&!n.swellTo)
     add(inst,bar,'dynamics','warning','Isolated velocity deviation from measure median',i,{velocity:clamp(center)});
    if(scope.includeStyle!==false&&strength>0&&p.beats===4&&isOrchestraStyle(styleId)&&styleId!=='traditional'&&(role==='chords'||role==='bass')&&!n.gesture&&!n.stringGlissando&&!n.pianoGlissando&&!n.bowedTremolo&&!n.swellTo&&!n.subito&&!p.articulation?.overrides?.[inst+':'+bar]&&!phrase?.parts[inst]?.articulation){
     const bass=role==='bass'||instrumentFamily(inst)==='Piano'&&n.pitch<(p.pianoSplitPitch??60);
     const slots=orchestraPulses(styleId,p.beats,bass?'bass':'chords');
     const slot=slots.find(s=>Math.abs(s.beat-local)<.126);
     if(!slot)add(inst,bar,'style','suggestion','Attack differs from typical style pulse; review rhythm',i);
     else {
      const expected=slot.accent?style.accentVelocity:style.plainVelocity;
      const velocity=clamp(v+(expected-v)*strength),gate=(n.gate??.9)+(style.gate-(n.gate??.9))*strength;
      if(Math.abs(velocity-v)>=12||Math.abs(gate-(n.gate??.9))>=.2)
       add(inst,bar,'style','suggestion','Expression differs from selected style heuristic',i,{velocity,gate,accent:slot.accent});
     }
    }
    const sounding=measureDynamicVelocity(p,inst,n.start,noteSoundingVelocity(n))*melodyDuckingFactor(p,inst,n.start);
    proxy+=Math.pow(sounding/127,2)*Math.min(p.beats,Math.max(0,noteSoundingDuration(n)));
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
/** Apply only explicitly selected expression patches, in a single returned project.
 * No pitch, onset or written duration changes. Protected measures opt-in. */
export function refineArrangement(p:Project,score:Score,findings:readonly Diagnostic[],allowProtected=false):Project{
 let next=p,current=score;
 const groups=new Map<string,Diagnostic[]>();
 for(const issue of findings){
  if(!issue.patch||issue.noteIndex===undefined)continue;
  const key=issue.instrument+':'+issue.measure;
  if(p.protectedBars[key]&&!allowProtected)continue;
  const list=groups.get(key)??[];list.push(issue);groups.set(key,list);
 }
 for(const list of groups.values()){
  const {instrument,measure}=list[0],source=score[instrument]??[];
  const patches=new Map<number,Diagnostic['patch']>();
  for(const issue of list)patches.set(issue.noteIndex!,{...patches.get(issue.noteIndex!),...issue.patch});
  const unchanged=new Set<Note>();
  const notes=source.flatMap((n,i)=>{
   if(Math.floor((n.start+1e-7)/p.beats)!==measure)return [];
   const patch=patches.get(i);if(!patch){unchanged.add(n);return [n];}
   return [{...n,...patch}];
  });
  next=replaceInstrumentMeasure(next,current,instrument,measure,notes,unchanged);
  current=next.generatedScore!;
 }
 return next;
}
