const dirty = new Map<string,boolean>()
export const setDraftDirty=(key:string,value:boolean)=>{if(value)dirty.set(key,true);else dirty.delete(key)}
export const hasUnsavedChanges=()=>dirty.size>0
const positions=new Map<string,number>()
export function watchNavigation(){
 let previous=window.location.hash||'#/'
 let allowed=false
 const click=(event:MouseEvent)=>{const link=(event.target as Element)?.closest?.('a');if(!link?.hash.startsWith('#/')||link.hash===previous)return;if(hasUnsavedChanges()&&!window.confirm('Discard changes? Your local draft will remain saved.')){event.preventDefault();return}allowed=true;positions.set(previous,window.scrollY)}
 const change=()=>{const next=window.location.hash||'#/';if(!allowed&&hasUnsavedChanges()&&!window.confirm('Discard changes? Your local draft will remain saved.')){history.replaceState(null,'',previous);window.dispatchEvent(new Event('together:navigation-cancelled'));return}positions.set(previous,window.scrollY);previous=next;allowed=false;requestAnimationFrame(()=>window.scrollTo({top:positions.get(next)??0,behavior:'instant'}))}
 const unload=(e:BeforeUnloadEvent)=>{if(hasUnsavedChanges()){e.preventDefault();e.returnValue=''}}
 window.addEventListener('click',click,true);window.addEventListener('hashchange',change);window.addEventListener('beforeunload',unload)
 return()=>{window.removeEventListener('click',click,true);window.removeEventListener('hashchange',change);window.removeEventListener('beforeunload',unload)}
}
