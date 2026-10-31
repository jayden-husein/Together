import { expect, test } from 'vitest'
import { assessReadings, draftFlood, fixturePacket, floodReadings } from '../../supabase/functions/_shared/flood'

const fixture = floodReadings(Date.parse('2026-10-01T14:00:00Z'))
const readings = [fixture.gauge, fixture.warning, fixture.news]
const quotes = readings.map(source => source.text)
const packet = fixturePacket(readings)!
test('a draft keeps the warning geometry and attributes each exact quote to its source', async () => {
  const draft = await draftFlood(packet, [], async () => ({ summary: 'Creek rising', quotes, area: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } }))
  expect(draft!.area).toEqual(fixture.warning.area)
  expect(draft!.sources.map(s => s.quote)).toEqual(quotes)
  expect(draft!.fallback).toBe(false)
})

test.each([
  async () => ({ summary: 'Flood', quotes: [...quotes].reverse() }),
  async () => ({ summary: 'Flood', quotes: ['', ...quotes.slice(1)] }),
  async () => ({ summary: 'Flood', quotes: quotes.slice(1) }),
  async () => { throw new Error('AI unavailable') },
])('unusable AI evidence produces a labeled pre-written draft', async summarize => {
  const draft = await draftFlood(packet, [], summarize)
  expect(draft!.fallback).toBe(true)
  expect(draft!.sources.map(s => s.quote)).toEqual(quotes)
  expect(draft!.area).toEqual(fixture.warning.area)
})

test('the feed takes only fixture readings, and needs one with its own geometry', () => {
  expect(fixturePacket([fixture.firstGauge])!.area).toEqual(fixture.firstGauge.area)
  expect(fixturePacket([{ ...fixture.gauge, text: 'The creek rose 9 metres.' }])).toBeNull()
  expect(fixturePacket([fixture.news])).toBeNull()
  expect(fixturePacket([])).toBeNull()
})

const gauge = fixture.firstGauge
const warning = fixture.warning
const dismissed = { id: 'first', sources: [gauge], dismissed_at: '2026-10-01T12:45:00Z', incident_id: null }

test('a new reading after a dismissal raises a new Potential incident carrying that dismissal', () => {
  expect(assessReadings([fixture.gauge], [dismissed])).toEqual({ raise: true, earlierDismissal: 'first', corroborated: false })
})

test('an exact duplicate delivery raises nothing', () => {
  expect(assessReadings([{ ...gauge }], [dismissed])).toEqual({ raise: false })
})

test('a gauge reading plus a weather warning is Corroborated; a single source is not', () => {
  expect(assessReadings([fixture.gauge, warning], [])).toEqual({ raise: true, earlierDismissal: null, corroborated: true })
  expect(assessReadings([warning], [])).toEqual({ raise: true, earlierDismissal: null, corroborated: false })
})

test('a dismissed reading backs nothing up', () => {
  expect(assessReadings([gauge, warning], [dismissed])).toEqual({ raise: true, earlierDismissal: 'first', corroborated: false })
})

test('a later verified Potential incident from the same source supersedes the dismissal', () => {
  const verified = { id: 'second', sources: [fixture.gauge], dismissed_at: null, incident_id: 'second' }
  const third = { ...fixture.gauge, text: fixture.firstGauge.text, at: '2026-10-01T13:50:00Z' }
  expect(assessReadings([third], [dismissed, verified])).toEqual({ raise: true, earlierDismissal: null, corroborated: false })
})

test('the drafted Potential incident carries the dismissal, Corroborated and its earliest reading time; a duplicate drafts nothing', async () => {
  const unused = async () => { throw new Error('no AI call for a duplicate') }
  expect(await draftFlood(fixturePacket([gauge])!, [dismissed], unused)).toBeNull()
  const draft = await draftFlood(packet, [dismissed], unused)
  expect(draft).toMatchObject({ earlier_dismissal_id: 'first', corroborated: true, starts_at: '2026-10-01T13:30:00.000Z' })
})
