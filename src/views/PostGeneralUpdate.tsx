import { type FormEvent, useState } from 'react'
import { draftGeneralUpdate, postGeneralUpdate, useIncidents } from '../lib/checkIns'

const maxLength = 1000

// A Coordinator writes a General Update, optionally starting from an AI draft. The draft only fills the text box:
// nothing is posted until the Coordinator presses Post.
export default function PostGeneralUpdate() {
  const { data } = useIncidents()
  const [chosen, setChosen] = useState<string>()
  const incident = data?.find(i => i.id === chosen) ?? data?.[0]
  const [text, setText] = useState('')
  const [busy, setBusy] = useState<'drafting' | 'posting'>()
  const [message, setMessage] = useState<{ text: string; failed?: boolean }>()
  if (!incident) return null

  async function run(kind: 'drafting' | 'posting', work: () => Promise<void>, failure: string) {
    if (busy) return // A double tap would post twice.
    setBusy(kind)
    setMessage(undefined)
    try { await work() } catch (e) {
      // Keep the text so nothing written is lost.
      setMessage({ text: `${failure}: ${e instanceof Error ? e.message : 'try again'}.`, failed: true })
    } finally { setBusy(undefined) }
  }
  const draft = () => run('drafting', async () => {
    setText((await draftGeneralUpdate(incident.id)).slice(0, maxLength))
    setMessage({ text: 'AI draft ready. Check it and edit before posting.' })
  }, "Couldn't draft one; write it yourself")
  const post = (e: FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    void run('posting', async () => {
      await postGeneralUpdate(incident.id, text.trim())
      setText('')
      setMessage({ text: 'Posted to the public incident page.' })
    }, "Couldn't post")
  }

  return (
    <section className="panel" aria-labelledby="post-update-heading">
      <h2 id="post-update-heading">Post a General Update</h2>
      <p className="lede">Anyone can read it without logging in. Never include anything private about a person.</p>
      <form className="case-action" onSubmit={post}>
        <fieldset disabled={!!busy}>
          {data!.length > 1 && <>
            <label htmlFor="update-incident">Incident</label>
            <select id="update-incident" value={incident.id} onChange={e => setChosen(e.target.value)}>
              {data!.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </>}
          <label htmlFor="update-text">General Update for {incident.name}</label>
          <textarea id="update-text" rows={4} maxLength={maxLength} value={text} onChange={e => setText(e.target.value)} />
          <button type="button" className="button" onClick={draft}>{busy === 'drafting' ? 'Drafting…' : 'Draft with AI'}</button>
          <button type="submit" className="button" disabled={!text.trim()}>Post</button>
          {message && <p role={message.failed ? 'alert' : 'status'}>{message.text}</p>}
        </fieldset>
      </form>
    </section>
  )
}
