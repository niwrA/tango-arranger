<script setup lang="ts">
import {onBeforeUnmount,ref} from 'vue';
import {midiSupported as supported,midiAccess as access,midiInputs as inputs,midiOutputs as outputs,midiInputId as inputId,midiOutputId as outputId,midiOutputEnabled as outputEnabled,midiStatus as status,midiBusy as busy,midiReceived as received,midiSent as sent,midiLog as log,midiOutput as selectedOutput,enableMidi as enable,selectMidiInput,selectMidiOutput,midiChannel,sendMidiNote,panicMidi,observeMidiDiagnostics} from './midiSession';
const panel=ref<HTMLDetailsElement|null>(null);
const stopObserving=observeMidiDiagnostics(()=>Boolean(panel.value?.open&&panel.value.isConnected));
onBeforeUnmount(stopObserving);
function testNote(){sendMidiNote(60,64,.3);}
</script>

<template>
  <details ref="panel" class="editor">
    <summary>MIDI diagnostics</summary>
    <p>Connect your digital piano using USB MIDI and enable MIDI access. Requires a secure connection and a compatible browser (for example Chrome on Android).</p>
    <button type="button" class="secondary" :disabled="!supported || busy || !!access" @click="enable">{{busy ? 'Requesting access…' : 'Enable MIDI'}}</button>
    <p role="status">{{status}}</p>
    <template v-if="access">
      <h3>Input devices ({{inputs.length}})</h3>
      <p v-if="!inputs.length">No MIDI inputs detected.</p>
      <ul v-else><li v-for="port in inputs" :key="port.id">{{port.name || port.id}} · {{port.manufacturer || 'Unknown manufacturer'}}</li></ul>
      <label v-if="inputs.length">Active MIDI input<select :value="inputId" @change="selectMidiInput(($event.target as HTMLSelectElement).value)"><option v-for="port in inputs" :key="port.id" :value="port.id">{{port.name || port.id}}</option></select></label>
      <p>Play a key or press a pedal on your piano to see incoming messages.</p>
      <h3>Output devices ({{outputs.length}})</h3>
      <label v-if="outputs.length">MIDI output<select  :value="outputId" @change="selectMidiOutput(($event.target as HTMLSelectElement).value)"><option v-for="port in outputs" :key="port.id" :value="port.id">{{port.name || port.id}}</option></select></label>
      <p v-else>No MIDI outputs detected.</p>
      <label v-if="outputs.length">Output channel<select v-model.number="midiChannel"><option v-for="channel in 16" :key="channel" :value="channel-1">{{channel}}</option></select></label>
      <label v-if="outputs.length"><input type="checkbox" v-model="outputEnabled"/> Send arrangement piano and note auditions to MIDI output</label>
      <button type="button" class="secondary" @click="panicMidi">All notes off</button>
      <button type="button" class="secondary" :disabled="!selectedOutput" @click="testNote">Send test note (C4)</button>
      <p class="hint">Listen for middle C on your piano. Queued output does not confirm that the piano received it. No automatic MIDI echo is enabled.</p>
      <h3>Activity</h3>
      <p class="hint">Activity is recorded only while this panel is open.</p>
      <p>Received: {{received}} · Output queued: {{sent}}</p>
      <button type="button" class="secondary" @click="log = []; received = 0; sent = 0">Clear log</button>
      <pre class="midi-log" aria-label="Recent MIDI messages">{{log.join('\n') || 'No MIDI messages yet.'}}</pre>
    </template>
  </details>
</template>

<style scoped>
.midi-log { max-height: 15rem; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font-size: .85rem; }
</style>
