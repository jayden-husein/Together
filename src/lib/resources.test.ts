import { expect, test } from 'vitest'
import { places } from '../../supabase/functions/_shared/itinerary'
import { nearestResource } from '../../supabase/functions/_shared/resources'

test('the nearest Resource to Phantom Ranch is the first-aid point across the creek', () => {
  expect(nearestResource(places['Phantom Ranch']).name).toBe('Tipoff first-aid point')
})

test('the nearest Resource to the rim is the shelter there', () => {
  expect(nearestResource(places['Bright Angel Trailhead']).name).toBe('Bright Angel Lodge shelter')
})
