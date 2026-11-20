/** Tone.Sampler plays finite one-shot files: increasing triggerAttackRelease's
 * requested duration does not loop a short source buffer. Sustain-capable
 * instruments therefore fall back to ADSR synthesis for longer notes.
 * Short attacks retain the existing sampled timbre when available.
 *
 * This is an audio-rendering choice only. It does not alter note duration,
 * velocity, technique, BPM, or score notation.
 */
export function needsSustainingSynth(instrument:string,durationSeconds:number):boolean{
 if(!Number.isFinite(durationSeconds)||durationSeconds<=0)return false;
 const id=instrument.toLowerCase();
 if(id.includes('violin'))return durationSeconds>=0.7;
 if(id.includes('bandoneon')||id.includes('voice'))return durationSeconds>=0.85;
 if(id.includes('contrabass')||id.includes('bass'))return durationSeconds>=1.4;
 return false; // Piano samples decay naturally; don't sustain every key with an oscillator.
}
