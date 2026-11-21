const NOTE_NAMES=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
export const TUNER_TOLERANCE_CENTS=5;

/** Convert a sounding estimate to a writable score pitch, without silently clipping it. */
export function microphoneScoreMidi(midi:number,scoreShiftSemitones:number){
 if(!Number.isFinite(midi)||!Number.isFinite(scoreShiftSemitones))return null;
 const scoreMidi=Math.round(midi)-Math.round(scoreShiftSemitones);
 return scoreMidi>=0&&scoreMidi<=127?scoreMidi:null;
}

export function tunerNote(midi:number){
 const rounded=Math.round(midi);
 return {name:NOTE_NAMES[((rounded%12)+12)%12],octave:Math.floor(rounded/12)-1};
}

/** The display follows the sounding pitch; only the score preview removes the rehearsal shift. */
export function microphoneTunerReading(midi:number|null,scoreShiftSemitones=0){
 if(midi===null||!Number.isFinite(midi))return null;
 const nearestMidi=Math.round(midi);
 const cents=(midi-nearestMidi)*100;
 const roundedCents=Math.round(cents)||0;
 const inTune=Math.abs(cents)<=TUNER_TOLERANCE_CENTS;
 const scoreMidi=microphoneScoreMidi(midi,scoreShiftSemitones);
 return {
  ...tunerNote(nearestMidi),nearestMidi,cents,roundedCents,
  meterPercent:Math.max(0,Math.min(100,cents+50)),
  inTune,direction:inTune?'In tune':cents<0?'Flat':'Sharp',
  score:scoreMidi!==null?tunerNote(scoreMidi):null
 };
}

export function microphoneTunerPrompt(active:boolean,inputDb:number|null,thresholdDb:number){
 if(!active)return 'Start Test microphone or Record';
 if(inputDb!==null&&Number.isFinite(inputDb)&&inputDb>=thresholdDb)return 'Signal detected · no steady pitch';
 return 'Listening · sing or play one note';
}
