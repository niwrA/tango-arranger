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
 if(id.includes('piano')||id.includes('guitar'))return false;
 if(id.includes('violin'))return durationSeconds>=0.5;
 // Bandoneon bypasses this one-shot policy and uses modeled reeds.
 if(id.includes('voice'))return durationSeconds>=0.65;
 if(id.includes('contrabass')||id.includes('bass'))return durationSeconds>=1.2;
 // Winds and other explicitly sustained parts must not fall back to the
 // generic short piano sample for long notes either.
 return durationSeconds>=0.7;
}
