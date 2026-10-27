# Background workers

Start independently from the API:

```bash
npm run start:worker -w backend
```

Workers execute queued jobs and must call owning-module services. They are processing capacity inside the modular monolith, not microservices.
