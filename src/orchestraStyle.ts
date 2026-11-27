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
