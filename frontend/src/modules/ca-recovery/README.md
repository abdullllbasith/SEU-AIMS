# ca-recovery

CA application and workflow UI. Backend owns eligibility, deadlines, state transitions, PDF/QR, physical verification, subject-level examination notices and reminders. No HOD portal.

- `LecturerCaPage`: publishes one examination notice per subject (date, start/end time in Asia/Colombo, venue), reschedules, cancels (reason required), completes one subject at a time, and shows per-channel delivery status.
- `StudentCaPage`: shows each subject of an application with its own exam status, local date/time and venue.
- Admin verification lives in `modules/admin` (`CaQrScanner`, `/admin/ca`).
