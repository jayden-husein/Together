import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { CheckInButtons, SourceLine, StatusBadge, UrgencyTag } from './ui'

test('status badges show the GLOSSARY label, not just a color', () => {
  render(
    <>
      <StatusBadge status="unconfirmed" />
      <StatusBadge status="cant_reach" />
      <StatusBadge status="needs_assistance" />
      <StatusBadge status="safe" />
      <StatusBadge status="resolved" />
    </>,
  )
  for (const label of ['Unconfirmed', "Can't reach", 'Needs assistance', 'Safe', 'Resolved'])
    expect(screen.getByText(label)).toBeTruthy()
})

test('urgency tags show the GLOSSARY label', () => {
  render(
    <>
      <UrgencyTag urgency="immediate" />
      <UrgencyTag urgency="urgent" />
      <UrgencyTag urgency="can_wait" />
      <UrgencyTag urgency="untriaged" />
    </>,
  )
  for (const label of ['Immediate', 'Urgent', 'Can wait', 'Untriaged'])
    expect(screen.getByText(label)).toBeTruthy()
})

test('Check-in buttons report which one was chosen', () => {
  const onCheckIn = vi.fn()
  render(<CheckInButtons onCheckIn={onCheckIn} />)
  fireEvent.click(screen.getByRole('button', { name: 'Safe' }))
  fireEvent.click(screen.getByRole('button', { name: 'Needs assistance' }))
  expect(onCheckIn.mock.calls).toEqual([['safe'], ['needs_assistance']])
})

test('Check-in buttons are native buttons, so Enter and Space work without extra code', () => {
  render(<CheckInButtons onCheckIn={() => {}} />)
  for (const b of screen.getAllByRole('button')) {
    expect(b.tagName).toBe('BUTTON')
    expect(b.getAttribute('type')).toBe('button')
  }
})

test('source line names the source and a machine-readable time', () => {
  render(<SourceLine source="Park ranger station" at="2026-10-31T14:05:00Z" />)
  expect(screen.getByText(/Park ranger station/)).toBeTruthy()
  expect(document.querySelector('time')?.getAttribute('dateTime')).toBe('2026-10-31T14:05:00Z')
})

test('source line shows a malformed time as written instead of crashing the view', () => {
  render(<SourceLine source="Venue record" at="not a time" />)
  expect(screen.getByText('not a time')).toBeTruthy()
})
