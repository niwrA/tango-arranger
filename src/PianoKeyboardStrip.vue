<script setup lang="ts">
import {computed} from 'vue';
import type {PianoWindow} from './pianoRegisters';
const props=defineProps<{
 window:PianoWindow;activePitches:number[];measurePitches:number[];chordTones:number[];label:string
}>();
const active=computed(()=>new Set(props.activePitches));
const planned=computed(()=>new Set(props.measurePitches));
const tones=computed(()=>new Set(props.chordTones));
const names=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
function pitchName(p:number){return names[p%12]+(Math.floor(p/12)-1);}
function marked(p:number){return {
 'is-active':active.value.has(p),
 'is-planned':planned.value.has(p)&&!active.value.has(p),
 'is-chord-tone':tones.value.has(p%12)&&!active.value.has(p)&&!planned.value.has(p)
};}
</script>
<template>
 <div class="piano-register-keyboard" role="img" :aria-label="label+' '+pitchName(window.start)+' to '+pitchName(window.end)">
  <div class="piano-register-white">
   <span v-for="pitch in window.whites" :key="pitch" class="piano-register-white-key" :class="marked(pitch)" :title="pitchName(pitch)">
    <small v-if="pitch%12===0||pitch===21||pitch===108">{{pitchName(pitch)}}</small>
   </span>
  </div>
  <div class="piano-register-black" aria-hidden="true">
   <span v-for="key in window.blacks" :key="key.pitch" class="piano-register-black-key"
    :class="marked(key.pitch)" :title="pitchName(key.pitch)" :style="{left:key.left+'%'}"/>
  </div>
 </div>
</template>
<style scoped>
.piano-register-keyboard{position:relative;width:100%;height:clamp(92px,min(22dvh,32vw),240px);align-self:center;flex:0 0 auto;min-height:0;max-height:240px;background:#d5dee4;border-radius:10px;border:1px solid #718391;box-sizing:border-box;overflow:hidden}
.piano-register-white{display:flex;position:absolute;inset:0}
.piano-register-white-key{position:relative;flex:1 1 0;min-width:0;background:#f2f1ec;border-right:1px solid #8899a5;box-sizing:border-box}
.piano-register-white-key:last-child{border-right:0}
.piano-register-white-key small{position:absolute;bottom:6px;left:0;right:0;text-align:center;color:#3c5261;font-size:clamp(9px,1.1vw,14px);font-weight:700}
.piano-register-black{position:absolute;inset:0;pointer-events:none}
.piano-register-black-key{position:absolute;top:0;transform:translateX(-50%);width:3.5%;height:58%;background:#1d2a35;border:1px solid #627685;border-radius:0 0 5px 5px;box-sizing:border-box}
.piano-register-white-key.is-chord-tone{background:#f2f1ec;box-shadow:inset 0 -4px #d2a452}
.piano-register-black-key.is-chord-tone{background:#1d2a35;box-shadow:inset 0 -4px #d2a452}
.piano-register-white-key.is-planned{background:#f2f1ec;box-shadow:inset 0 0 0 2px #d2a452}
.piano-register-black-key.is-planned{background:#1d2a35;box-shadow:inset 0 0 0 2px #d2a452}
.piano-register-white-key.is-active{background:#74d8c6;box-shadow:inset 0 0 0 2px #2b8c80}
.piano-register-black-key.is-active{background:#36b9ae;border-color:#1a706d;box-shadow:0 0 0 2px #96fff2}
</style>
