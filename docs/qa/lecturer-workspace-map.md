# Lecturer workspace map (Prompt 20)

| Surface | Source | Notes |
|---|---|---|
| Assigned offerings | `LecturerAssignment` + `SubjectOffering` | Names from Batch/Year/Semester |
| canManage | Active assignment + ACTIVE offering + VERIFIED lecturer | Inactive = read-only |
| Resources | `OfficialResource` counts/list | Upload/publish via `/api/learning` |
| Deadlines | `CalendarEvent` ASSIGNMENT_DEADLINE | Create via `/api/calendar/lecturer/events` |
| CA list | `listApprovedForLecturer` | Registration number, not a student directory |
| Notifications | `unreadCount` / inbox | Own user only |
| Search | Prefix on assigned offerings/resources/events/CA regs | Rejects regex |
