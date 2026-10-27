# Modular monolith

SEU-AIMS is one backend deployable and one frontend deployable.

Logical domain modules live under `backend/src/modules/`. They are not microservices.

```text
Users → React → API (Express × N) → modules
                    ↓
         MongoDB / Redis / object storage
                    ↓
              workers × M
```

API processes must remain stateless. Persistent files go through the file-storage interface, not an API instance disk as the production store.
