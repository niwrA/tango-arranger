# Tango Arranger v0.8

Local-first experimental tango orchestration workbench built with Vue 3, TypeScript, Vite and Tone.js. Enter or import a single lead-sheet melody, specify harmony and sectional roles, generate a six-part **orquesta típica** score (piano, contrabass, two violins, two bandoneons; optional voice), and export MusicXML for editing in MuseScore.

**Status:** prototype. The algorithm is style-informed, but is **not** a transcription of a historic orchestra or a validated replacement for a professional arranger. No automatic acceptance in MuseScore 4 can be claimed until an actual MuseScore 4 import test passes. See `PROJECT-BOARD.MD`.

## Installation and running

Requires Node.js 20+ and npm with package-registry access.

```bash
npm install
npm run dev
```

Open http://localhost:8000/. `vite.config.ts` sets port **8000**, `strictPort: true` (fails rather than moving to another port). Run `npm run build` for the production type-check and build. Run `npm run test:regression` for self-contained generator/MusicXML regressions (requires system/global TypeScript; see below).

## Workflow

Use **+ New blank song** in the header to start from an empty lead sheet (default 32 measures, 4/4, 124 BPM), or continue with the initial demo. The new-song dialog confirms before replacing your current work. Blank measures export as rests until you add chords or melody.

1. Open **Song overview** to inspect roles and playing techniques for all measures and instruments. Select a cell to edit one instrument-measure, or select a range, section or entire song to apply role, articulation and violin chord-technique overrides. The highlighted corner indicates an explicit override. Click **Apply to range**, then **Regenerate / merge protected edits** when appropriate.
2. Enter the melody and one or more chord symbols per bar, or import MusicXML/MIDI and select the melody track. Note text format: `D5:1@0` (pitch, quarter-beat duration, beat offset).
3. Select section roles (A1/B1/A2/B2/C) for piano, contrabass, violins and bandoneons. An explicit **rest** role is always honored.
4. Choose an orchestra-style **heuristic** (Traditional, D'Arienzo, Di Sarli, Troilo, Pugliese, Canaro, Fresedo). These affect accents, rhythmic density, string/phrasing assumptions and the Pugliese-inspired piano bass-register accent. They are **not** exact historical reproductions.
5. In **Orchestration**, set violin technique (pizzicato, arco/sustained, arpeggio, playable low-position double stop), bandoneon following (piano/violin/bandoneon, exact/octave/adapt/rhythm), per-instrument **Easy/Intermediate/Advanced** and measure-activity target.
6. Set global transposition (-24 to +24 semitones) to suit the singer or instrument ergonomics. This is a reversible display/export/playback shift and does not rewrite the original lead sheet. When importing an edited score the shift is reversed internally.
7. Use the eight-measure articulation alternation (marcato/staccato then lyrical legato, with staggered instrumental variation). Override any individual violin or bandoneon measure from Orchestration. For violins, lyrical phrasing indicates arco; for bandoneons, it indicates legato bellows articulation.
8. Set dynamics at section boundaries, optional crescendos, or disable expression markings. Generated note velocities follow the dynamics level.
9. Generate, review individual part activity and notes, export `.musicxml` for MuseScore 4. Return edited MusicXML using **Edited full score** import and protect changed instrument-measures.
10. Save/open `.tango` ZIP projects to keep local project settings and scores together.

## New in v0.8

- **New blank song:** choose title, 8–64 measures, 4/4 tango (default), 3/4 vals or 2/4 milonga/historical notation, and tempo. A confirmation prevents accidental loss of unsaved changes. The new lead sheet has no melody, no chords and no fabricated accompaniment. Measures are assigned to eight-bar sections A1, B1, A2, B2, C. Enter harmony and melody in the Lead Sheet, then generate. Empty chord fields can be saved and cleared; MusicXML exports rests without fabricated harmony. Save a `.tango` project to retain your work.

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
- `tests/generated-smoke.musicxml`: generated deterministic fixture; not a verified MuseScore import.
- `PROJECT-GOALS.MD`: product and musical goals with references.
- `PROJECT-BOARD.MD`: stories/tasks, release/status, verification and risks.

## Known constraints

- No staff/piano-roll editor or true finger-position optimization; double stops use a conservative adjacent-string/open-low-position heuristic.
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
