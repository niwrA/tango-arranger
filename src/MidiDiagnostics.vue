<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue';

const supported = typeof navigator.requestMIDIAccess === 'function';
const access = shallowRef<MIDIAccess>();
const inputs = shallowRef<MIDIInput[]>([]);
const outputs = shallowRef<MIDIOutput[]>([]);
const outputId = ref('');
const status = ref(supported ? 'Not enabled' : 'Web MIDI unavailable in this browser.');
const busy = ref(false);
const received = ref(0);
const sent = ref(0);
const log = ref<string[]>([]);
let disposed = false;
const selectedOutput = computed(() => outputs.value.find(port => port.id === outputId.value));
function record(direction: string, port: string, bytes: Uint8Array) {
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join(' ').toUpperCase();
  const kind = bytes[0] & 0xf0;
  const note = bytes.length >= 3 && (kind === 0x80 || kind === 0x90)
    ? ' · ' + (kind === 0x80 || bytes[2] === 0 ? 'Note off' : 'Note on') + ' · ch ' + ((bytes[0] & 15) + 1) + ' · note ' + bytes[1] + ' · velocity ' + bytes[2] : '';
  log.value = [new Date().toLocaleTimeString() + ' ' + direction + ' ' + port + ': ' + hex + note, ...log.value].slice(0, 100);
}
function receive(event: MIDIMessageEvent) {
  if (!event.data) return;
  received.value++;
  record('IN', (event.currentTarget as MIDIInput)?.name || 'MIDI', event.data);
}
function refresh() {
  if (!access.value || disposed) return;
  const nextInputs: MIDIInput[] = [];
  const nextOutputs: MIDIOutput[] = [];
  access.value.inputs.forEach(port => { if (port.state === 'connected') nextInputs.push(port); });
  access.value.outputs.forEach(port => { if (port.state === 'connected') nextOutputs.push(port); });
  for (const port of inputs.value) if (!nextInputs.includes(port)) {
    port.onmidimessage = null;
    void port.close().catch(() => {});
  }
  for (const port of nextInputs) port.onmidimessage = receive;
  inputs.value = nextInputs;
  outputs.value = nextOutputs;
  if (!nextOutputs.some(port => port.id === outputId.value)) outputId.value = nextOutputs[0]?.id || '';
  status.value = nextInputs.length || nextOutputs.length ? 'MIDI enabled' : 'MIDI enabled; no devices detected';
}
async function enable() {
  if (!supported || busy.value || access.value) return;
  busy.value = true;
  try {
    const result = await navigator.requestMIDIAccess({ sysex: false });
    if (disposed) return;
    access.value = result;
    result.onstatechange = refresh;
    refresh();
  } catch (error) {
    status.value = 'MIDI access failed: ' + (error instanceof Error ? error.message : String(error));
  } finally { busy.value = false; }
}
function testNote() {
  const port = selectedOutput.value;
  if (!port) return;
  try {
    const on = new Uint8Array([0x90, 60, 64]);
    const off = new Uint8Array([0x80, 60, 0]);
    const now = performance.now();
    port.send(on, now);
    port.send(off, now + 300);
    sent.value += 2;
    record('OUT queued', port.name || 'MIDI', on);
    record('OUT queued (+300 ms)', port.name || 'MIDI', off);
  } catch (error) { status.value = 'MIDI send failed: ' + String(error); }
}
onBeforeUnmount(() => {
  disposed = true;
  if (access.value) access.value.onstatechange = null;
  for (const port of inputs.value) {
    port.onmidimessage = null;
    void port.close().catch(() => {});
  }
});
</script>

<template>
  <details class="editor">
    <summary>MIDI diagnostics</summary>
    <p>Connect your digital piano using USB MIDI and enable MIDI access. Requires a secure connection and a compatible browser (for example Chrome on Android).</p>
    <button type="button" class="secondary" :disabled="!supported || busy || !!access" @click="enable">{{busy ? 'Requesting access…' : 'Enable MIDI'}}</button>
    <p role="status">{{status}}</p>
    <template v-if="access">
      <h3>Input devices ({{inputs.length}})</h3>
      <p v-if="!inputs.length">No MIDI inputs detected.</p>
      <ul v-else><li v-for="port in inputs" :key="port.id">{{port.name || port.id}} · {{port.manufacturer || 'Unknown manufacturer'}}</li></ul>
      <p>Play a key or press a pedal on your piano to see incoming messages.</p>
      <h3>Output devices ({{outputs.length}})</h3>
      <label v-if="outputs.length">MIDI output<select v-model="outputId"><option v-for="port in outputs" :key="port.id" :value="port.id">{{port.name || port.id}}</option></select></label>
      <p v-else>No MIDI outputs detected.</p>
      <button type="button" class="secondary" :disabled="!selectedOutput" @click="testNote">Send test note (C4)</button>
      <p class="hint">Listen for middle C on your piano. Queued output does not confirm that the piano received it. No automatic MIDI echo is enabled.</p>
      <h3>Activity</h3>
      <p>Received: {{received}} · Output queued: {{sent}}</p>
      <button type="button" class="secondary" @click="log = []; received = 0; sent = 0">Clear log</button>
      <pre class="midi-log" aria-label="Recent MIDI messages">{{log.join('\n') || 'No MIDI messages yet.'}}</pre>
    </template>
  </details>
</template>

<style scoped>
.midi-log { max-height: 15rem; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font-size: .85rem; }
</style>
