import { useGeneralUpdates, useIncidents, type PublicIncident as Incident } from '../lib/checkIns'
import { useState } from 'react'
import { divIcon, type LatLngTuple } from 'leaflet'
import { MapContainer, Marker, Polygon, Tooltip } from 'react-leaflet'
import { RESOURCE_KIND, resources } from '../../supabase/functions/_shared/resources'
import MapTiles from '../MapTiles'
import { SourceLine, formatTime } from '../ui'

export default function PublicIncident() {
  const { data, error } = useIncidents()
  const [selected, setSelected] = useState<string>()
  const incident = data?.find(item => item.id === selected) ?? data?.[0]
  return (
    <div className="incident incident-browser">
      <header className="view-header">
        <h1>{incident?.name ?? 'Incident'}</h1>
        {incident && <SourceLine source="Verified by a Coordinator" at={incident.created_at} />}
        {error && <p role="alert">Could not load Incidents. Try refreshing the page.</p>}
        {!data && !error && <p>Loading Incidents…</p>}
        {data && !incident && <p>No verified Incident yet.</p>}
      </header>
      <section className="panel incident-picker" aria-label="Choose an Incident">
        <h2>Incidents</h2>
        <p className="lede">Choose an Incident to see its area and time window.</p>
        <ul className="rows">
          {data?.map(item => <li key={item.id}>
            <button type="button" className="incident-option" aria-pressed={item.id === incident?.id} onClick={() => setSelected(item.id)}>
              <strong>{item.name}</strong>
              <span>{formatTime(item.starts_at)}</span>
              <span>{item.ends_at ? 'Ended' : 'Ongoing'}</span>
            </button>
          </li>)}
        </ul>
      </section>
      <IncidentMap key={incident?.id ?? 'empty'} incident={incident} />
      {incident && <section className="panel incident-window" aria-label="Incident time window">
        <h2>Incident time window</h2>
        <dl className="review-facts">
          <div><dt>Start</dt><dd><time dateTime={incident.starts_at}>{formatTime(incident.starts_at)}</time></dd></div>
          <div><dt>End</dt><dd>{incident.ends_at ? <time dateTime={incident.ends_at}>{formatTime(incident.ends_at)}</time> : 'Ongoing'}</dd></div>
        </dl>
        <p className="lede">The shaded area is copied from the weather warning.</p>
      </section>}
      {incident && <GeneralUpdates incidentId={incident.id} />}
      <ResourceList />
    </div>
  )
}

function IncidentMap({ incident }: { incident?: Incident }) {
  const [tilesFailed, setTilesFailed] = useState(false)
  const rings = incident?.area.coordinates.map(ring => ring.map(([lng, lat]): LatLngTuple => [lat, lng]))
  return <section className="incident-map" aria-label={incident ? `Area for ${incident.name}` : 'Incident map'}>
    {tilesFailed && <div className="tile-error" role="status">
      <p>The map couldn't load. Try refreshing the page. The Incident time window and Resources are listed below.</p>
    </div>}
    <MapContainer className="map" bounds={rings?.[0]} boundsOptions={{ padding: [24, 24] }} center={rings ? undefined : [36.1, -112.1]} zoom={10}>
      <MapTiles onError={() => setTilesFailed(true)} />
      {rings && <Polygon positions={rings} pathOptions={{ color: 'var(--color-info-fg)', fillOpacity: 0.18 }} />}
      {resources.map(r => <Marker key={r.name} position={[r.at[1], r.at[0]]} icon={resourceIcon} title={`${RESOURCE_KIND[r.kind]}: ${r.name} (simulated)`}>
        <Tooltip>{RESOURCE_KIND[r.kind]}: {r.name} (simulated)</Tooltip>
      </Marker>)}
    </MapContainer>
  </section>
}

const resourceIcon = divIcon({ className: 'resource-marker', iconSize: [16, 16] })

// The same Resources the map marks, as a list: for screen readers and for when map tiles fail.
function ResourceList() {
  return <section className="panel resources" aria-labelledby="resources-heading">
    <h2 id="resources-heading">Resources</h2>
    <p className="lede">Help available nearby. Check with staff before relying on it: nearby doesn't mean safe.</p>
    <ul className="rows" aria-label="Resources">
      {resources.map(r => <li className="row" key={r.name}>
        <div className="row-main"><h3 className="row-name">{r.name}</h3><span className="tag">{RESOURCE_KIND[r.kind]}</span><span className="simulation">Simulated</span></div>
        <p>{r.availability}</p>
        <SourceLine source={`${r.source}, last updated`} at={r.updatedAt} />
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
        {data.map(u => <li className="row" key={u.id}><p>{u.body}</p><SourceLine source="Posted by a Coordinator" at={u.created_at} /></li>)}
      </ul>
    )}
  </section>
}
