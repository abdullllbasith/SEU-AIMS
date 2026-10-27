# Backend modules

Logical domains of one Express application. Import each module through its `index.js` public API only.

Models and repositories stay inside the owning module.

`student-experience` composes other modules for `/api/me` and must not become a second results or GPA store.

`admin-operations` aggregates department-scoped counts for administrators and must not become an edit UI or second academic store.

`lecturer-workspace` composes assignment-scoped teaching reads and must not become a second resource, CA, or results store.
