<script setup lang="ts">
const props=defineProps<{name:'plus'|'save'|'upload'|'file-down'|'archive'|'settings'|'ellipsis'|'play'|'play-from-start'|'square'|'x'|'music'|'pencil'|'layers'|'list-check'|'refresh-cw'|'copy'|'trash'|'info'|'chevron-down'|'folder-open'|'volume-2'|'sliders-horizontal'|'circle-help'|'presentation'|'arrow-left'}>();
const paths:Record<typeof props.name,string>={
  plus:'M12 5v14 M5 12h14',
  save:'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z M7 3v6h10V4 M7 21v-8h10v8',
  upload:'M12 16V3 M7 8l5-5 5 5 M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3',
  'file-down':'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M12 11v7 M8 15l4 4 4-4',
  archive:'M3 4h18v4H3z M5 8v12h14V8 M10 12h4',
  settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.12 2.12-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.04 1.56V21h-3v-.78A1.7 1.7 0 0 0 10.66 18.66a1.7 1.7 0 0 0-1.88.34l-.06.06-2.12-2.12.06-.06A1.7 1.7 0 0 0 7 15a1.7 1.7 0 0 0-1.56-1.04H4v-3h1.44A1.7 1.7 0 0 0 7 9.92a1.7 1.7 0 0 0-.34-1.88L6.6 7.98l2.12-2.12.06.06a1.7 1.7 0 0 0 1.88.34A1.7 1.7 0 0 0 11.7 4.7V4h3v.7a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.12 2.12-.06.06a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.56 1.04H21v3h-.04A1.7 1.7 0 0 0 19.4 15Z',
  ellipsis:'M5 12h.01 M12 12h.01 M19 12h.01',
  play:'M8 5v14l11-7z',
  'play-from-start':'M5 5v14 M9 5v14l11-7z',
  square:'M5 5h14v14H5z',
  x:'M18 6 6 18 M6 6l12 12',
  music:'M9 18V5l12-2v13 M9 9l12-2 M9 18a3 2 0 1 1-6 0 3 2 0 0 1 6 0 M21 16a3 2 0 1 1-6 0 3 2 0 0 1 6 0',
  pencil:'M12 20h9 M16 4l4 4-12 12-5 1 1-5z',
  layers:'M12 2 2 7l10 5 10-5z M2 12l10 5 10-5 M2 17l10 5 10-5',
  'list-check':'M9 6h12 M9 12h12 M9 18h12 M3 6l1 1 2-2 M3 12l1 1 2-2 M3 18l1 1 2-2',
  'refresh-cw':'M20 7v5h-5 M4 17v-5h5 M5 9a7 7 0 0 1 12-3l3 6 M4 12l3 6a7 7 0 0 0 12-3',
  copy:'M8 4h12v15H8z M16 21H5a2 2 0 0 1-2-2V6',
  trash:'M3 6h18 M8 6V4h8v2 M5 6l1 15h12l1-15 M10 10v7 M14 10v7',
  info:'M12 17v-5 M12 8h.01 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z',
  'chevron-down':'m6 9 6 6 6-6',
  'folder-open':'M3 19h16a2 2 0 0 0 2-2l1-9H11l-2-3H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2Z M3 19l2-9h17',
  'volume-2':'M11 5 6 9H2v6h4l5 4V5Z M15 9a4 4 0 0 1 0 6 M18 6a8 8 0 0 1 0 12',
  'sliders-horizontal':'M4 7h16 M4 17h16 M9 4v6 M15 14v6',
  'circle-help':'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z M9.1 9a3 3 0 0 1 5.8 1c0 2-2.9 2.2-2.9 4 M12 17h.01',
  'presentation':'M3 3h18v14H3z M8 21l4-4 4 4 M12 17v4',
  'arrow-left':'M19 12H5 M12 19l-7-7 7-7'
};
</script>
<template><svg class="app-icon" xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path :d="paths[props.name]"/></svg></template>
