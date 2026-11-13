# Tango Arranger — project board (v0.5)

**Status definitions:** Done = code/doc is present; Partial = meaningful implementation with clear gaps; Planned = not implemented. **Verification is a separate axis**: Done does not imply MuseScore compatibility or historical fidelity.

| ID | User story / engineering task | Status | Release | Evidence / outstanding work |
|---|---|---|---|---|
| TA-001 | Local-first Vue/TypeScript workbench | Done | v0.1 | `src/App.vue` |
| TA-002 | Manual melody/chord input and section roles | Partial | v0.1 | Text entry; staff editor planned |
| TA-003 | MIDI and MusicXML import | Partial | v0.1 | Complex meter, repeats, grace notes unsupported |
| TA-004 | Portable `.tango` project ZIP | Done | v0.1 | `src/io.ts` |
| TA-005 | MusicXML export and precise measure accounting | Partial | v0.2–0.4 | Regression test passes; MuseScore 4 not run |
| TA-006 | Repair missing `download` export | Done | v0.2.1 | `src/io.ts` |
| TA-007 | Standardize Vite at port 8000 strict | Done | v0.3 | `vite.config.ts` |
| TA-008 | Violin pizzicato, arpeggio, arco/sustain | Partial | v0.3 | Heuristic note realization and directions |
| TA-009 | Violin adjacent-string double stops | Partial | v0.3 | Low-position/open-string feasibility; no optimized fingering |
| TA-010 | Bandoneon following other instruments | Partial | v0.3 | Section target + exact/octave/adapt/rhythm methods |
| TA-011 | Preflight MusicXML duration validation | Done | v0.3 | Export blocked on invalid sum |
| TA-012 | Update README / goals / story board | Done | v0.3–0.4 | Root documentation |
| TA-013 | Historical, sourced orchestra-profile heuristics incl. Troilo | Partial | v0.5 | Accent, compás, voicing tendencies; not recording-calibrated |
| TA-014 | Reduce Bandoneon II unwanted rests | Done | v0.5 | Default role now harmony; empty melody maps to chords |
| TA-015 | Respect explicit rest roles | Done | v0.5 | Regression test |
| TA-016 | Per-instrument activity controls and activity report | Partial | v0.5 | Deterministic measure target; no phrase planner or cross-part collision solver |
| TA-017 | Overall and per-instrument difficulty | Partial | v0.5 | Easy/Intermediate/Advanced heuristics; ergonomics incomplete |
| TA-018 | Piano chords move between registers in same bar | Partial | v0.5 | Different voicing targets; single stave, no true hand separation |
| TA-019 | Sectional dynamics + wedges + accents + velocities | Partial | v0.5 | MusicXML directions implemented; browser expression not independently verified |
| TA-020 | Safe 2/4 → 4/4 conversion | Partial | v0.5 | Preserves time, refuses harmony/section conflicts, no pickups |
| TA-021 | Generator and export regression suite | Done | v0.5 | `tests/regression.cjs`, deterministic fixture |
| TA-022 | Actual MuseScore 4 clean-open end-to-end test | Planned | Next | Required before compatibility certification |
| TA-023 | Full production `npm run build` and CI | Planned | Next | npm registry unavailable here; Vue compilation unverified |
| TA-024 | More than one chord/change per measure | Implemented (v0.7) | Beat-aligned comma shorthand; fractional-beat changes still planned |
| TA-025 | Real phrase-level role/density planning | Planned | Next | Separate plan from notes, human overrides |
| TA-026 | Valid independent multiple-voice MusicXML and pickups | Planned | Future | Current exporter flattens overlaps to tied chords |
| TA-027 | Optimized violin fingering and bandoneon voicing | Planned | Future | Position/ergonomic checks and pitch motion optimization |
| TA-028 | Staff/piano-roll editor | Planned | Future | Current interface is text + note overview |
| TA-029 | Three-way merge from MuseScore | Planned | Future | Currently instrument-measure protection only |
| TA-030 | Historical excerpt comparison/golden reference set | Planned | Next | Score/legal-source selection, analysis and listening validation |
| TA-031 | Per-instrument expression differences | Partial | v0.5 | `dynamicsOffset` in data model and UI; not independently listening-verified |
| TA-032 | Authenticity of Pugliese yumba and Di Sarli accompaniment | Partial | v0.5 | Approximations, not transcriptions; test in corpus |

## Executed in v0.5

- Changed default Bandoneon II fill assignment to harmonic continuity and provided an empty-melody fallback.
- Introduced per-instrument and overall difficulty and activity UI, with active-measure reporting.
- Added piano intra-bar register targets and profile-derived accents, plus a Troilo heuristic.
- Added MusicXML dynamics, crescendo and note accents and corresponding generated note velocity scaling.
- Added a conservative 2/4-to-4/4 conversion that refuses destructive merges.
- Added deterministic regression tests for continuity, rest semantics, voicing complexity, XML measure coverage/overlap, conversion, articulation and expression.
- Recorded references and explicit known limitations in README and goals.

## Release verification (environment)

- [x] TypeScript generator check using system `tsc`.
- [x] Standalone regression checks passed (10 tests).
- [x] Generated MusicXML checked for complete durations by code.
- [ ] Production Vue typecheck/build. Registry resolution (`EAI_AGAIN`) prevented dependency installation.
- [ ] Actual MuseScore 4 import to confirm no warnings.
- [ ] Historical corpus and human-ear comparison.
- [ ] Full playback and portable `.tango` browser test.


## v0.5 stories and tasks

| ID | Story / task | Status | Verification / follow-up |
|---|---|---|---|
| TA-033 | Global, reversible semitone transpose UI (-24..+24) | Done | Implementation in `App.vue` and project model; full browser verification pending |
| TA-034 | Transpose sounding notes and MusicXML chord symbols | Done | Regression for pitches/chord roots and measure duration |
| TA-035 | Transposed MuseScore import prevents double transposition | Partial | Inverse conversion implemented; browser round-trip test pending |
| TA-036 | Configurable eight-bar rhythmic/lyrical articulation cycle | Done | Deterministic pattern with staggered Violin II/Bandoneon II |
| TA-037 | Individual instrument, per-measure articulation override | Done | Overrides in model/UI and regression; browser usability pending |
| TA-038 | MusicXML staccato+marcato / legato direction export | Partial | XML produced; MuseScore 4 opening/rendering pending |
| TA-039 | Singer tessitura and ergonomic bandoneon fingering checks | Planned | Requires range analysis and instrument-specific fingering model |
| TA-040 | Historical recording/score corpus to validate phrase changes | Planned | User's eight-bar pattern remains optional heuristic |
| TA-041 | Ensure physical violin vs. bandoneon articulation semantics | Partial | Uses arco/pizz. for violin, legato/staccato for bandoneon; playback timbre pending |

### Work executed in v0.5

- Added transposition as a persisted scalar rather than destructive editing of imported melody or generated notes.
- Updated MusicXML chord roots and note pitches, with round-trip inverse transpose for edited-score import.
- Added configurable phrase duration and explicit measure/instrument articulation overrides.
- Added generated staccato attacks with shorter note durations and legato mode; expressed markers in MusicXML.
- Expanded smoke/regression suite; `npm run test:regression` is the reproducible check.

### Verification

- [x] System TypeScript check on `src/music.ts`.
- [x] Standalone regression tests and measure-duration export checks.
- [ ] Full Vite Vue production build with dependencies installed.
- [ ] MuseScore 4 application import, actual articulation engraving, and playback listening.
- [ ] End-to-end browser interaction/round-trip test.


## v0.6 song overview

| ID | Story / task | Status | Evidence / remaining work |
|---|---|---|---|
| TA-042 | Full-song instrument-by-measure orchestration matrix | Implemented | Vue interface with horizontal scrolling, role color, articulation label and section boundaries; browser UX unverified |
| TA-043 | Select an instrument-measure for direct editing | Implemented | Selecting a matrix cell loads instrument, measure, and explicit override values |
| TA-044 | Override instrument roles by measure and range | Implemented | `measureRoles` persisted in project JSON; generator uses it; automated regression |
| TA-045 | Override violin chord techniques by measure and range | Implemented | `measureViolinTechniques` persisted; generator uses it; automated regression |
| TA-046 | Apply articulation override across range/section/full song | Implemented | Reuses `articulation.overrides`; range editor can inherit/remove explicit overrides |
| TA-047 | Preserve section inheritance and intentional rests | Implemented | Sparse overrides; regression tests for explicit rests |
| TA-048 | Verify song overview in browser and MusicXML in MuseScore 4 | Pending | Requires installed dependencies, browser interaction and MuseScore 4 |
| TA-049 | Consolidate project documentation into exactly three files | Done | Removed legacy `README.md`, `EXPORT-FIX-NOTES.md`; `.tango` package no longer includes README.txt |

### v0.6 checks

- [x] Generator TypeScript compiled by system `tsc`.
- [x] Existing and new standalone regression suite passed.
- [ ] Full Vue production build (`npm run build`) not available in this environment without installed npm dependencies.
- [ ] Browser UX (including matrix scrolling, selection and bulk edits) needs interactive verification.
- [ ] MuseScore 4 application import remains outstanding.

## v0.7 — Beat-level harmony editing

| ID | Story / task | Status | Verification / follow-up |
|---|---|---|---|
| TA-050 | Multi-chord shorthand per measure (`D,G`, `D,D,D,G`) | Implemented | Parser and per-beat unit checks |
| TA-051 | Shared chord editor from Song Overview measure header | Implemented | Vue interface; browser interaction pending |
| TA-052 | Chord editor from Song Overview instrument row header | Implemented | Opens focused measure's shared harmony; browser pending |
| TA-053 | Chord editing from Lead Sheet measure tile and field | Implemented | Uses shared editor; browser pending |
| TA-054 | Active chord influences generated accompaniment and bass | Implemented | Regression checks for piano beat-four change |
| TA-055 | MusicXML multiple harmony events with beat offsets | Implemented | XML parse and offset assertions; MuseScore 4 pending |
| TA-056 | Multiple chord symbols transpose together | Implemented | Regression assertions |
| TA-057 | 2/4-to-4/4 conversion preserves harmonic changes | Implemented | Regression assertion |
| TA-058 | Import beat-aligned MusicXML harmony offsets | Implemented / unverified | DOM importer logic; browser and MuseScore round trip pending |
| TA-059 | Verify complete Vue build and browser interaction | Pending | Dependencies unavailable in this runtime |
| TA-060 | Extend harmonic events to fractional-beat positions | Planned | Requires timing-aware editor and additional XML tests |
| TA-061 | Restrict documentation to exactly three files | Done | Only `README.MD`, `PROJECT-GOALS.MD`, `PROJECT-BOARD.MD` |

### v0.7 verification

- [x] 22 regression checks pass, including new chord timing and MusicXML tests.
- [x] TypeScript domain model compiles with system `tsc`.
- [x] Generated MusicXML parses and passes per-part measure-duration checks.
- [ ] Full Vue production build with npm dependencies.
- [ ] Browser UX, import/save and actual MuseScore 4 import.

## v0.8 — New blank song

| ID | Story / task | Status | Verification / follow-up |
|---|---|---|---|
| TA-062 | New blank song action and setup panel | Implemented | UI source; browser UX pending |
| TA-063 | Configurable title, measure count, meter and BPM | Implemented | Domain validation regression |
| TA-064 | No demo notes, chord symbols or fabricated accompaniment | Implemented | Blank-generation regression |
| TA-065 | Empty harmony entry and clearing chords | Implemented | Parser and generator regression |
| TA-066 | Export blank measures as valid MusicXML rests | Implemented | Duration preflight regression; MuseScore pending |
| TA-067 | Confirmation before replacing an unsaved project | Implemented | UI source; browser interaction pending |
| TA-068 | Browser interaction and MuseScore 4 acceptance | Pending | Requires Vue runtime and MuseScore 4 |
| TA-069 | Keep exactly three documentation files | Done | README.MD, PROJECT-GOALS.MD, PROJECT-BOARD.MD |
