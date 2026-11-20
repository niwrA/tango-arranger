/** A transport-only rehearsal multiplier: the score's written BPM never changes. */
export const REHEARSAL_SPEEDS=[0.5,0.6,0.7,0.8,0.9,1,1.1,1.25] as const;
export type RehearsalSpeed=typeof REHEARSAL_SPEEDS[number];
export function normalizeRehearsalSpeed(value:unknown):RehearsalSpeed {
 const n=typeof value==='string'?Number(value):value;
 return REHEARSAL_SPEEDS.includes(n as RehearsalSpeed)?n as RehearsalSpeed:1;
}
export function effectiveTempo(bpm:number,speed:number):number {
 if(!Number.isFinite(bpm)||bpm<=0)throw Error('Invalid song BPM');
 if(!Number.isFinite(speed)||speed<=0)throw Error('Invalid rehearsal speed');
 return bpm*speed;
}
/** Transport musical ticks, independent of seconds and tempo changes mid-song. */
export function beatOffsetTicks(beats:number,ppq:number):string {
 if(!Number.isFinite(beats)||beats<0||!Number.isFinite(ppq)||ppq<=0)throw Error('Invalid musical tick position');
 return Math.round(beats*ppq)+'i';
}
/** Durations generated at the song's original BPM must follow the live multiplier. */
export function playbackDuration(seconds:number,speed:number):number {
 if(!Number.isFinite(seconds)||seconds<0||!Number.isFinite(speed)||speed<=0)throw Error('Invalid playback duration');
 return seconds/speed;
}
