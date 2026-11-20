<script setup lang="ts">
import {computed,ref} from 'vue';
import PianoKeyboardStrip from './PianoKeyboardStrip.vue';
import {pianoWindow,movePianoWindow,PIANO_LOW,PIANO_HIGH} from './pianoRegisters';
const props=defineProps<{
 measurePitches:number[];activePitches:number[];chordTones:number[];splitPitch:number
}>();
const emit=defineEmits<{(event:'switch-mode'):void}>();
const layout=ref<'split'|'single'>('split');
const lockedUpper=ref<number|null>(null);
const lockedLower=ref<number|null>(null);
const lockedSingle=ref<number|null>(null);
const upper=computed(()=>pianoWindow(props.measurePitches,'upper',props.splitPitch,21,lockedUpper.value??undefined));
const lower=computed(()=>pianoWindow(props.measurePitches,'lower',props.splitPitch,21,lockedLower.value??undefined));
const single=computed(()=>pianoWindow(props.measurePitches,'all',props.splitPitch,30,lockedSingle.value??undefined));
function move(which:'upper'|'lower'|'single',steps:number){
 const current=which==='upper'?upper.value:which==='lower'?lower.value:single.value;
 const count=which==='single'?30:21;
 const start=movePianoWindow(current.start,steps,count);
 if(which==='upper')lockedUpper.value=start;
 else if(which==='lower')lockedLower.value=start;
 else lockedSingle.value=start;
}
function follow(which:'upper'|'lower'|'single'){
 if(which==='upper')lockedUpper.value=null;
 else if(which==='lower')lockedLower.value=null;
 else lockedSingle.value=null;
}
function label(pitch:number){return ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][pitch%12]+(Math.floor(pitch/12)-1);}
</script>
<template>
 <div class="piano-focus-view" aria-label="Expanded piano note reference">
  <div class="piano-focus-options" role="group" aria-label="Piano focus keyboard layout">
   <button type="button" :class="{selected:layout==='split'}" :aria-pressed="layout==='split'" @click="layout='split'">Two registers</button>
   <button type="button" :class="{selected:layout==='single'}" :aria-pressed="layout==='single'" @click="layout='single'">Single keyboard</button>
   <span>A0–C8 · 88 keys available</span>
  </div>
  <div class="piano-focus-registers" :class="{'is-single':layout==='single'}">
   <template v-for="reg in (layout==='split'?[{id:'upper',title:'Upper staff · right hand suggested',view:upper,locked:lockedUpper},{id:'lower',title:'Lower staff · left hand suggested',view:lower,locked:lockedLower}]:[{id:'single',title:'Piano · continuous register',view:single,locked:lockedSingle}])" :key="reg.id">
    <div class="piano-focus-register">
     <div class="piano-focus-register-bar">
      <strong>{{reg.title}}</strong>
      <span>{{label(reg.view.start)}}–{{label(reg.view.end)}}</span>
      <div class="piano-focus-range-actions">
       <button type="button" :aria-label="'Shift '+reg.title+' down one octave'" @click="move(reg.id as 'upper'|'lower'|'single',-12)">−12</button>
       <button type="button" :aria-label="'Shift '+reg.title+' up one octave'" @click="move(reg.id as 'upper'|'lower'|'single',12)">+12</button>
       <button type="button" :aria-label="'Follow notes for '+reg.title" :class="{selected:reg.locked===null}" @click="follow(reg.id as 'upper'|'lower'|'single')">{{reg.locked===null?'Following':'Follow'}}</button>
      </div>
     </div>
     <button class="piano-focus-keyboard-button" type="button" :aria-label="'Show role and cues from '+reg.title" @click="emit('switch-mode')">
      <PianoKeyboardStrip :window="reg.view" :active-pitches="activePitches" :measure-pitches="measurePitches" :chord-tones="chordTones" :label="reg.title"/>
     </button>
    </div>
   </template>
  </div>
  <p class="piano-focus-legend"><span class="piano-focus-indicator active"/> Sounding now <span class="piano-focus-indicator planned"/> Notes in this measure <span class="piano-focus-indicator chord"/> Other chord tones · tap the keyboard to show role and cues</p>
 </div>
</template>
<style scoped>
.piano-focus-view{display:flex;flex-direction:column;flex:1 1 auto;min-height:0;max-width:1300px;width:100%;margin:auto;gap:12px}
.piano-focus-options{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.piano-focus-options button,.piano-focus-range-actions button{border:1px solid #657d8e;border-radius:8px;background:#253c4e;color:#e7eff5;min-height:39px;padding:6px 12px;font-size:13px;cursor:pointer}
.piano-focus-options button.selected,.piano-focus-range-actions button.selected{background:#e5be84;color:#142532;font-weight:800}
.piano-focus-options>span{margin-left:auto;color:#bdcbd7;font-size:12px}
.piano-focus-registers{display:flex;flex-direction:column;gap:12px;flex:1 1 auto;min-height:0}
.piano-focus-register{display:flex;flex-direction:column;gap:8px;flex:1 1 0;min-height:148px}
.piano-focus-register-bar{display:flex;align-items:center;flex-wrap:wrap;gap:8px 14px;color:#ebf2f7}
.piano-focus-register-bar>strong{font-size:clamp(14px,1.6vw,21px)}
.piano-focus-register-bar>span{font-size:13px;color:#efca91;font-variant-numeric:tabular-nums}
.piano-focus-range-actions{display:flex;gap:5px;margin-left:auto}
.piano-focus-keyboard-button{display:flex;flex:1 1 auto;padding:0;background:none;border:0;cursor:pointer;min-height:92px;width:100%}
.piano-focus-keyboard-button:focus-visible,.piano-focus-options button:focus-visible,.piano-focus-range-actions button:focus-visible{outline:3px solid #f9d6a4;outline-offset:2px}
.piano-focus-legend{font-size:12px;color:#b9cbd6;display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin:0}
.piano-focus-indicator{display:inline-block;height:10px;width:10px;border-radius:3px}
.piano-focus-indicator.active{background:#74d8c6}.piano-focus-indicator.planned{background:#f0ba6a}.piano-focus-indicator.chord{background:#ebdfba}
@media(max-width:700px){.piano-focus-options>span{width:100%;margin-left:0}.piano-focus-register-bar{gap:5px 9px}.piano-focus-range-actions button{padding:4px 8px;min-height:35px}.piano-focus-view{gap:7px}.piano-focus-registers{gap:8px}}
</style>
