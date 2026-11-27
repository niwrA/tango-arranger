export const dynamicsCurves=[
 {id:'linear',label:'Linear'},
 {id:'ease-in',label:'Build gradually'},
 {id:'ease-out',label:'Change early'},
 {id:'smooth',label:'Smooth ends'}
] as const;
export type DynamicsCurve=typeof dynamicsCurves[number]['id'];
export type VelocityPoint={at:number;velocity:number};

export function dynamicsProgress(progress:number,curve:DynamicsCurve='linear'):number{
 const t=Math.max(0,Math.min(1,progress));
 switch(curve){
  case 'ease-in':return t*t;
  case 'ease-out':return 1-(1-t)*(1-t);
  case 'smooth':return t*t*(3-2*t);
  default:return t;
 }
}

export function velocityCurve(sample:(at:number)=>number):VelocityPoint[]{
 return [0,.125,.25,.375,.5,.625,.75,.875,1].map(at=>({at,velocity:sample(at)}));
}
