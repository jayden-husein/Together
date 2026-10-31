import { expect, it } from 'vitest'
import { isCurrent, type Stop } from '../../supabase/functions/_shared/itinerary'

const now = Date.parse('2026-10-31T13:00:00Z')
const stop = (start: string, end: string): Stop => ({ place: 'Phantom Ranch', start, end })

it('is current while a stop has not ended', () => {
  expect(isCurrent([stop('2026-10-31T12:00:00Z', '2026-10-31T14:00:00Z')], now)).toBe(true)
  expect(isCurrent([stop('2026-11-01T12:00:00Z', '2026-11-01T14:00:00Z')], now)).toBe(true)
})
it('is not current once every stop has ended', () => {
  expect(isCurrent([stop('2026-10-31T10:00:00Z', '2026-10-31T11:00:00Z'), stop('2026-10-31T11:00:00Z', '2026-10-31T13:00:00Z')], now)).toBe(false)
  expect(isCurrent([], now)).toBe(false)
})
