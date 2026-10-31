import { copy, messages } from '../copy'
import { useConnections } from '../lib/operations'
import { useAccount } from '../SignIn'
import { Icon, Skeleton, toast } from '../components'
import GeneralUpdateNotices from './GeneralUpdateNotices'
import Itineraries from './Itineraries'
import Itinerary from './Itinerary'
import { useState } from 'react'
import { type CheckInRequest, type ConfirmedItinerary, type CheckInStatus, submitCheckIn, useMyCheckIns, useMyItineraries } from '../lib/checkIns'
import { RESOURCE_KIND_LABEL } from '../../supabase/functions/_shared/resources'
import { CheckInButtons, ResourceSource, SimulationLabel, SourceLine, StatusBadge, formatTime, statusClass } from '../ui'

export default function Traveler() {
  const account = useAccount()
  const connections=useConnections()
  const { data, error } = useMyCheckIns()
  const itineraries = useMyItineraries()
  // The Itinerary being corrected; `form` changes to start the form afresh on Correct or Cancel.
  const [correcting, setCorrecting] = useState<ConfirmedItinerary | null>(null)
  const [form, setForm] = useState(0)
  const restart = (itinerary: ConfirmedItinerary | null) => { setCorrecting(itinerary); setForm(f => f + 1) }
  return (
    <div className="column">
      <header className="view-header">
        <h1>{copy.hi}{account.capabilities?.name.split(' ')[0] || copy.there}</h1><p className="lede">{data?.some(r=>r.reports[0]?.status==='needs_assistance') ? copy.help_has_been_requested_a_coordinator_will_2 : data?.some(r=>!r.reports.length || r.requestedAt && r.reports[0].at<r.requestedAt) ? copy.coordinators_need_your_checkin : data?.[0]?.reports[0]?.status==='safe' ? messages.youre_safe_as_of(formatTime(data[0].reports[0].at)) : copy.add_your_plans_to_receive_checkin_requests}</p><a href="#/contact">{copy.you_also_have_an_emergency_contact_page}</a>
      </header>
      <GeneralUpdateNotices />
      {error && <p role="alert">{error}</p>}
      {!data ? (
        !error && <p className="empty">{copy.loading_2}</p>
      ) : data.length === 0 ? (
        <p className="empty">{copy.no_checkin_requests_together_asks_here_if}</p>
      ) : (
        data.map(request => <Request key={request.caseId} request={request} />)
      )}
      <section className="panel"><h2>{copy.who_can_see_my_status}</h2><p>{connections.data?.[0]?.contacts.map(c=>c.name).join(', ') || copy.no_emergency_contacts_added_yet}</p><p className="lede">{copy.emergency_contacts_see_your_status_and_outcomes}</p><a href="#/account">{copy.manage_emergency_contacts}</a></section>
      <Itinerary key={form} correcting={correcting} onCancel={() => restart(null)}
        onConfirmed={() => { setCorrecting(null); itineraries.reload() }} onAlreadyCorrected={itineraries.reload} />
      <Itineraries data={itineraries.data} error={itineraries.error} onCorrect={restart} onChange={itineraries.reload} />
    </div>
  )
}

function Request({ request }: { request: CheckInRequest }) {
  const [changing, setChanging] = useState(false)
  const [answer, setAnswer] = useState<CheckInStatus | null>(null)
  const latest = request.reports[0]
  const answered = answer || latest && (!request.requestedAt || Date.parse(latest.at) >= Date.parse(request.requestedAt)) && latest.status
  const [asking, setAsking] = useState(false)
  const [description, setDescription] = useState('')
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState<{ text: string; failed?: boolean }>()

  async function send(status: CheckInStatus) {
    if (sending) return // A double tap would store two Check-ins.
    const previous=answer
    setAnswer(status);setChanging(false)
    setSending(true)
    setMessage(undefined)
    try {
      await (status === 'safe' ? submitCheckIn(request.caseId, status) : submitCheckIn(request.caseId, status, description.trim()))
      // A Safe tap leaves any description in place, so nothing typed is lost.
      if (status === 'needs_assistance') {
        setAsking(false)
        setDescription('')
      }
      setMessage({ text: copy.checkin_sent }); setAnswer(status); setChanging(false); toast(copy.checkin_sent_2)
    } catch (e) {
      setAnswer(previous);setChanging(true);toast(copy.could_not_send_checkin_please_retry)
      // Keep the description so nothing they typed is lost; they can send again.
      setMessage({ text: copy.could_not_send_your_checkin_retry_when, failed: true })
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <section className="panel panel-request" aria-label={copy.checkin_request} aria-busy={sending}>
        <h2>{answered && !changing ? messages.you_checked_in(answered === 'safe' ? 'Safe' : 'Needs assistance') : copy.checkin_request}</h2>
        {answered && !changing && <><SourceLine source={copy.checked_in} at={latest?.at ?? new Date().toISOString()} />{answered === 'needs_assistance' && <><p>{copy.help_has_been_requested_a_coordinator_will}</p><button type="button" className="link-button" disabled={sending} onClick={()=>void send('safe')}>{copy.change_to_safe}</button></>}<button type="button" className="link-button" onClick={() => setChanging(true)}>{copy.change_answer}</button></>}
        <p>{request.incident}{copy.coordinators_are_asking_whether_youre_safe_choose}</p>
        {answered !== 'safe' && <div className="resource-mini"><Icon name={request.nearestResource.kind==='first_aid'?'lifebuoy':'pin'}/><div><p>{copy.nearest_resource}<strong>{request.nearestResource.name}</strong></p><p className="lede">{RESOURCE_KIND_LABEL[request.nearestResource.kind]}{request.resourceDistanceKm!==undefined && ` · ${new Intl.NumberFormat(undefined,{maximumFractionDigits:1}).format(request.resourceDistanceKm)} km in a straight line`}{copy.text_5}{request.nearestResource.availability}</p><SimulationLabel/><ResourceSource resource={request.nearestResource}/></div></div>}
        {(!answered || changing) && <CheckInButtons disabled={sending} onCheckIn={status => (status === 'safe' ? send('safe') : setAsking(true))} />}
        {asking && (
          <form className="describe" onSubmit={e => { e.preventDefault(); send('needs_assistance') }}>
            <label htmlFor={`describe-${request.caseId}`}>{copy.what_do_you_need_and_how_urgent}</label>
            <textarea id={`describe-${request.caseId}`} rows={3} value={description} autoFocus
              onChange={e => setDescription(e.target.value)} />
            <button type="submit" className="button" disabled={sending || !description.trim()}>{copy.send}</button>
          </form>
        )}
        {message && <p role={message.failed ? 'alert' : 'status'}>{message.text}</p>}
      </section>
      <section className="panel">
        <h2>{copy.your_checkins}</h2>
        {request.reports.length === 0 ? (
          <p className="empty">{copy.you_havent_checked_in_yet}</p>
        ) : (
          <ul className="rows" aria-label={copy.your_checkins}>
            {request.reports.map(report => (
              <li className={`row ${statusClass(report.status)}`} key={report.id}>
                <div className="row-main"><StatusBadge status={report.status} /></div>
                {report.description && <p>{report.description}</p>}
                <SourceLine source={copy.sent} at={report.at} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
