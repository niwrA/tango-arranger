/** Concert A4 reference for practice. Stored per arrangement, independent of
 * transposition and written score pitch. Older projects default to A4 = 442 Hz. */
export const DEFAULT_A4_HZ=442;
export const MIN_A4_HZ=400;
export const MAX_A4_HZ=480;
export type ProjectTuning={a4Hz:number;overrides?:Record<string,number>};
export function validReferenceHz(value:unknown):value is number{
 return typeof value==='number'&&Number.isInteger(value)&&value>=MIN_A4_HZ&&value<=MAX_A4_HZ;
}
export function tuningReferenceFor(project:{tuning?:Partial<ProjectTuning>},instrument:string):number{
 const global=validReferenceHz(project.tuning?.a4Hz)?project.tuning.a4Hz:DEFAULT_A4_HZ;
 const override=project.tuning?.overrides?.[instrument];
 return validReferenceHz(override)?override:global;
}
