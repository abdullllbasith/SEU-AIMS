import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { registerModels } from '../../src/infrastructure/database/register-models.js';

let mongod;
let dbPath;

function workspaceScratchRoot() {
  return path.resolve(process.cwd(), '..', '.local-storage', 'mongo-memory');
}

async function connect(uri, serverSelectionTimeoutMS = 5000) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS });
  registerModels();
  await mongoose.connection.syncIndexes();
  return uri;
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
      return await connect(process.env.MONGODB_TEST_URI, 5000);
    } catch (error) {
      errors.push(`MONGODB_TEST_URI: ${error.message}`);
    }
  }

  try {
    return await connect('mongodb://127.0.0.1:27017/seu_aims_test', 3000);
  } catch (error) {
    errors.push(`local:27017: ${error.message}`);
  }

  const systemBinary = cachedMongodBinary();
  dbPath = path.join(workspaceScratchRoot(), `pid-${process.pid}`);
  fs.mkdirSync(dbPath, { recursive: true });

  try {
    mongod = await MongoMemoryServer.create({
      instance: {
        dbPath,
        storageEngine: 'wiredTiger',
        args: ['--wiredTigerCacheSizeGB', '0.25'],
        launchTimeout: 20000,
      },
      binary: systemBinary
        ? { systemBinary, version: '7.0.24' }
        : { version: '7.0.24' },
    });
    return await connect(mongod.getUri('seu_aims_test'));
  } catch (error) {
    errors.push(`MongoMemoryServer: ${error.message}`);
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
  if (dbPath && fs.existsSync(dbPath)) {
    try {
      fs.rmSync(dbPath, { recursive: true, force: true });
    } catch {
      // Windows can keep mongod file handles briefly after stop.
    }
    dbPath = undefined;
  }
}

export async function clearIsolatedMongo() {
  const collections = mongoose.connection.collections;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
}
