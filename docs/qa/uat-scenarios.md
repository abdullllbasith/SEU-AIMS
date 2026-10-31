# UAT scenarios

These are **human** acceptance scripts using synthetic accounts from `backend/tests/helpers/qa-fixtures.js` patterns. They are **not** marked passed from this developer session.

## Student
Login → current semester → official resource → Study Room → result → GPA → E(CA)/CA application → PDF → calendar → notice → profile.

## Lecturer
Login → assigned offerings only → official resources → approved CA students → publish a CA examination notice per subject (subject, date, time, venue) → calendar → notifications. Confirm Study Room is denied.

## Department Administrator
Academic structure → lecturer assignment → notice publish → calendar → result import → CA physical verify (scan the printed QR, or type the Application ID, after confirming the HOD signature was inspected) → CA approve → operations/integrity.

## CA recovery with several subjects
Use one student with an application for three subjects: A and B taught by lecturer 1, C by lecturer 2; a second student owes only B. Verify the printed form (QR and manual ID), approve, then confirm: lecturer 1 receives two notifications and lecturer 2 one; each lecturer sees only their own subjects. Lecturer 1 publishes A, B and lecturer 2 publishes C; only the students of that subject are notified (in-app, email, WhatsApp). Cancel A: B and C keep their date, status and reminders, and the application stays scheduled. Reschedule C: the old reminders stop and new 7/3/1-day reminders follow. Complete C, then B, then re-publish and complete A: the application is completed only after the last subject. Check the delivery status on the lecturer page and the notification health page; failed email/WhatsApp must show as failed, not sent.

## Pass criteria
The intended role completes the path; other roles cannot; no critical API/UI errors. Do not sign off from a developer-only walkthrough.
