# Lecturer object-level authorization (Prompt 20)

| Action | Assigned offering | Different offering | Different department | Non-lecturer |
|---|---|---|---|---|
| GET `/api/lecturer/subject-offerings/:id` | Allow | Deny 403 | Deny 403 | Role 403 |
| GET search hits | Own prefix matches | Hidden | Hidden | Role 403 |
| Upload resource | Allow via `/api/learning` | Deny (learning tests) | Deny | Deny |
| Publish resource | Allow via `/api/learning` | Deny | Deny | Deny |
| Read CA eligible | Active assignment (CA service) | Hidden | Hidden | Deny |
| Create CA schedule | Allow via `/api/ca` | Deny | Deny | Deny |
| POST `/api/lecturer/ca-recovery/approve` | Deny | Deny | Deny | Deny |
| POST `/api/lecturer/results` | Deny | Deny | Deny | Deny |
| Edit admin calendar event | Deny (calendar service) | Deny | Deny | Deny |
