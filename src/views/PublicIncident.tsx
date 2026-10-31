import { useState } from 'react'
import type { LatLngTuple } from 'leaflet'
import { MapContainer } from 'react-leaflet'
import MapTiles from '../MapTiles'
import { SourceLine } from '../ui'

const GRAND_CANYON: LatLngTuple = [36.1, -112.1]

export default function PublicIncident() {
  const [tilesFailed, setTilesFailed] = useState(false)

  return (
    <div className="incident">
      <header className="view-header">
        <h1>Flash flood at Phantom Ranch</h1>
        <SourceLine source="Verified by a Coordinator" at="2026-10-31T13:40:00Z" />
      </header>
      <div className="incident-map">
        {tilesFailed && (
          <section className="tile-error" role="status">
            <p>The map couldn't load. A list of the incident's places will appear here.</p>
          </section>
        )}
        <MapContainer className="map" center={GRAND_CANYON} zoom={10}>
          <MapTiles onError={() => setTilesFailed(true)} />
        </MapContainer>
      </div>
      <div className="incident-side">
        <section className="panel">
          <h2>General Updates</h2>
          <p className="empty">No General Updates yet. Coordinators post them here as the incident develops.</p>
        </section>
        <section className="panel">
          <h2>Resources</h2>
          <p className="empty">No Resources listed yet. Shelters, water and first aid will appear here with their source.</p>
        </section>
      </div>
    </div>
  )
}
