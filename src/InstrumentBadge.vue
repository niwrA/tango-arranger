<script setup lang="ts">
import {computed} from 'vue';
import {instrumentBadgeIdentity} from './instrumentBadge';

const props=defineProps<{instrument:string;roster:readonly string[];label:string}>();
const badge=computed(()=>instrumentBadgeIdentity(props.instrument,props.roster));
</script>

<template>
 <span class="instrument-badge" :title="label" aria-hidden="true">
  <svg class="instrument-badge-icon" xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"
   fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" focusable="false">
   <path :d="badge.icon.outline"/>
   <path v-if="badge.icon.solid" :d="badge.icon.solid" fill="currentColor" stroke="none"/>
  </svg>
  <span v-if="badge.number!==null" class="instrument-badge-number">{{badge.number}}</span>
 </span>
</template>

<style scoped>
.instrument-badge{position:relative;display:inline-flex;align-items:center;justify-content:center;flex:0 0 36px;width:36px;height:36px;vertical-align:middle;color:#ecd0a5}
.instrument-badge-icon{display:block;width:32px;height:32px;flex:none}
.instrument-badge-number{position:absolute;top:-2px;right:-3px;display:flex;align-items:center;justify-content:center;min-width:16px;height:16px;padding:0 3px;border:1px solid #192d3b;border-radius:8px;background:#ebc990;color:#172a35;font-size:10px;font-weight:850;line-height:1;font-variant-numeric:tabular-nums;box-shadow:0 0 0 1px #ebc99055}
</style>
