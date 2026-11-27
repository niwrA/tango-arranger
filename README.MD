# Current application guide (v5.5.3, updated 2026-11-18)

Tango Arranger is a local-first Vue/TypeScript workbench for arranging Argentine tango. The current navigation starts at **Structure, Keys & Ensemble** when no tab preference is saved, and restores the last workspace tab on refresh or reopening in the same browser. The Orchestration workspace offers **All**, **Section** (instrumental group), and **Instrument** views.

**Current export paths:** Files includes native MuseScore **.mscz** export as well as MusicXML and portable song backups. Native .mscz crescendo/decrescendo hairpins have been tested in MuseScore on iPad; this does not constitute full validation of every exported score or notation feature.

**Current features beyond v5.5.3:** Dynamics Timeline hairpins have selectable measure and optional note-onset endpoints, with a unified editor. The toolbar, editing controls, status banner and full-width responsive About page have received interface refinements. The About page shows the latest improvements before the historical versioned releases.

**Documentation scope:** Entries below are a chronological development record, not all descriptions of the current interface. In particular, older statements about starting in Song Overview or Orchestration, fixed seven-part rosters, MusicXML-only export, and outstanding melisma support have been superseded by later changes. Build and device verification claims in historical entries apply only to the time of those entries.

## Current Note Editor — unified musical editing

The score and note grid share a contextual editing toolbar, note and measure selection, Select/Create/Erase modes and a persistent Preview preference. Split view displays both surfaces, and proposed edits can be auditioned before Apply or Cancel. Use Create to click a staff position or enter a pitch and beat in the toolbar. In Select mode, drag a notehead to move its pitch or onset. Create mode also offers role-aware material. **Fill empty measures** preserves occupied measures, **Replace with role** explicitly regenerates selected measures, and **Change role** preserves existing notes.

The shared domain implementation is in `src/musicalEdit.ts`, and the score surface is in `src/ScorePreview.vue`. The production build and full regression suite, including musical editing tests, pass locally and in CI. See the project board for verified desktop interactions and outstanding iPad, Apple Pencil and musical acceptance, and the project goals for the product direction. [Project board](PROJECT-BOARD.MD) · [Project goals](PROJECT-GOALS.MD)

In Preview, both views show the proposed notes alongside markers for original and removed notes. Use **Audition** to hear the proposed part at the rehearsal speed, or enable **With accompaniment** to hear it with the other parts.


---

## Documentation

- [Release notes and version history](CHANGELOG.md)
- [Installation, workflow and project guidance](#installation-and-running)

## Measure editing — copy, paste, move and cleanup

The taskbar **clipboard icon** opens a compact **Measure tools** dialog in Lead Sheet, Orchestration, Rhythm Editor and Note Editor. It does not occupy permanent space in the score view.

1. **Select source.** Enter From/To measures or choose a whole section. **Pick from score** closes the dialog temporarily: click and Shift-click on desktop, or press and hold the first measure and tap the last on iPad. The selected range then returns to the dialog.
2. **Choose content.** Work on one instrument (for example Voice) or all instruments; check instrument notes, attached lyrics, chords, lead melody or per-measure roles/dynamics/expression. The default is **one instrument's notes and lyrics**. **Everything** includes all supported fields.
3. **Copy** only fills a clipboard; the current song and the **Destination** field remain unchanged. **Preview paste** shows exactly what would be replaced before a separate Confirm action. **Overwrite** replaces matching destination content without changing the song length; **Insert** opens new measures and shifts later events. A one-instrument clipboard may be pasted into another part, subject to instrument pitch and technique limits.
4. **Move** uses the *current source selection* directly, without requiring Copy first. It transfers that content into the destination and clears the original notes or chords in the same undoable operation; cleared instrument notes remain protected against regeneration. Moving does **not** delete the source measures. An overlapping move to the same instrument is rejected rather than silently mixing notes; choose a non-overlapping destination.
5. **Clear, insert, delete, undo and redo** live in the collapsible advanced section. Clear removes selected content without structural changes, while Delete measures shifts the timeline, including saved difficulty editions. All destructive operations require a preview/confirmation.

Inline status and warnings are shown inside the dialog. For example, copying **Pequeña E measures 131–163** (33 measures) and overwriting from **147** would need destination measures **147–179** and will be rejected in a 163-measure song. Copy no longer silently changes the requested destination. To transfer just the first half of E, select **131–147** as the *source*.

The taskbar **File** menu contains New/Open/Save/Duplicate/Delete and portable backups. The separate **Import / Export** menu groups import of projects/MusicXML/MIDI, notation software formats, player-friendly exports and project exchange.

**Verification:** The measure-clipboard regression script covers measure movement, protected Voice rests, structural shifts, invalid destinations, iPad UI wiring and the Pequeña C→E scenario. Physical iPad Safari interaction and MuseScore engraving still require device acceptance testing.

## Ritardando, fermata and following the singer

The **Lead Sheet → Expressive ending** editor adds song-wide tempo and holding instructions. Select the opening and closing measures of a **rit.** and its final written-tempo percentage (for example 65%); the tempo remains reduced until an explicit **a tempo** marking. Add a **fermata** to the selected instrument and measure, set its practice stretch and choose **Wait for singer/conductor cue** when appropriate. During whole-song playback, the ensemble slows and holds; a cue fermata pauses the transport until **Continue · singer cue** is pressed. Rehearsal speed still scales the entire performance without changing the saved composition.

Both **MusicXML** (including compressed MXL and difficulty editions) and **experimental native MuseScore MSCZ** export the ritardando, discrete tempo changes, a-tempo return and a conventional fermata symbol on the designated instrument's last event of that measure. The optional **colla voce / wait for cue** indication is printed as text. MuseScore's own playback may interpret holds and tempo marks differently and **cannot wait indefinitely for a live vocal cue merely because notation is present**. In Tango Arranger the fermata stretch affects the final beat of its measure; the score marking remains conventional.

Native score ties now use correct distances back to the previous note segment, especially across mixed note durations and barlines. Each tie is validated in the regression suite to connect matching pitches in the same staff and voice; a separate same-pitch reattack in MusicXML must not be tied to its predecessor. Physical MuseScore/iPad visual verification is still required before claiming every possible multi-voice engraving case is solved.

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

## Expression gestures (Milestone 1, 2026-11-19)

Note Editor and Performance mode show marcato and staccato markers, structured
pitch trajectories and compact per-instrument difficulty labels. An editable
`gesture` on a note preserves its normalized pitch points; optional
`partner` adds a second violin voice for a double sirena. Presets include
ascending/descending portamento and látigo, single and double sirenas in both
directions, rise–fall/fall–rise sirenas and descending double sirena with tremolo.
Double violin gestures are checked against a conservative adjacent-string and
first-position model. Manual edits are protected from regeneration and saved
in the existing `.tango.json` backup; legacy `slideTo` notes still work.

App playback synthesizes multi-point pitch trajectories and two simultaneous
notes for double sirenas. MusicXML and experimental MSCZ export both starting
pitches and a **text label**; exact gesture pitch bends and tremolo playback
are not round-tripped by MuseScore. More advanced fingerings, phrase-aware
automatic generation, multi-difficulty editions and rhythm-snap provenance
remain future work. Browser/Safari and MuseScore GUI validation remain necessary.

## Independent instrument difficulty editions (Milestone 2, 2026-11-19)

A single portable `.tango.json` song now stores separate **Easy**, **Intermediate**
and **Advanced** versions of each instrument. The form, lead-sheet melody,
harmonic progression and tempo remain shared. Choose a musician's version in
**Orchestration → Instrument editions**, or switch the active part in the
Note Editor (including Focus mode). Switching saves the previous version's
notes, manual edits and protected measures, then restores the chosen version.
A missing version is generated without overwriting the others; it can then be
edited and protected independently. The default active scores retain their
original fields for compatibility with older files and project tools.

In **Files**, choose **Printable difficulty editions (.zip)**. The download
contains `selected-ensemble.musicxml` with your currently chosen combination
of difficulties, plus Easy/Intermediate/Advanced individual MusicXML parts for
every instrument. Open these in MuseScore to print or export PDF. The bundle
also includes `edition-selections.json`, which describes the chosen levels,
and lists stored editions that may be stale after changes to shared material.
Missing parts are generated for the ZIP without changing the editable song.
The `.tango.json` backup stores the independent editable editions, including
manual protections. Legacy version-1 song files remain readable.

**Limitations:** Edits to shared melody, harmony or form do not automatically
re-harmonize saved alternatives; the UI marks stale editions. Regenerate or
review those versions before printing. The three levels remain heuristic
arrangements, not individually certified technique examinations. Print-ready
layout is finalized in MuseScore; no native browser PDF engraver is provided.

## Milestone 3 — Editable phrase-aware orchestration (2026-11-19)

Open **Orchestration → Tools → Open phrase planner**. Choose a phrase length from 1 to 32 measures (eight by default), then use **Create proposal**. Phrase boundaries follow contiguous song sections, including shortened final phrases. The proposal is an editable draft; it **does not** change the score until **Apply phrase plan**.

For every instrument and phrase, set musical **role**, active-measure **percentage**, placement (**Opening**, **Closing**, **Throughout**), optional articulation, and violin or contrabass playing technique. The editor shows exactly which measures would be active. The result is a shared, explicit phrase-level plan between melody/harmony input and difficulty-aware note generation; existing Easy/Intermediate/Advanced instrument editions remain independent. Choosing **Use section settings** removes the active plan and returns to the previous behavior.

**Precedence and safety:** Explicit instrument-measure role/articulation/technique overrides win over the phrase plan; a valid phrase plan wins over song-section defaults. Notes in protected instrument-measures remain unchanged when planning/regenerating. Stored alternative difficulty editions are preserved and flagged stale when their shared arrangement changes. Source project notes, lyrics and expressive gestures are retained through portable backups. Legacy .tango projects without a phrase plan continue generating as before. Invalid plans (overlapping/out-of-order measures, altered meter, altered form or altered roster) are rejected or treated as inactive until rebuilt.

Phrase articulation also supplies the default articulation and written duration for newly entered notes, with explicit note choices and measure overrides retaining priority. Malformed saved plans show validation and rebuild controls without trying to render invalid phrase rows. Invalid drafts remain discardable. `npm run test:phrases` covers generation, manual-note defaults, protected editions, native backups, real compressed MusicXML exports, and Vue rendering with malformed input.

**What this does not do:** Automatically detect expressive phrases or cadences from recordings; infer physical violin fingerings or bandoneon button layouts; add advanced double stops to free melodic lines; solve full contrapuntal voice leading; or guarantee that every printed part is ergonomically playable. It is a deterministic, editable *orchestration-planning foundation*. The remaining milestones include instrument-specific playability, advanced harmony, and violin double stops. Rhythm-snap provenance is covered by Milestone 4 below. Browser/iPad Safari and MuseScore GUI acceptance remain necessary.

## Milestone 4 — Rhythm snap cues and contextual editing (2026-11-19)

**Note Editor:** Choose a tango rhythm from **Snap note onsets to** to show gold attack guides on the beat ruler and piano-roll grid in both normal and Focus mode. The previous **free timing** behavior remains the default. When adding a note within half a beat of a preset attack, its onset snaps to that attack. Existing notes are not moved automatically: select a note and press **Snap note / chord to preset** in the Note Inspector to move its onset (and any simultaneous chord notes) deliberately. Resizing or moving a note afterward clears its source label, because the original timed placement no longer applies. Notes that are outside the snap tolerance remain at their original times.

Snapped notes carry a small diamond and a source label in the Note Editor and Performance mode. An edit can be an actual selected preset or an **Edited rhythm pattern** applied through the dedicated Rhythm Editor. A source is recorded only when an action actually applies a rhythm; merely resembling a template is not evidence. You can release the label while retaining timing. Exact timing, articulation and note values are preserved in MusicXML, while the app-specific provenance is stored in the portable .tango.json project and its independent difficulty editions.

**Contextual settings:** Orchestration map **instrument headings** now have a compact more-options button and also open a menu on a long touch press, desktop right-click or keyboard **Shift+F10/Menu**. The menu provides Edit notes, Edit chords, Role/technique settings, Rhythm Editor, Play instrument and difficulty selection using the existing tools. Long-press/right-click on individual map cells continues to open measure-level settings; the keyboard context-menu gesture is now supported there too. Notes already supported long press for properties and now also accept right-click or keyboard **Shift+F10/Menu**. Ordinary clicks, range selection and double-click-to-edit remain available.

**Limits:** Snap guides indicate deterministic app templates, not historically authenticated orchestral rhythms. Applying a rhythm in the Rhythm Editor can intentionally retime notes and requires confirmation before overwriting protected measures. Source labels are app-specific and do not claim that MuseScore can recreate the originating preset. UI changes and pointer/context-menu behavior still require physical iPad Safari and desktop-browser acceptance testing.

## Contextual editing extension — phrase, rhythm and dynamics (2026-11-19)

Existing editor actions are now available directly from their musical objects. Touch and pen long press (about 550 ms), desktop right-click, keyboard Menu/Shift+F10, and visible more-options controls open context menus without replacing ordinary clicks. Moving the touch pointer cancels the pending hold, allowing scroll gestures. Menu actions lead back to the same editor functionality; there is no second independent arrangement state.

**Phrase planner:** A new compact phrase-block strip selects contiguous phrases and offers contextual shortcuts to open the whole measure range in the Note Editor, create an editable phrase-plan draft, copy the previous phrase's part settings, or set shared placement/activity for non-resting parts. All changes to phrase roles, activity and placement remain in a **draft** until **Apply phrase plan**. Applied alternatives and protected notes are not silently overwritten.

**Rhythm editor:** Long-press, right-click or keyboard-open a rhythm attack, or use **Options** on its selected-note controls. The menu provides beat/duration editing, accented/unaccented, move/lengthen/shorten by a sixteenth-note step, split and delete. This changes only the editable rhythm grid; instrument notes do not change until the existing Apply action. A vertical scroll cancels a pending long press; the dedicated resize grip still handles dragging.

**Dynamics timeline:** Measure tiles and hairpins have context menus and a visible more-options button. Measure options edit/set/clear dynamics within the current scope or open the existing crescendo/diminuendo composer. A hairpin menu opens the existing full editor, starts or ends as exact-beat/note-snapped endpoints, or requests confirmation before deleting. The endpoint chooser now uses notes from the actual hairpin instrument even when the dynamics scope differs.

Manual acceptance checks remain important on iPad Safari: scroll cancellation, right-click from a desktop mouse, keyboard context keys, focus recovery and popup geometry in both orientations.

## Intelligent MusicXML import, alignment and merge (2026-11-19)

Files > Import offers a **reviewed MusicXML merge** in addition to older melody and positional round-trip imports. The new MusicXML parser retains division durations across measures (important for PlayScore 2), independent voices, backup timing, piano staves, signature regions, lyric metadata, and measure boundaries. Explicit harmony is recognized; if no chord symbols are present, **Suggest harmony** offers a fallible note-based estimate rather than silently fabricating a chord.

The preview compares existing **Ours** with incoming **Theirs**, with an optional **Combine** decision per measure for the selected instrument and harmony. Sections have batch decisions; individual rows expose source-measure remapping, local +/-24-semitone shifts, evidence-based confidence, protected-note policy, and a small inline editor for original MIDI pitches. Choose **Fit to current song**, **Imported score defines structure**, or **Reference only**. When imported piano leads, key-signature regions supply initial section boundaries; this is not proof of major or minor tonal center. Unmatched/low-confidence regions are flagged for review.

**Data protection:** Before applying, the app requests confirmation. It saves the full previous project (including every original instrument and difficulty edition) inside importMergeBackup for **Files > Undo last MusicXML merge**. The selected source MusicXML and alignment plan are saved in the project as an import reference for later review. Protected parts keep their pitches by default; deliberate merge and edit decisions may modify them. For a source-led reconstruction, only mapped original measures are carried into the new timeline; unmatched material survives in the backup, not as an invented correspondence. The result remains editable in the Note Editor and can be exported to MuseScore. Legacy imports remain offered for same-layout round trips.

**Known limitations:** No image-based score comparison, automated fingering reassignment, full MusicXML schema validation, harmonic certainty guarantee, repeat expansion, or intelligent pitch-level contrapuntal rewriting. Printed score appearance and Safari touch interactions still require application/device acceptance testing.

**Orchestration-map iPad fix:** Instrument names, the options button and two playback actions are now constrained to a single allocated row within the sticky instrument column, avoiding overlap with measure 1.

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
