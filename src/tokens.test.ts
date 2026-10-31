import { expect, test } from 'vitest'
// Needs `css: true` in vite.config.ts; otherwise Vitest hands every CSS import back empty.
import css from './tokens.css?raw'

// The light block is the first `:root { … }`; dark mode is the `:root { … }` inside the media query.
function tokens(block: string) {
  return Object.fromEntries([...block.matchAll(/--color-([\w-]+):\s*(#[0-9a-f]{6})/gi)].map(m => [m[1], m[2]]))
}
const light = tokens(css.split('@media (prefers-color-scheme: dark)')[0])
const dark = { ...light, ...tokens(css.split('@media (prefers-color-scheme: dark)')[1]) }

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map(i => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// [foreground, background, minimum ratio]
const pairs: [string, string, number][] = [
  ['text', 'bg', 4.5],
  ['text', 'surface', 4.5],
  ['text-secondary', 'bg', 4.5],
  ['text-secondary', 'surface', 4.5],
  ['border-strong', 'surface', 3],
  ['on-primary', 'primary-solid', 4.5],
  ['focus', 'bg', 3],
  ['focus', 'surface', 3],
  ['on-solid', 'danger-solid', 4.5],
  ['on-solid', 'success-solid', 4.5],
  ...['neutral', 'danger', 'warning', 'success', 'info'].flatMap(s => [
    [`${s}-fg`, `${s}-bg`, 4.5] as [string, string, number],
    [`${s}-fg`, 'surface', 4.5] as [string, string, number],
  ]),
]

for (const [mode, t] of [['light', light], ['dark', dark]] as const) {
  test.each(pairs)(`${mode}: %s on %s meets %d:1`, (fg, bg, min) => {
    expect(t[fg], `--color-${fg}`).toBeDefined()
    expect(t[bg], `--color-${bg}`).toBeDefined()
    expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(min)
  })
}

test('contrast() agrees with a known pair', () => {
  expect(contrast('#ffffff', '#000000')).toBeCloseTo(21)
  expect(contrast('#767676', '#ffffff')).toBeCloseTo(4.54, 2)
})
