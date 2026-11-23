const BUILD_PATTERN=/^[a-f0-9]{40}$/i;
const BUILD_QUERY='__tango_build';

export async function fetchAppBuild(url:URL,signal:AbortSignal):Promise<string|null>{
  const response=await fetch(url,{cache:'no-store',signal});
  if(!response.ok)return null;
  const document=new DOMParser().parseFromString(await response.text(),'text/html');
  const meta=Array.from(document.getElementsByTagName('meta')).find(tag=>tag.getAttribute('name')==='tango-build');
  const build=meta?.getAttribute('content');
  return build&&BUILD_PATTERN.test(build)?build:null;
}

export function appUpdateUrl(href:string,build:string):URL{
  const url=new URL(href);
  url.searchParams.set(BUILD_QUERY,build);
  return url;
}

export function cleanAppUpdateUrl(href:string,build:string):URL|null{
  const url=new URL(href);
  if(!build||url.searchParams.get(BUILD_QUERY)!==build)return null;
  url.searchParams.delete(BUILD_QUERY);
  return url;
}
