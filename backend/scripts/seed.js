#!/usr/bin/env node
/**
 * There is no production seed. This command refuses to run against production
 * so developers cannot "accidentally" load synthetic QA identities.
 */
if (process.env.NODE_ENV === 'production') {
  process.stderr.write('Refusing to seed a production database.\n');
  process.exit(1);
}

process.stderr.write(
  'No application seed script is provided. Use isolated tests or approved staging fixtures. Synthetic QA identities live in backend/tests/helpers/qa-fixtures.js and must not be copied to production.\n',
);
process.exit(2);
