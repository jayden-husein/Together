import { expect, test } from 'vitest'
import { assessReadings, draftFlood, floodReadings } from '../../supabase/functions/_shared/flood'

const fixture = floodReadings()
const readings = [fixture.gauge, fixture.warning, fixture.news]
const quotes = readings.map(source => source.text)
test('a draft keeps the warning geometry and attributes each exact quote to its source', async () => {
  const draft = await draftFlood(readings, async () => ({ summary: 'Creek rising', quotes, area: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } }))
  expect(draft.area).toEqual(fixture.warning.area)
  expect(draft.sources.map(s => s.quote)).toEqual(quotes)
  expect(draft.fallback).toBe(false)
})

test.each([
  async () => ({ summary: 'Flood', quotes: [...quotes].reverse() }),
  async () => ({ summary: 'Flood', quotes: ['', ...quotes.slice(1)] }),
  async () => ({ summary: 'Flood', quotes: quotes.slice(1) }),
  async () => { throw new Error('AI unavailable') },
])('unusable AI evidence produces a labeled pre-written draft', async summarize => {
  const draft = await draftFlood(readings, summarize)
  expect(draft.fallback).toBe(true)
  expect(draft.sources.map(s => s.quote)).toEqual(quotes)
  expect(draft.area).toEqual(fixture.warning.area)
})

const gauge = { kind: 'gauge', name: 'Bright Angel Creek stream gauge', text: 'The creek rose 0.4 metres in ten minutes.', at: '2026-11-01T12:00:00Z' } as const
const warning = { kind: 'warning', name: 'Weather service warning', text: 'Flash flooding is expected.', at: '2026-11-01T13:05:00Z' } as const
const dismissed = { id: 'first', sources: [gauge], dismissedAt: '2026-11-01T12:30:00Z' }

test('a new reading after a dismissal raises a new Potential incident carrying that dismissal', () => {
  const retrip = { ...gauge, text: 'The creek rose 1.2 metres in thirty minutes.', at: '2026-11-01T13:00:00Z' }
  expect(assessReadings([retrip], [dismissed])).toEqual({ raise: true, earlierDismissal: 'first', corroborated: false })
})

test('an exact duplicate delivery raises nothing', () => {
  expect(assessReadings([{ ...gauge }], [dismissed])).toEqual({ raise: false })
})

test('a gauge reading plus a weather warning is Corroborated; a single source is not', () => {
  expect(assessReadings([gauge, warning], [])).toEqual({ raise: true, earlierDismissal: null, corroborated: true })
  expect(assessReadings([warning], [])).toEqual({ raise: true, earlierDismissal: null, corroborated: false })
})
