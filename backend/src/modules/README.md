# Backend modules

Logical domains of one Express application. Import each module through its `index.js` public API only.

Models, repositories, and private helpers stay inside the owning module when they are added in later prompts.

`student-experience` composes other modules for `/api/me` and must not become a second results or GPA store.
