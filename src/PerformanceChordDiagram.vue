<script setup lang="ts">
import {computed} from 'vue';
import {chordTones,instrumentFamily,parsePitch,type Instrument} from './music';
import {suggestViolinPosition,violinStopOffsets,type ViolinPosition} from './violinPositions';
import {fingerboardStrings} from './stringFingerboard';
import {positionWindow,type StringPositionGuide} from './stringPositionGuide';
import {pianoWindowCovering} from './pianoRegisters';

/** All highlighted notes are concert-pitch chord tones, not a generated fingering or the
 * exact notes currently being played by this part until live note highlighting is enabled. Physical stopped-note locations are
 * schematic; bandoneon systems and wind fingerings need an instrument-specific chart. */
const props=defineProps<{instrument:Instrument;chord:string;nextChord:string;currentBeats:string[];upcomingBeats:string[];activeBeat:number;activePitches:number[];activeStringNotes?:{pitch:number;stringMidi?:number}[];dimUnplayedChordTones:boolean;violinPosition?:ViolinPosition|null;positionGuide?:StringPositionGuide|null;measurePitches?:number[];registerPitches?:number[];splitPitch?:number;focus?:boolean;learn?:boolean;showTargetLabel?:boolean;targetPitch?:number|null;feedbackProgress?:number;feedbackState?:string;feedbackCents?:number|null;bandoneonHands?:{left:number[];right:number[];inferred:boolean};bandoneonTargetHand?:'left'|'right'}>();
const family=computed(()=>instrumentFamily(props.instrument));
const sharpNames=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const flatNames=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const flatSpelling=computed(()=>/^[A-G]b/.test(props.chord));
const names=computed(()=>flatSpelling.value?flatNames:sharpNames);
function noteName(pc:number){return names.value[((pc%12)+12)%12];}
function toneClasses(symbol:string):number[]{
  if(!/^[A-Ga-g][#b]?[a-zA-Z0-9+#°øΔ()\/-]*$/.test(symbol.trim()))return [];
  return [...new Set(chordTones(symbol))];
}
const tones=computed(()=>toneClasses(props.chord));
const root=computed(()=>{
 const match=props.chord.trim().match(/^([A-Ga-g])([#b]?)/);
 return match?parsePitch(match[1].toUpperCase()+match[2]+'4')!%12:-1;
});
const activeMidi=computed(()=>new Set(props.activePitches));
const activeClasses=computed(()=>new Set(props.activePitches.map(n=>((n%12)+12)%12)));
function isPlayingPitch(midi:number){return activeMidi.value.has(midi);}
const feedbackStyle=computed(()=>({
 '--feedback-fill':Math.round(Math.max(0,Math.min(1,props.feedbackProgress??0))*100)+'%',
 '--feedback-color':props.feedbackState==='Too low'?'#83bfff':props.feedbackState==='Too high'?'#ff9e85':props.feedbackState==='In tune'?'#69d5a1':'#ffd166',
}));
function isTarget(midi:number){return props.targetPitch!==null&&props.targetPitch!==undefined&&props.targetPitch===midi;}
function isTargetStop(openMidi:number,offset:number){
 if(!isTarget(openMidi+offset)||offset===0)return false;
 if(props.positionGuide)return isPlannedStringPitch(openMidi,openMidi+offset);
 return family.value!=='Violin'||props.violinPosition?.openMidi===openMidi;
}
const targetName=computed(()=>props.targetPitch===null||props.targetPitch===undefined?'':midiLabel(props.targetPitch));
function isPlayingTone(tone:number){return activeClasses.value.has(tone);}
function shouldDimTone(midi:number){return props.dimUnplayedChordTones&&isTone(midi)&&!isPlayingPitch(midi);}
function shouldDimClass(tone:number){return props.dimUnplayedChordTones&&tones.value.includes(tone)&&!isPlayingTone(tone);}
function isTone(midi:number){return tones.value.includes(midi%12);}
function isRoot(midi:number){return root.value>=0&&midi%12===root.value;}
function midiLabel(midi:number){return noteName(midi%12)+(Math.floor(midi/12)-1);}
/** The two hand registers independently cover their current measure and sounding
 * notes, even when the bass-to-treble span is too wide for one mini keyboard. */
const pianoHands=computed(()=>{
 const split=props.splitPitch??60;
 const scored=props.measurePitches??[]; // Do not stretch an empty measure to the entire song's pitch span.
 const relevant=[...new Set([...scored,...props.activePitches])];
 return [
  {id:'bass',label:'LH',view:pianoWindowCovering(relevant,'lower',split,12)},
  {id:'upper',label:'RH',view:pianoWindowCovering(relevant,'upper',split,12)}
 ] as const;
});
const plannedPianoPitches=computed(()=>new Set(props.measurePitches??[]));
function isPianoMeasurePitch(midi:number){return plannedPianoPitches.value.has(midi);}
function isPianoBassMidi(midi:number){return midi<(props.splitPitch??60);}
function pianoRegisterCaption(bass:boolean):string {
 const pitches=(props.measurePitches??[]).filter(p=>isPianoBassMidi(p)===bass).sort((a,b)=>a-b);
 if(!pitches.length)return '—';
 const first=pitches[0],last=pitches[pitches.length-1];
 return midiLabel(first)+(last===first?'':'–'+midiLabel(last));
}
const pianoBassCaption=computed(()=>pianoRegisterCaption(true));
const pianoUpperCaption=computed(()=>pianoRegisterCaption(false));
function pianoPitchVisible(midi:number):boolean {
 const view=(isPianoBassMidi(midi)?pianoHands.value[0]:pianoHands.value[1]).view;
 return view.whites.includes(midi)||view.blacks.some(key=>key.pitch===midi);
}
const pianoPitchesOutOfView=computed(()=>(props.measurePitches??[]).filter(midi=>!pianoPitchVisible(midi)).length);
const openStrings=computed(()=>fingerboardStrings(family.value));
const stops=[0,1,2,3,4,5,6,7];
// The open-string cell already represents offset zero. Never render it again
// as a stopped note; the first two stopped cells are +1 and +2 semitones.
const displayedStops=computed(()=>{
 const base=(props.positionGuide?positionWindow(props.positionGuide):family.value==='Violin'?violinStopOffsets(props.violinPosition??null):stops).filter(offset=>offset>0);
 const explicit=(props.activeStringNotes??[]).flatMap(n=>n.stringMidi===undefined?[]:[n.pitch-n.stringMidi]).filter(n=>n>0);
 return [...new Set([...base,...explicit])].sort((a,b)=>a-b);
});
const fingerboardColumns=computed(()=>({'--stop-count':displayedStops.value.length}));
const positionText=computed(()=>props.positionGuide
 ?'Position '+props.positionGuide.position+' · '+(props.positionGuide.thumb?'thumb':'1st finger')+' '+midiLabel(props.positionGuide.anchorMidi)+' on '+midiLabel(props.positionGuide.anchorStringMidi)+' string'
 :props.violinPosition
  ?(props.violinPosition.finger===0?'Open '+props.violinPosition.stringName+' string':'Position '+props.violinPosition.position+' · '+props.violinPosition.stringName+' string · finger '+props.violinPosition.finger)
  :'First position');
function fingerFor(openMidi:number,midi:number):string|null{
 const match=props.positionGuide?.fingerings.find(f=>f.openMidi===openMidi&&f.pitch===midi);
 return match?.finger??null;
}
function isPlannedStringPitch(openMidi:number,midi:number){return fingerFor(openMidi,midi)!==null;}
function stringAnchorLabel(openMidi:number){
 const guide=props.positionGuide;
 return guide?(guide.thumb?'T':'1')+'='+midiLabel(openMidi+guide.firstFingerOffset):'';
}
function isPlayingStringPitch(stringMidi:number,midi:number){
 if(!isPlayingPitch(midi))return false;
 const explicit=(props.activeStringNotes??[]).filter(n=>n.pitch===midi&&n.stringMidi!==undefined);
 if(explicit.length)return explicit.some(n=>n.stringMidi===stringMidi);
 if(props.positionGuide)return isPlannedStringPitch(stringMidi,midi);
 if(family.value!=='Violin')return true;
 return suggestViolinPosition(midi)?.openMidi===stringMidi;
}
const isStringInstrument=computed(()=>openStrings.value.length>0);
/** Actual sounding notes can fall outside the two-octave piano diagram or the
 * seven-semitone string segment. Show those pitches explicitly instead of
 * pretending their octave is on the visible keyboard/fingerboard. */
const unmappedSoundingPitches=computed(()=>props.activePitches.filter(midi=>{
 if(family.value==='Piano')return !pianoPitchVisible(midi);
 if(isStringInstrument.value&&props.positionGuide)return !props.positionGuide.fingerings.some(f=>
   f.pitch===midi&&(f.offset===0||displayedStops.value.includes(f.offset)));
 if(isStringInstrument.value)return !openStrings.value.some(string=>
   (midi===string.midi||displayedStops.value.includes(midi-string.midi))
   &&(family.value!=='Violin'||suggestViolinPosition(midi)?.openMidi===string.midi));
 return true;
}));
/** Live note labels are overlays; they never add flex/grid rows.
 * Bound the visible pitch badges so polyphonic voicings cannot overflow. */
const visibleUnmappedPitches=computed(()=>unmappedSoundingPitches.value.slice(0,3));
const extraUnmappedCount=computed(()=>Math.max(0,unmappedSoundingPitches.value.length-visibleUnmappedPitches.value.length));
const livePitchesLabel=computed(()=>unmappedSoundingPitches.value.map(midiLabel).join(' · '));
const diagramDescription=computed(()=>{
 if(family.value==='Piano')return 'Measure-following piano · bass notes blue, upper notes amber, sounding notes highlighted';
 if(isStringInstrument.value)return 'Open strings + chromatic positions · schematic';
 if(family.value==='Bandoneon')return 'Chord tones · no button fingering inferred';
 if(family.value==='Trumpet'||family.value==='Clarinet')return 'Concert pitches · transpose for written part';
 return 'Concert-pitch targets · not fingerings';
});
</script>

<template>
 <div class="performance-instrument-diagram" :style="feedbackStyle" :class="{'is-focus':props.focus,'is-learn':props.learn}" :aria-label="instrument+' chord note reference. '+diagramDescription">
   <div v-if="props.showTargetLabel&&targetName" class="diagram-learn-target" role="status">PLAY NOW <strong>{{targetName}}</strong><span>Highlighted in amber where represented on the instrument</span></div>
   <div class="diagram-measure-chords" role="group" :aria-label="'Current measure chords, beat '+activeBeat+' of '+currentBeats.length">
    <span v-for="(symbol,index) in currentBeats" :key="index" class="diagram-chord-beat" :class="{'is-current-beat':activeBeat===index+1,'is-continuation':symbol==='–'}" :aria-label="'Beat '+(index+1)+': '+(symbol==='–'?'same chord as previous beat':symbol)">
      <strong>{{symbol}}</strong>
    </span>
   </div>
   <div class="diagram-upcoming-measure" role="group" aria-label="Chords in the next measure">
    <span v-for="(symbol,index) in upcomingBeats" :key="index" class="diagram-next-chord-beat" :class="{'is-continuation':symbol==='–'}" :aria-label="'Next measure beat '+(index+1)+': '+(symbol==='–'?'same chord as previous beat':symbol)">
      <strong>{{symbol}}</strong>
    </span>
   </div>
   <div class="diagram-visual-stage" :class="{'diagram-target-visual':!isStringInstrument&&family!=='Piano'}">
   <div v-if="family==='Piano'" class="diagram-piano diagram-piano-split"
      :aria-label="'Two hand piano reference · left '+midiLabel(pianoHands[0].view.start)+' to '+midiLabel(pianoHands[0].view.end)+'; right '+midiLabel(pianoHands[1].view.start)+' to '+midiLabel(pianoHands[1].view.end)">
      <div v-for="hand in pianoHands" :key="hand.id" class="diagram-piano-register"
        :class="'diagram-piano-register-'+hand.id" :style="{'--piano-white-count':hand.view.whites.length}">
        <div class="diagram-white-keys">
          <div v-for="midi in hand.view.whites" :key="midi" class="diagram-white-key"
            :class="{'is-chord-tone':isTone(midi),'is-root':isRoot(midi),'is-sounding':isPlayingPitch(midi),'is-unplayed-chord-tone':shouldDimTone(midi),
              'is-learn-target':isTarget(midi),'is-piano-measure':isPianoMeasurePitch(midi),'is-piano-bass':hand.id==='bass'&&(isPianoMeasurePitch(midi)||isPlayingPitch(midi)),
              'is-piano-upper':hand.id==='upper'&&(isPianoMeasurePitch(midi)||isPlayingPitch(midi))}"
            :title="midiLabel(midi)+(isPianoMeasurePitch(midi)?' · '+hand.label:'')">
            <span v-if="isPianoMeasurePitch(midi)||isPlayingPitch(midi)||isTarget(midi)">{{noteName(midi)}}</span>
          </div>
        </div>
        <div class="diagram-black-keys" aria-hidden="true">
          <span v-for="key in hand.view.blacks" :key="key.pitch" class="diagram-black-key"
            :class="{'is-chord-tone':isTone(key.pitch),'is-root':isRoot(key.pitch),'is-sounding':isPlayingPitch(key.pitch),'is-unplayed-chord-tone':shouldDimTone(key.pitch),
              'is-learn-target':isTarget(key.pitch),'is-piano-measure':isPianoMeasurePitch(key.pitch),'is-piano-bass':hand.id==='bass'&&(isPianoMeasurePitch(key.pitch)||isPlayingPitch(key.pitch)),
              'is-piano-upper':hand.id==='upper'&&(isPianoMeasurePitch(key.pitch)||isPlayingPitch(key.pitch))}"
            :style="{left:key.left+'%'}" :title="midiLabel(key.pitch)">
            <span v-if="isPianoMeasurePitch(key.pitch)||isPlayingPitch(key.pitch)||isTarget(key.pitch)">{{noteName(key.pitch)}}</span>
          </span>
        </div>
        <span class="diagram-piano-register-badge" aria-hidden="true">{{hand.label}} {{hand.id==='bass'?pianoBassCaption:pianoUpperCaption}}</span>
      </div>
      <span class="diagram-piano-hand-legend" aria-hidden="true"><i class="diagram-piano-hand-bass"/> Bass <i class="diagram-piano-hand-upper"/> Upper
        <span v-if="pianoPitchesOutOfView"> · {{pianoPitchesOutOfView}} notes outside keyboard</span>
      </span>
    </div>
   <div v-else-if="isStringInstrument" class="diagram-fingerboard" :style="fingerboardColumns"
     :class="{'diagram-violin-fingerboard':family==='Violin','diagram-bass-fingerboard':family==='Contrabass'&&Boolean(props.positionGuide),'diagram-has-guide':Boolean(props.positionGuide)}"
     :aria-label="family+' open strings and schematic semitone positions'+(props.positionGuide||family==='Violin'?', '+positionText:'')">
     <span v-if="family==='Violin'||(family==='Contrabass'&&props.positionGuide)" class="diagram-violin-position"
       :title="'Schematic suggestion: '+positionText">{{positionText}}</span>
     <div v-if="props.learn" class="diagram-string-row diagram-stop-header" aria-label="Semitones above open string">
      <span class="diagram-open-heading">Open · 0</span>
      <span v-for="offset in displayedStops" :key="offset" :title="offset+' semitones above open string'">{{offset}}</span>
     </div>
     <div v-for="string in openStrings" :key="string.midi" class="diagram-string-row"
       :class="{'diagram-guided-string-row':Boolean(props.positionGuide)}">
       <span class="diagram-open-label" :class="{'is-sounding':isPlayingStringPitch(string.midi,string.midi),'is-learn-target':isTarget(string.midi)}"
         :title="'Open '+string.name+(props.positionGuide?' · '+stringAnchorLabel(string.midi):'')">
         <strong>{{string.name}}</strong><small v-if="props.positionGuide">{{stringAnchorLabel(string.midi)}}</small>
       </span>
       <span v-for="offset in displayedStops" :key="offset" class="diagram-string-stop"
         :class="{'is-chord-tone':isTone(string.midi+offset),'is-root':isRoot(string.midi+offset),
           'is-sounding':isPlayingStringPitch(string.midi,string.midi+offset),
           'is-measure-note':isPlannedStringPitch(string.midi,string.midi+offset),
           'is-learn-target':isTargetStop(string.midi,offset),
           'is-unplayed-chord-tone':shouldDimTone(string.midi+offset)}"
         :title="midiLabel(string.midi+offset)+(fingerFor(string.midi,string.midi+offset)!==null?' · suggested finger '+fingerFor(string.midi,string.midi+offset):'')">
         <span v-if="isTone(string.midi+offset)||isPlayingPitch(string.midi+offset)||isPlannedStringPitch(string.midi,string.midi+offset)||isTargetStop(string.midi,offset)">{{fingerFor(string.midi,string.midi+offset)??noteName(string.midi+offset)}}</span>
       </span>
     </div>
   </div>
   <div v-else-if="props.learn&&family==='Bandoneon'" class="diagram-bandoneon-practice" role="group" aria-label="Bandoneon notes in the current measure">
     <div v-for="hand in (['left','right'] as const)" :key="hand" class="diagram-bandoneon-hand">
      <strong>{{hand==='left'?'Left hand':'Right hand'}}</strong>
      <div class="diagram-tone-pills">
       <span v-for="pitch in bandoneonHands?.[hand]" :key="pitch" class="diagram-tone-pill"
        :class="{'is-learn-target':hand===bandoneonTargetHand&&isTarget(pitch)}">{{midiLabel(pitch)}}</span>
       <span v-if="!bandoneonHands?.[hand].length" class="diagram-hand-rest">Rest</span>
      </div>
     </div>
     <small v-if="bandoneonHands?.inferred">Register split used for notes without staff assignments</small>
   </div>
   <div v-else class="diagram-targets" :class="'diagram-family-'+family.toLowerCase()" aria-label="Concert-pitch chord tone targets">
     <div class="diagram-targets-graphic" aria-hidden="true">
       <template v-if="family==='Bandoneon'">
         <span class="diagram-bank">◉ ◉ ◉</span><span class="diagram-bellows">▥▥▥</span><span class="diagram-bank">◉ ◉ ◉</span>
       </template>
       <template v-else-if="family==='Trumpet'"><span>○　○　○</span></template>
       <template v-else-if="family==='Trombone'"><span>━━━━━━━━</span></template>
       <template v-else-if="family==='Flute'||family==='Clarinet'"><span>●—●—●—●—●</span></template>
       <template v-else><span>♪ ♫ ♪</span></template>
     </div>
     <div class="diagram-tone-pills"><span v-for="tone in tones" :key="tone" class="diagram-tone-pill"  :class="{'is-learn-target':props.targetPitch!==null&&props.targetPitch!==undefined&&props.targetPitch%12===tone,'is-root':tone===root,'is-sounding':isPlayingTone(tone),'is-unplayed-chord-tone':shouldDimClass(tone)}">{{noteName(tone)}}</span><span v-if="!tones.length">—</span></div>
   </div>
   <div v-if="unmappedSoundingPitches.length" class="diagram-live-pitches" :title="livePitchesLabel" :aria-label="'Additional sounding pitches: '+livePitchesLabel">
    <span v-for="pitch in visibleUnmappedPitches" :key="pitch" class="diagram-live-pitch">{{midiLabel(pitch)}}</span>
    <span v-if="extraUnmappedCount" class="diagram-live-pitch diagram-live-overflow">+{{extraUnmappedCount}}</span>
   </div>
   </div>
 </div>
</template>

<style scoped>
.performance-instrument-diagram{width:100%;min-width:0;display:flex;flex-direction:column;gap:8px;flex:1}
.diagram-harmony-pair{display:grid;grid-template-columns:1fr 1fr;gap:9px;min-width:0;align-items:start}
.diagram-harmony-pair>div{min-width:0;display:flex;flex-direction:column;gap:2px;text-align:left}
.diagram-harmony-pair small{font-size:10px;color:#b9cbd7;font-weight:700;text-transform:uppercase;letter-spacing:.02em}
.diagram-harmony-pair strong{font-size:clamp(22px,2.4vw,35px);line-height:1.08;font-weight:850;overflow-wrap:anywhere;color:#ffe0ae}
.diagram-chord-next strong{color:#e4eef6;font-size:clamp(19px,2vw,30px)}
.diagram-chord-next em{font-size:10px;font-style:normal;font-weight:650;color:#bed0de}
.diagram-piano{position:relative;min-height:94px;height:94px;border-radius:8px;overflow:hidden;border:1px solid #8c9eaf;margin-top:8px;background:#d9e0e7}
.diagram-white-keys{height:100%;display:grid;grid-template-columns:repeat(14,1fr)}
.diagram-white-key{position:relative;background:#ecf0ef;border-right:1px solid #6a7884;color:#1b3442;min-width:0}
.diagram-white-key:last-child{border-right:none}
.diagram-white-key.is-chord-tone{background:#f4d89c}
.diagram-white-key.is-root{background:#efb968}
.diagram-white-key>span{position:absolute;bottom:4px;left:0;right:0;font-size:10px;font-weight:800;text-align:center;white-space:nowrap}
.diagram-black-keys{position:absolute;inset:0;pointer-events:none}
.diagram-black-key{position:absolute;top:0;transform:translateX(-50%);width:4.4%;height:55%;background:#101b24;border:1px solid #536675;border-radius:0 0 4px 4px;display:flex;justify-content:center;align-items:flex-end;padding-bottom:5px;color:#fff;font-size:9px;font-weight:800}
.diagram-black-key.is-chord-tone{background:#ad7e40;border-color:#f3cf87;color:#fff}
.diagram-black-key.is-root{background:#e7aa52;color:#1b2731}
.diagram-fingerboard{display:grid;gap:5px;padding:6px;background:#1a2934;border:1px solid #495f72;border-radius:9px;min-height:120px}
.diagram-fingerboard-header{display:flex;justify-content:space-between;color:#a8bccb;font-size:10px;letter-spacing:.03em}
.diagram-string-row{display:grid;grid-template-columns:34px repeat(8,minmax(0,1fr));align-items:center;gap:3px;min-height:23px}
.diagram-open-label{font-size:11px;color:#dce8ef;font-weight:700}
.diagram-string-stop{height:18px;position:relative;display:flex;align-items:center;justify-content:center;min-width:0;border-radius:4px;border-top:2px solid #8092a1}
.diagram-string-stop:nth-child(2){border-left:2px solid #e4dfc9}
.diagram-string-stop.is-chord-tone{background:#c69c62;color:#17232f;border-top-color:#ffda9e}
.diagram-string-stop.is-root{background:#f1cd8f}
.diagram-string-stop span{font-weight:800;font-size:10px;white-space:nowrap}
.diagram-targets{min-height:116px;display:flex;flex-direction:column;justify-content:space-around;gap:8px;padding:8px;border-radius:9px;background:#1b2b37;border:1px solid #4b6373}
.diagram-targets-graphic{display:flex;align-items:center;justify-content:center;gap:10px;opacity:.55;color:#cbd6dd;font-size:14px;font-weight:650;white-space:nowrap}
.diagram-bellows{font-size:26px;letter-spacing:-5px}
.diagram-tone-pills{display:flex;justify-content:center;flex-wrap:wrap;gap:6px}
.diagram-tone-pill{display:inline-flex;min-width:35px;min-height:33px;padding:5px 8px;border-radius:50%;align-items:center;justify-content:center;color:#172731;background:#c6a371;font-weight:850;font-size:16px}
.diagram-tone-pill.is-root{background:#ffdb98}
.diagram-footer{margin-top:auto;display:flex;gap:2px;flex-direction:column;text-align:left;color:#a6bbcb;font-size:10px;line-height:1.2}
.diagram-next-tones{font-weight:650;color:#cedce5}
@media(max-width:900px){.diagram-harmony-pair strong{font-size:clamp(18px,2.3vw,27px)}.diagram-chord-next strong{font-size:clamp(16px,2vw,24px)}.diagram-white-key>span,.diagram-black-key{font-size:9px}.diagram-fingerboard{min-height:108px}.diagram-string-stop span{font-size:9px}}

/* Beat slots ARE the chord and count-in: one chord onset per measure or a
 * continuation dash. The active playback beat is the only bright slot. */
.diagram-measure-chords,.diagram-upcoming-measure{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);gap:5px;width:100%;min-width:0}
.diagram-chord-beat,.diagram-next-chord-beat{display:flex;align-items:center;justify-content:center;min-width:0;white-space:nowrap;border-radius:7px;border:1px solid #617589;font-variant-numeric:tabular-nums}
.diagram-measure-chords{margin:0 0 1px}
.diagram-chord-beat{height:51px;background:#263846;color:#d6e4ed}
.diagram-chord-beat strong{font-weight:850;font-size:clamp(18px,2vw,30px);line-height:1;overflow:hidden;text-overflow:ellipsis}
.diagram-chord-beat.is-continuation{color:#718996}
.diagram-chord-beat.is-current-beat{background:#f1c587;color:#192731;border-color:#ffe3b5;box-shadow:inset 0 1px rgba(255,255,255,.35),0 0 0 1px #efc58b55}
.diagram-chord-beat.is-current-beat.is-continuation{color:#314353}
.diagram-upcoming-measure{margin:0 0 3px}
.diagram-next-chord-beat{height:33px;background:#1d2d39;border-color:#3a5061;color:#d2dfe9}
.diagram-next-chord-beat strong{font-size:clamp(14px,1.3vw,20px);font-weight:760;overflow:hidden;text-overflow:ellipsis}
.diagram-next-chord-beat.is-continuation{color:#617989}
.performance-instrument-diagram{gap:7px}
.diagram-piano{min-height:80px;height:80px;margin-top:2px}
.diagram-fingerboard{min-height:98px;padding:4px;gap:3px}
.diagram-string-row{min-height:18px}
.diagram-string-stop{height:17px}
.diagram-targets{min-height:83px;gap:5px;padding:6px}
.diagram-tone-pill{min-height:29px;min-width:29px;font-size:14px;padding:4px 6px}
.diagram-targets-graphic{font-size:13px}
@media(max-width:900px){
 .diagram-chord-beat{height:46px}
 .diagram-chord-beat strong{font-size:clamp(18px,2vw,25px)}
 .diagram-next-chord-beat{height:31px}
 .diagram-piano{min-height:77px;height:77px}
 .diagram-fingerboard{min-height:94px}
 .diagram-targets{min-height:78px}
}

/* Prevent changes in chord tone count or live notes from altering chart height.
 * All visual movement is confined to color/highlight changes inside a fixed box. */
.diagram-targets{height:94px;min-height:94px;max-height:94px;box-sizing:border-box;overflow:hidden}
.diagram-fingerboard{height:98px;min-height:98px;max-height:98px;box-sizing:border-box;overflow:hidden}
.diagram-piano{height:80px;min-height:80px;max-height:80px;box-sizing:border-box}
@media(max-width:900px){
 .diagram-targets{height:82px;min-height:82px;max-height:82px}
 .diagram-fingerboard{height:94px;min-height:94px;max-height:94px}
 .diagram-piano{height:77px;min-height:77px;max-height:77px}
}
/* Aqua means the note is actually sounding in this instrument, rather than
 * simply belonging to the theoretical chord. Unplayed chord tones are subdued
 * only for a sounding chord-role voicing. */
.diagram-white-key.is-unplayed-chord-tone:not(.is-sounding),
.diagram-black-key.is-unplayed-chord-tone:not(.is-sounding),
.diagram-string-stop.is-unplayed-chord-tone:not(.is-sounding),
.diagram-tone-pill.is-unplayed-chord-tone:not(.is-sounding){opacity:.28;filter:saturate(.35)}
.diagram-white-key.is-sounding,.diagram-black-key.is-sounding,
.diagram-string-stop.is-sounding,.diagram-tone-pill.is-sounding{
 background:#79e6d4;color:#132e32;border-color:#c6fff3;
 box-shadow:0 0 0 2px #8ffdeb88,0 0 12px #5deace80;
 z-index:2;
}
.diagram-white-key.is-sounding{border-color:#317f75}
.diagram-visual-stage{position:relative;isolation:isolate;min-width:0;flex:0 0 auto}
.diagram-live-pitches{
 position:absolute;z-index:10;right:4px;bottom:3px;max-width:calc(100% - 8px);
 display:flex;align-items:center;justify-content:flex-end;gap:3px;flex-wrap:nowrap;
 min-width:0;min-height:0;overflow:hidden;white-space:nowrap;pointer-events:none;
 background:#14232edb;padding:3px 4px;border-radius:7px;border:1px solid #67988f8c;
}
/* Abstract button and wind charts have no fixed displayed octave. Place their
 * live pitch badges above the chord targets, rather than covering the targets. */
.diagram-target-visual .diagram-live-pitches{top:2px;bottom:auto}
.diagram-live-overflow{font-size:10px;font-weight:800;color:#c6f6ed;background:#315550;border:1px solid #6bb9a5;border-radius:5px;padding:2px 5px}
.diagram-live-pitch{font-size:12px;font-weight:800;color:#17333b;background:#79e6d4;border:1px solid #b4fff3;border-radius:7px;padding:2px 7px;font-variant-numeric:tabular-nums}
@media(prefers-reduced-motion:reduce){
 .diagram-white-key.is-sounding,.diagram-black-key.is-sounding,
 .diagram-string-stop.is-sounding,.diagram-tone-pill.is-sounding{box-shadow:inset 0 0 0 2px #174940}
}

/* Violin positions are deliberate visual shifts within a fixed-size fingerboard,
 * not extra content rows. A stable measure-level reference is supplied by the
 * stage so note attacks never resize or reorder this instrument card. */
.diagram-fingerboard.diagram-violin-fingerboard{position:relative;padding-top:19px;gap:2px}
.diagram-violin-fingerboard .diagram-string-row{min-height:15px}
.diagram-violin-position{
 position:absolute;top:2px;left:5px;right:5px;height:15px;
 overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
 display:block;text-align:center;font-size:10px;line-height:15px;
 font-weight:800;letter-spacing:.01em;color:#ffdaa2;
}
@media(max-width:900px){
 .diagram-violin-position{font-size:9px}
 .diagram-fingerboard.diagram-violin-fingerboard{padding-top:17px;gap:1px}
}

/* Focused instrument scales its visual charts; the normal card stays fixed-height. */
.performance-instrument-diagram.is-focus{flex:1 1 auto;justify-content:center;gap:clamp(10px,2dvh,21px);max-width:1100px;margin:auto}
.performance-instrument-diagram.is-focus .diagram-chord-beat{height:clamp(50px,9dvh,102px)}
.performance-instrument-diagram.is-focus .diagram-chord-beat strong{font-size:clamp(20px,3.6vw,54px)}
.performance-instrument-diagram.is-focus .diagram-next-chord-beat{height:clamp(32px,6dvh,64px)}
.performance-instrument-diagram.is-focus .diagram-next-chord-beat strong{font-size:clamp(15px,2.6vw,33px)}
.performance-instrument-diagram.is-focus .diagram-fingerboard,
.performance-instrument-diagram.is-focus .diagram-fingerboard.diagram-violin-fingerboard{
 display:flex;flex-direction:column;justify-content:space-around;height:clamp(155px,35dvh,330px);
 min-height:155px;max-height:none;gap:clamp(3px,1dvh,10px);padding:clamp(10px,2vw,24px);
}
.performance-instrument-diagram.is-focus .diagram-fingerboard.diagram-violin-fingerboard{padding-top:clamp(34px,6dvh,50px)}
.performance-instrument-diagram.is-focus .diagram-violin-position{top:7px;left:10px;right:10px;height:28px;font-size:clamp(13px,1.8vw,20px);line-height:28px}
.performance-instrument-diagram.is-focus .diagram-string-row{flex:1 1 auto;min-height:0;grid-template-columns:clamp(40px,7vw,80px) repeat(8,minmax(0,1fr));gap:clamp(3px,.8vw,12px)}
.performance-instrument-diagram.is-focus .diagram-open-label{font-size:clamp(13px,1.5vw,22px)}
.performance-instrument-diagram.is-focus .diagram-string-stop{height:clamp(24px,5dvh,48px)}
.performance-instrument-diagram.is-focus .diagram-string-stop span{font-size:clamp(12px,1.6vw,23px)}
.performance-instrument-diagram.is-focus .diagram-piano{height:clamp(145px,35dvh,330px);min-height:145px;max-height:none;margin-top:4px}
.performance-instrument-diagram.is-focus .diagram-white-key>span{font-size:clamp(12px,1.6vw,22px)}
.performance-instrument-diagram.is-focus .diagram-black-key{font-size:clamp(11px,1.4vw,19px)}
.performance-instrument-diagram.is-focus .diagram-targets{height:clamp(145px,35dvh,330px);min-height:145px;max-height:none;gap:clamp(8px,2dvh,20px)}
.performance-instrument-diagram.is-focus .diagram-targets-graphic{font-size:clamp(18px,3vw,35px)}
.performance-instrument-diagram.is-focus .diagram-tone-pill{min-width:clamp(40px,5vw,75px);min-height:clamp(40px,5vw,75px);font-size:clamp(20px,2.3vw,32px)}
.performance-instrument-diagram.is-focus .diagram-live-pitch{font-size:clamp(13px,1.5vw,21px)}
@media(max-width:640px){
 .performance-instrument-diagram.is-focus{gap:7px}
 .performance-instrument-diagram.is-focus .diagram-fingerboard,
 .performance-instrument-diagram.is-focus .diagram-fingerboard.diagram-violin-fingerboard{height:clamp(150px,30dvh,260px)}
 .performance-instrument-diagram.is-focus .diagram-piano,
 .performance-instrument-diagram.is-focus .diagram-targets{height:clamp(145px,30dvh,260px)}
}

/* Position symbols and open-string/first-finger anchors fit fixed-height cards. */
.diagram-fingerboard.diagram-bass-fingerboard{position:relative;padding-top:19px;gap:2px}
.diagram-bass-fingerboard .diagram-string-row{min-height:15px}
.diagram-guided-string-row{grid-template-columns:70px repeat(8,minmax(0,1fr));gap:2px}
.diagram-guided-string-row .diagram-open-label{display:flex;align-items:center;gap:2px;min-width:0;white-space:nowrap;font-size:9px}
.diagram-guided-string-row .diagram-open-label strong{font-size:10px;font-weight:800;color:#e3eef4}
.diagram-guided-string-row .diagram-open-label small{font-size:9px;font-weight:700;color:#ffdda8;white-space:nowrap}
.diagram-guided-string-row .diagram-open-label.is-sounding strong{color:#79e6d4}
.diagram-guided-string-row .diagram-string-stop span{font-size:10px}
.diagram-guided-string-row .diagram-string-stop.is-measure-note{box-shadow:inset 0 0 0 1px #e6b778;color:#ffe7b9}
.diagram-guided-string-row .diagram-string-stop.is-measure-note span{font-weight:900}
.diagram-guided-string-row .diagram-string-stop.is-sounding{box-shadow:0 0 0 2px #8ffdeb88,0 0 12px #5deace80;color:#132e32}
.performance-instrument-diagram.is-focus .diagram-guided-string-row{
 grid-template-columns:clamp(95px,13vw,165px) repeat(8,minmax(0,1fr));gap:clamp(4px,.8vw,12px);
}
.performance-instrument-diagram.is-focus .diagram-guided-string-row .diagram-open-label{gap:7px}
.performance-instrument-diagram.is-focus .diagram-guided-string-row .diagram-open-label strong{font-size:clamp(15px,1.7vw,23px)}
.performance-instrument-diagram.is-focus .diagram-guided-string-row .diagram-open-label small{font-size:clamp(13px,1.5vw,21px)}
.performance-instrument-diagram.is-focus .diagram-guided-string-row .diagram-string-stop span{font-size:clamp(14px,1.7vw,24px)}
.performance-instrument-diagram.is-focus .diagram-fingerboard.diagram-bass-fingerboard{
 display:flex;flex-direction:column;justify-content:space-around;height:clamp(155px,35dvh,330px);
 min-height:155px;max-height:none;gap:clamp(3px,1dvh,10px);padding:clamp(34px,6dvh,50px) clamp(10px,2vw,24px) clamp(10px,2vw,24px);
}
@media(max-width:900px){
 .diagram-fingerboard.diagram-bass-fingerboard{padding-top:17px;gap:1px}
 .diagram-guided-string-row{grid-template-columns:68px repeat(8,minmax(0,1fr))}
 .diagram-guided-string-row .diagram-string-stop span{font-size:9px}
}

/* Adaptive compact piano: each hand independently covers its scored note span. */
.diagram-white-keys{grid-template-columns:repeat(var(--piano-white-count,14),minmax(0,1fr))}
.diagram-black-key{width:calc(65% / var(--piano-white-count,14))}
.diagram-piano .diagram-white-key.is-piano-measure.is-unplayed-chord-tone:not(.is-sounding),
.diagram-piano .diagram-black-key.is-piano-measure.is-unplayed-chord-tone:not(.is-sounding){opacity:1;filter:none}
.diagram-piano .diagram-white-key.is-piano-bass{background:#9ab9e4;color:#182c44;border-bottom:3px solid #4d80c5}
.diagram-piano .diagram-black-key.is-piano-bass{background:#648bc2;color:#fff;border-color:#93b9ed}
.diagram-piano .diagram-white-key.is-piano-upper{background:#f1cc89;color:#382715;border-bottom:3px solid #c69b4b}
.diagram-piano .diagram-black-key.is-piano-upper{background:#bd8e49;color:#fff;border-color:#f2c779}
.diagram-piano .diagram-white-key.is-piano-bass.is-sounding,.diagram-piano .diagram-black-key.is-piano-bass.is-sounding{
 background:#7eb7fa;color:#12263b;border-color:#cbe4ff;box-shadow:inset 0 0 0 2px #3669ac,0 0 0 2px #8cb6fa88;z-index:3
}
.diagram-piano .diagram-white-key.is-piano-upper.is-sounding,.diagram-piano .diagram-black-key.is-piano-upper.is-sounding{
 background:#ffe1a1;color:#2d2111;border-color:#fff0c1;box-shadow:inset 0 0 0 2px #bd8431,0 0 0 2px #f5d083aa;z-index:3
}
.diagram-piano .diagram-white-key>span{font-size:clamp(8px,.77vw,10px)}
.diagram-piano .diagram-black-key>span{font-size:8px}
.diagram-piano-hand-legend{
 position:absolute;z-index:4;bottom:2px;left:3px;display:flex;align-items:center;gap:3px;
 background:#192e3edc;border:1px solid #688395aa;border-radius:5px;padding:1px 4px;
 color:#f3f6fa;font-size:9px;font-weight:800;pointer-events:none;max-width:calc(100% - 6px);
 white-space:nowrap;overflow:hidden;text-overflow:ellipsis
}
.diagram-piano-hand-legend i{display:inline-block;width:7px;height:7px;flex:0 0 7px;border-radius:2px}
.diagram-piano-hand-bass{background:#9ab9e4}.diagram-piano-hand-upper{background:#f1cc89}
@media(max-width:900px){.diagram-piano-hand-legend{font-size:8px}.diagram-piano .diagram-white-key>span{font-size:8px}}

/* Each keyboard labels its own actual scored octave span. */
.diagram-piano-register-labels{position:absolute;z-index:5;top:2px;left:3px;right:3px;display:flex;justify-content:space-between;align-items:center;gap:4px;pointer-events:none}
.diagram-piano-register-labels>span{min-width:0;max-width:50%;padding:1px 4px;border-radius:4px;background:#1b2d3fdb;color:#fff1d8;border:1px solid #8192a3aa;font-size:9px;font-weight:800;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-variant-numeric:tabular-nums}
@media(max-width:800px){.diagram-piano-register-labels>span{font-size:8px;padding:1px 2px}}

/* Both hands stay within the card. Individual registers widen only as needed
 * for the current measure, rather than silently hiding distant notes. */
.diagram-piano.diagram-piano-split{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;padding:2px;background:#213546;overflow:hidden}
.diagram-piano-register{position:relative;min-width:0;height:100%;overflow:hidden;border-radius:5px;background:#d9e0e7}
.diagram-piano-register-badge{position:absolute;z-index:5;top:2px;left:2px;max-width:calc(100% - 4px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:#1b2d3fdf;color:#fff0d5;border:1px solid #8192a3aa;border-radius:4px;padding:1px 3px;font-size:clamp(7px,.7vw,9px);font-weight:800;pointer-events:none;font-variant-numeric:tabular-nums}
.diagram-piano-split .diagram-white-keys{grid-template-columns:repeat(var(--piano-white-count,12),minmax(0,1fr))}
.diagram-piano-split .diagram-black-key{width:calc(65% / var(--piano-white-count,12))}
.diagram-piano-split .diagram-piano-hand-legend{left:50%;transform:translateX(-50%);bottom:1px}
@media(max-width:700px){.diagram-piano.diagram-piano-split{gap:2px}.diagram-piano-register-badge{font-size:7px;padding:1px 2px}.diagram-piano-split .diagram-piano-hand-legend{font-size:7px}}

/* Amber means the expected Learn note, distinct from sounding-note aqua.
   For strings and keyboard keys, only the exact MIDI pitch is highlighted. */
.diagram-learn-target{display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:wrap;padding:5px 7px;background:#5b4324;border:2px solid #f8cd6f;border-radius:8px;color:#fff1ce;font-size:12px;font-weight:800}
.diagram-learn-target strong{font-size:23px;color:#fff}
.diagram-learn-target span{font-size:10px;font-weight:500}
.diagram-fingerboard .diagram-string-stop.is-learn-target,
.diagram-fingerboard .diagram-open-label.is-learn-target,
.diagram-piano .diagram-white-key.is-learn-target,
.diagram-piano .diagram-black-key.is-learn-target,
.diagram-tone-pill.is-learn-target{background:#ffd166!important;color:#201c13!important;border:2px solid #fff2a8!important;box-shadow:inset 0 0 0 2px #9a641b,0 0 0 3px #ffcf66,0 0 15px #ffcf6688!important;opacity:1!important;filter:none!important;z-index:9}
.diagram-fingerboard .diagram-open-label.is-learn-target strong{color:#2d2116}
.performance-instrument-diagram.is-focus.is-learn{gap:7px}
.diagram-bandoneon-practice{display:grid;gap:8px;padding:10px;border:1px solid #495f72;border-radius:9px;text-align:center}
.diagram-bandoneon-hand{display:grid;grid-template-columns:5.5rem minmax(0,1fr);align-items:center;gap:7px;text-align:left;min-height:38px}
.diagram-bandoneon-hand .diagram-tone-pills{justify-content:flex-start}
.diagram-hand-rest{color:#bacbd6}
.performance-instrument-diagram.is-focus .diagram-bandoneon-practice .diagram-tone-pill{min-width:0;min-height:36px;font-size:clamp(14px,2vw,22px)}
.performance-instrument-diagram.is-focus.is-learn .diagram-fingerboard{
 display:grid;grid-auto-rows:minmax(26px,auto);height:auto;min-height:0;max-height:none;
 padding:6px;gap:3px;align-content:start;
}
.performance-instrument-diagram.is-focus.is-learn .diagram-violin-position{
 position:static;height:auto;min-width:0;font-size:12px;line-height:26px;
}
.performance-instrument-diagram.is-focus.is-learn .diagram-string-row{grid-template-columns:clamp(27px,7vw,52px) repeat(8,minmax(0,1fr));gap:3px}
.performance-instrument-diagram.is-focus.is-learn .diagram-guided-string-row{grid-template-columns:clamp(60px,15vw,95px) repeat(8,minmax(0,1fr))}
.performance-instrument-diagram.is-focus.is-learn .diagram-string-stop,.is-learn .diagram-open-label{
 box-sizing:border-box;height:26px;display:flex;align-items:center;
}
.is-learn .diagram-open-label{padding-inline:2px;border:2px solid transparent;border-radius:4px}
.is-learn .diagram-string-stop.is-learn-target,.is-learn .diagram-open-label.is-learn-target{box-shadow:inset 0 0 0 1px #9a641b!important}
.performance-instrument-diagram.is-focus.is-learn .diagram-string-stop span{font-size:clamp(10px,1.8vw,16px);line-height:1}
@media(max-width:760px){.is-learn .diagram-chord-beat{height:28px!important}.is-learn .diagram-next-chord-beat{height:24px!important}.is-learn .diagram-learn-target{padding:3px 5px}.is-learn .diagram-learn-target strong{font-size:18px}.is-learn .diagram-learn-target span{display:none}}

/* Learn Diagram: the physical playing surface is the primary reference.
   Harmony stays available as a compact beat strip below the fingerboard. */
.performance-instrument-diagram.is-focus.is-learn:has(.diagram-fingerboard){
 justify-content:flex-start;gap:8px;max-width:1280px;
}
.performance-instrument-diagram.is-focus.is-learn:has(.diagram-fingerboard) .diagram-learn-target{
 order:0;justify-content:flex-start;padding:7px 12px;gap:10px;
}
.performance-instrument-diagram.is-focus.is-learn:has(.diagram-fingerboard) .diagram-visual-stage{order:1}
.performance-instrument-diagram.is-focus.is-learn:has(.diagram-fingerboard) .diagram-measure-chords{order:2}
.performance-instrument-diagram.is-focus.is-learn:has(.diagram-fingerboard) .diagram-upcoming-measure{order:3}
.performance-instrument-diagram.is-focus.is-learn .diagram-fingerboard.diagram-violin-fingerboard{
 padding:12px;gap:7px;grid-auto-rows:minmax(43px,auto);background:#152936;
}
.performance-instrument-diagram.is-focus.is-learn .diagram-fingerboard.diagram-violin-fingerboard .diagram-violin-position{
 line-height:24px;font-size:15px;text-align:left;padding-left:5px;
}
.performance-instrument-diagram.is-focus.is-learn .diagram-fingerboard.diagram-violin-fingerboard .diagram-string-row{min-height:43px;gap:6px}
.performance-instrument-diagram.is-focus.is-learn .diagram-fingerboard.diagram-violin-fingerboard .diagram-string-stop{
 height:37px;border-top-width:3px;
}
.performance-instrument-diagram.is-focus.is-learn .diagram-fingerboard.diagram-violin-fingerboard .diagram-open-label{height:37px}
.performance-instrument-diagram.is-focus.is-learn:has(.diagram-fingerboard) .diagram-chord-beat{height:43px}
.performance-instrument-diagram.is-focus.is-learn:has(.diagram-fingerboard) .diagram-chord-beat strong{font-size:clamp(17px,2vw,26px)}
.performance-instrument-diagram.is-focus.is-learn:has(.diagram-fingerboard) .diagram-next-chord-beat{height:29px}
.performance-instrument-diagram.is-focus.is-learn:has(.diagram-fingerboard) .diagram-next-chord-beat strong{font-size:clamp(13px,1.4vw,18px)}
@media(max-width:760px){
 .performance-instrument-diagram.is-focus.is-learn .diagram-fingerboard.diagram-violin-fingerboard{
  padding:6px;gap:3px;grid-auto-rows:minmax(29px,auto)
 }
 .performance-instrument-diagram.is-focus.is-learn .diagram-fingerboard.diagram-violin-fingerboard .diagram-string-row{min-height:29px;gap:3px}
 .performance-instrument-diagram.is-focus.is-learn .diagram-fingerboard.diagram-violin-fingerboard .diagram-string-stop,
 .performance-instrument-diagram.is-focus.is-learn .diagram-fingerboard.diagram-violin-fingerboard .diagram-open-label{height:26px}
}


.performance-instrument-diagram.is-learn .is-learn-target{position:relative}
.performance-instrument-diagram.is-learn .diagram-string-stop.is-learn-target,
.performance-instrument-diagram.is-learn .diagram-open-label.is-learn-target,
.performance-instrument-diagram.is-learn .diagram-white-key.is-learn-target,
.performance-instrument-diagram.is-learn .diagram-black-key.is-learn-target{
 background-image:linear-gradient(90deg,var(--feedback-color) 0 var(--feedback-fill),transparent var(--feedback-fill) 100%)!important;
 background-blend-mode:normal;
}
.performance-instrument-diagram.is-learn .is-learn-target{transition:background-image 80ms linear}

/* All columns share one geometry; the open string is a real cell, not a label
   taking up an extra hidden semitone. Number the stopped cells in Learn. */
.performance-instrument-diagram .diagram-fingerboard .diagram-string-row{
 grid-template-columns:repeat(calc(var(--stop-count,7) + 1),minmax(0,1fr));
}
.diagram-fingerboard .diagram-open-label{
 display:flex;align-items:center;justify-content:center;gap:2px;min-width:0;
 border:1px solid #70899a;border-radius:5px;background:#263d4d;
 box-sizing:border-box;height:18px;text-align:center;
}
.diagram-fingerboard .diagram-open-label.is-sounding{background:#79e6d4;color:#132e32}
.diagram-fingerboard .diagram-open-label.is-sounding strong{color:#132e32}
.diagram-fingerboard .diagram-guided-string-row .diagram-open-label{flex-wrap:wrap;line-height:1}
.diagram-fingerboard .diagram-stop-header{
 color:#b8ccd9;text-align:center;font-size:11px;font-weight:700;min-height:18px;
}
.performance-instrument-diagram.is-focus.is-learn .diagram-fingerboard .diagram-stop-header{
 min-height:18px;line-height:18px;align-self:center;
}
.performance-instrument-diagram.is-focus.is-learn .diagram-fingerboard{
 grid-auto-rows:auto;
}
.performance-instrument-diagram.is-focus .diagram-fingerboard .diagram-open-label{
 height:clamp(24px,5dvh,48px);
}
.performance-instrument-diagram.is-focus.is-learn .diagram-fingerboard .diagram-open-label{height:26px}
.performance-instrument-diagram.is-focus.is-learn .diagram-fingerboard.diagram-violin-fingerboard .diagram-open-label{height:37px}
@media(max-width:760px){
 .performance-instrument-diagram.is-focus.is-learn .diagram-fingerboard.diagram-violin-fingerboard .diagram-open-label{height:26px}
 .diagram-fingerboard .diagram-stop-header{font-size:10px}
}
</style>
