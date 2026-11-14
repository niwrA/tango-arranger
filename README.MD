# Tango Arranger v3.3 — Free chord editing, duration controls and section-key transposition

## Lead Sheet chords

Chord fields accept freely typed symbols, including comma-separated sequences such as `C,C`, `Dm,A7`, `G7/B`, and `Cmaj7/G`. The suggestion list is **optional**: tap **Suggestions** to see completions for the chord at the caret, then explicitly select one. Merely typing does not force a selection. If the parser rejects an unfinished symbol on blur or Enter, the unsaved draft stays visible for correction instead of reverting silently. Only valid chord sequences are committed to the arrangement. Enter and Tab still support keyboard navigation.

## Note Editor duration

The selected note's **written duration** has separate `−` / `+`, slider, numeric entry and **Apply** controls. Numeric edits are committed on Change, Enter or Apply rather than on every intermediate keystroke. The duration bar's width is proportional to the actual saved duration and is keyed by that duration to force a fresh render; a second proportional preview and the saved duration label provide immediate independent feedback. The maximum is constrained by the note's start position and the end of the measure; it is not a sounding-length/gate control. Touch resize still needs testing in a real browser; source-level and domain tests cannot establish that every device behaves correctly.

## Changing a section key

Selecting a new key opens a decision dialog with three operations: **key signature only**, **transpose section chords**, or **transpose section chords and lead melody**. The latter also transposes protected instrument notes in the section, rejecting out-of-range notes without applying a partial change. Unprotected generated parts are regenerated from the new harmony. All other sections are left untouched. Chord qualities, inversions and comma slot positions are preserved. The spelling favors flats or sharps according to the destination key. A major/minor mode change on the same tonic is **not** automatic reharmonization; its chord qualities remain unchanged. The global arrangement transpose setting is unaffected.

**Verification:** automated tests cover section-local transposition, slash chords, protected notes, invalid keys, optional chord suggestions and duration-control wiring. Full Vue/Vite build, touchscreen interactions and MuseScore rendering remain to be verified in the deployed environment.

---

# Tango Arranger v3.2 — Rhythm Editor

The new **5 · Rhythm editor** tab offers fourteen templates (seven rhythmic figures and seven named orchestra-profile variants): Current orchestra style, Marcato en cuatro, Marcato en dos, Síncopa, 3–3–2, Habanera-inspired and Offbeat chords. Preview accents in a beat diagram. Choose the rhythm section (Piano, Contrabass, Bandoneon I/II), all parts, or any custom instrument selection. Apply to a measure range, one section or the whole song. You can apply onset/duration/accent changes or just accents/articulation while retaining original timing.

The editor preserves the original pitches, chord voicings, piano register split, and per-note gestures. Existing simultaneous chord notes stay together. Silent measures are skipped rather than inventing notes; melody/voice selections require confirmation. Protected instrument-measures are skipped by default; overriding them requires a separate opt-in and confirmation. Applied results are protected manual note edits, persist in local autosave and `.tango` archives, survive orchestral regeneration and export to MusicXML. The patterns are simple editable rhythmic templates, not transcriptions of historic orchestra recordings. For 2/4 and 3/4, the reference pattern scales across the bar; this is a pragmatic approximation, not a musicological meter conversion.

**Caution:** Replacing a rhythm changes onsets and written durations. It does not perform harmonic re-voicing when chords change within the bar; review the resulting notes if a measure has multiple harmonies. Browser UI, real audio and MuseScore rendering require deployment verification.

## v2.6.2 — Browser audio activation / Azure playback

The application no longer imports Tone.js during initial page load. Some browsers warn that a Web Audio `AudioContext` was started without a user gesture even when the app has not requested playback. On the first Play, measure-loop or note-audition action, `src/toneSession.ts` synchronously creates/resumes a native `AudioContext` during the user's gesture, dynamically loads Tone.js, and assigns that already-resumed context to Tone. This also supports the expressive-note audition path. Browser autoplay policies still apply: the user must click Play or a note before audio can start; a site cannot silently unlock audio. Actual deployed-browser testing is required to verify whether warnings are eliminated in each browser. The workflow and Azure Static Web Apps configuration do not need changing.

## v2.6.1 — Azure build TypeScript hotfix

Corrected the full-score Tone.js playback call in `src/App.vue` to pass `Tone.Frequency(event.pitch, 'midi').toFrequency()` to `PolySynth.triggerAttackRelease`. The previous `FrequencyClass<number>` object failed `vue-tsc` (TS2345) on line 442. The measure loop and note audition already used `.toFrequency()`. Package version is 2.6.1; the UI reads it from `package.json`. The full Vue production build remains unverified in this environment because npm dependencies could not be installed.

## v2.6 — Rhythmic notation, piano registers and UI version

The app header displays the version from `package.json` rather than a hard-coded 2.0 label. Generated piano accompaniment uses monophonic bass notes below the configurable split (bass clef) and the chosen upper figure above it (treble clef). Contrabass and bandoneon use conventional written durations with playback gates for short articulation. Existing imported or manually edited notes retain their explicit written durations. The sample user MusicXML was used for diagnostic analysis, not bundled with the app.

# Tango Arranger v2.5

Local-first experimental tango orchestration workbench built with Vue 3, TypeScript, Vite and Tone.js. Enter or import a single lead-sheet melody, specify harmony and sectional roles, generate a six-part **orquesta típica** score (piano, contrabass, two violins, two bandoneons; optional voice), and export MusicXML for editing in MuseScore.

**Status:** prototype. The algorithm is style-informed, but is **not** a transcription of a historic orchestra or a validated replacement for a professional arranger. No automatic acceptance in MuseScore 4 can be claimed until an actual MuseScore 4 import test passes. See `PROJECT-BOARD.MD`.

## Wide workspace, piano figures and expression (v2.5)

The application now uses the full available browser width rather than a 1500px centered layout. Song Overview retains a horizontal instrument-by-measure map with a side editing panel; the Piano Note Editor can display its upper and lower registers side by side on very wide screens (1700px+), with horizontal scrolling within each grid.

**Piano accompaniment:** For a section where Piano has the **Chords** role, select a figure in **Song Overview** or **Orchestration**: single notes ascending/descending, moving chord inversions ascending/descending, countermelody, or melody response. Chord inversion figures add independent bass pulses in the lower piano register, and the upper part moves through chord tones and inversions with optional octave displacement. These are deterministic style-informed *starting points*, not verified transcriptions of historical Argentine piano arrangements. The selected section pattern and variation are saved in the project. The generator retains manually protected instrument-measures.

**Figure workbench:** In the Note Editor, choose any of the six figures for the selected instrument-measure, apply it, or cycle to another variation. Chord changes within the measure are honored. The figure replaces **only that instrument-measure** and protects it from later orchestral regeneration; the first replacement of an existing manually protected measure requires confirmation. Counters and responses use the lead-sheet melody when available; otherwise they use a simple fallback. Counterpoint quality, fingering and historical idiom remain areas for improvement.

**Note gestures:** Non-piano, non-pizzicato notes can specify a **slide-to MIDI pitch** and **swell-to velocity**. The native Web Audio preview and playback interpolate pitch and amplitude over the note's sounding duration; the written rhythmic duration is unchanged. These properties persist in local autosave and `.tango` projects. MusicXML currently exports *text indications* (e.g. `gliss. to G5`, `cresc. to velocity 110`) for these single-note gestures, **not a guaranteed MuseScore glissando line or precise velocity envelope**. Piano and pizzicato notes cannot receive sustained slides/swells.

**Expression across measures:** In the Note Editor, create instrument-specific crescendo/decrescendo ranges by selecting start/end measures, optional beats within those measures, and start/end intensities (80 = neutral). The browser playback applies a gradual velocity offset while preserving individual note accents; the MusicXML exporter adds standard hairpin wedges at the range boundaries. These can span multiple measures and sections. Restructuring the song clears expression ranges because their absolute measure positions are no longer reliable; the app warns before applying such a change. The older section-wide crescendo option remains available.

**Verification:** the regression suite includes 16 additional figure/expression checks and MusicXML duration validation; domain, loop and Web Audio modules pass TypeScript checking. The Vue production build, browser playback and actual MuseScore 4 import remain unverified in this environment.

## Whole-measure violin arpeggios (v2.4)

For a violin with the **Chords** role and the **Arpeggio** or **Pizzicato arpeggio** technique, the generator now plays **exactly four single notes over one complete measure**, not a small arpeggio repeated on every beat. In 4/4 these are four quarter-note events at beats 1–4; in 2/4 they are four eighth-note events; in 3/4 they are four equal subdivisions of the bar. For a D-minor triad the rising figure is D–F–A–D (octave) and the falling figure is D–A–F–D (starting at the higher D). Seventh chords use root, third, fifth and seventh rather than repeating the root.

In **Orchestration → Violin chord accompaniment**, each violin has a **direction** setting: **Up**, **Down**, or **Alternate each measure** (default). The direction is measured across the full bar, and alternating starts with Up at the beginning of each section. For measures with comma-separated chords, each note uses the chord active at its own onset; the four-note total remains unchanged. The setting is stored in `.tango` projects and retained when resizing sections. A per-measure violin technique override still selects arpeggio or pizzicato arpeggio, using the section's direction.

**Pizzicato arpeggio** uses plucked notes and a short 22% sounding gate; bowed arpeggio uses arco. Notes remain editable and audible in the Note Editor, and their four written durations are exported to MusicXML. This is a simple register-aware arpeggio heuristic, not an optimized fingering model; actual MuseScore display and browser audio require verification.

## Dedicated structure and keys workspace (v2.3)

The application now opens in **1 · Song overview**, the primary measure-level orchestration workspace. **2 · Structure & keys** is a separate tab for changing section count, measure lengths, and concert-pitch major/minor key signatures. The structure tab preserves the existing confirmation and reset behavior when resizing measures, and the same MusicXML rehearsal marks and section key changes continue to export. Changing a key does not transpose existing pitches or chords.

The Song Overview no longer contains the two large structure/key editors. Instead it displays a compact read-only section strip with **letter, key, and measure range**, plus **Edit structure & keys** to jump to the dedicated tab. The instrument-by-measure map and range editor are placed together in a responsive workspace: on wider screens, the range editor stays in a right-hand panel beside the horizontally scrollable map; on narrower screens, it stacks below the map. Double-click/Enter-to-edit notes, inline chords, section/whole-song role overrides, and local autosave are unchanged. The Lead Sheet still displays editable section keys for convenience when composing harmony.

**Verification:** new navigation checks assert tab separation, default overview, structure editing isolation, and the map/editor workspace. Browser layout and full Vue production build still require verification on a machine with npm dependencies.

## Violin tango chord accompaniment (v2.2)

When **Violin I** or **Violin II** has the **Chords** role, the new **Tango staccato** and **Pizzicato** techniques generate **one note on every beat**, not a three-note chord or arpeggio. Each note is selected from the harmony active at that beat, including comma-separated mid-measure changes. Written notes occupy one beat, while synthesized playback is much shorter: unaccented tango staccato uses a **16% sounding gate**, unaccented pizzicato **22%**, and marcato **58%** plus a stronger attack. These are editable heuristics rather than empirically calibrated tango performance timings. Articulations are exported to MusicXML as dots and marcato wedges; exact gate percentages remain local to `.tango` and browser playback.

In **Orchestration → Violin chord accompaniment**, choose Tango staccato or Pizzicato for each violin, and optionally set **Marcato beats** per section using comma-separated, one-based beat numbers (e.g. `1,3`, or `2,4`; empty means no marcato). The selected style profile provides initial accent beats; these are **arranging defaults, not fixed rules or transcriptions of the named composer**. The Song Overview shows the technique and marcato beat positions. In the Note Editor, new violin chord notes inherit the technique and per-beat articulation; existing notes can still be edited individually. An explicit measure-level articulation override takes precedence over the generated beat pattern. Existing arpeggio, double-stop, sustained, and block techniques remain available by choice.

Changing violin technique or section marcato beats refreshes generated notes while merging protected manual measures. Older `.tango` projects retain their saved violin techniques; newly created projects use the new chord-accompaniment defaults. Dedicated regression tests cover note density, beat placement, meter, mid-measure chord changes, accent profiles and overrides, editor suggestions, MusicXML, and structural changes. Actual browser audio and MuseScore 4 interpretation remain to be verified.

## Piano grand staff and comma-safe harmony editing (v2.1)

**Piano note editor:** selecting **Piano** in **6 · Note editor** now displays two independently scrollable piano rolls for the **upper (treble)** and **lower (bass)** registers. Both edit the same Piano instrument-measure, so notes in both rolls sound together in the existing measure loop and remain protected from regeneration. Use separate octave buttons to navigate each register. A **Split between piano staves** setting (default middle C, MIDI 60) changes which roll and exported staff receives each pitch. The split is saved in local autosave and `.tango` projects; older projects use the default. This is a pitch/register-based split, not a hand-fingering or voice-leading inference: move the split to accommodate left-hand chords higher in the register.

**MuseScore / MusicXML:** Piano now exports as a **single two-staff piano part** with numbered treble and bass clefs, voice 1 on staff 1, voice 2 on staff 2, and a MusicXML `<backup>` between the two full-measure rhythmic streams. Bass notes and upper chords can therefore sound simultaneously without the previous single-clef or collapsed-voice layout. Empty sections of each staff are represented by timed rests. Section key signatures, rehearsal marks, articulations and written durations remain in the export. The split threshold follows the score's global transposition so staff membership is stable when transposing. Real MuseScore 4 visual import and engraving quality still need verification.

**Lead Sheet chord input:** autocomplete is **non-destructive** and affects only the comma-separated chord at the cursor. `C,C`, `C,G` and `C,C,C,G` are valid in 4/4, including repeated chord slots. The input is no longer committed on each native `change` event; it is validated and saved on **Enter**, **Tab**, **Shift+Tab**, or when focus leaves the field. Click a suggestion to replace only the active chord token, then continue typing a comma and the next chord. An unfinished token such as `C,` is allowed while typing, but cannot be saved until completed. The existing section-aware chord copying and inline Song Overview harmony editing are unchanged.

**Verification:** dedicated regression tests cover independent piano voices and measure timing, configurable staff split, transposition, repeated chord tokens, and deferred Lead Sheet commit. The XML was parsed with a standard XML parser; a full Vue production build and actual MuseScore import remain unverified in this environment.

## Live measure loop in the Note Editor (v2.0)

Open **6 · Note editor**, select an instrument and measure, then click **▶ Loop this instrument measure**. The editor repeats exactly the current instrument's measure, at the song tempo, without starting the entire orchestra. Click **■ Stop measure loop** or press **L** (when not typing in an input) to stop/start. The active beat is highlighted in the piano roll. Individual click-to-hear audition remains independently switchable.

- Playback respects **global transposition**, note velocity, staccato/marcato attack and the **sounding-length gate**. Written MusicXML durations remain unchanged. Notes sounding beyond the measure are cut off at the loop boundary.
- **Edits made while looping are heard on the next repetition**, because the current notes are read at the beginning of every pass. Empty measures loop silently, providing a rhythmic timing reference via the beat highlight.
- Navigating to another measure, instrument, song or tab stops the loop. Full-arrangement playback and measure looping are mutually exclusive, preventing duplicate transport schedules. The app releases voices and cancels transport events on stop or unmount.
- Audio is synthesized with Tone.js and requires a browser user gesture; it is not authentic instrument sampling. The full browser audio experience is not yet verified in this environment.

**Verification:** Eight new self-contained measure-loop checks cover timing, instrument/measure filtering, articulation gates, velocity, transposition, boundary clipping and UI integration. Run `npm run test:regression` for all test suites.

## Tango articulation and note editing (v1.9)

The **Instrument Note Editor** offers an articulation selector for **every instrument**, including piano and contrabass. Choose the default articulation for newly clicked notes, or select any note event to change its articulation, base velocity, or **sounding length (%)**. A new note is selected automatically so you can edit it immediately. Editing articulation or sounding length auditions the new sound. These settings are saved in the `.tango` project and protected from regeneration.

The note's **written duration remains unchanged** when you select an articulation. Synthesized playback uses these editable defaults: tango **staccato** = 28% of written duration, **marcato** = 58% plus a stronger attack (+14 MIDI velocity units, capped at 127), **legato** = 94%. Unmarked notes use 90%. These are adjustable performance heuristics, not exact universal timing standards. For a single note, setting a sounding-length percentage overrides the articulation's default gate; changing articulation retains an existing manual gate override.

MusicXML exports a staccato **dot** (`<staccato/>`) and a marcato **wedge** (`<strong-accent type="up"/>`), with the dot also applied to the combined tango marcato-staccato articulation. The MusicXML note/rest durations stay rhythmic values; the app's precise playback-gate percentage is not directly represented in standard MusicXML, so MuseScore may interpret playback lengths differently. The app's synthesis remains a simple approximation, not a sampled tango orchestra. Existing saved projects load without needing a migration; regenerate unprotected measures to apply the new default articulation behavior to old generated scores.

## Installation and running

Requires Node.js 20+ and npm with package-registry access.

```bash
npm install
npm run dev
```

Open http://localhost:8000/. `vite.config.ts` sets port **8000**, `strictPort: true` (fails rather than moving to another port). Run `npm run build` for the production type-check and build. Run `npm run test:regression` for self-contained generator/MusicXML regressions (requires system/global TypeScript; see below).

## Workflow

The application opens with an **empty 80-measure song**, divided into five 16-measure sections **A–E** (4/4, 124 BPM). Use **+ New blank song** to choose a different number of sections (1–26) and a independent section lengths (1–128 measures per section, at most 512 total). The new-song dialog displays an editable A/B/C… measure count for each section, an optional Apply to all control, and the total number of measures. It creates a separate locally saved song; your previous song remains in the browser library. Blank measures export as rests until you add chords or melody.

1. Open **Song overview** (the default tab) to inspect roles and playing techniques for all measures and instruments. Select a cell to edit one instrument-measure, or select a range, section or entire song to apply role, articulation and violin chord-technique overrides. The highlighted corner indicates an explicit override. Click **Apply to range**, then **Regenerate / merge protected edits** when appropriate.
2. Use **Structure & keys** to edit section lengths and keys when needed, then enter the melody and one or more chord symbols per bar, or import MusicXML/MIDI and select the melody track. Note text format: `D5:1@0` (pitch, quarter-beat duration, beat offset).
3. Select section roles (A/B/C/D/E by default) for piano, contrabass, violins and bandoneons. An explicit **rest** role is always honored.
4. Choose an orchestra-style **heuristic** (Traditional, D'Arienzo, Di Sarli, Troilo, Pugliese, Canaro, Fresedo). These affect accents, rhythmic density, string/phrasing assumptions and the Pugliese-inspired piano bass-register accent. They are **not** exact historical reproductions.
5. In **Orchestration**, set violin technique (pizzicato, arco/sustained, arpeggio, playable low-position double stop), bandoneon following (piano/violin/bandoneon, exact/octave/adapt/rhythm), per-instrument **Easy/Intermediate/Advanced** and measure-activity target.
6. Set global transposition (-24 to +24 semitones) to suit the singer or instrument ergonomics. This is a reversible display/export/playback shift and does not rewrite the original lead sheet. When importing an edited score the shift is reversed internally.
7. Use the eight-measure articulation alternation (marcato/staccato then lyrical legato, with staggered instrumental variation). Override any individual violin or bandoneon measure from Orchestration. For violins, lyrical phrasing indicates arco; for bandoneons, it indicates legato bellows articulation.
8. Set dynamics at section boundaries, optional crescendos, or disable expression markings. Generated note velocities follow the dynamics level.
9. Generate, review individual part activity and notes, and open **6 · Note editor** to add/remove notes by pitch and beat for a selected instrument-measure. Export `.musicxml` for MuseScore 4. Return edited MusicXML using **Edited full score** import and protect changed instrument-measures.
10. The app **automatically saves** each song to browser IndexedDB after edits (including unnamed songs and manually edited notes). Switch between local songs using the sidebar library. Export `.tango` ZIP backups to keep project settings and scores outside the browser.

## New in v1.0 — adjustable song structure and rehearsal letters

- **New default:** five sections, each with 16 measures, totaling **80 measures**. Section names are sequential letters **A, B, C, D, E**, rather than the older A1/B1/A2/B2/C convention. The editor opens with a blank 80-measure project; the older 40-measure demo remains in code for testing.
- **New-song options:** set the number of sections and common initial measures per section, along with title, tempo and time signature.
- **Song Overview → Edit sections & measures:** set a different length for each section, add a section, or remove the final section. Measure numbers, key selection, orchestration roles and section dynamics adapt to the revised structure.
- **Preservation rules:** existing chords and melody are retained at the same *relative measure within their section*; expanding a section adds empty measures. Shrinking/removing sections deletes the affected measures, and the UI requests confirmation. Per-measure role, violin-technique and articulation overrides are remapped to their new measure indices. Generated/imported scores and protected-bar flags are invalidated on a structural edit because absolute note positions may have shifted; the UI warns before discarding these.
- **MusicXML rehearsal marks:** each contiguous section boundary emits a standard MusicXML `<rehearsal>` direction with sequential alphabetic labels, on the first part, so MuseScore can display section letters above the score. The key-signature changes remain in all parts. Legacy projects with names such as A1/B1 still export as **A/B/C…** in boundary order, without altering their stored section names.
- **Verification:** 56 standalone regression checks passed, including custom section lengths, content/override remapping, key changes and rehearsal marks. The MusicXML is syntactically parsed and measure durations are checked, but a real MuseScore 4 import and full Vue production build remain pending.

## v0.9 — keys by section

- **Section key signatures:** set each section (A–E in new projects; A1/B1/A2/B2/C in legacy projects) to any conventional major or minor key in **Song Overview**, **Lead Sheet** or **Orchestration**. Each measure inherits the key of its assigned section. The Song Overview displays the section's key alongside its measure label.
- **Independent from chords:** changing a section key updates the notated signature but does **not** transpose existing melody notes or rewrite chord sequences. Change chord progressions separately using the beat-level harmony editor. The generator uses actual chords, not an assumed tonic.
- **MuseScore/MusicXML:** export emits `<key><fifths>…</fifths><mode>major/minor</mode></key>` on **all parts** at every key change, plus visible section/key text above the piano staff. Relative minor and major (e.g. D minor → F major) share the same accidentals, so a new set of accidentals would not normally appear; the section/key text makes the change visible.
- **Global transposition:** the existing semitone shift transposes notes, chords **and section key signatures** together, without changing stored lead-sheet pitches or section key settings. Note spelling follows the key's diatonic notes and the raised leading tone of harmonic minor where applicable; complex enharmonic spellings are still approximate.
- **Project round-trip:** keys are persisted in `.tango` project JSON. Older projects without key settings get an editable first-chord-based guess on load; this is not reliable harmonic analysis. Imported MusicXML key signatures can initialize the keys of existing sections when importing a melody.
- **Legacy test demo:** A1 D minor, B1 F major, A2 D minor, B2 F major, C D minor. **New blank song:** C major in each section until you choose otherwise; blank measures still contain no chords or melody.
- **Validation:** section changes, major/minor, key transposition, XML duration completeness and legacy inference are covered by regression tests. MuseScore 4 application import still requires local testing.

## New in v0.8

- **Historical v0.8 blank-song feature (superseded by v1.0 defaults):** choose title, 4/4 tango (default), 3/4 vals or 2/4 milonga/historical notation, and tempo. A confirmation is shown, and the previous song remains in the local browser library. The new lead sheet has no melody, no chords and no fabricated accompaniment. New projects now use configurable A/B/C… sections of 16 measures by default. Enter harmony and melody in the Lead Sheet, then generate. Empty chord fields can be saved and cleared; MusicXML exports rests without fabricated harmony. Save a `.tango` project to retain your work.

## New in v0.6

- **Song overview:** scrollable instrument-by-measure orchestration matrix showing the current melodic/harmonic role and playing technique. Color-coded role cells, manual-override corner markers, individual measure selection and bulk range/section/whole-song editing. Each selection can override role, articulation, and violin chord technique independently; choosing Inherit removes the override. Overrides are stored in the `.tango` project JSON.
- **Bandoneon continuity:** the default Bandoneon II assignment is harmony rather than an end-of-bar-only fill. When assigned to a non-rest role, its generated role generally has harmonic or melodic content across the phrase. If the input melody is blank, harmonic material is used. Activity targets provide deterministic thinning, but do not mean the percentage of beats sounded. A configured `rest` role remains entirely silent.
- **Per-instrument difficulty:** simpler easy piano voicings, smaller simultaneous note counts and simplified violin arpeggio/double-stop behavior; advanced piano alternates registers more widely. An individual instrument setting overrides the overall level.
- **Piano register changes:** piano can alternate middle and lower/higher voicing targets within the same 4/4 measure. Since v0.7, those voicings can also follow chord changes within the measure.
- **Expression:** section-level `pp`–`ff`, optional crescendo wedges, per-instrument dynamic velocity offsets in the model, accent articulation and playback velocities.
- **Meter conversion:** a conservative 2/4 → 4/4 conversion command joins pairs when their sections agree and there are no protected/edited/generated scores. Since v0.7, different harmonies in the paired measures are preserved. Tuplets, pickups and independent meter/tempo units remain future work.
- **MusicXML:** full-measure rhythmic preflight, notation for accents, dynamics, crescendos, pizz./arco changes, ties/chords and rests. Still needs actual MuseScore 4 application verification.
- **Regression tests:** generator continuity, difficulty, explicit rests, rhythm, simultaneity, conversion guards and expression export.

## Project files

- `src/music.ts`: domain types, style presets, chord tones, generation, instrument difficulty/continuity, conservative meter conversion, protected-bar merge.
- `src/io.ts`: MusicXML export + rhythmic validation, `.tango` ZIP save/load, MIDI/MusicXML import.
- `src/App.vue`: user interface, playback, import/export workflow.
- `src/style.css`: interface styling.
- `tests/regression.cjs`: standalone smoke/regression checks. It uses the globally installed `typescript` compiler from the current development environment and can be adapted to local installations.
- `tests/generated-smoke.musicxml`: generated by the regression suite and ignored by Git; not included as a tracked source fixture or a verified MuseScore import.
- `PROJECT-GOALS.MD`: product and musical goals with references.
- `PROJECT-BOARD.MD`: stories/tasks, release/status, verification and risks.

## Known constraints

- The v1.3 note editor is a simple beat-grid piano roll, **not** engraved staff notation or finger-position optimization. Double stops use a conservative adjacent-string/open-low-position heuristic. The editor permits arbitrary manual polyphony; ergonomic playability is not guaranteed.
- Piano is exported as one part rather than separate hands/staves; chord placement remains heuristic.
- Harmony entry supports one or more beat-aligned chord symbols per bar, such as `D,G` (change on beat 3 in 4/4) or `D,D,D,G` (change on beat 4). Sub-beat chord changes and complex imported harmony timing are not yet supported.
- The eight-measure alternation is a user-specified starting pattern, not a universal historical rule. Different periods, orchestras, tracks and recordings require different phrasing; a real phrase/texture analyzer is still planned.
- The global transpose cannot guarantee an improved singer range or bandoneon fingering: parts are shifted literally without independent register repair.
- Articulation lengths are not always identical to perceived real acoustic tango articulations; browser playback uses a basic synthesizer, not instrument samples.
- Musical roles default by section but can now be overridden per instrument and measure in the Song overview. A true automated phrase-level role planner, musicological calibration and source-audio comparison remain incomplete.
- XML duration preflight checks total part-measure durations, not full MusicXML XSD or MuseScore's importer; imported complex voices, grace notes, repeats, time-signature changes and pickups are not faithfully modeled.
- `.tango` project schema retains `version:1` and optional new fields for backward compatibility. Old projects can load with generator defaults. Save a copy before testing migration.

## Research principles

The profile mapping is intentionally approximate and references documented practices rather than using a conductor's name as a guarantee of authenticity. Useful background:

- *Introduction to the Orquesta Típica*, an educational guide on marcato in four/two, piano/bass rhythmic foundation and stylistic strong-beat accents. https://s3.amazonaws.com/kajabi-storefronts-production/file-uploads/sites/2147630972/downloads/33d3f78-cefe-2b48-127f-a721baa27d0_Introduction_to_the_Orquesta_Ti_pica_-_Free_Guide.pdf
- Academic analysis of Pugliese's *La Tupungatina*, on marcato, syncopation, yumba, piano register/voicing and bass rhythmic organization (Actas AAM/INM). https://www.ism.unl.edu.ar/investigacion/wp-content/uploads/sites/7/2018/09/Actas_2016_AAM_INM.pdf
- *Guía Estilo Carlos Di Sarli*, distinguishing earlier/later orchestral practices, string prominence, piano register and dynamics. https://s3.amazonaws.com/kajabi-storefronts-production/file-uploads/sites/2147630972/downloads/0502b3-57d8-6c68-ae-0b845caddb_1-DI-SARLI-FINAL.pdf
- *Cambridge Companion to Tango* supporting musical examples and transcriptions: https://www.tangocompanion.com/tango-music/

These support **design hypotheses**, not numeric activity thresholds or the accuracy of any specific generated arrangement.

## New in v0.7: multiple chords per measure

- **Chord editor in Song Overview:** click a measure's numbered chord heading to edit its harmonic progression; clicking an instrument's row heading opens the same editor for the currently focused measure. The chord progression belongs to the measure, not to an individual instrument.
- **Lead Sheet:** click a measure tile or its chord button to open the same editor. Input accepts comma-separated chord symbols and shows the chord on each beat before saving.
- **Examples in 4/4:** `D` holds D for all four beats; `D,G` assigns D to beats 1–2 and G to 3–4; `D,D,D,G` changes to G on beat 4. Up to four comma-separated slots are supported in 4/4. A three-symbol entry begins at beats 1, 2 and 3; for unambiguous timing use four slots.
- **Generation:** chord voicings, bass and harmonic parts follow the active harmony at each beat, while melodic roles retain their independent line. Editing a chord invalidates the cached generated score; explicit protected imports are still preserved when using **Generate orchestra**.
- **MusicXML:** harmony changes are emitted with MusicXML harmony offsets, in divisions. Global transpose applies to every symbol. The importer reads beat-aligned harmony offsets from the first part and reconstructs the sequence where representable.
- **2/4 → 4/4:** joining two bars with different harmonies now preserves both symbols instead of refusing conversion.

**Limits:** Chord changes are quarter-beat-aligned, not arbitrary fractions of a beat. The MusicXML importer is a prototype; unusual imported voices and harmony offsets still require real-world round-trip tests. MuseScore 4 import is not yet verified in this environment.

**Documentation policy:** only `README.MD`, `PROJECT-GOALS.MD` and `PROJECT-BOARD.MD` are documentation files in the source ZIP.

## v1.1 — Blank song setup

**New blank song** now offers one editable measure count per section before creation, defaulting to A–E at 16 measures each. Changing the section count adds or removes individual section-length fields while preserving the remaining lengths. An optional **Apply to all sections** action sets a uniform length; the total updates live. Limits are 1–26 sections, 1–128 measures each and 512 measures overall. The resulting A/B/C… rehearsal marks and per-section keys are retained in MusicXML export.

## v1.3 — Guided instrument note editor

Open **6 · Note editor**, or select an instrument-measure in Song Overview and choose **Edit notes in selected cell**; Score Review also provides an **Edit notes** button for each part. Select the instrument and measure, then click a piano-roll cell to add/remove a note. Change the grid resolution (quarter/eighth/sixteenth), default duration, pitch register and suggestion filter. The note list below the grid supports individual pitch, onset, duration, velocity, articulation and violin technique changes. The editor works on blank songs as well as generated scores.

The panel displays the instrument's **effective measure role**, difficulty, activity, dynamic, articulation and violin technique; the section's major/minor key and instrument range; and the chord active at each grid column (including mid-measure changes). **Follow role** suggests chord tones for bass/chord/harmony roles, or section-key tones for melodic roles. **In section key** uses major or *natural minor* pitch classes; **All chromatic pitches** allows any note within the instrument's supported MIDI range. These are editing aids, **not automatic voice-leading, counterpoint or fingering validation**. Existing out-of-filter notes remain removable.

Manual changes replace exactly one instrument-measure in both the visible score and the protected edit store. **Generate orchestra** retains the protected measure while regenerating other measures. **Restore generated measure** removes protection for just that instrument-measure and recalculates its generated notes. Empty protected measures stay silent. Manual notes are persisted in `.tango` and exported to MusicXML; global transposition is applied only during playback/export, not to the stored source pitches.

**Verification:** 56 standalone regression checks pass, including role/key/chord guidance, per-measure protection, empty-measure edits, restoring generated notes and MusicXML duration checks. A full Vue production build and actual MuseScore 4 import remain unverified in this environment because the npm dependencies were unavailable.


## v1.3: section-aware inline lead-sheet harmony

The Lead Sheet groups measures into labeled sections with key signatures and measure ranges. Section keys can be edited in their headers without changing pitches. Each measure has an inline chord-sequence input (Enter or blur to commit; Escape to discard); a measure-number button selects the melody editor. The Song Overview measure headers also expose inline chord inputs, while the expanded harmony editor remains available. Invalid chord sequences are rejected without changing the project.


## v1.4: Copy chords between sections

The Lead Sheet now has a **Copy section chords** panel with source and destination selectors and an explicit overwrite confirmation. It copies the complete chord sequence (including multiple chords per measure and empty measures) by measure position, leaving melody, section keys, instrument roles, manually edited notes, and protection flags untouched. When section lengths differ, only the first `min(source measures, destination measures)` measures are copied; extra destination measures remain unchanged. Generated accompaniment is refreshed after a change while protected manual notes are retained. Source chord strings are validated before any change. The operation is reversible by re-entering harmony or loading an earlier `.tango` save; there is no general undo stack.

## v1.5: automatic local saves, multiple songs, and note audition

- **Autosave:** The app creates an IndexedDB song record on first launch, saves edits after approximately 650 ms of inactivity, and flushes pending edits when switching songs, creating a new song, or importing a `.tango` project. Status is visible in the sidebar. There is also **Save now**. A browser must permit IndexedDB; otherwise the UI reports that autosave is unavailable and portable `.tango` export remains possible.
- **Local library:** The sidebar lists locally saved songs with title, number of measures, and last saved time. Opening a song restores its chords, melody, orchestration, keys, manual note edits and protected measures. The last opened song is restored on reload. **Duplicate song** creates a separate record. **Delete song** requires confirmation and deletes only the selected record. Multiple songs may share the same title, including `Untitled Tango`, because records use stable IDs.
- **No cloud sync:** Browser-local storage is scoped to the current origin and browser profile. Clearing site data, using private browsing, or moving to another device can remove access to these songs. Use **Export .tango backup** regularly and keep those files somewhere durable. A different port/origin has a separate library.
- **Note audition:** In **6 · Note editor**, click a piano-roll cell to hear the corresponding pitch while adding or removing a note. Click a pitch label or an existing note chip to hear it again. **Hear notes when clicked** is enabled by default and can be turned off. A short Tone.js synthesized tone is used; its pitch reflects the current global transposition. The browser may require a click to unlock audio. This is a pitch preview, not an authentic instrument sample.
- **Verification:** Generator/MusicXML regression suite and simulated IndexedDB CRUD tests. A complete Vue build, actual browser persistence test, audio device test, and MuseScore 4 import still need local verification.


## v1.6: Bandoneon I defaults and lead-sheet chord keyboard workflow

- New songs default **Bandoneon I** to follow **Violin II**, using the `adapt` method, in every section. **Bandoneon II** retains its existing independent/section-specific orchestration. Existing saved songs keep their explicit follow settings. Change following under Orchestration → Bandoneon following.
- In Lead Sheet, **Enter** validates/saves the chord sequence and focuses the next measure's chord field, including across section boundaries. **Tab** and **Shift+Tab** move directly among chord inputs (native tab behavior resumes at the grid edges). Invalid entries are rejected and the previous harmony is restored.
- A contextual chord-completion menu appears when typing a chord root. Arrow keys navigate suggestions; Enter accepts a highlighted suggestion; clicking a suggestion inserts it without moving to another measure. The completion replaces only the comma-delimited chord under the caret, preserving other chord slots.
- Diminished chord syntax: `Ddim` or `D°` (diminished triad), `Ddim7` or `D°7` (fully diminished seventh), `Dm7b5` or `Dø7` (half-diminished seventh). The chord-tone generator distinguishes these pitch-class sets.
- This is a keyboard-first entry aid, not an exhaustive jazz-chord grammar or spell-checker for arbitrary extensions.

## v1.7: Direct note editing and navigation shortcuts

- **Song Overview:** a single click on an instrument/measure cell still selects its role, articulation and technique overrides. **Double-click** that cell, or focus it with the keyboard and press **Enter**, to open the Note Editor at that exact instrument and measure. **Space** on a focused cell retains the single-click selection behavior. The map cells expose descriptive accessible labels and tooltips.
- **Note Editor:** **Previous measure** and **Next measure** buttons move within the same instrument; the buttons are disabled at song boundaries. When not typing in an input, select or textarea, **[** and **]** move one measure backward/forward, and **Escape** returns to the Song Overview with the original instrument/measure selected and focused. Keyboard shortcuts are disabled while entering note properties so they do not interfere with typing.
- **Score Review:** double-click an instrument's displayed note list to open that instrument and measure in the Note Editor. The existing explicit **Edit notes** button remains available.
- **Lead Sheet:** double-click a measure number to select it and focus its **Melody notes** text editor. A single click still only selects the measure. Harmony input shortcuts and completion behavior are unchanged.
- These navigation actions do not change project data, autosave or manual-measure protection. Only actual note or setting edits modify the song.

**Verification:** the existing 71 generator/MusicXML checks, 6 local-library/audition checks, and 8 navigation/source-integrity checks pass (85 total). The navigation suite includes a TypeScript parse of the Vue `<script setup>` content; it is not a full Vue template compilation or interactive browser test. The production build, keyboard/mouse interactions in a browser, and actual MuseScore 4 import remain unverified without installed npm dependencies.

## v1.8: Chromatic note entry without harmonic restrictions

- Every pitch/beat cell within the instrument's supported register can be clicked, regardless of the chord, section key, instrument role, or difficulty. Clicking a cell adds/removes the note and auditions its pitch (if enabled). Instrument-range and measure-duration validation remain active.
- Piano-roll colors are informational: **chord tone**, **other section-key tone**, or **chromatic tone**. Classification updates at intra-measure chord changes. The selected note is still protected from orchestral regeneration and included in MusicXML.
- The **Pitch labels** control offers **Follow key signature**, **Use sharps**, or **Use flats**. For example, D♯4 and E♭4 denote the same MIDI pitch. This is an editor display preference, not an explicit enharmonic override in the saved note; MusicXML continues to choose note spelling from the section key.
- The grid covers a scrolling 18-semitone window. Use the octave buttons to reach the rest of the instrument's supported range. Chromatic notes outside that range are still rejected.
- Regression coverage includes out-of-chord melody and bass notes, manual-note persistence, MusicXML duration validity, enharmonic display labels, and a source check that the grid has no harmonic disabled state.


### v2.6.3 mobile and audio diagnostics
Playback controls are now at the top of the main workspace, with a direct 440 Hz Test sound control and visible audio status. Mobile project settings and local song library are collapsed behind a toggle; tabs scroll horizontally and the transport remains sticky on small screens. A blank song with no generated notes now displays a clear message rather than silently appearing to play. Actual browser audio on Azure/mobile devices still requires device testing.


## v2.7 — Note editor and workspace ergonomics
- New projects default to Advanced overall and instrument difficulty; saved songs retain their chosen settings.
- The transport stays visible while scrolling on desktop and mobile.
- A global Show/Hide explanations control stores the choice locally in this browser.
- The Note Editor supports dragging a note's right edge to change written duration and its center vertically to transpose, with long-press opening the properties panel. Existing notes are selected on tap rather than deleted; deletion remains in the properties panel.
- Note properties have velocity and sounding-length sliders alongside precise numeric inputs.
- Less-used global actions are also grouped under More tools; existing access points are retained.


## v2.8 Note duration editing
Touch note resize now uses pointer capture, a larger resize handle, visible note-length preview, and duration stepper controls. Written duration remains independent from articulation gate.

### v2.9 dynamics and melody balance
- Optional measure start/end ppp–fff marks per instrument; both endpoints export a MusicXML hairpin.
- Optional note-level subito mark; MusicXML exports the immediate dynamic.
- Automatic accompaniment ducking while another part has the melody; contrabass is exempt, with configurable reduction.
- Playback applies the measure dynamic envelope and accompaniment reduction at note onset; soundfont/realistic dynamics and MuseScore playback still require verification.


## v3.0.0 About and release notes
The clickable Tango Arranger header opens an in-app About page explaining the workflow and summarizing recent releases. The About & releases tab also provides access. The page is responsive and includes shortcuts to the main editing areas.

## v3.1.0 — Note duration editor correction
The note grid now renders each note as a **single bar with actual horizontal width proportional to its written duration**; the resize handle is located at the note's true endpoint, not the right edge of the onset cell. Notes with onsets between grid divisions also display at their actual position. Dragging the handle on a touchscreen captures the pointer on the stable grid scroller, so dragging remains active when Vue rerenders the note. The selected-note editor has immediate numeric and slider duration controls and 0.25-beat stepper buttons, with an explicit maximum at the measure boundary. Every successful edit updates the protected manual score and MusicXML. A new executable regression test checks duration math, persistence through regeneration and MusicXML validity. Browser touchscreen verification is still required.
