import { copy } from '../copy'
import { useState } from 'react'
import { CircleMarker, MapContainer, Tooltip } from 'react-leaflet'
import { places, type Place } from '../../supabase/functions/_shared/itinerary'
import MapTiles from '../MapTiles'

// Stops without a place yet are left off the map.
export default function StopsMap({ stops }: { stops: { place: string }[] }) {
  const [tilesFailed, setTilesFailed] = useState(false)
  const placed = stops.flatMap(s => s.place ? [s.place] : [])
  if (!placed.length) return null
  return <>
    <MapContainer scrollWheelZoom={false} className="itinerary-map" center={[36.082, -112.115]} zoom={11}>
      <MapTiles onError={() => setTilesFailed(true)} />
      {placed.map((place, i) => {
        const [lng, lat] = places[place as Place]
        return <CircleMarker key={i} center={[lat, lng]} radius={7}><Tooltip>{place}</Tooltip></CircleMarker>
      })}
    </MapContainer>
    {tilesFailed && <p role="status">{copy.map_tiles_could_not_load_review_your}</p>}
  </>
}
