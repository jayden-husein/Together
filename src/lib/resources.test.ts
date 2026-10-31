import { expect, test } from 'vitest'
import { floodReadings } from '../../supabase/functions/_shared/flood'
import { places, type Stop } from '../../supabase/functions/_shared/itinerary'
import { nearestResource, nearestResourceFor } from '../../supabase/functions/_shared/resources'

test('the nearest Resource to Phantom Ranch is the first-aid point across the creek', () => {
  expect(nearestResource(places['Phantom Ranch']).name).toBe('Tipoff first-aid point')
})

test('the nearest Resource to the rim is the shelter there', () => {
  expect(nearestResource(places['Bright Angel Trailhead']).name).toBe('Bright Angel Lodge shelter')
})

const flood = { id: 'flood', starts_at: '2026-10-31T13:00:00Z', ends_at: null, area: floodReadings().warning.area }
const stop = (place: Stop['place'], start: string, end: string): Stop => ({ place, start, end })

test("Maya's Check-in Request names the first-aid point nearest her Phantom Ranch stop, not her other stops", () => {
  const maya = [stop('Bright Angel Trailhead', '2026-10-31T08:00:00Z', '2026-10-31T09:00:00Z'), stop('Phantom Ranch', '2026-10-31T13:30:00Z', '2026-10-31T16:00:00Z')]
  expect(nearestResourceFor(flood, maya).name).toBe('Tipoff first-aid point')
})

test('with no stop in the Incident, the Resource nearest the Incident area is named', () => {
  // The area's corners, counted once, centre on Phantom Ranch.
  expect(nearestResourceFor(flood, []).name).toBe('Tipoff first-aid point')
  const rim = { ...flood, area: { type: 'Polygon' as const, coordinates: [[[-112.15, 36.05], [-112.13, 36.05], [-112.13, 36.06], [-112.15, 36.06], [-112.15, 36.05]]] } }
  expect(nearestResourceFor(rim, []).name).toBe('Bright Angel Lodge shelter')
})
