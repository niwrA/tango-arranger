<script setup lang="ts">
import {computed} from 'vue';
import {microphoneTunerPrompt,microphoneTunerReading,TUNER_TOLERANCE_CENTS} from './microphoneTuner';

const props=defineProps<{
 estimate:{midi:number;frequency:number;clarity:number}|null;
 inputDb:number|null;
 active:boolean;
 scoreShiftSemitones:number;
 thresholdDb:number;
}>();
const reading=computed(()=>microphoneTunerReading(props.active?props.estimate?.midi??null:null,props.scoreShiftSemitones));
const prompt=computed(()=>microphoneTunerPrompt(props.active,props.inputDb,props.thresholdDb));
const inputLevel=computed(()=>props.active&&props.inputDb!==null&&Number.isFinite(props.inputDb)?Math.max(-90,Math.min(0,props.inputDb)):null);
const levelLabel=computed(()=>inputLevel.value===null?'Off':Math.round(inputLevel.value)+' dBFS');
const centsLabel=computed(()=>{
 const cents=reading.value?.roundedCents;
 return cents===undefined?'':(cents>0?'+':cents<0?'−':'')+Math.abs(cents)+' cents';
});
</script>

<template>
 <section class="microphone-tuner" :class="{'is-in-tune':reading?.inTune,'has-pitch':reading}" aria-label="Microphone tuner">
  <div class="tuner-pitch">
   <span class="tuner-eyebrow">Detected pitch</span>
   <div class="tuner-note"><strong>{{reading?.name??'—'}}</strong><span v-if="reading" class="tuner-octave">{{reading.octave}}</span></div>
   <span v-if="reading" class="tuner-score">Score <strong v-if="reading.score">{{reading.score.name}}{{reading.score.octave}}</strong><span v-else>out of MIDI range</span><span v-if="scoreShiftSemitones"> · {{scoreShiftSemitones>0?'−':'+'}}{{Math.abs(scoreShiftSemitones)}} semitones</span></span>
   <span v-else class="tuner-score">{{active?'Listening…':'Microphone off'}}</span>
  </div>
  <div class="tuner-guidance">
   <div class="tuner-deviation">
    <strong v-if="reading" class="tuner-cents">{{centsLabel}}</strong>
    <strong v-else class="tuner-prompt">{{prompt}}</strong>
    <span v-if="reading" class="tuner-direction">{{reading.direction}}</span>
   </div>
   <div class="tuner-scale" :role="reading?'meter':undefined" :aria-label="reading?'Tuning deviation from the nearest note':undefined"
    :aria-valuemin="reading?-50:undefined" :aria-valuemax="reading?50:undefined" :aria-valuenow="reading?.roundedCents"
    :aria-valuetext="reading?centsLabel+', '+reading.direction:undefined">
    <span class="tuner-target" aria-hidden="true"></span>
    <span v-for="tick in [0,25,50,75,100]" :key="tick" class="tuner-tick" :class="{'tuner-center':tick===50}" :style="{left:tick+'%'}" aria-hidden="true"></span>
    <span v-if="reading" class="tuner-needle" :style="{left:reading.meterPercent+'%'}" aria-hidden="true"></span>
   </div>
   <div class="tuner-scale-labels" aria-hidden="true"><span>−50 · Flat</span><span>0</span><span>Sharp · +50</span></div>
   <div class="tuner-reference"><span v-if="reading&&estimate">{{estimate.frequency.toFixed(1)}} Hz · </span>A4 = 440 Hz <span>· target ±{{TUNER_TOLERANCE_CENTS}} cents</span></div>
  </div>
  <div class="tuner-input">
   <span class="tuner-level-label">Input <strong>{{levelLabel}}</strong></span>
   <meter class="tuner-level-meter" min="-90" max="0" low="-60" high="-6" optimum="-18" :value="inputLevel??-90" aria-label="Microphone signal level" :aria-valuetext="levelLabel"></meter>
   <span v-if="reading&&estimate" class="tuner-clarity" title="Periodicity measured by the pitch detector; this is not a calibrated confidence score.">Pitch clarity {{Math.round(Math.max(0,Math.min(1,estimate.clarity))*100)}}%</span>
   <span v-else class="tuner-clarity">One note at a time</span>
  </div>
 </section>
</template>

<style scoped>
.microphone-tuner{display:grid;grid-template-columns:minmax(108px,.65fr) minmax(0,2fr);gap:8px 22px;min-width:0;padding:14px 18px 11px;border:1px solid #577181;border-radius:10px;background:#182e3c;color:#dce8ef;font-variant-numeric:tabular-nums}
.microphone-tuner.is-in-tune{border-color:#6da999}
.tuner-pitch{min-width:0;display:flex;flex-direction:column;align-items:flex-start}
.tuner-eyebrow{font-size:10px;line-height:1.4;letter-spacing:.08em;text-transform:uppercase;color:#b2c8d6;font-weight:700}
.tuner-note{display:flex;align-items:baseline;gap:3px;min-height:62px;line-height:1;color:#f2d6a5}
.tuner-note>strong{font-size:56px;font-weight:800;letter-spacing:-.04em;line-height:1.12}
.tuner-octave{font-size:25px;font-weight:650;color:inherit}
.is-in-tune .tuner-note,.is-in-tune .tuner-cents,.is-in-tune .tuner-direction{color:#a1e1c7}
.tuner-score{font-size:11px;line-height:1.4;color:#b5cad8}
.tuner-score strong{color:#e1edf4;font-weight:700}
.tuner-guidance{align-self:center;min-width:0}
.tuner-deviation{display:flex;align-items:baseline;justify-content:space-between;gap:8px;min-height:28px;margin:0 0 8px}
.tuner-cents{font-size:22px;line-height:1.1;color:#f2d6a5;font-weight:750;white-space:nowrap}
.tuner-direction{font-size:12px;font-weight:700;color:#ead0a7}
.tuner-prompt{font-size:13px;line-height:1.4;color:#bdced9;font-weight:550}
.tuner-scale{position:relative;height:20px;margin:0 3px;border-top:1px solid #607888;border-bottom:1px solid #607888;background:#122531}
.tuner-target{position:absolute;top:0;bottom:0;left:45%;width:10%;background:#3c796957}
.tuner-tick{position:absolute;top:4px;bottom:4px;width:1px;background:#8499a5}
.tuner-tick.tuner-center{top:0;bottom:0;background:#9ad6be}
.tuner-needle{position:absolute;top:-4px;bottom:-4px;width:3px;transform:translateX(-50%);border-radius:2px;background:#f2d6a5;box-shadow:0 0 0 1px #152430}
.is-in-tune .tuner-needle{background:#a1e1c7}
.tuner-scale-labels{display:flex;justify-content:space-between;gap:7px;margin-top:5px;font-size:10px;line-height:1.3;color:#c0cfd9}
.tuner-reference{margin-top:6px;font-size:10px;line-height:1.4;color:#99b3c3}
.tuner-reference>span{display:inline}
.tuner-input{grid-column:1/-1;display:flex;align-items:center;gap:10px;min-width:0;padding-top:7px;border-top:1px solid #3b5363}
.tuner-level-label{flex:0 0 auto;font-size:10px;color:#b5cad8;white-space:nowrap}
.tuner-level-label strong{color:#dce8ef;font-weight:650}
.tuner-level-meter{display:block;flex:1 1 80px;min-width:30px;max-width:180px;height:9px;margin:0;accent-color:#94d6bc}
.tuner-level-meter::-webkit-meter-bar{background:#101e28;border:1px solid #486271;border-radius:4px}
.tuner-level-meter::-webkit-meter-optimum-value{background:#94d6bc}
.tuner-level-meter::-webkit-meter-suboptimum-value{background:#e6c592}
.tuner-level-meter::-webkit-meter-even-less-good-value{background:#eea697}
.tuner-level-meter::-moz-meter-bar{background:#94d6bc}
.tuner-clarity{margin-left:auto;font-size:10px;color:#b5cad8;text-align:right}
@media(max-width:480px){.microphone-tuner{grid-template-columns:90px minmax(0,1fr);gap:8px 12px;padding:12px}.tuner-note>strong{font-size:49px}.tuner-note{min-height:57px}.tuner-octave{font-size:22px}.tuner-cents{font-size:18px}.tuner-deviation{gap:4px;flex-wrap:wrap;min-height:30px}.tuner-direction{font-size:10px}.tuner-reference{font-size:9px}.tuner-input{gap:6px}.tuner-level-meter{max-width:100px}.tuner-clarity{font-size:9px}}
@media(max-width:340px){.microphone-tuner{grid-template-columns:74px minmax(0,1fr);gap:8px}.tuner-note>strong{font-size:42px}.tuner-score{font-size:10px}.tuner-prompt{font-size:11px}.tuner-reference>span:last-child{display:none}.tuner-clarity{max-width:90px}}
</style>
