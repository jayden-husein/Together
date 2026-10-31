import { TileLayer } from 'react-leaflet'

export default function MapTiles({ onError }: { onError: () => void }) {
  return <TileLayer
    url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    eventHandlers={{ tileerror: onError }}
  />
}
