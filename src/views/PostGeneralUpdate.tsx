import { copy } from '../copy'
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
  const ready=!!incident && !!text.trim() && text.length<=maxUpdateLength
  const privateDetails=/[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+?\d[\d ()-]{7,}\d)/i.test(text)||cases.data?.some(c=>new RegExp(`\\b${c.traveler.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`,'i').test(text))
  async function draft() {
    if(busy||!incident)return
    setBusy('drafting');setError(copy.text)
    try {setText(await draftGeneralUpdate(incident.id));toast(copy.ai_draft_ready_review_before_posting)} catch {setError(copy.drafting_isnt_available_right_now_write_your)} finally {setBusy(undefined)}
  }
  async function post() {
    if(!ready||busy)return
    setBusy('posting');setError(copy.text)
    try {
      if(editing)await editGeneralUpdate(editing,text.trim());else await postGeneralUpdate(incident!.id,text.trim(),requestId.current)
      setText('');setEditing(undefined);setPreview(false);requestId.current=crypto.randomUUID();recent.reload();toast(copy.update_posted)
    } catch {setError(copy.could_not_post_your_text_is_saved)} finally {setBusy(undefined)}
  }
  return <section className="panel" aria-labelledby="post-update-heading"><h2 id="post-update-heading">{copy.post_a_general_update}</h2>
    <p className="lede">{copy.anyone_can_read_it_without_logging_in}</p>
    <form onSubmit={e=>{e.preventDefault();if(ready)setPreview(true)}} className="case-action"><fieldset disabled={!!busy}>
      <label htmlFor="update-incident">{copy.incident}</label><select id="update-incident" value={incident?.id??''} onChange={e=>setChosen(e.target.value)}><option value="" disabled>{copy.select_an_incident}</option>{data?.map(i=><option value={i.id} key={i.id}>{i.name}</option>)}</select>
      <label htmlFor="update-template">{copy.quick_template}</label><select id="update-template" defaultValue="" onChange={e=>{if(e.target.value)setText(e.target.value)}}><option value="">{copy.choose_a_template}</option><option value="Shelter open: check with staff for current availability. Simulation.">{copy.shelter_open}</option><option value="Road closed: follow posted closures and local authority guidance.">{copy.road_closed}</option><option value="All clear: check with local authorities before resuming your trip.">{copy.all_clear}</option></select>
      <label htmlFor="update-text">{copy.general_update_for}{incident?.name??copy.an_incident}</label><textarea id="update-text" rows={5} value={text} onChange={e=>setText(e.target.value)} aria-describedby="update-counter"/>
      <p id="update-counter" className={text.length>500?'field-error':'lede'}>{text.length}{copy["500_characters"]}{!text.trim()?copy.write_an_update_before_posting:text.length>500?copy.shorten_your_update_before_posting:''}</p>
      {privateDetails&&<Callout tone="warn">{copy.this_looks_like_it_includes_private_details}</Callout>}
      <div className="actions"><Button type="submit" variant="primary" disabled={!ready}>{copy.preview_update}</Button><Button type="button" busy={busy==='drafting'} disabled={!incident} onClick={draft}>{copy.draft_with_ai}</Button></div>
    </fieldset></form>
    {error&&<div role="alert"><p>{error}</p><Button onClick={error.startsWith('Drafting')?draft:()=>setPreview(true)}>{copy.retry}</Button></div>}
    {preview&&<Dialog title={editing?copy.preview_edit:copy.post_publicly_2} onClose={()=>setPreview(false)}><p>{copy.this_will_be_public_to_everyone_including}</p><h3>{incident?.name}</h3><blockquote className="update-preview">{text.trim()}</blockquote>{privateDetails&&<Callout tone="warn">{copy.this_looks_like_it_includes_private_details}</Callout>}<div className="actions"><Button variant="primary" busy={busy==='posting'} onClick={post}>{copy.post_publicly}</Button><Button onClick={()=>setPreview(false)}>{copy.edit}</Button></div>{error&&<p role="alert">{error}</p>}</Dialog>}
    <h3>{copy.recent_updates}</h3><ul className="rows">{recent.data?.slice(0,25).map(u=><li className="row" key={u.id}><p>{u.retracted_at?copy.retracted_by_a_coordinator:u.body}</p><time dateTime={u.created_at}>{formatTime(u.created_at)}</time>{!u.retracted_at&&<div className="actions"><Button disabled={Date.now()-Date.parse(u.created_at)>600000} onClick={()=>{setEditing(u.id);setText(u.body)}}>{copy.edit}</Button><Button disabled={!!busy} onClick={async()=>{if(!window.confirm(copy.retract_this_public_update))return;setBusy('editing');try{await editGeneralUpdate(u.id,null,true);recent.reload();toast(copy.update_retracted)}catch{setError(copy.could_not_retract_please_retry)}finally{setBusy(undefined)}}}>{copy.retract}</Button></div>}</li>)}</ul>
  </section>
}
