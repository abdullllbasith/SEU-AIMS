#!/usr/bin/env node
/**
 * There is no production seed. This command refuses to run against production
 * so developers cannot "accidentally" load synthetic QA identities.
 */
import dotenv from 'dotenv';
import { connectMongo, disconnectMongo } from '../src/infrastructure/database/mongo.js';
import { seedQaWorld, QA_PASSWORD } from '../tests/helpers/qa-fixtures.js';
import { User } from '../src/modules/authentication/models/user.model.js';
import { hashPassword } from '../src/modules/authentication/security/passwords.js';
import { ROLES } from '../src/shared/constants/roles.js';

dotenv.config();

if (process.env.NODE_ENV === 'production') {
  process.stderr.write('Refusing to seed a production database.\n');
  process.exit(1);
}

async function run() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/seu_aims';
  console.log('Connecting to Mongo at', uri);
  await connectMongo({ uri });

  console.log('Seeding QA data...');
  const world = await seedQaWorld();

  // Also ensure admin@example.test exists
  const existingAdmin = await User.findOne({ email: 'admin@example.test' });
  if (!existingAdmin) {
    await User.create({
      role: ROLES.DEPARTMENT_ADMINISTRATOR,
      email: 'admin@example.test',
      displayName: 'System Admin',
      accountStatus: 'ACTIVE',
      departmentId: world.departmentA._id,
      passwordHash: await hashPassword(QA_PASSWORD, { minLength: 10 }),
      lecturerStatus: 'NOT_APPLICABLE',
    });
    console.log('Created admin@example.test with password: ' + QA_PASSWORD);
  } else {
    existingAdmin.passwordHash = await hashPassword(QA_PASSWORD, { minLength: 10 });
    existingAdmin.accountStatus = 'ACTIVE';
    await existingAdmin.save();
    console.log('Reset password for admin@example.test to: ' + QA_PASSWORD);
  }

  console.log('Database seeded successfully!');
  await disconnectMongo();
}

run().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
