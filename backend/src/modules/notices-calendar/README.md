# notices-calendar

**Owns:** Department notices (lifecycle + targeting) and calendar *representation* of academic events.

**Must not own:** Provider delivery, CA assessment schedule facts, official results, or an Assignment domain store (none exists). Lecturers create `ASSIGNMENT_DEADLINE` events for assigned offerings only. `CA_SCHEDULE` events are created by CA Recovery; calendar cannot edit them.

Cancelled events set `cancelledAt` and are excluded from active queries. Reminder jobs carry a generation so reschedules invalidate stale work.
