export type Instrument = 'Piano'|'Contrabass'|'Violin I'|'Violin II'|'Bandoneon I'|'Bandoneon II'|'Voice';
export const INSTRUMENTS: Instrument[] = ['Piano','Contrabass','Violin I','Violin II','Bandoneon I','Bandoneon II','Voice'];
export type Role = 'melody'|'harmony'|'chords'|'bass'|'fill'|'variation'|'rest';
export type Articulation = 'auto'|'marcato_staccato'|'staccato'|'legato';
export type Note = { articulation?:Exclude<Articulation,'auto'>; pitch:number; start:number; duration:number; velocity?:number; accent?:boolean; technique?:'pizzicato'|'arco'; source?:'generated'|'imported'|'manual' };
export type Difficulty = 'easy'|'intermediate'|'advanced';
export type DynamicMark = 'pp'|'p'|'mp'|'mf'|'f'|'ff';
export type InstrumentSettings = { difficulty?:Difficulty; activity?:number; dynamicsOffset?:number };
export type ExpressionSettings = { enabled:boolean; sections:Record<string,DynamicMark>; crescendo:boolean };
export const defaultInstrumentSettings=():Partial<Record<Instrument,InstrumentSettings>>=>({Piano:{difficulty:'intermediate',activity:1},Contrabass:{difficulty:'intermediate',activity:1},'Violin I':{difficulty:'intermediate',activity:0.92},'Violin II':{difficulty:'intermediate',activity:0.88},'Bandoneon I':{difficulty:'intermediate',activity:0.93},'Bandoneon II':{difficulty:'intermediate',activity:0.85},Voice:{difficulty:'easy',activity:0}});
export const defaultExpression=():ExpressionSettings=>({enabled:true,sections:{A1:'mp',B1:'mf',A2:'mp',B2:'f',C:'f'},crescendo:true});
export type ViolinTechnique = 'arpeggio'|'pizzicato'|'pizzicato_arpeggio'|'double_stop'|'sustained'|'block';
export type FollowTarget = 'independent'|'Piano'|'Violin I'|'Violin II'|'Bandoneon I';
export type FollowMethod = 'exact'|'octave'|'adapt'|'rhythm';
export type OrchestrationSettings = { violin:Record<string,Partial<Record<'Violin I'|'Violin II',ViolinTechnique>>>; bandoneon:Record<string,Partial<Record<'Bandoneon I'|'Bandoneon II',{target:FollowTarget;method:FollowMethod}>>> };
export const defaultOrchestration=():OrchestrationSettings=>({violin:{A1:{'Violin II':'pizzicato_arpeggio'},B1:{'Violin II':'double_stop'},A2:{'Violin I':'arpeggio'},B2:{'Violin II':'pizzicato'},C:{'Violin II':'sustained'}},bandoneon:{A1:{'Bandoneon I':{target:'Violin I',method:'adapt'}},B1:{'Bandoneon II':{target:'Piano',method:'rhythm'}},A2:{'Bandoneon I':{target:'Violin II',method:'octave'}},B2:{'Bandoneon II':{target:'Piano',method:'rhythm'}}}});
export type Bar = { chord:string; melody:Note[]; section:string };
export type Score = Record<Instrument,Note[]>;
export type Project = { version:1; transposeSemitones?:number; articulation?:{phraseBars:number; enabled:boolean; overrides:Record<string,Exclude<Articulation,'auto'>>}; title:string; bpm:number; beats:number; profile:string; bars:Bar[]; roles:Record<string,Partial<Record<Instrument,Role>>>; protectedBars:Record<string,boolean>; measureRoles?:Record<string,Role>; measureViolinTechniques?:Record<string,ViolinTechnique>; orchestration?:OrchestrationSettings; difficulty?:Difficulty; instrumentSettings?:Partial<Record<Instrument,InstrumentSettings>>; expression?:ExpressionSettings; importedScore?:Score; generatedScore?:Score; baseScore?:Score };
export const defaultArticulation=()=>({phraseBars:8,enabled:true,overrides:{} as Record<string,Exclude<Articulation,'auto'>>});
export function transposeScore(score:Score,semitones:number):Score {
  if(!Number.isInteger(semitones)||semitones < -24||semitones > 24)throw Error('Transpose must be an integer between -24 and +24 semitones');
  return Object.fromEntries(INSTRUMENTS.map(i=>[i,(score[i]??[]).map(n=>{const pitch=n.pitch+semitones;if(pitch<0||pitch>127)throw Error(`Transposition exceeds MIDI pitch limits for ${i}`);return {...n,pitch};})])) as Score;
}
export function transposeChord(symbol:string,semitones:number):string {
  if(!Number.isInteger(semitones)||semitones < -24||semitones > 24)throw Error('Invalid transpose');
  return symbol.replace(/(^|\/)([A-G])([#b]?)/g,(_m,prefix,step,acc)=>{const n=parsePitch(step+acc+'4');return n===null?_m:prefix+PITCHES[((n+semitones)%12+12)%12];});
}
export function measureArticulation(p:Project,inst:Instrument,barIndex:number):Exclude<Articulation,'auto'>|undefined {
  if(!(inst.startsWith('Violin')||inst.startsWith('Bandoneon')))return undefined;
  const override=p.articulation?.overrides?.[`${inst}:${barIndex}`];if(override)return override;
  if(p.articulation?.enabled===false)return undefined;
  const period=Math.max(1,Math.min(32,p.articulation?.phraseBars??8));
  // Phrase variation: stagger switches between instrument groups without random rests.
  const variation=inst==='Violin II'?2:inst==='Bandoneon II'?1:0;
  const rhythmic=Math.floor((barIndex+variation)/period)%2===0;
  return rhythmic?'marcato_staccato':'legato';
}
export const PITCHES = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
export const midiName = (n:number) => PITCHES[((n%12)+12)%12]+(Math.floor(n/12)-1);
export function parsePitch(s:string):number|null { const m=s.trim().match(/^([A-Ga-g])([#b]?)(-?\d+)$/);if(!m)return null;const pc:Record<string,number>={C:0,D:2,E:4,F:5,G:7,A:9,B:11};return (Number(m[3])+1)*12+pc[m[1].toUpperCase()]+(m[2]==='#'?1:m[2]==='b'?-1:0); }
/** A comma-delimited chord sequence divides the bar into beat-aligned slots.
 * 4/4: D,G => D on beats 1-2 and G on 3-4;
 * D,D,D,G => G begins on beat 4. Repetitions are meaningful.
 * For three entries in 4/4, starts are beats 1, 2 and 3.
 */
export type ChordChange = {beat:number; chord:string};
export function parseChordSequence(input:string,beats:number):ChordChange[] {
  if(!Number.isInteger(beats)||beats<1||beats>12)throw Error('Invalid time signature');
  if(!input.trim())return [];
  const parts=input.split(',').map(x=>x.trim());
  if(parts.length>beats)throw Error(`At most ${beats} chord slots in ${beats}/4; one slot per beat`);
  if(parts.some(x=>!/^([A-Ga-g])([#b]?)([a-zA-Z0-9+#°øΔ()\/\-]*)$/.test(x)))
    throw Error('Invalid chord sequence: use symbols such as Dm, G7, F#dim, or D,G');
  return parts.map((chord,i)=>({beat:Math.floor(i*beats/parts.length),chord:chord[0].toUpperCase()+chord.slice(1)}));
}
export function chordAt(input:string,beats:number,beat:number):string {
  const changes=parseChordSequence(input,beats);
  return [...changes].reverse().find(c=>c.beat<=beat+1e-8)?.chord??changes[0]?.chord??'';
}
export function chordSequenceFromBeats(changes:ChordChange[],beats:number):string {
  if(!changes.length)return 'Dm';
  const sorted=[...changes].sort((a,b)=>a.beat-b.beat);
  const first=sorted[0].chord;
  const slots=Array.from({length:beats},(_,beat)=>{
    let chord=first;
    for(const change of sorted)if(change.beat<=beat+1e-8)chord=change.chord;
    return chord;
  });
  // Prefer the compact half-bar form when its onset times are identical.
  if(beats%2===0 && slots.slice(0,beats/2).every(x=>x===slots[0]) && slots.slice(beats/2).every(x=>x===slots[beats/2]))
    return slots[0]===slots[beats/2]?slots[0]:`${slots[0]},${slots[beats/2]}`;
  return slots.every(x=>x===slots[0])?slots[0]:slots.join(',');
}
export function chordTones(symbol:string):number[] {const m=symbol.trim().match(/^([A-Ga-g])([#b]?)(.*)$/);if(!m)return [0,4,7];const root=parsePitch(m[1].toUpperCase()+m[2]+'4')!%12;const q=m[3].toLowerCase();const minor=/^(m(?!aj)|min|-)/.test(q);const dim=/dim|°|o7/.test(q);const aug=/aug|\+/.test(q);const seventh=/7|9|11|13/.test(q);const maj7=/maj7|ma7|Δ/.test(m[3]);const intervals=dim?[0,3,6]:aug?[0,4,8]:minor?[0,3,7]:[0,4,7];if(seventh)intervals.push(dim?9:maj7?11:minor&&/m7b5/.test(q)?10:10);return intervals.map(n=>(root+n)%12);}
export function closest(pc:number,target:number,lo:number,hi:number):number {const options=[];for(let n=lo;n<=hi;n++)if(n%12===pc)options.push(n);return options.sort((a,b)=>Math.abs(a-target)-Math.abs(b-target))[0]??target;}
export function defaultRoles():Project['roles'] {const sets:Record<string,Role[]>={A1:['chords','bass','melody','chords','chords','harmony','rest'],B1:['chords','bass','harmony','chords','melody','harmony','rest'],A2:['chords','bass','chords','melody','chords','harmony','rest'],B2:['chords','bass','melody','harmony','fill','chords','rest'],C:['chords','bass','harmony','chords','variation','harmony','rest']};return Object.fromEntries(Object.entries(sets).map(([s,roles])=>[s,Object.fromEntries(INSTRUMENTS.map((inst,i)=>[inst,roles[i]]))]));}
/** Create an empty, editable score. No placeholder melody or fabricated harmony. */
export function blankProject(options:{title?:string;measures?:number;beats?:number;bpm?:number}={}):Project {
  const measures=options.measures??32,beats=options.beats??4,bpm=options.bpm??124;
  if(!Number.isInteger(measures)||measures<1||measures>256)throw Error('Blank song must contain 1–256 measures');
  if(!Number.isInteger(beats)||beats<2||beats>4)throw Error('Choose 2/4, 3/4 or 4/4');
  if(!Number.isFinite(bpm)||bpm<40||bpm>240)throw Error('Tempo must be 40–240 BPM');
  const labels=['A1','B1','A2','B2','C'];
  return {
    version:1,title:options.title?.trim()||'Untitled Tango',bpm,beats,profile:'traditional',
    bars:Array.from({length:measures},(_,i)=>({chord:'',melody:[],section:labels[Math.min(Math.floor(i/8),labels.length-1)]})),
    roles:defaultRoles(),protectedBars:{},transposeSemitones:0,articulation:defaultArticulation(),
    orchestration:defaultOrchestration(),difficulty:'intermediate',
    instrumentSettings:defaultInstrumentSettings(),expression:defaultExpression()
  };
}
export function demoProject():Project {const chords=['Dm','Dm','Gm','A7','Dm','Gm','A7','Dm','F','C7','F','A7','Dm','Gm','A7','Dm','Dm','Dm','Gm','A7','Dm','Gm','A7','Dm','F','C7','F','A7','Dm','Gm','A7','Dm','Dm','Gm','A7','Dm','Dm','Gm','A7','Dm'];const pattern=[[74,1],[77,1],[76,1],[74,1]];return {version:1,title:'Untitled Tango (demo melody)',bpm:124,beats:4,profile:'traditional',bars:chords.map((chord,i)=>({chord,section:i<8?'A1':i<16?'B1':i<24?'A2':i<32?'B2':'C',melody:pattern.map(([pitch,duration],j)=>({pitch:pitch+(i%8===4?-2:0)+(i%16>=8?3:0),start:j,duration}))})),roles:defaultRoles(),protectedBars:{},transposeSemitones:0,articulation:defaultArticulation(),orchestration:defaultOrchestration(),difficulty:'intermediate',instrumentSettings:defaultInstrumentSettings(),expression:defaultExpression()};}
export const patterns:Record<string,{density:number;accent:number;legato:number;strongBeats:boolean;yumba:boolean;strings:boolean}>={traditional:{density:1,accent:0.8,legato:0,strongBeats:true,yumba:false,strings:true},darienzo:{density:1,accent:1,legato:0,strongBeats:false,yumba:false,strings:false},disarli:{density:1,accent:0.75,legato:0.22,strongBeats:true,yumba:false,strings:true},troilo:{density:1,accent:0.78,legato:0.24,strongBeats:true,yumba:false,strings:true},fresedo:{density:0.9,accent:0.65,legato:0.25,strongBeats:true,yumba:false,strings:true},canaro:{density:1,accent:0.8,legato:0.1,strongBeats:false,yumba:false,strings:false},pugliese:{density:1,accent:1,legato:0.15,strongBeats:true,yumba:true,strings:true}};
// Conservative violin string model: open strings G3 D4 A4 E5, positions 0..7 semitones.
// A double stop is permitted only if each note is reachable on adjacent strings.
const VIOLIN_OPEN=[55,62,69,76];
export function playableDoubleStop(tones:number[],target=70):[number,number]|null {
  const pcs=new Set(tones.map(n=>(n%12+12)%12));
  const candidates:{pair:[number,number];cost:number}[]=[];
  for(let string=0;string<3;string++)for(let a=0;a<=7;a++)for(let b=0;b<=7;b++){
    const lo=VIOLIN_OPEN[string]+a,hi=VIOLIN_OPEN[string+1]+b;
    if(pcs.has(lo%12)&&pcs.has(hi%12)) candidates.push({pair:[lo,hi],cost:Math.abs((lo+hi)/2-target)+a+b+(a&&b?2:0)});
  }
  return candidates.sort((a,b)=>a.cost-b.cost)[0]?.pair??null;
}
function instrumentRange(inst:Instrument):[number,number]{return inst==='Contrabass'?[28,55]:inst==='Piano'?[43,85]:inst==='Voice'?[55,85]:inst.startsWith('Violin')?[55,96]:[48,88];}
export function convertTwoFourToFour(p:Project):Project {
  if(p.beats!==2)throw Error('Only 2/4 projects can be converted to 4/4');
  if(p.bars.length%2)throw Error('An odd number of measures requires an explicit pickup/ending decision');
  if(p.importedScore||p.generatedScore||p.baseScore||Object.keys(p.protectedBars).length)throw Error('Remove or archive edited/generated score and protections before meter conversion');
  const bars:Bar[]=[];
  for(let i=0;i<p.bars.length;i+=2){
    const first=p.bars[i],second=p.bars[i+1];
    if(first.section!==second.section)throw Error(`Section boundary between measures ${i+1} and ${i+2}; choose grouping manually`);
    const mergedChanges=[...parseChordSequence(first.chord,2),...parseChordSequence(second.chord,2).map(c=>({...c,beat:c.beat+2}))];
    const mergedChord=chordSequenceFromBeats(mergedChanges,4);
    bars.push({chord:mergedChord,section:first.section,melody:[...first.melody.map(n=>({...n})),...second.melody.map(n=>({...n,start:n.start+2}))]});
  }
  return {...p,beats:4,bars,protectedBars:{}};
}
const dynVelocity:Record<DynamicMark,number>={pp:52,p:63,mp:74,mf:88,f:101,ff:112};
export function instrumentActivity(score:Score,inst:Instrument,barCount:number,beats:number):number {
  if(!barCount)return 0;
  let active=0;for(let b=0;b<barCount;b++)if((score[inst]??[]).some(n=>n.start<b*beats+beats&&n.start+n.duration>b*beats))active++;
  return active/barCount;
}
export function generate(p:Project):Score {
  const score=Object.fromEntries(INSTRUMENTS.map(i=>[i,[]])) as unknown as Score;
  const profile=patterns[p.profile]??patterns.traditional;
  const settings=p.orchestration??defaultOrchestration();
  const expression=p.expression??defaultExpression();
  for(let b=0;b<p.bars.length;b++){
    const bar=p.bars[b],offset=b*p.beats,sectionRoles=p.roles[bar.section]??{};
    if(!bar.chord.trim()&&!bar.melody.length)continue; // A blank measure is genuinely silent.
    const harmony=(beat:number)=>chordTones(chordAt(bar.chord,p.beats,beat));
    const tones=harmony(0),root=tones[0];
    // Generate primary lines first so followers can copy the actual generated notes.
    const order:Instrument[]=['Piano','Contrabass','Violin I','Violin II','Bandoneon I','Bandoneon II','Voice'];
    for(const inst of order){
      const configuredRole=p.measureRoles?.[`${inst}:${b}`]??sectionRoles[inst]??'rest',notes=score[inst],range=instrumentRange(inst);
      if(!bar.chord.trim() && configuredRole!=='melody' && configuredRole!=='variation')continue; // No invented harmony before chord entry.
      const cfg=p.instrumentSettings?.[inst]; const difficulty=cfg?.difficulty??p.difficulty??'intermediate';
      const activity=Math.max(0,Math.min(1,cfg?.activity??(inst==='Voice'?0:0.9)));
      const intentionalRest=configuredRole==='rest';
      const activeBar=!intentionalRest && ((b*7+INSTRUMENTS.indexOf(inst)*3)%100)<Math.round(activity*100);
      if(!activeBar)continue;
      const role=(configuredRole==='fill' && inst.startsWith('Bandoneon'))?(bar.melody.length?'harmony':'chords'):(configuredRole==='harmony'&&!bar.melody.length?'chords':configuredRole);
      const sectionDyn=expression.sections[bar.section]??'mf';
      const dynamicScale=expression.enabled?(dynVelocity[sectionDyn]/88):1;
      const difficultyBoost=difficulty==='advanced'?1:difficulty==='intermediate'?0.84:0.65;
      const put=(pitch:number,start:number,duration:number,velocity=80,technique?:Note['technique'])=>{
        if(pitch>=0&&pitch<=127&&duration>0&&start>=0&&start<p.beats)
          notes.push({pitch,start:offset+start,duration:Math.min(duration,p.beats-start),velocity:Math.max(35,Math.min(127,Math.round(velocity*dynamicScale+(cfg?.dynamicsOffset??0)))),accent:Math.abs(start-Math.round(start))<0.001&&(profile.strongBeats?Math.round(start)%2===0:true),technique,source:'generated'});
      };
      if(inst.startsWith('Bandoneon')){
        const follower=settings.bandoneon[bar.section]?.[inst as 'Bandoneon I'|'Bandoneon II'];
        if(follower&&follower.target!=='independent'&&follower.target!==inst){
          const source=score[follower.target]??[];
          const events=source.filter(n=>n.start>=offset&&n.start<offset+p.beats);
          if(events.length){
            for(const n of events){
              const local=n.start-offset;
              const localTones=harmony(local);
              const pitch=follower.method==='octave'?n.pitch+(n.pitch<60?12:0):follower.method==='adapt'?closest(n.pitch%12,66,range[0],range[1]):follower.method==='rhythm'?closest(localTones[(Math.floor(local)+1)%localTones.length],66,range[0],range[1]):n.pitch;
              put(Math.max(range[0],Math.min(range[1],pitch)),local,n.duration,follower.method==='rhythm'?72:80);
            }
            continue;
          }
        }
      }
      const primary=bar.melody;
      if(role==='melody'||role==='harmony'||role==='variation'){
        for(const n of primary){
          let pitch=n.pitch;
          if(role==='harmony'){
            pitch=harmony(n.start).map(pc=>closest(pc,n.pitch-4,range[0],range[1])).sort((a,b)=>Math.abs(a-(n.pitch-4))-Math.abs(b-(n.pitch-4)))[0]??pitch;
            if(Math.abs(pitch-n.pitch)<2)pitch=closest(harmony(n.start)[0],n.pitch-5,range[0],range[1]);
          }
          pitch=Math.max(range[0],Math.min(range[1],pitch));
          if(role==='variation'&&n.duration>=1){put(pitch,n.start,n.duration/2,90);put(Math.max(range[0],Math.min(range[1],pitch+(b%2?2:-2))),n.start+n.duration/2,n.duration/2,75);}
          else put(pitch,n.start,inst.startsWith('Bandoneon')?Math.min(n.duration,1.3):n.duration,inst.startsWith('Violin')&&profile.strings?91:85,inst.startsWith('Violin')?'arco':undefined);
        }
        continue;
      }
      if(role==='bass'){
        for(let beat=0;beat<p.beats;beat+=2){
          const t0=harmony(beat),r0=t0[0];
          put(closest(beat===0?r0:t0[2]??r0,40,28,55),beat,Math.min(0.68,p.beats-beat),95);
          if(profile.density>=0.85&&beat+1<p.beats){const t1=harmony(beat+1),r1=t1[0];put(closest(beat===0?t1[2]??r1:r1,42,28,55),beat+1,0.52,72);}
        }
        continue;
      }
      if(role==='chords'){
        const beats=difficulty==='easy'?[0,2]:profile.density>=0.85?[0,1,2,3]:[0,2];
        if(inst.startsWith('Violin')){
          const technique=p.measureViolinTechniques?.[`${inst}:${b}`]??settings.violin[bar.section]?.[inst as 'Violin I'|'Violin II']??'arpeggio';
          for(const beat of beats.filter(x=>x<p.beats)){
            const tones=harmony(beat),root=tones[0];
            const dur=Math.min(0.65,p.beats-beat);
            if(technique==='double_stop'&&difficulty!=='easy'){
              const pair=playableDoubleStop(tones,inst==='Violin I'?76:69);
              if(pair){for(const pitch of pair)put(pitch,beat,0.38,77);continue;}
            }
            if(technique==='arpeggio'||technique==='pizzicato_arpeggio'||technique==='double_stop'){
              const pcs=difficulty==='easy'?[tones[0],tones[2]??root]:[tones[0],tones[1]??root,tones[2]??root];
              pcs.forEach((pc,j)=>put(closest(pc,70+j*2,range[0],range[1]),beat+j*dur/3,dur/3,73,technique==='pizzicato_arpeggio'?'pizzicato':undefined));
            }else if(technique==='pizzicato'){
              put(closest(tones[beat%tones.length],70,range[0],range[1]),beat,0.28,76,'pizzicato');
            }else if(technique==='sustained'){
              put(closest(tones[1]??root,72,range[0],range[1]),beat,Math.min(1.7,p.beats-beat),66,'arco');
            }else{
              for(const pc of tones.slice(0,3))put(closest(pc,72,range[0],range[1]),beat,0.4,75);
            }
          }
        }else for(const beat of beats.filter(x=>x<p.beats)){
          const tones=harmony(beat),root=tones[0];
          const register=inst==='Piano'?(difficulty==='easy'?61:beat%2===0?55:(difficulty==='advanced'?76:69)):65;
          const chordCount=difficulty==='easy'?2:3;
          const duration=inst==='Piano'?0.30+profile.legato*0.45:0.42;
          for(const pc of tones.slice(0,chordCount))put(closest(pc,register,range[0],range[1]),beat,duration,Math.round(65+25*profile.accent));
          if(inst==='Piano'&&profile.yumba&&beat%2===1&&difficulty!=='easy')
            put(closest(root,45,43,55),beat,0.22,96);
        }
        continue;
      }
      if(role==='fill'&&primary.length){
        const last=primary[primary.length-1];
        if(last.start+last.duration<=p.beats-0.5){const at=Math.max(0,p.beats-1),t=harmony(at);put(closest(t[1]??t[0],70,range[0],range[1]),at,0.5,68);put(closest(t[0],72,range[0],range[1]),at+0.5,0.5,75);}
      }
      // Tango texture continuity: a bandoneon with sparse assigned material
      // receives an accompaniment figure rather than arbitrary full-measure rests.
      if(inst.startsWith('Bandoneon') && !notes.some(n=>n.start>=offset&&n.start<offset+p.beats)){
        for(const beat of (difficulty==='easy'?[0,2]:[0,1,2,3]).filter(x=>x<p.beats)){
          const beatTones=harmony(beat);const pc=beatTones[(beat+(inst==='Bandoneon II'?1:0))%beatTones.length];
          put(closest(pc,inst==='Bandoneon II'?61:67,range[0],range[1]),beat,0.36,72);
        }
      }
    }
  }
  // Apply phrasing after role generation so follower notes get consistent articulation.
  for(const inst of INSTRUMENTS)for(const n of score[inst]){
    const barIndex=Math.floor((n.start+1e-7)/p.beats);
    const mode=measureArticulation(p,inst,barIndex);
    if(mode){n.articulation=mode;if(mode==='marcato_staccato'){n.accent=true;n.duration=Math.min(n.duration,0.48);}else if(mode==='staccato'){n.duration=Math.min(n.duration,0.55);}else n.accent=false;}
    if(inst.startsWith('Violin')&&mode==='legato')n.technique='arco';
  }
  return score;
}
export function mergeScores(p:Project,fresh:Score):Score {const merged=Object.fromEntries(INSTRUMENTS.map(i=>[i,[]])) as unknown as Score;for(const inst of INSTRUMENTS){for(let b=0;b<p.bars.length;b++){const key=`${inst}:${b}`,from=p.protectedBars[key]&&p.importedScore?p.importedScore:fresh;merged[inst].push(...(from[inst]??[]).filter(n=>Math.floor((n.start+1e-7)/p.beats)===b).map(n=>({...n})));}}return merged;}
export function scoreStats(score:Score):number {return INSTRUMENTS.reduce((s,i)=>s+(score[i]?.length??0),0);}
