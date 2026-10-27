# admin-operations

**Owns:** Department-scoped operational aggregation for Department Administrators: dashboard counts, student/lecturer overviews, offering health, result-import monitoring, CA/notification/calendar health views, bounded student CSV export, and links to existing audit/integrity snapshots.

**Must not own:** Official results, GPA formula, CA workflow decisions, Study Room content, job force-success, or a generic query/export pipeline.

Department scope is always `principal.departmentId`. Query `departmentId` is ignored.

Metrics are derived. Repair academic data through the owning module APIs, not this dashboard.

See [admin operations handbook](../../../../docs/ops/admin-operations.md).
