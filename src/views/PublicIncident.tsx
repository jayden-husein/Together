import { copy, messages } from '../copy'
import { useGeneralUpdates, useIncidents, useCoordinatorIncidentCases, resolveIncident, type QueueCase, type PublicIncident as Incident } from '../lib/checkIns'
import { useAccount } from '../SignIn'
import { Button, Icon, MapLegend, Skeleton, toast } from '../components'
import { useEffect, useState } from 'react'
import { divIcon, type LatLngTuple } from 'leaflet'
import { MapContainer, Marker, Polygon, Tooltip, useMap, ZoomControl, Popup } from 'react-leaflet'
import { RESOURCE_KIND_LABEL, resources } from '../../supabase/functions/_shared/resources'
import MapTiles from '../MapTiles'
import { ResourceSource, SimulationLabel, SourceLine, StatusBadge, formatTime } from '../ui'

export default function PublicIncident() {
  const account=useAccount()
  const { data, error, reload } = useIncidents()
  const management = useCoordinatorIncidentCases()
  const [showResolved, setShowResolved] = useState(false)
  const visible = data?.filter(item => showResolved || !item.resolved_at)
  const [selected, setSelected] = useState<string>()
  const incident = visible?.find(item => item.id === selected) ?? visible?.[0]
  return (
    <div className="incident incident-browser">
      <header className="view-header">
        {!account.session && <p className="public-signin-banner"><a href="#/signin">{copy.sign_in_to_check_in_or_manage}</a></p>}
        <h1>{incident?.name ?? copy.incident}</h1>
        <div className="actions"><Button onClick={()=>{reload();toast(copy.incidents_refreshed)}}>{copy.refresh}</Button><Button onClick={async()=>{try{await navigator.clipboard.writeText(window.location.origin+'/#/');toast(copy.link_copied)}catch{toast(copy.could_not_copy_copy_the_address_from)}}}>{copy.share}</Button><Button onClick={()=>window.print()}>{copy.print_general_updates}</Button></div>
        <p className="lede">{copy.last_updated}{new Intl.DateTimeFormat(undefined,{timeStyle:'short'}).format(new Date())}</p>
        {incident && <div className="hero-status"><span className="tag">{incident.resolved_at?copy.resolved_2:copy.ongoing}</span><Icon name="check"/><span>{copy.started}{formatTime(incident.starts_at)}</span></div>}
        {incident && <SourceLine source={copy.verified_by_a_coordinator} at={incident.created_at} />}
        {error && <p role="alert">{copy.could_not_load_incidents_try_refreshing_the}</p>}
        {!data && !error && <p>{copy.loading_incidents}</p>}
        {data && !incident && <p>{data.length ? copy.no_active_incidents_show_resolved_incidents_to : copy.no_verified_incident_yet}</p>}
      </header>
      <div className="incident-content">
      <section className="panel incident-picker" aria-label={copy.choose_an_incident}>
        <h2>{copy.incidents}</h2>
        <p className="lede">{copy.choose_an_incident_to_see_its_area}</p>
        <label><input type="checkbox" checked={showResolved} onChange={e => setShowResolved(e.target.checked)} />{copy.show_resolved_incidents}</label>
        <ul className="rows">
          {visible?.map(item => <li key={item.id}>
            <button type="button" className="incident-option" aria-pressed={item.id === incident?.id} onClick={() => setSelected(item.id)}>
              <strong>{item.name}</strong>
              <span>{formatTime(item.starts_at)}</span>
              <span>{item.resolved_at ? copy.resolved_2 : item.ends_at ? copy.time_window_set : copy.ongoing}</span>
            </button>
          </li>)}
        </ul>
      </section>
      <IncidentMap key={'map-' + (incident?.id ?? 'empty')} incident={incident} />
      {incident && <section className="panel incident-window" aria-label={copy.incident_time_window}>
        <h2>{copy.incident_time_window}</h2>
        {incident.resolved_at && <p>{copy.resolved}{formatTime(incident.resolved_at)}</p>}
        <dl className="review-facts">
          <div><dt>{copy.start}</dt><dd><time dateTime={incident.starts_at}>{formatTime(incident.starts_at)}</time></dd></div>
          <div><dt>{copy.end}</dt><dd>{incident.ends_at ? <time dateTime={incident.ends_at}>{formatTime(incident.ends_at)}</time> : incident.resolved_at ? copy.no_end_time_recorded : copy.ongoing}</dd></div>
        </dl>
        <p className="lede">{copy.the_shaded_area_is_copied_from_the}</p>
      </section>}
      {incident && <GeneralUpdates incidentId={incident.id} />}
      {incident && <ResourceList />}
      </div>
      {incident && management.data?.[0] && <IncidentManagement key={'management-' + incident.id} incident={incident}
        cases={management.data[0].cases.filter(c => c.incidentId === incident.id)}
        onChange={() => { reload(); management.reload() }} />}
      <aside className="callout info emergency-reminder">{copy.in_a_real_emergency_call_911_local}{import.meta.env.VITE_LOCAL_AUTHORITY_PHONE || copy.contact_number_not_configured}{copy.text_6}</aside>
      {management.error && <p role="alert">{copy.could_not_load_coordinator_case_statistics_try}</p>}
    </div>
  )
}

function IncidentMap({ incident }: { incident?: Incident }) {
  const [tilesFailed, setTilesFailed] = useState(false)
  const rings = incident?.area.coordinates.map(ring => ring.map(latLng))
  return <section className="incident-map" aria-label={incident ? messages.area_for(incident.name) : copy.incident_map}>
    {tilesFailed && <div className="tile-error" role="status">
      <p>{copy.the_map_couldnt_load_try_refreshing_the}</p>
    </div>}
    <div className="map-frame"><MapContainer scrollWheelZoom={false} zoomControl={false} className="map" bounds={rings ? [...rings[0], ...resources.map(r=>latLng(r.at))] : undefined} boundsOptions={{ padding: [24, 24] }} center={rings ? undefined : [36.1, -112.1]} zoom={10}>
      <MapTiles onError={() => setTilesFailed(true)} />
      {rings && <Polygon positions={rings} pathOptions={{ color: 'var(--accent)', fillOpacity: 0.2, dashArray:'6 6', weight:2 }} />}
      {/* Hover text only: the Resource list below says the same, with source and time. */}
      {incident && resources.map(r => <Marker key={r.name} position={latLng(r.at)} icon={resourceIcon(r.kind)} title={messages.text_13(RESOURCE_KIND_LABEL[r.kind],r.name)}>
        <Tooltip>{RESOURCE_KIND_LABEL[r.kind]}{copy.text_4}{r.name}</Tooltip><Popup>{r.name}<br/>{r.availability}<br/>{copy.simulation_2}</Popup>
      </Marker>)}
      <MapInteraction rings={rings}/><ZoomControl position="bottomright"/>
    </MapContainer><div className="map-hint">{copy.ctrl_scroll_to_zoom}</div><MapLegend/></div>
  </section>
}

// GeoJSON is longitude first; Leaflet wants latitude first.
const latLng = ([lng, lat]: readonly number[]): LatLngTuple => [lat, lng]
const resourceIcon = (kind:string) => divIcon({ className: `resource-marker ${kind}`, html:`<span>${kind==='water'?'W':kind==='first_aid'?'+':'S'}</span>`, iconSize:[28,28], iconAnchor:[14,28] })

// The same Resources the map marks, as a list: for screen readers and for when map tiles fail.
function ResourceList() {
  return <section className="panel resources" aria-labelledby="resources-heading">
    <h2 id="resources-heading">{copy.resources}</h2>
    <p className="lede">{copy.help_available_nearby_check_with_staff_before}</p>
    <ul className="rows" aria-label={copy.resources}>
      {resources.map(r => <li className="row" key={r.name}>
        <div className="row-main"><h3 className="row-name">{r.name}</h3><span className="tag">{RESOURCE_KIND_LABEL[r.kind]}</span><SimulationLabel /></div>
        <p>{r.availability}</p>
        <ResourceSource resource={r} />
      </li>)}
    </ul>
  </section>
}

function GeneralUpdates({ incidentId }: { incidentId: string }) {
  const [limit,setLimit]=useState(25)
  const { data, error } = useGeneralUpdates(incidentId)
  return <section className="panel general-updates" aria-labelledby="updates-heading">
    <h2 id="updates-heading">{copy.general_updates_2}</h2>
    {error && <p role="alert">{copy.could_not_load_general_updates_try_refreshing}</p>}
    {!data ? !error && <p className="empty">{copy.loading_2}</p> : data.length === 0 ? <p className="empty">{copy.no_general_updates_yet}</p> : (
      <ul className="rows" aria-label={copy.general_updates_2}>
        {data.slice(0,limit).map(u => <li className="row" key={u.id}><p>{u.retracted_at ? copy.retracted_by_a_coordinator : u.body}</p><SourceLine source={copy.posted_by_a_coordinator} at={u.created_at} /></li>)}
      </ul>
    )}
    {data && <p className="lede">{copy.showing}{Math.min(limit,data.length)}{copy.of}{data.length}{copy.updates}</p>}{data && data.length>limit && <Button onClick={()=>setLimit(n=>n+25)}>{copy.load_more}</Button>}
  </section>
}

function IncidentManagement({ incident, cases, onChange }: { incident: Incident; cases: QueueCase[]; onChange: () => void }) {
  const [reason,setReason]=useState('')
  const [outcome,setOutcome]=useState<import('../ui').Outcome>('assistance_provided')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const statuses = ['needs_assistance', 'cant_reach', 'unconfirmed', 'safe', 'resolved'] as const
  async function resolve() {
    setBusy(true)
    setError(copy.text)
    try {
      await resolveIncident(incident.id,reason,outcome)
      setConfirming(false)
      onChange()
    } catch { setError(copy.could_not_resolve_the_incident_try_again) }
    finally { setBusy(false) }
  }
  return <section className="panel incident-management" aria-label={copy.coordinator_incident_controls}>
    <h2>{copy.cases_for_this_incident}</h2>
    <p>{cases.length}{copy.total}{cases.filter(c => c.status !== 'resolved').length}{copy.unresolved}</p>
    <ul className="summary" aria-label={copy.incident_case_statistics}>
      {statuses.map(status => <li key={status}><span className="summary-count">{cases.filter(c => c.status === status).length}</span><StatusBadge status={status} /></li>)}
    </ul>
    <a href="#/coordinator">{copy.open_case_queue}</a>
    {!incident.resolved_at && (confirming ? <div className="incident-resolution">
      <h3>{copy.resolve_2}{incident.name}{copy.text_2}</h3>
      <p>{cases.filter(c => c.status !== 'resolved').length}{copy.unresolved_cases_will_be_closed_stops_new}{cases.filter(c => c.status !== 'resolved').length}{copy.cases_still_have_no_resolution_review_them}</p>
<label>{copy.reason_2}<textarea required value={reason} onChange={e=>setReason(e.target.value)}/></label><label>{copy.outcome_for_unresolved_cases}<select value={outcome} onChange={e=>setOutcome(e.target.value as import('../ui').Outcome)}><option value="assistance_provided">{copy.assistance_provided}</option><option value="reached">{copy.reached}</option><option value="not_in_area">{copy.not_in_area}</option></select></label>
      <div className="row-main">
        <button type="button" className="button danger" disabled={busy || !reason.trim()} onClick={resolve}>{busy ? copy.resolving : copy.confirm_resolution}</button>
        <button type="button" className="link-button" disabled={busy} onClick={() => setConfirming(false)}>{copy.cancel}</button>
      </div>
    </div> : <button type="button" className="button" onClick={() => setConfirming(true)}>{copy.resolve_incident}</button>)}
    {error && <p role="alert">{error}</p>}
  </section>
}

function MapInteraction({rings}:{rings?:LatLngTuple[][]}){
 const map=useMap()
 useEffect(()=>{const element=map.getContainer();const wheel=(event:WheelEvent)=>{if(!event.ctrlKey&&!event.metaKey)return;event.preventDefault();map.setZoomAround(map.mouseEventToContainerPoint(event),map.getZoom()+(event.deltaY<0?1:-1))};element.addEventListener('wheel',wheel,{passive:false});return()=>element.removeEventListener('wheel',wheel)},[map])
 return <button type="button" className="button map-reset" onClick={()=>{if(rings?.[0])map.fitBounds([...rings[0],...resources.map(r=>latLng(r.at))]);else map.setView([36.1,-112.1],10)}}>{copy.reset_view}</button>
}
