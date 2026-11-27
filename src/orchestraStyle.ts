/** Deterministic arranging heuristics, not transcriptions or empirical style models.
 * Shared by generation and the rhythm editor; no dependency on the score engine. */
export type StylePulse={beat:number;duration:number;accent:boolean};
export type StyleVoice='bass'|'chords'|'melody';
export const ORCHESTRA_STYLES={
 traditional:{bass:[0,2,4,6],chords:[0,2,4,6],accents:[0,4],gate:.74,accentVelocity:90,plainVelocity:74,register:68},
 darienzo:{bass:[0,2,4,6],chords:[0,2,4,6],accents:[0,2,4,6],gate:.42,accentVelocity:104,plainVelocity:78,register:69},
 disarli:{bass:[0,4],chords:[2,6],accents:[0,4],gate:.88,accentVelocity:90,plainVelocity:65,register:65},
 troilo:{bass:[0,3,4,7],chords:[0,3,4,7],accents:[3,7],gate:.68,accentVelocity:94,plainVelocity:72,register:70},
 fresedo:{bass:[0,4],chords:[2,6],accents:[0,2],gate:.78,accentVelocity:82,plainVelocity:62,register:72},
 canaro:{bass:[0,2,4,6],chords:[0,2,4,6],accents:[0,4],gate:.65,accentVelocity:91,plainVelocity:70,register:66},
 pugliese:{bass:[0,2,4,6],chords:[0,2,4,6],accents:[0,6],gate:.63,accentVelocity:112,plainVelocity:64,register:67}
} as const;
export type OrchestraStyleId=keyof typeof ORCHESTRA_STYLES;
export function isOrchestraStyle(value:string):value is OrchestraStyleId{
 return Object.prototype.hasOwnProperty.call(ORCHESTRA_STYLES,value);
}
export function orchestraStyle(value:string){return ORCHESTRA_STYLES[isOrchestraStyle(value)?value:'traditional'];}
export function orchestraPulses(style:string,beats:number,voice:'bass'|'chords'):StylePulse[]{
 const profile=orchestraStyle(style),units=profile[voice],accents:readonly number[]=profile.accents;
 const round=(n:number)=>Math.round(n*1e6)/1e6;
 return units.map((unit,i)=>({beat:round(unit*beats/8),duration:round(((units[i+1]??8)-unit)*beats/8),accent:accents.includes(unit)}));
}
/** Optional section override; unknown profiles remain backward-compatible. */
export function effectiveOrchestraStyle(project:{profile:string;sectionStyles?:Record<string,OrchestraStyleId>},section:string):string{
 return project.sectionStyles?.[section]??project.profile;
}

/** Phrase shaping is deliberately bounded. These are editorial defaults, not measured historical timing. */
export const STYLE_EXPRESSION:Record<OrchestraStyleId,{phraseLift:number;cadenceRelease:number;ornament:'neighbor'|'chord'|'none';response:number;timingFlex:number}>={
 traditional:{phraseLift:0,cadenceRelease:0,ornament:'none',response:0,timingFlex:0},
 darienzo:{phraseLift:5,cadenceRelease:2,ornament:'chord',response:2,timingFlex:0},
 disarli:{phraseLift:8,cadenceRelease:5,ornament:'neighbor',response:3,timingFlex:.025},
 troilo:{phraseLift:10,cadenceRelease:7,ornament:'neighbor',response:4,timingFlex:.045},
 fresedo:{phraseLift:6,cadenceRelease:6,ornament:'neighbor',response:2,timingFlex:.02},
 canaro:{phraseLift:3,cadenceRelease:3,ornament:'chord',response:2,timingFlex:.01},
 pugliese:{phraseLift:14,cadenceRelease:9,ornament:'chord',response:4,timingFlex:.06}
};
export type StyleSettings={profile:string;sectionStyles?:Record<string,OrchestraStyleId>;styleStrength?:number;phraseStyles?:Record<string,OrchestraStyleId>};
export function styleStrength(p:StyleSettings):number{
 return Number.isFinite(p.styleStrength)?Math.max(0,Math.min(1,p.styleStrength!)):1;
}
export function resolvePhraseStyle(p:StyleSettings,section:string,phraseKey?:string):string{
 return (phraseKey?p.phraseStyles?.[phraseKey]:undefined)??effectiveOrchestraStyle(p,section);
}
export function phraseStyleExpression(style:string,position:number,strength:number){
 const e=STYLE_EXPRESSION[isOrchestraStyle(style)?style:'traditional'],t=Math.max(0,Math.min(1,position));
 return {velocity:Math.round(strength*(e.phraseLift*Math.sin(Math.PI*t)-e.cadenceRelease*t*t*t)),timingFlex:e.timingFlex*strength,ornament:e.ornament,response:e.response};
}
/** Reference measurements can later replace heuristics without depending on an audio or score importer. */
export type StyleReferenceMeasurement={style:OrchestraStyleId;period?:string;sourceId:string;license:string;instrumentFamily:string;role:string;sampleCount:number;onsetHistogram:number[];medianGate?:number;medianVelocity?:number};
export function summarizeStyleReferences(records:readonly StyleReferenceMeasurement[]){
 const usable=records.filter(r=>r.sampleCount>0&&r.license.trim()&&r.sourceId.trim());
 return {sources:[...new Set(usable.map(r=>r.sourceId))],observations:usable.reduce((n,r)=>n+r.sampleCount,0),records:usable.length};
}
