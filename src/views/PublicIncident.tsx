import { useState } from 'react'
import type { LatLngTuple } from 'leaflet'
import { MapContainer, TileLayer } from 'react-leaflet'
import { SourceLine } from '../ui'

const GRAND_CANYON: LatLngTuple = [36.1, -112.1]

export default function PublicIncident() {
  const [tilesFailed, setTilesFailed] = useState(false)

  return (
    <div className="incident">
      <header className="view-header">
        <h1>Grand Canyon incident</h1>
        <SourceLine source="Verified by a Coordinator" at="2026-10-31T13:40:00Z" />
      </header>
      <div className="incident-map">
        {tilesFailed && (
          <section className="tile-error" role="status">
            <p>The map couldn't load. A list of the incident's places will appear here.</p>
          </section>
        )}
        <MapContainer className="map" center={GRAND_CANYON} zoom={10}>
          <TileLayer
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            eventHandlers={{ tileerror: () => setTilesFailed(true) }}
          />
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
