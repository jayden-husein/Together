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

type Packet = { readings: Reading[]; area: Polygon }
type EarlierDraft = { id: string; sources: Pick<Reading, 'name' | 'text' | 'at'>[]; dismissed_at: string | null; incident_id: string | null }

const same = (a: Pick<Reading, 'name' | 'text' | 'at'>, b: Pick<Reading, 'name' | 'text' | 'at'>) =>
  a.name === b.name && a.text === b.text && Date.parse(a.at) === Date.parse(b.at)

// A fixture reading, at whatever time the delivery says if it isn't in the future.
function fixtureReading(value: unknown): Reading | null {
  if (!value || typeof value !== 'object') return null
  const { kind, name, text, at, area } = value as Record<string, unknown>
  const known = Object.values(floodReadings()).find(r => r.kind === kind && r.name === name && r.text === text)
  if (!known || typeof at !== 'string' || !(Date.parse(at) <= Date.now())) return null
  if (JSON.stringify(area) !== JSON.stringify('area' in known ? known.area : undefined)) return null
  return { ...known, at: new Date(at).toISOString() }
}

// The feed accepts only fixture readings, and needs one with its own geometry: the warning's area, else the gauge's.
export function fixturePacket(value: unknown): Packet | null {
  if (!Array.isArray(value) || value.length > Object.keys(floodReadings()).length) return null
  const readings = value.map(fixtureReading)
  if (!readings.every((r): r is Reading => r !== null)) return null
  const area = (readings.find(r => r.kind === 'warning') ?? readings.find(r => r.area))?.area
  return area ? { readings, area } : null
}

// Reading assessment. Any reading with a new time or value raises a new Potential incident. It carries the latest
// decision on the same sources if that was a dismissal, and is Corroborated by two or more source kinds not dismissed.
export function assessReadings(readings: Reading[], earlier: EarlierDraft[]) {
  if (readings.every(r => earlier.some(e => e.sources.some(s => same(s, r))))) return { raise: false } as const
  const dismissed = (r: Reading) => earlier.some(e => e.dismissed_at && e.sources.some(s => same(s, r)))
  const names = new Set(readings.map(r => r.name))
  const latest = (e: EarlierDraft) => Math.max(...e.sources.map(s => Date.parse(s.at)))
  const decided = earlier.filter(e => (e.dismissed_at || e.incident_id) && e.sources.some(s => names.has(s.name)))
    .sort((a, b) => latest(b) - latest(a))[0]
  return { raise: true, earlierDismissal: decided?.dismissed_at ? decided.id : null,
    corroborated: new Set(readings.filter(r => !dismissed(r)).map(r => r.kind)).size >= 2 } as const
}

// The Potential incident to raise, or null for a duplicate delivery. The area is the source's, never the model's.
export async function draftFlood({ readings, area }: Packet, earlier: EarlierDraft[], summarize: () => Promise<unknown>) {
  const assessment = assessReadings(readings, earlier)
  if (!assessment.raise) return null
  const sources = readings.map(({ kind, name, text, at }) => ({ kind, name, text, at, quote: text }))
  const draft = { area, corroborated: assessment.corroborated, earlier_dismissal_id: assessment.earlierDismissal,
    starts_at: readings.map(r => r.at).sort()[0], readings_key: readings.map(r => `${r.name}|${r.text}|${r.at}`).sort().join('\n') }
  try {
    const output = await summarize()
    if (!output || typeof output !== 'object' || !('summary' in output) || typeof output.summary !== 'string'
      || !output.summary.trim() || !('quotes' in output) || !Array.isArray(output.quotes)
      || output.quotes.length !== sources.length) throw new Error('Incomplete summary')
    const quotes = output.quotes
    return { ...draft, summary: output.summary.trim(), fallback: false, sources: sources.map((source, i) => {
      const quote = quotes[i]
      if (typeof quote !== 'string' || !quote.trim() || !source.text.includes(quote)) throw new Error('Unattributed quote')
      return { ...source, quote }
    }) }
  } catch {
    return { ...draft, summary: sources.map(s => `${s.name}: ${s.text}`).join(' '), sources, fallback: true }
  }
}
