import { expect, test } from 'vitest'
import { homeRoute, mayOpen, type Capabilities } from './access'
const person: Capabilities = { isCoordinator: false, isTraveler: true, isEmergencyContact: true, name: 'Maya' }
test('traveler and contact capabilities are additive', () => {
  expect(mayOpen('#/traveler', person)).toBe(true)
  expect(mayOpen('#/contact', person)).toBe(true)
  expect(mayOpen('#/coordinator', person)).toBe(false)
  expect(homeRoute(person)).toBe('#/traveler')
  expect(homeRoute({ ...person, isTraveler: false })).toBe('#/contact')
})
test('coordinators can only open public and coordinator views', () => {
  const c = { ...person, isCoordinator: true }
  expect(mayOpen('#/traveler', c)).toBe(false)
  expect(mayOpen('#/contact', c)).toBe(false)
  expect(mayOpen('#/coordinator', c)).toBe(true)
  expect(mayOpen('#/', c)).toBe(true)
  expect(homeRoute(c)).toBe('#/coordinator')
})
