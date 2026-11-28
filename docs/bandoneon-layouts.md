# Bandoneon factory keyboards and pitch ranges

Ranges are sounding MIDI pitches (middle C is C4, MIDI 60) and come directly from each button pair in the selected keyboard. The Ensemble setting is per part. The default is the 142 Rheinische layout, including its playable bass register, not the narrower arranging preference.

| Model | Buttons L / R | Left-hand pitches | Right-hand pitches | Source |
| --- | --- | --- | --- | --- |
| 142 Rheinische (tango) | 33 / 38 | C2–B4, without B♭4 | A3–B6, without B♭6 | [Bandonionfabrik 142 chart](https://bandonionfabrik.de/assets/grifftabellen-bc-142-rheinische-tonlage.pdf) |
| 152 Rheinische extended (Gutjahr) | 37 / 39 | B1–B4 | G♯3–B6, without B♭6 | [Klaus Gutjahr's Argentinian system](https://www.klausgutjahr.de/argentinisches-system.html) and [its keyboard chart](https://www.klausgutjahr.de/images/Argentinisch.jpg) |
| 144 Einheits (German) | 35 / 37 | C2–B♭4 | G3–A6, without G♯6 | [Bandonionfabrik 144 chart](https://bandonionfabrik.de/assets/144.pdf) and [Omar Caccia's opening/closing diagrams](https://www.omarcaccia.com/wp-content/uploads/2024/02/layout-bandoneon-144-einheits.pdf) |
| 146 Peguri (unisonoric) | 33 / 40 | F♯2–C♯5 | A3–B6 | [Bandonionfabrik Peguri chart](https://bandonionfabrik.de/assets/146p.pdf) |

The buttons were checked by hand against the source charts, in chart orientation. The 142 pitch pairs were checked against the maker's published chart and against the 71 corresponding positions in Gutjahr's base 142 system. The 152 uses Gutjahr's actual five extended positions, not a generic 152 chart from another builder. In his chart the underlined capital H is B1, while plain H is B2 and B/b is B♭. For 144, the manufacturer's 144 chart index was checked against the paired open/close diagrams above. For Peguri, each button keeps its pitch in both directions.

Positions follow chart rows and major gaps, not calibrated distances or finger reach. Use the chart on your own instrument if the disposition differs. Numbered 142 button IDs are retained in its 152 extension. The extra unnumbered buttons and the 144/Peguri rows use stable app position IDs rather than purported engraving or fingering numbers.

These are specific layouts, not exhaustive definitions of every model sold with that key count. Pitch ranges include either bellows direction. A known pitch does not certify that a chord or passage is playable in one direction or with a given fingering. An explicit written staff is retained; otherwise a pitch available to just one hand is assigned to that hand and shared pitches use the display split.

Selecting a different model does not rewrite imported notes, protected measures, or saved copies. Changing the model affects newly generated material and the playable-note checks. Saved scores can still show existing out-of-model notes so they can be reviewed deliberately.

The bundled *Hasta Siempre Amor* removed the unplayable held D1 in the opening of each bandoneon part (measure 2). The valid D2s in both parts at measure 74 and the opening piano bass were retained. All example arrangements are checked by `node tests/bandoneon-range.cjs`.
