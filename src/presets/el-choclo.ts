import source from './el-choclo-source.json';
import {
  defaultArticulation,defaultExpression,defaultInstrumentSettings,defaultOrchestration,
  generate, type Project
} from '../music';

/**
 * The melodic source is the earlier El Choclo ABC-transcription study supplied
 * with the project. It is NOT a verified 1913 engraving or historical orchestration.
 * A/B/A/B/C is a simplified performance form; pickups and repeat endings are
 * not represented exactly. New orchestration uses the current generation engine.
 */
export function createElChocloStudy():Project {
  const roles=Object.fromEntries(Object.entries(source.roles).map(([section,parts])=>
    [section,{...parts}])) as Project['roles'];
  const p:Project={
    version:1,title:'El Choclo — orchestral study',bpm:source.bpm,beats:source.beats,
    profile:'traditional',bars:source.bars.map(bar=>({
      chord:bar.chord,section:bar.section,melody:bar.melody.map(n=>({...n}))
    })),roles,protectedBars:{},transposeSemitones:0,difficulty:'advanced',
    sectionKeys:{A1:'Am',B1:'C',A2:'Am',B2:'C',C:'A'},
    articulation:{...defaultArticulation(),phraseBars:8},
    orchestration:defaultOrchestration(),
    instrumentSettings:defaultInstrumentSettings(),expression:defaultExpression(),
    pianoFigures:{A1:'chords_up',B1:'notes_down',A2:'melody_response',B2:'chords_down',C:'countermelody'},
    pianoFigureVariation:{A1:0,B1:1,A2:2,B2:1,C:3},
    violinArpeggioDirections:{A1:{'Violin II':'alternate'},B1:{'Violin II':'up'},A2:{'Violin I':'down'},C:{'Violin II':'alternate'}},
    melodyDucking:{enabled:true,reduction:24},
    violinMarcatoBeats:{A1:{'Violin II':[0]},B1:{'Violin II':[0,1]},A2:{'Violin I':[0]},B2:{'Violin II':[0]},C:{'Violin II':[0,1]}},
    measureDynamics:{'Violin I:0':{start:'mp'},'Bandoneon I:16':{start:'mf'},'Violin II:24':{start:'mp',end:'f'},'Bandoneon I:48':{start:'f'},'Piano:60':{start:'mf',end:'ff'}},
    expressionRanges:[{instrument:'Bandoneon I',startMeasure:48,endMeasure:56,from:78,to:102}],
  };
  p.orchestration!.contrabass={A1:'traditional',B1:'pizzicato',A2:'marcato',B2:'traditional',C:'habanera'};
  p.orchestration!.violin={
    A1:{'Violin II':'pizzicato'},B1:{'Violin II':'arpeggio'},
    A2:{'Violin I':'sustained','Violin II':'tango_staccato'},
    B2:{'Violin II':'pizzicato_arpeggio'},C:{'Violin II':'tango_staccato'}
  };
  p.orchestration!.bandoneon={
    A1:{'Bandoneon I':{target:'Violin I',method:'adapt'},'Bandoneon II':{target:'Piano',method:'rhythm'}},
    B1:{'Bandoneon II':{target:'Violin II',method:'rhythm'}},
    A2:{'Bandoneon I':{target:'Violin II',method:'adapt'}},
    B2:{'Bandoneon I':{target:'Violin I',method:'adapt'}},
    C:{'Bandoneon II':{target:'Piano',method:'rhythm'}}
  };
  p.expression!.sections={A1:'mp',B1:'mf',A2:'mp',B2:'f',C:'f'};
  p.generatedScore=generate(p);
  return p;
}
