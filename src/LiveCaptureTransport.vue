<script setup lang="ts">
import AppIcon from './AppIcon.vue';

defineProps<{
  kind:'melody'|'rhythm';
  playing:boolean;
  recording:boolean;
  loop:boolean;
  metronome:boolean;
  countIn:boolean;
  status:string;
}>();
defineEmits<{
  (event:'play'):void;
  (event:'record'):void;
  (event:'loop'):void;
  (event:'metronome'):void;
  (event:'count-in'):void;
}>();
</script>

<template>
  <div class="capture-transport-bar" role="toolbar" :aria-label="'Live '+kind+' input transport'">
    <div class="capture-transport-buttons" role="group" aria-label="Recording transport">
      <button type="button" class="capture-transport-button" :class="{'is-on':metronome}" :aria-pressed="metronome"
        :title="metronome?'Turn metronome off':'Turn metronome on'" :aria-label="metronome?'Metronome on':'Metronome off'"
        @click="$emit('metronome')"><AppIcon name="metronome"/></button>
      <button type="button" class="capture-transport-button" :class="{'is-on':countIn}" :aria-pressed="countIn"
        :disabled="playing" :title="countIn?'Disable one-measure count-in':'Enable one-measure count-in'"
        :aria-label="countIn?'Count-in on':'Count-in off'" @click="$emit('count-in')"><AppIcon name="count-in"/></button>
      <button type="button" class="capture-transport-button" :class="{'is-on':loop}" :aria-pressed="loop"
        :disabled="playing" :title="loop?'Disable repeat after stopping':'Repeat selected measures'"
        :aria-label="loop?'Loop on':'Loop off'" @click="$emit('loop')"><AppIcon name="repeat"/></button>
      <span class="capture-transport-divider" aria-hidden="true"></span>
      <button type="button" class="capture-transport-button" :class="{'is-on':playing&&!recording}"
        :aria-pressed="playing&&!recording" :title="playing?'Stop playback':'Play selected measures without recording'"
        :aria-label="playing?'Stop playback':'Play arrangement'" @click="$emit('play')"><AppIcon :name="playing?'square':'play'"/></button>
      <button type="button" class="capture-transport-button capture-record-button" :class="{'is-recording':recording}"
        :aria-pressed="recording" :title="recording?'Stop recording':'Record and start playback'"
        :aria-label="recording?'Stop recording':'Record and play'" @click="$emit('record')"><AppIcon :name="recording?'square':'record'"/></button>
    </div>
    <span class="capture-transport-status" role="status" aria-live="polite">{{status}}</span>
    <div class="capture-transport-extras"><slot name="extras"/></div>
    <details class="capture-settings-menu">
      <summary title="Recording settings" aria-label="Recording settings"><AppIcon name="settings"/></summary>
      <div class="capture-settings-panel"><slot name="settings"/></div>
    </details>
  </div>
</template>
