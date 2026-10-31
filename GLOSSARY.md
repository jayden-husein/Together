# Together

A disaster accountability map: it gathers trip plans, check-ins, family reports and venue records about people who may be caught in an incident, so they can be followed up and their families kept informed.

## People and roles

**Person**:
The record of someone being tracked. A Person comes from an Account that signed up, or from a Venue record of someone who consented to the venue sharing it. Together never holds people reported only by family or law enforcement; those go to law enforcement's own systems.
_Avoid_: Missing person, subject

**Account**:
A login to Together, linked to at most one Person.
_Avoid_: User, profile

**Traveler**:
The role an Account holds while it has an Itinerary for an outing outside its usual routine: a trip abroad, a concert, a park visit.

**Emergency Contact**:
An Account a traveler has named, allowed to receive Individual Updates about them and to file a Can't-reach report.
_Avoid_: Contact link, family account

**Coordinator**:
Emergency staff at a desk, such as a dispatcher, incident commander or emergency manager, who run an incident's Cases: relays what Responders and law enforcement find onto existing Cases, claims Cases, records Contact Attempts and decides what's true. A Coordinator cannot add a new Person. The AI drafts and suggests; the Coordinator decides.
_Avoid_: Dispatcher, admin, operator

**Responder**:
A field emergency worker (fire, EMS, search and rescue). Responders don't use Together; what they find reaches it through the Coordinator.
_Avoid_: First responder (in code)

## Incidents

**Potential incident**:
A suspected emergency the AI has compiled from sensor data and news sources, waiting for a Coordinator to verify or dismiss it. It affects nobody until verified. Dismissing one is a judgment about those readings only: a new reading always raises a new Potential incident, showing the earlier dismissal.
_Avoid_: Alert, detection

**Corroborated**:
A Potential incident backed by two or more independent sources, such as a gauge reading and a weather warning.

**Incident**:
An emergency a Coordinator has verified: an area, a start time and an optional end time. Only an Incident opens Cases.
_Avoid_: Event, disaster

**Resource**:
Help available during an Incident, such as a shelter, water or first aid, shown with its source and when it was last updated.

## Evidence and follow-up

**Report**:
An original submission about someone's whereabouts or condition, with its source and time. It is never edited; a correction is a new Report.
_Avoid_: Record, submission, evidence (as a noun for one item)

**Itinerary**:
A Report of planned stops, each with a place and time window, confirmed by the traveler.
_Avoid_: Trip plan (in code), schedule

**Check-in**:
A Report in which a traveler says they are either **Safe** or **Needs assistance**, with a description of what they need and how urgent it is.

**Can't-reach report**:
A Report from an Emergency Contact saying they can't reach their traveler.
_Avoid_: Missing-person report, family report

**Venue record**:
A Report from a venue (e.g. a tour manifest) placing someone at a place and time, shared only with that person's consent.

**Location ping**:
A Report of a device's position, with its accuracy and the time it was taken.
_Avoid_: GPS point, current location

**Case**:
The follow-up for one person in one incident, built on the Reports that link them.

**Urgency**:
How soon a Needs assistance Check-in should be acted on: **Immediate**, **Urgent** or **Can wait**. The AI proposes it with a quote from the traveler's words; the Coordinator can change it. A request the AI couldn't assess is **Untriaged**.
_Avoid_: Priority score, severity

**Contact Attempt**:
A recorded effort to reach the person in a Case.
_Avoid_: Log contact

**Reached**:
The outcome of a Contact Attempt that got through to the person.
_Avoid_: Contact confirmed

## Communication

**General Update**:
A public post about an Incident, readable without logging in. It never contains private details about a person.
_Avoid_: Alert, broadcast

**Individual Update**:
A change to one Case, sent only to that person's Emergency Contacts.

**Check-in Request**:
A prompt sent to a traveler in a Case, asking them to submit a Check-in.
_Avoid_: Ping, alert

**Notification**:
The in-app delivery of a General Update, Individual Update or Check-in Request to one Account.
_Avoid_: Message, alert
