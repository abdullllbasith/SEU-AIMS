import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { registerModels } from '../../src/infrastructure/database/register-models.js';

let mongod;

async function connect(uri, serverSelectionTimeoutMS = 5000) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS });
  registerModels();
  await mongoose.connection.syncIndexes();
  return uri;
}

async function supportsTransactions() {
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  return Boolean(hello.setName);
}

async function connectTransactional(uri, serverSelectionTimeoutMS) {
  await connect(uri, serverSelectionTimeoutMS);
  if (await supportsTransactions()) {
    return uri;
  }
  await mongoose.disconnect();
  return null;
}

function cachedMongodBinary() {
  if (process.env.MONGOMS_SYSTEM_BINARY && fs.existsSync(process.env.MONGOMS_SYSTEM_BINARY)) {
    return process.env.MONGOMS_SYSTEM_BINARY;
  }
  const cached = path.join(os.homedir(), '.cache', 'mongodb-binaries', 'mongod-x64-win32-7.0.24.exe');
  if (fs.existsSync(cached)) {
    return cached;
  }
  return null;
}

export async function startIsolatedMongo() {
  const errors = [];

  if (process.env.MONGODB_TEST_URI) {
    try {
      const uri = await connectTransactional(process.env.MONGODB_TEST_URI, 5000);
      if (uri) {
        return uri;
      }
      errors.push('MONGODB_TEST_URI: transactions require a replica set');
    } catch (error) {
      errors.push(`MONGODB_TEST_URI: ${error.message}`);
    }
  }

  try {
    const uri = await connectTransactional('mongodb://127.0.0.1:27017/seu_aims_test', 3000);
    if (uri) {
      return uri;
    }
    errors.push('local:27017: standalone server does not support transactions');
  } catch (error) {
    errors.push(`local:27017: ${error.message}`);
  }

  const systemBinary = cachedMongodBinary();

  try {
    mongod = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' },
      binary: systemBinary
        ? { systemBinary, version: '7.0.24' }
        : { version: '7.0.24' },
    });
    return await connect(mongod.getUri('seu_aims_test'), 30000);
  } catch (error) {
    errors.push(`MongoMemoryReplSet: ${error.message}`);
    throw new Error(`Isolated MongoDB is required and could not start. ${errors.join(' | ')}`);
  }
}

export async function stopIsolatedMongo() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
  if (mongod) {
    await mongod.stop();
    mongod = undefined;
  }
}

export async function clearIsolatedMongo() {
  const collections = mongoose.connection.collections;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
}
