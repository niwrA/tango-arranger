<script setup lang="ts">
import {computed} from 'vue';
import {chordTones,instrumentFamily,parsePitch,type Instrument} from './music';

/** All highlighted notes are concert-pitch chord tones, not a generated fingering or the
 * exact notes currently being played by this part. Physical stopped-note locations are
 * schematic; bandoneon systems and wind fingerings need an instrument-specific chart. */
const props=defineProps<{instrument:Instrument;chord:string;nextChord:string;currentBeats:string[];upcomingBeats:string[];activeBeat:number}>();
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
function isTone(midi:number){return tones.value.includes(midi%12);}
function isRoot(midi:number){return root.value>=0&&midi%12===root.value;}
function midiLabel(midi:number){return noteName(midi%12)+(Math.floor(midi/12)-1);}
const pianoWhitePcs=[0,2,4,5,7,9,11];
const whiteKeys=Array.from({length:14},(_,i)=>48+Math.floor(i/7)*12+pianoWhitePcs[i%7]);
const blackKeys=whiteKeys.flatMap((note,i)=>{
 const next=whiteKeys[i+1];
 return next!==undefined&&next-note===2?[{midi:note+1,left:(i+1)/whiteKeys.length*100}]:[];
});
const openStrings=computed(()=>{
 if(family.value==='Violin')return [{name:'G3',midi:55},{name:'D4',midi:62},{name:'A4',midi:69},{name:'E5',midi:76}];
 if(family.value==='Contrabass')return [{name:'E1',midi:28},{name:'A1',midi:33},{name:'D2',midi:38},{name:'G2',midi:43}];
 if(family.value==='Guitar')return [{name:'E2',midi:40},{name:'A2',midi:45},{name:'D3',midi:50},{name:'G3',midi:55},{name:'B3',midi:59},{name:'E4',midi:64}];
 return [];
});
const stops=[0,1,2,3,4,5,6,7];
const isStringInstrument=computed(()=>openStrings.value.length>0);
const diagramDescription=computed(()=>{
 if(family.value==='Piano')return 'Two octaves · concert pitches';
 if(isStringInstrument.value)return 'Open strings + chromatic positions · schematic';
 if(family.value==='Bandoneon')return 'Chord tones · no button fingering inferred';
 if(family.value==='Trumpet'||family.value==='Clarinet')return 'Concert pitches · transpose for written part';
 return 'Concert-pitch targets · not fingerings';
});
</script>

<template>
 <div class="performance-instrument-diagram" :aria-label="instrument+' chord note reference. '+diagramDescription">
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
   <div v-if="family==='Piano'" class="diagram-piano" aria-label="Piano keys highlighted at chord pitch classes">
     <div class="diagram-white-keys">
       <div v-for="midi in whiteKeys" :key="midi" class="diagram-white-key" :class="{'is-chord-tone':isTone(midi),'is-root':isRoot(midi)}" :title="midiLabel(midi)">
         <span v-if="isTone(midi)">{{noteName(midi)}}</span>
       </div>
     </div>
     <div class="diagram-black-keys" aria-hidden="true">
       <span v-for="key in blackKeys" :key="key.midi" class="diagram-black-key" :class="{'is-chord-tone':isTone(key.midi),'is-root':isRoot(key.midi)}" :style="{left:key.left+'%'}"><span v-if="isTone(key.midi)">{{noteName(key.midi)}}</span></span>
     </div>
   </div>
   <div v-else-if="isStringInstrument" class="diagram-fingerboard" :aria-label="family+' open strings and schematic semitone positions'">
     <div v-for="string in openStrings" :key="string.midi" class="diagram-string-row">
       <span class="diagram-open-label">{{string.name}}</span>
       <span v-for="offset in stops" :key="offset" class="diagram-string-stop" :class="{'is-chord-tone':isTone(string.midi+offset),'is-root':isRoot(string.midi+offset)}" :title="midiLabel(string.midi+offset)">
         <span v-if="isTone(string.midi+offset)">{{noteName(string.midi+offset)}}</span>
       </span>
     </div>
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
     <div class="diagram-tone-pills"><span v-for="tone in tones" :key="tone" class="diagram-tone-pill" :class="{'is-root':tone===root}">{{noteName(tone)}}</span><span v-if="!tones.length">—</span></div>
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
.diagram-string-stop:first-of-type{border-left:2px solid #e4dfc9}
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

</style>
