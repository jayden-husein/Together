import { useGeneralUpdates, useIncidents, useCoordinatorIncidentCases, resolveIncident, type QueueCase, type PublicIncident as Incident } from '../lib/checkIns'
import { useAccount } from '../SignIn'
import { Button, Icon, MapLegend, toast } from '../components'
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
        {!account.session && <p className="public-signin-banner"><a href="#/signin">Sign in to check in or manage cases</a></p>}
        <h1>{incident?.name ?? 'Incident'}</h1>
        <div className="actions"><Button onClick={()=>{reload();toast('Incidents refreshed')}}>Refresh</Button><Button onClick={async()=>{try{await navigator.clipboard.writeText(window.location.origin+'/#/');toast('Link copied')}catch{toast('Could not copy. Copy the address from your browser.')}}}>Share</Button><Button onClick={()=>window.print()}>Print General Updates</Button></div>
        <p className="lede">Last updated {new Intl.DateTimeFormat(undefined,{timeStyle:'short'}).format(new Date())}</p>
        {incident && <div className="hero-status"><span className="tag">{incident.resolved_at?'Resolved':'Ongoing'}</span><Icon name="check"/><span>Started {formatTime(incident.starts_at)}</span></div>}
        {incident && <SourceLine source="Verified by a Coordinator" at={incident.created_at} />}
        {error && <p role="alert">Could not load Incidents. Try refreshing the page.</p>}
        {!data && !error && <p>Loading Incidents…</p>}
        {data && !incident && <p>{data.length ? 'No active Incidents. Show resolved Incidents to view history.' : 'No verified Incident yet.'}</p>}
      </header>
      <section className="panel incident-picker" aria-label="Choose an Incident">
        <h2>Incidents</h2>
        <p className="lede">Choose an Incident to see its area and time window.</p>
        <label><input type="checkbox" checked={showResolved} onChange={e => setShowResolved(e.target.checked)} /> Show resolved Incidents</label>
        <ul className="rows">
          {visible?.map(item => <li key={item.id}>
            <button type="button" className="incident-option" aria-pressed={item.id === incident?.id} onClick={() => setSelected(item.id)}>
              <strong>{item.name}</strong>
              <span>{formatTime(item.starts_at)}</span>
              <span>{item.resolved_at ? 'Resolved' : item.ends_at ? 'Time window set' : 'Ongoing'}</span>
            </button>
          </li>)}
        </ul>
      </section>
      <IncidentMap key={'map-' + (incident?.id ?? 'empty')} incident={incident} />
      {incident && <section className="panel incident-window" aria-label="Incident time window">
        <h2>Incident time window</h2>
        {incident.resolved_at && <p>Resolved {formatTime(incident.resolved_at)}</p>}
        <dl className="review-facts">
          <div><dt>Start</dt><dd><time dateTime={incident.starts_at}>{formatTime(incident.starts_at)}</time></dd></div>
          <div><dt>End</dt><dd>{incident.ends_at ? <time dateTime={incident.ends_at}>{formatTime(incident.ends_at)}</time> : incident.resolved_at ? 'No end time recorded' : 'Ongoing'}</dd></div>
        </dl>
        <p className="lede">The shaded area is copied from the weather warning.</p>
      </section>}
      {incident && <GeneralUpdates incidentId={incident.id} />}
      {incident && <ResourceList />}
      {incident && management.data?.[0] && <IncidentManagement key={'management-' + incident.id} incident={incident}
        cases={management.data[0].cases.filter(c => c.incidentId === incident.id)}
        onChange={() => { reload(); management.reload() }} />}
      <aside className="callout info emergency-reminder">In a real emergency, call 911. Local authority: {import.meta.env.VITE_LOCAL_AUTHORITY_PHONE || 'Contact number not configured'}.</aside>
      {management.error && <p role="alert">Could not load Coordinator Case statistics. Try refreshing the page.</p>}
    </div>
  )
}

function IncidentMap({ incident }: { incident?: Incident }) {
  const [tilesFailed, setTilesFailed] = useState(false)
  const rings = incident?.area.coordinates.map(ring => ring.map(latLng))
  return <section className="incident-map" aria-label={incident ? `Area for ${incident.name}` : 'Incident map'}>
    {tilesFailed && <div className="tile-error" role="status">
      <p>The map couldn't load. Try refreshing the page. The Incident time window and Resources are listed below.</p>
    </div>}
    <div className="map-frame"><MapContainer scrollWheelZoom={false} zoomControl={false} className="map" bounds={rings ? [...rings[0], ...resources.map(r=>latLng(r.at))] : undefined} boundsOptions={{ padding: [24, 24] }} center={rings ? undefined : [36.1, -112.1]} zoom={10}>
      <MapTiles onError={() => setTilesFailed(true)} />
      {rings && <Polygon positions={rings} pathOptions={{ color: 'var(--accent)', fillOpacity: 0.2, dashArray:'6 6', weight:2 }} />}
      {/* Hover text only: the Resource list below says the same, with source and time. */}
      {incident && resources.map(r => <Marker key={r.name} position={latLng(r.at)} icon={resourceIcon(r.kind)} title={`${RESOURCE_KIND_LABEL[r.kind]}: ${r.name}`}>
        <Tooltip>{RESOURCE_KIND_LABEL[r.kind]}: {r.name}</Tooltip><Popup>{r.name}<br/>{r.availability}<br/>Simulation</Popup>
      </Marker>)}
      <MapInteraction rings={rings}/><ZoomControl position="bottomright"/>
    </MapContainer><div className="map-hint">Ctrl / ⌘ + scroll to zoom</div><MapLegend/></div>
  </section>
}

// GeoJSON is longitude first; Leaflet wants latitude first.
const latLng = ([lng, lat]: readonly number[]): LatLngTuple => [lat, lng]
const resourceIcon = (kind:string) => divIcon({ className: `resource-marker ${kind}`, html:`<span>${kind==='water'?'W':kind==='first_aid'?'+':'S'}</span>`, iconSize:[28,28], iconAnchor:[14,28] })

// The same Resources the map marks, as a list: for screen readers and for when map tiles fail.
function ResourceList() {
  return <section className="panel resources" aria-labelledby="resources-heading">
    <h2 id="resources-heading">Resources</h2>
    <p className="lede">Help available nearby. Check with staff before relying on it: nearby doesn't mean safe.</p>
    <ul className="rows" aria-label="Resources">
      {resources.map(r => <li className="row" key={r.name}>
        <div className="row-main"><h3 className="row-name">{r.name}</h3><span className="tag">{RESOURCE_KIND_LABEL[r.kind]}</span><SimulationLabel /></div>
        <p>{r.availability}</p>
        <ResourceSource resource={r} />
      </li>)}
    </ul>
  </section>
}

function GeneralUpdates({ incidentId }: { incidentId: string }) {
  const { data, error } = useGeneralUpdates(incidentId)
  return <section className="panel general-updates" aria-labelledby="updates-heading">
    <h2 id="updates-heading">General Updates</h2>
    {error && <p role="alert">Could not load General Updates. Try refreshing the page.</p>}
    {!data ? !error && <p className="empty">Loading…</p> : data.length === 0 ? <p className="empty">No General Updates yet.</p> : (
      <ul className="rows" aria-label="General Updates">
        {data.map(u => <li className="row" key={u.id}><p>{u.retracted_at ? 'Retracted by a Coordinator' : u.body}</p><SourceLine source="Posted by a Coordinator" at={u.created_at} /></li>)}
      </ul>
    )}
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
    setError('')
    try {
      await resolveIncident(incident.id,reason,outcome)
      setConfirming(false)
      onChange()
    } catch { setError('Could not resolve the Incident. Try again.') }
    finally { setBusy(false) }
  }
  return <section className="panel incident-management" aria-label="Coordinator Incident controls">
    <h2>Cases for this Incident</h2>
    <p>{cases.length} total · {cases.filter(c => c.status !== 'resolved').length} unresolved</p>
    <ul className="summary" aria-label="Incident Case statistics">
      {statuses.map(status => <li key={status}><span className="summary-count">{cases.filter(c => c.status === status).length}</span><StatusBadge status={status} /></li>)}
    </ul>
    <a href="#/coordinator">Open Case queue</a>
    {!incident.resolved_at && (confirming ? <div className="incident-resolution">
      <h3>Resolve {incident.name}?</h3>
      <p>{cases.filter(c => c.status !== 'resolved').length} unresolved cases will be closed. Stops new matching and moves this Incident and its Cases to history. {cases.filter(c => c.status !== 'resolved').length} Cases still have no resolution. Review them before continuing.</p>
<label>Reason<textarea required value={reason} onChange={e=>setReason(e.target.value)}/></label><label>Outcome for unresolved cases<select value={outcome} onChange={e=>setOutcome(e.target.value as import('../ui').Outcome)}><option value="assistance_provided">Assistance provided</option><option value="reached">Reached</option><option value="not_in_area">Not in area</option></select></label>
      <div className="row-main">
        <button type="button" className="button danger" disabled={busy || !reason.trim()} onClick={resolve}>{busy ? 'Resolving…' : 'Confirm resolution'}</button>
        <button type="button" className="link-button" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
      </div>
    </div> : <button type="button" className="button" onClick={() => setConfirming(true)}>Resolve Incident</button>)}
    {error && <p role="alert">{error}</p>}
  </section>
}

function MapInteraction({rings}:{rings?:LatLngTuple[][]}){
 const map=useMap()
 useEffect(()=>{const element=map.getContainer();const wheel=(event:WheelEvent)=>{if(!event.ctrlKey&&!event.metaKey)return;event.preventDefault();map.setZoomAround(map.mouseEventToContainerPoint(event),map.getZoom()+(event.deltaY<0?1:-1))};element.addEventListener('wheel',wheel,{passive:false});return()=>element.removeEventListener('wheel',wheel)},[map])
 return <button type="button" className="button map-reset" onClick={()=>{if(rings?.[0])map.fitBounds([...rings[0],...resources.map(r=>latLng(r.at))]);else map.setView([36.1,-112.1],10)}}>Reset view</button>
}
