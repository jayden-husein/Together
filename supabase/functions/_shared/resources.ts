// Resources during a Grand Canyon Incident: hard-coded, fictional and labeled simulated. Coordinates are GeoJSON longitude/latitude.
// None sits inside the demo flood area: a Resource says what help is there, never that a place is safe.
export type Resource = {
  name: string; kind: 'shelter' | 'water' | 'first_aid'; at: readonly [number, number]
  availability: string; source: string; updatedAt: string
}

// Simulated last updates: minutes before the app loaded, like the flood fixture's readings.
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

export const resources: Resource[] = [
  { name: 'Bright Angel Lodge shelter', kind: 'shelter', at: [-112.1405, 36.0571], availability: 'Open, room for 80 people',
    source: 'Simulated park operations feed', updatedAt: ago(20) },
  { name: 'Havasupai Gardens water station', kind: 'water', at: [-112.126, 36.079], availability: 'Drinking water, refilled hourly',
    source: 'Simulated park operations feed', updatedAt: ago(35) },
  { name: 'Tipoff first-aid point', kind: 'first_aid', at: [-112.0839, 36.092], availability: 'Ranger with first-aid kit, staffed until dark',
    source: 'Simulated ranger dispatch', updatedAt: ago(10) },
]

export const RESOURCE_KIND_LABEL: Record<Resource['kind'], string> = { shelter: 'Shelter', water: 'Water', first_aid: 'First aid' }

// Straight-line distance in km. ponytail: flat-earth approximation, fine across one park; use haversine for wider areas.
const distanceKm = ([lng1, lat1]: readonly number[], [lng2, lat2]: readonly number[]) =>
  Math.hypot((lng2 - lng1) * 111.32 * Math.cos((lat1 * Math.PI) / 180), (lat2 - lat1) * 110.57)

export const nearestResource = (point: readonly number[]) =>
  resources.reduce((best, r) => (distanceKm(point, r.at) < distanceKm(point, best.at) ? r : best))
