import { copy } from './copy'
import { type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode, useEffect, useId, useRef, useState } from 'react'
export function Icon({ name = 'shield', size = 20 }: { name?: string; size?: number }) {
  const paths: Record<string,string> = { shield:'M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7z', pin:'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z M12 7v6m-3-3h6', clock:'M12 8v4l3 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0', user:'M8 7a4 4 0 1 0 8 0 4 4 0 1 0-8 0 M4 22v-3a8 8 0 0 1 16 0v3', users:'M8 7a4 4 0 1 0 8 0 4 4 0 1 0-8 0 M4 22v-3a8 8 0 0 1 16 0v3 M19 4a4 4 0 0 1 0 8', check:'m5 12 4 4L19 6', alert:'m12 3 10 18H2Z M12 9v5m0 3v1', bell:'M18 8a6 6 0 0 0-12 0c0 8-3 8-3 9h18c0-1-3-1-3-9 M9 21h6', megaphone:'m3 10 18-7v18L3 14Z M7 15v6h4', lock:'M6 10V7a6 6 0 0 1 12 0v3 M4 10h16v12H4Z', close:'m6 6 12 12M6 18 18 6', search:'M20 20l-5-5 M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0', help:'M9 8a3 3 0 1 1 4 3l-1 1v2m0 3v1 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0', lifebuoy:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M5 5l4 4m6 6 4 4M5 19l4-4m6-6 4-4' }
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] ?? paths.shield}/></svg>
}
export function Button({ variant='secondary', busy, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary'|'secondary'|'danger'|'text'; busy?: boolean }) {
 const [automaticBusy,setAutomaticBusy]=useState(false)
 const pending=busy||automaticBusy
 return <button {...props} onClick={event=>{if(pending)return;const result=props.onClick?.(event) as unknown;if(result instanceof Promise){setAutomaticBusy(true);void result.catch(()=>toast(copy.could_not_complete_the_action_please_retry)).finally(()=>setAutomaticBusy(false))}}} disabled={props.disabled || pending} className={`button ${variant} ${props.className ?? ''}`} aria-busy={pending}>{pending && <span className="spinner" aria-hidden="true"/>}{children}</button>
}

export function IconButton({ label, icon, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; icon: string }) { return <Button {...props} aria-label={label} title={label}><Icon name={icon}/></Button> }
export function Avatar({ name }: { name: string }) { return <span className="avatar" data-tone={[...name].reduce((value,letter)=>value+letter.charCodeAt(0),0)%3} aria-hidden="true">{name.split(/\s+/).slice(0,2).map(n => n[0]).join('')}</span> }
export function Card(props: HTMLAttributes<HTMLElement>) { return <section {...props} className={`panel ${props.className ?? ''}`}/> }
export function Callout({ tone='info', children }: { tone?: string; children: ReactNode }) { return <div className={`callout ${tone}`}><Icon name={tone==='warn'?'alert':'help'}/><div>{children}</div></div> }
export function Skeleton() { return <div className="skeleton" role="status" aria-label={copy.loading}><span className="sr-only">{copy.loading_2}</span></div> }
export function EmptyState({ title, children, icon='shield' }: { title: string; children?: ReactNode; icon?: string }) { return <div className="empty-state"><Icon name={icon} size={32}/><h2>{title}</h2><p className="lede">{children}</p></div> }
export function Dialog({ title, children, onClose, drawer=false }: { title: string; children: ReactNode; onClose: () => void; drawer?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()
  useEffect(() => { const previous = document.activeElement as HTMLElement; ref.current?.showModal?.(); return () => previous?.focus() }, [])
  return <dialog ref={ref} open={typeof HTMLDialogElement.prototype.showModal !== 'function'} className={drawer?'drawer':''} aria-labelledby={id} onCancel={e => { e.preventDefault(); onClose() }} onClick={e => { if (e.target === e.currentTarget) onClose() }}><div className="dialog-content"><header className="row-main"><h2 id={id}>{title}</h2><IconButton label={copy.close} icon="close" onClick={onClose}/></header>{children}</div></dialog>
}
export const Drawer = (props: Parameters<typeof Dialog>[0]) => <Dialog {...props} drawer />
export function Tabs({ tabs, selected, onChange }: { tabs: string[]; selected: string; onChange: (tab: string) => void }) { return <div className="tabs" role="tablist">{tabs.map((t,i)=><button key={t} type="button" role="tab" aria-selected={selected===t} tabIndex={selected===t?0:-1} onClick={()=>onChange(t)} onKeyDown={e=>{ if (['ArrowRight','ArrowLeft'].includes(e.key)) { e.preventDefault(); onChange(tabs[(i+(e.key==='ArrowRight'?1:tabs.length-1))%tabs.length]); (e.currentTarget.parentElement?.children[(i+(e.key==='ArrowRight'?1:tabs.length-1))%tabs.length] as HTMLElement)?.focus() } }}>{t}</button>)}</div> }
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (value:boolean)=>void; label:string }) { return <button type="button" className="switch" role="switch" aria-checked={checked} onClick={()=>onChange(!checked)}><span aria-hidden="true"/>{label}</button> }
export function toast(message: string) { window.dispatchEvent(new CustomEvent('together:toast', { detail: message })) }
export function Toasts() {
  const [items,setItems]=useState<{id:string;message:string}[]>([])
  useEffect(()=>{ const timers=new Set<ReturnType<typeof setTimeout>>(); const receive=(e:Event)=>{ const id=crypto.randomUUID(); setItems(prev=>[...prev,{id,message:(e as CustomEvent<string>).detail}]); const timer=setTimeout(()=>{setItems(prev=>prev.filter(x=>x.id!==id));timers.delete(timer)},4000);timers.add(timer) }; window.addEventListener('together:toast',receive);return()=>{window.removeEventListener('together:toast',receive);timers.forEach(clearTimeout)} },[])
  return <div className="toasts" aria-live="polite" aria-atomic="false">{items.map(x=><div className="toast" key={x.id}><Icon name="check"/>{x.message}</div>)}</div>
}

// Field wrappers preserve native form and password-manager behavior.
export const Input = (props: import('react').InputHTMLAttributes<HTMLInputElement>) => <input {...props}/>
export const Textarea = (props: import('react').TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props}/>
export const Select = (props: import('react').SelectHTMLAttributes<HTMLSelectElement>) => <select {...props}/>
export function DateTimeField({label,...props}:import('react').InputHTMLAttributes<HTMLInputElement>&{label:string}){return <label>{label}{copy.mst_grand_canyon_local}<Input {...props} type="datetime-local"/></label>}
export function SegmentedControl({options,value,onChange}:{options:{value:string;label:string}[];value:string;onChange:(value:string)=>void}){return <div className="segmented">{options.map(x=><Button key={x.value} aria-pressed={x.value===value} onClick={()=>onChange(x.value)}>{x.label}</Button>)}</div>}
export function Chip({children,pressed,onClick}:{children:ReactNode;pressed?:boolean;onClick?:()=>void}){return onClick?<Button className="chip" aria-pressed={pressed} onClick={onClick}>{children}</Button>:<span className="tag">{children}</span>}
export const FilterChip=Chip
export function StatCard({label,value,total,onClick,pressed}:{label:string;value:number;total:number;onClick:()=>void;pressed:boolean}){return <button type="button" className="stat-card" aria-pressed={pressed} onClick={onClick}><span className="summary-count">{value}</span><span>{label}</span><progress value={value} max={total||1}/></button>}
export function Tooltip({label,children}:{label:string;children:ReactNode}){return <span title={label}>{children}</span>}
export function Timeline({children}:{children:ReactNode}){return <ol className="timeline">{children}</ol>}
export function MapLegend(){return <div className="map-legend" aria-label={copy.map_legend}><strong>{copy.map_legend_simulation}</strong><span><Icon name="shield" size={14}/>{copy.incident_area}</span><span className="legend-shelter"><Icon name="pin" size={14}/>{copy.s_shelter}</span><span className="legend-water"><Icon name="pin" size={14}/>{copy.w_water}</span><span className="legend-first-aid"><Icon name="lifebuoy" size={14}/>{copy.first_aid}</span></div>}
export function AccountMenu({name,email,role,onSignOut}:{name:string;email:string;role:string;onSignOut:()=>void}){return <details className="account-menu"><summary title={copy.account_menu}><Avatar name={name}/><span className="account-name">{name}</span><span className="sr-only">{copy.account_menu}</span></summary><div className="panel"><strong>{name}</strong><span>{email}</span><span>{role}</span><a href="#/account">{copy.my_account}</a><a href="#/account">{copy.notifications}</a><a href="#/help">{copy.help}</a><Button variant="danger" onClick={onSignOut}>{copy.sign_out}</Button></div></details>}

export { StatusBadge as StatusPill } from './ui'
