<script setup lang="ts">
defineProps<{pressure?:number;shake?:number}>();
const emit=defineEmits<{pressure:[value:string];shake:[value:string]}>();
function change(field:'pressure'|'shake',event:Event){
 const el=event.target as HTMLInputElement;
 if(el.validity.badInput||!el.checkValidity()){el.reportValidity();return;}
 if(field==='pressure')emit('pressure',el.value);else emit('shake',el.value);
}
</script>

<template>
 <div class="bandoneon-expression">
  <label>Bellows pressure <small>(×)</small>
   <input type="number" min="0.25" max="1.5" step="0.05" placeholder="Auto" :value="pressure??''" @change="change('pressure',$event)">
  </label>
  <label>Bellows shake <small>(Hz)</small>
   <input type="number" min="3" max="12" step="1" placeholder="Off" :value="shake??''" @change="change('shake',$event)">
  </label>
  <small class="hint">Pressure overrides the velocity-based estimate. Shake pulses the airflow without changing pitch. Clear a field to restore automatic playback.</small>
 </div>
</template>

<style scoped>
.bandoneon-expression{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.5rem;width:100%}
.bandoneon-expression label{min-width:0}
.bandoneon-expression input{width:100%;min-width:0;box-sizing:border-box}
.bandoneon-expression>.hint{grid-column:1/-1}
</style>
