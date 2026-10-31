import { expect, test } from 'vitest'
import { draftFlood, floodReadings } from '../../supabase/functions/_shared/flood'

const readings = floodReadings()
const quotes = [readings.gauge, readings.warning, readings.news].map(source => source.text)
test('a draft keeps the warning geometry and attributes each exact quote to its source', async () => {
  const draft = await draftFlood(readings, async () => ({ summary: 'Creek rising', quotes, area: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } }))
  expect(draft.area).toEqual(readings.warning.area)
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
  expect(draft.area).toEqual(readings.warning.area)
})
