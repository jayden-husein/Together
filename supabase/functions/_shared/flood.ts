type Polygon = { type: 'Polygon'; coordinates: number[][][] }
export type Reading = { kind: 'gauge' | 'warning' | 'news'; name: string; text: string; at: string; area?: Polygon }

const gaugeName = 'Bright Angel Creek stream gauge'
const creek: Polygon = { type: 'Polygon', coordinates: [[[-112.098, 36.1], [-112.09, 36.1], [-112.09, 36.11], [-112.098, 36.11], [-112.098, 36.1]]] }

// Synthetic source readings supplied by the demo feed: a first gauge trip, then a second alongside the warning.
export function floodReadings(now = Date.now()) {
  const at = (minutesAgo: number) => new Date(now - minutesAgo * 60000).toISOString()
  return {
    firstGauge: { kind: 'gauge', name: gaugeName, text: 'The creek rose 0.4 metres in ten minutes.', at: at(90), area: creek },
    gauge: { kind: 'gauge', name: gaugeName, text: 'The creek rose 1.2 metres in thirty minutes.', at: at(30), area: creek },
    warning: { kind: 'warning', name: 'Weather service warning', text: 'Flash flooding is expected near Phantom Ranch and Black Bridge.', at: at(25),
      area: { type: 'Polygon', coordinates: [[[-112.1, 36.095], [-112.085, 36.095], [-112.085, 36.112], [-112.1, 36.112], [-112.1, 36.095]]] } },
    news: { kind: 'news', name: 'Canyon news desk', text: 'Hikers report water across the trail near Phantom Ranch.', at: at(20) },
  } satisfies Record<string, Reading>
}

// The feed accepts only the fixture readings; their time is whatever the delivery says, if it isn't in the future.
export function fixtureReading(packet: unknown): Reading | null {
  if (!packet || typeof packet !== 'object') return null
  const { kind, name, text, at, area } = packet as Record<string, unknown>
  const known = Object.values(floodReadings()).find(r => r.kind === kind && r.name === name && r.text === text)
  if (!known || typeof at !== 'string' || !(Date.parse(at) <= Date.now())) return null
  if (JSON.stringify(area) !== JSON.stringify('area' in known ? known.area : undefined)) return null
  return { ...known, at: new Date(at).toISOString() }
}

type EarlierDraft = { id: string; sources: Pick<Reading, 'name' | 'text' | 'at'>[]; dismissedAt: string | null }

// Reading assessment. Any reading with a new time or value raises a new Potential incident, carrying the latest
// dismissal of one from the same source; Corroborated needs two or more source kinds.
export function assessReadings(readings: Reading[], earlier: EarlierDraft[]) {
  const seen = (r: Reading) => earlier.some(e => e.sources.some(s => s.name === r.name && s.text === r.text && Date.parse(s.at) === Date.parse(r.at)))
  if (readings.every(seen)) return { raise: false } as const
  const names = new Set(readings.map(r => r.name))
  const dismissal = earlier.filter(e => e.dismissedAt && e.sources.some(s => names.has(s.name)))
    .sort((a, b) => Date.parse(b.dismissedAt!) - Date.parse(a.dismissedAt!))[0]
  return { raise: true, earlierDismissal: dismissal?.id ?? null, corroborated: new Set(readings.map(r => r.kind)).size >= 2 } as const
}

export async function draftFlood(readings: Reading[], summarize: () => Promise<unknown>) {
  const sources = readings.map(({ kind, name, text, at }) => ({ kind, name, text, at, quote: text }))
  // The warning's own geometry, else the gauge's; never the model's.
  const area = (readings.find(r => r.kind === 'warning') ?? readings.find(r => r.area))?.area
  if (!area) throw new Error('No source geometry')
  try {
    const output = await summarize()
    if (!output || typeof output !== 'object' || !('summary' in output) || typeof output.summary !== 'string'
      || !output.summary.trim() || !('quotes' in output) || !Array.isArray(output.quotes)
      || output.quotes.length !== sources.length) throw new Error('Incomplete summary')
    const quotes = output.quotes
    return { summary: output.summary.trim(), area, fallback: false, sources: sources.map((source, i) => {
      const quote = quotes[i]
      if (typeof quote !== 'string' || !quote.trim() || !source.text.includes(quote)) throw new Error('Unattributed quote')
      return { ...source, quote }
    }) }
  } catch {
    return { summary: sources.map(s => `${s.name}: ${s.text}`).join(' '), area, sources, fallback: true }
  }
}
