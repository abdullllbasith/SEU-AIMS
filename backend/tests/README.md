# Backend tests

Unit tests do not require MongoDB.

Database integration tests (`tests/integration/database-foundation.test.js`) use, in order:

1. `MONGODB_TEST_URI` if set (must be an isolated test database, never production)
2. `mongodb://127.0.0.1:27017/seu_aims_test`
3. `mongodb-memory-server`

They skip when no isolated MongoDB is available.
