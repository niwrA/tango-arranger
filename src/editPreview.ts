import type {Note} from './music';
import type {MusicalEditChanges} from './musicalEdit';

export type PreviewOriginal={note:Note;kind:'original'|'deleted'};
export type EditPreview={before:PreviewOriginal[];after:ReadonlyMap<Note,'added'|'modified'>};

/** Match the transaction's raw notes to the corresponding renderable notes in each snapshot. */
export function projectEditPreview(changes:MusicalEditChanges,before:readonly Note[],beforeDisplay:readonly Note[],after:readonly Note[],afterDisplay:readonly Note[]):EditPreview{
 const originals=new Map(before.map((note,index)=>[note,beforeDisplay[index]??note]));
 const proposed=new Map(after.map((note,index)=>[note,afterDisplay[index]??note]));
 const marks=new Map<Note,'added'|'modified'>();
 for(const note of changes.added)marks.set(proposed.get(note)??note,'added');
 for(const {after:note} of changes.modified)marks.set(proposed.get(note)??note,'modified');
 return {
  before:[
   ...changes.modified.map(({before:note})=>({note:originals.get(note)??note,kind:'original' as const})),
   ...changes.deleted.map(note=>({note:originals.get(note)??note,kind:'deleted' as const}))
  ],
  after:marks
 };
}
