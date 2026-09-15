# Backend modules

Logical domains of one Express application. Import each module through its `index.js` public API only.

Models and repositories stay inside the owning module.

`student-experience` composes other modules for `/api/me` and must not become a second results or GPA store.
