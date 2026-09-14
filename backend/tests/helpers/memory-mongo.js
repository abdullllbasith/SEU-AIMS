import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { registerModels } from '../../src/infrastructure/database/register-models.js';

let mongod;

async function connect(uri, serverSelectionTimeoutMS = 5000) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS });
  registerModels();
  await mongoose.connection.syncIndexes();
  return uri;
}

export async function startIsolatedMongo() {
  if (process.env.MONGODB_TEST_URI) {
    return connect(process.env.MONGODB_TEST_URI);
  }

  try {
    return await connect('mongodb://127.0.0.1:27017/seu_aims_test', 1500);
  } catch {
    mongod = await MongoMemoryServer.create();
    return connect(mongod.getUri('seu_aims_test'));
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
