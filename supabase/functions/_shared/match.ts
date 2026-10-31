import inside from '@turf/boolean-point-in-polygon'
import { places, type Stop } from './itinerary.ts'

type Incident = { id: string; starts_at: string; ends_at: string | null; area: { type: 'Polygon'; coordinates: number[][][] } }
type CaseKey = { personId: string; incidentId: string }

export function match(personId: string, stops: Stop[], incidents: Incident[], existing: CaseKey[] = []) {
  return incidents.flatMap(incident => {
    if (existing.some(c => c.personId === personId && c.incidentId === incident.id)) return []
    const stop = stops.find(s => Date.parse(s.end) >= Date.parse(incident.starts_at)
      && (!incident.ends_at || Date.parse(s.start) <= Date.parse(incident.ends_at))
      && inside([...places[s.place]], incident.area))
    return stop ? [{ personId, incidentId: incident.id, stop }] : []
  })
}
