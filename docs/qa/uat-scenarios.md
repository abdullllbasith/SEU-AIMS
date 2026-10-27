# UAT scenarios

These are **human** acceptance scripts using synthetic accounts from `backend/tests/helpers/qa-fixtures.js` patterns. They are **not** marked passed from this developer session.

## Student
Login → current semester → official resource → Study Room → result → GPA → E(CA)/CA application → PDF → calendar → notice → profile.

## Lecturer
Login → assigned offerings only → official resources → approved CA students → schedule → calendar → notifications. Confirm Study Room is denied.

## Department Administrator
Academic structure → lecturer assignment → notice publish → calendar → result import → CA physical verify/approve → operations/integrity.

## Pass criteria
The intended role completes the path; other roles cannot; no critical API/UI errors. Do not sign off from a developer-only walkthrough.
