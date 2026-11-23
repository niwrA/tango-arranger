<script setup lang="ts">
import {computed,onBeforeUnmount,onMounted,ref} from 'vue';
import {practiceRecordingPulse,type PracticeRecordingClock} from './practiceRecordingPulse';

const props=defineProps<{clock:PracticeRecordingClock;beats:number;firstMeasure:number}>();
const now=ref(performance.now());
let frame=0;
function update(time:number){
 now.value=time;
 frame=requestAnimationFrame(update);
}
onMounted(()=>{frame=requestAnimationFrame(update);});
onBeforeUnmount(()=>cancelAnimationFrame(frame));
const pulse=computed(()=>practiceRecordingPulse((now.value-props.clock.startMs)/props.clock.msPerBeat,
 props.beats,props.clock.totalBeats,props.firstMeasure));
const label=computed(()=>pulse.value.phase==='count-in'?'Count-in · Get ready':
 pulse.value.phase==='finish'?'Finishing recording':`Recording · Measure ${pulse.value.measure}`);
</script>

<template>
 <div class="recording-beat" :class="{'is-count-in':pulse.phase==='count-in'}" aria-label="Visual recording metronome">
  <div class="recording-beat-heading">
   <strong role="status">{{label}}</strong>
   <span>{{Math.round(60000/clock.msPerBeat)}} BPM</span>
  </div>
  <div class="recording-beat-grid" :style="{gridTemplateColumns:`repeat(${beats},minmax(0,1fr))`}">
   <div v-for="tick in beats" :key="tick" class="recording-beat-cell"
    :class="{'is-downbeat':tick===1,'is-current':tick===pulse.beat,'is-elapsed':tick<pulse.beat}"
    :aria-current="tick===pulse.beat?'step':undefined">
    <strong>{{tick}}</strong><span v-if="tick===1">Downbeat</span>
    <div v-if="tick===pulse.beat" class="recording-beat-progress" :style="{transform:`scaleX(${pulse.progress})`}" aria-hidden="true"></div>
   </div>
  </div>
 </div>
</template>

<style scoped>
.recording-beat{--beat-accent:#7de3b5;box-sizing:border-box;width:100%;padding:5px 7px 7px;border:1px solid #527886;border-radius:8px;background:#142733}
.recording-beat.is-count-in{--beat-accent:#ffd489}
.recording-beat-heading{display:flex;justify-content:space-between;gap:6px;align-items:baseline;margin-bottom:4px;font-size:12px}
.recording-beat-heading strong{color:var(--beat-accent)}
.recording-beat-heading>span{color:#d5e2eb;font-variant-numeric:tabular-nums;white-space:nowrap}
.recording-beat-grid{display:grid;gap:5px}
.recording-beat-cell{min-width:0;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;gap:4px;min-height:clamp(34px,6vh,56px);padding:0 3px 3px;border:1px solid #557080;border-radius:5px;background:#233b4a;color:#e5edf4}
.recording-beat-cell strong{font-size:clamp(18px,3vw,32px);line-height:1;font-variant-numeric:tabular-nums}
.recording-beat-cell span{font-size:10px;font-weight:650;overflow:hidden;text-overflow:ellipsis}
.recording-beat-cell.is-downbeat{border-width:2px}
.recording-beat-cell.is-current{background:var(--beat-accent);border-color:#fff8;color:#122530}
.recording-beat-cell.is-elapsed:not(.is-current){background:#1b303c;color:#a9bfcd}
.recording-beat-progress{position:absolute;bottom:0;left:0;width:100%;height:4px;background:#16303c;transform-origin:left}
@media(prefers-reduced-motion:reduce){.recording-beat-progress{display:none}}
</style>
