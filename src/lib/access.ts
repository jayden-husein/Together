export type Capabilities = { isCoordinator: boolean; isTraveler: boolean; isEmergencyContact: boolean; name: string }
export function homeRoute(c: Capabilities) { return c.isCoordinator ? '#/coordinator' : !c.isTraveler && c.isEmergencyContact ? '#/contact' : '#/traveler' }
export function mayOpen(path: string, c: Capabilities) {
  return path === '#/coordinator' ? c.isCoordinator : ['#/traveler', '#/contact'].includes(path) ? !c.isCoordinator : true
}
