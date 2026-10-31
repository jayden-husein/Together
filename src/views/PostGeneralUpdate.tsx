import { useRef, useState } from 'react'
import { maxUpdateLength } from '../../supabase/functions/_shared/aiOutputCheck'
import { draftGeneralUpdate, postGeneralUpdate, editGeneralUpdate, useGeneralUpdates, useIncidents, useQueue } from '../lib/checkIns'
import { useDraft } from '../lib/drafts'
import { Button, Callout, Dialog, toast } from '../components'
import { formatTime } from '../ui'
export default function PostGeneralUpdate() {
  const incidents=useIncidents()
  const data=incidents.data?.filter(i=>!i.resolved_at)
  const [chosen,setChosen]=useState('')
  const incident=data?.find(i=>i.id===chosen)??data?.[0]
  const recent=useGeneralUpdates(incident?.id)
  const cases=useQueue()
  const [text,setText]=useDraft('general-update')
  const [busy,setBusy]=useState<'drafting'|'posting'|'editing'>()
  const [error,setError]=useState('')
  const [preview,setPreview]=useState(false)
  const [editing,setEditing]=useState<string>()
  const requestId=useRef(crypto.randomUUID())
  const ready=!!incident && !!text.trim() && text.trim().length<=maxUpdateLength
  const privateDetails=/[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+?\d[\d ()-]{7,}\d)/i.test(text)||cases.data?.some(c=>new RegExp(`\\b${c.traveler.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`,'i').test(text))
  async function draft() {
    if(busy||!incident)return
    setBusy('drafting');setError('')
    try {setText(await draftGeneralUpdate(incident.id));toast('AI draft ready. Review before posting.')} catch {setError("Drafting isn't available right now. Write your update or retry.")} finally {setBusy(undefined)}
  }
  async function post() {
    if(!ready||busy)return
    setBusy('posting');setError('')
    try {
      if(editing)await editGeneralUpdate(editing,text.trim());else await postGeneralUpdate(incident!.id,text.trim(),requestId.current)
      setText('');setEditing(undefined);setPreview(false);requestId.current=crypto.randomUUID();recent.reload();toast('Update posted')
    } catch {setError('Could not post. Your text is saved. Please retry.')} finally {setBusy(undefined)}
  }
  return <section className="panel" aria-labelledby="post-update-heading"><h2 id="post-update-heading">Post a General Update</h2>
    <p className="lede">Anyone can read it without logging in. Never include anything private about a person.</p>
    <form onSubmit={e=>{e.preventDefault();if(ready)setPreview(true)}} className="case-action"><fieldset disabled={!!busy}>
      <label htmlFor="update-incident">Incident</label><select id="update-incident" value={incident?.id??''} onChange={e=>setChosen(e.target.value)}><option value="" disabled>Select an incident</option>{data?.map(i=><option value={i.id} key={i.id}>{i.name}</option>)}</select>
      <label htmlFor="update-template">Quick template</label><select id="update-template" defaultValue="" onChange={e=>{if(e.target.value)setText(e.target.value)}}><option value="">Choose a template</option><option value="Shelter open: check with staff for current availability. Simulation.">Shelter open</option><option value="Road closed: follow posted closures and local authority guidance.">Road closed</option><option value="All clear: check with local authorities before resuming your trip.">All clear</option></select>
      <label htmlFor="update-text">General Update for {incident?.name??'an incident'}</label><textarea id="update-text" rows={5} value={text} onChange={e=>setText(e.target.value)} aria-describedby="update-counter"/>
      <p id="update-counter" className={text.length>500?'field-error':'lede'}>{text.length} / 500 characters{!text.trim()?' · Write an update before posting.':text.length>500?' · Shorten your update before posting.':''}</p>
      {privateDetails&&<Callout tone="warn">This looks like it includes private details.</Callout>}
      <div className="actions"><Button type="submit" variant="primary" disabled={!ready}>Preview update</Button><Button type="button" busy={busy==='drafting'} disabled={!incident} onClick={draft}>Draft with AI</Button></div>
    </fieldset></form>
    {error&&<div role="alert"><p>{error}</p><Button onClick={error.startsWith('Drafting')?draft:()=>setPreview(true)}>Retry</Button></div>}
    {preview&&<Dialog title={editing?'Preview edit':'Post publicly?'} onClose={()=>setPreview(false)}><p>This will be public to everyone, including people who aren't signed in.</p><h3>{incident?.name}</h3><blockquote className="update-preview">{text.trim()}</blockquote>{privateDetails&&<Callout tone="warn">This looks like it includes private details.</Callout>}<div className="actions"><Button variant="primary" busy={busy==='posting'} onClick={post}>Post publicly</Button><Button onClick={()=>setPreview(false)}>Edit</Button></div>{error&&<p role="alert">{error}</p>}</Dialog>}
    <h3>Recent updates</h3><ul className="rows">{recent.data?.slice(0,25).map(u=><li className="row" key={u.id}><p>{u.retracted_at?'Retracted by a Coordinator':u.body}</p><time dateTime={u.created_at}>{formatTime(u.created_at)}</time>{!u.retracted_at&&<div className="actions"><Button disabled={Date.now()-Date.parse(u.created_at)>600000} onClick={()=>{setEditing(u.id);setText(u.body)}}>Edit</Button><Button disabled={!!busy} onClick={async()=>{if(!window.confirm('Retract this public update?'))return;setBusy('editing');try{await editGeneralUpdate(u.id,null,true);recent.reload();toast('Update retracted')}catch{setError('Could not retract. Please retry.')}finally{setBusy(undefined)}}}>Retract</Button></div>}</li>)}</ul>
  </section>
}
