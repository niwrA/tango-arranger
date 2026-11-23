/** Convert an exact written MIDI pitch into frequency using a selectable A4. */
export function expectedFrequency(midi:number,referenceHz:number):number{
 if(!Number.isFinite(midi)||!Number.isFinite(referenceHz)||referenceHz<=0)throw Error('Invalid tuning');
 return referenceHz*Math.pow(2,(midi-69)/12);
}
export function deviationCents(frequency:number,midi:number,referenceHz:number,allowAnyOctave=false):number|null{
 if(!Number.isFinite(frequency)||frequency<=0)return null;
 const cents=1200*Math.log2(frequency/expectedFrequency(midi,referenceHz));
 return allowAnyOctave?cents-1200*Math.round(cents/1200):cents;
}
export function matchesPracticePitch(detected:number,expected:number,allowAnyOctave=false):boolean {
 return allowAnyOctave?(detected-expected)%12===0:detected===expected;
}
/** Higher microphone sensitivity accepts quieter signals while retaining
 * the pitch detector's separate periodicity/clarity test. */
export function sensitivityThresholdDb(percent:number):number{
 const amount=Math.max(0,Math.min(100,Number.isFinite(percent)?percent:50));
 return -30-amount*0.5;
}
