<script setup lang="ts" generic="Onset extends string|number, Duration extends string|number">
const props=withDefaults(defineProps<{
  onset:Onset;
  duration:Duration;
  disabled?:boolean;
  auto?:boolean;
}>(),{disabled:false,auto:false});
const emit=defineEmits<{
  (event:'update:onset',value:Onset):void;
  (event:'update:duration',value:Duration):void;
}>();
const grids=[
  {value:1,label:'Quarter'},
  {value:0.5,label:'Eighth'},
  {value:0.25,label:'Sixteenth'},
  {value:0.125,label:'Thirty-second'}
];
function changeOnset(event:Event){
  const value=(event.target as HTMLSelectElement).value;
  emit('update:onset',(typeof props.onset==='number'?Number(value):value) as Onset);
}
function changeDuration(event:Event){
  const value=(event.target as HTMLSelectElement).value;
  emit('update:duration',(typeof props.duration==='number'?Number(value):value) as Duration);
}
</script>

<template>
  <label>Note start grid<select :value="onset" :disabled="disabled" aria-label="Note start grid" @change="changeOnset">
    <option v-if="auto" value="auto">Auto · measure articulation</option>
    <option :value="0">Raw timing</option>
    <option v-for="grid in grids" :key="grid.value" :value="grid.value">{{grid.label}}</option>
  </select></label>
  <label>Note duration grid<select :value="duration" :disabled="disabled" aria-label="Note duration grid" @change="changeDuration">
    <option v-if="auto" value="auto">Same as start</option>
    <option :value="0">Raw duration</option>
    <option v-for="grid in grids" :key="grid.value" :value="grid.value">{{grid.label}}</option>
  </select></label>
</template>
