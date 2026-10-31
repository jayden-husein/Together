import { useState } from 'react'
import type { LatLngTuple } from 'leaflet'
import { MapContainer, TileLayer } from 'react-leaflet'

const GRAND_CANYON: LatLngTuple = [36.1, -112.1]

export default function App() {
  const [tilesFailed, setTilesFailed] = useState(false)

  return (
    <main className="page">
      <header>
        <h1>Grand Canyon incident</h1>
        <span className="simulation">Simulation</span>
      </header>
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
    </main>
  )
}
