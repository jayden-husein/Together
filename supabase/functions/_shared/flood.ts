// Synthetic source packet supplied by the demo feed.
export function floodReadings() {
  return {
    gauge: { name: 'Bright Angel Creek stream gauge', text: 'The creek rose 1.2 metres in thirty minutes.' },
    warning: { name: 'Weather service warning', text: 'Flash flooding is expected near Phantom Ranch and Black Bridge.',
      area: { type: 'Polygon' as const, coordinates: [[[-112.1, 36.095], [-112.085, 36.095], [-112.085, 36.112], [-112.1, 36.112], [-112.1, 36.095]]] } },
    news: { name: 'Canyon news desk', text: 'Hikers report water across the trail near Phantom Ranch.' },
  }
}

export async function draftFlood(readings: ReturnType<typeof floodReadings>, summarize: () => Promise<unknown>) {
  const sources = [readings.gauge, readings.warning, readings.news].map(({ name, text }) => ({ name, text, quote: text }))
  const area = readings.warning.area
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
    return { summary: 'A rapid rise in Bright Angel Creek and reports of water on the trail support the flash flood warning near Phantom Ranch.', area, sources, fallback: true }
  }
}
