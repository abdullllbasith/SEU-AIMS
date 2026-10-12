import dns from 'node:dns';
import mongoose from 'mongoose';

function lookup(hostname, options, callback) {
  dns.lookup(hostname, options, (error, address, family) => {
    if (!error) {
      callback(null, address, family);
      return;
    }
    dns.resolve4(hostname, (resolveError, addresses) => {
      if (resolveError || !addresses?.length) {
        callback(error);
        return;
      }
      callback(null, addresses[0], 4);
    });
  });
}

/**
 * Central MongoDB lifecycle. Do not open per-request connections.
 * Never log credentials or the raw connection string.
 */
export async function connectMongo({ uri, logger, maxPoolSize = 20, serverSelectionTimeoutMS = 5000 }) {
  if (!uri) {
    logger?.warn('MongoDB URI is not configured; database remains disconnected');
    return null;
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  if (mongoose.connection.readyState === 2) {
    await mongoose.connection.asPromise();
    return mongoose;
  }

  mongoose.set('strictQuery', true);

  await mongoose.connect(uri, {
    maxPoolSize,
    serverSelectionTimeoutMS,
    family: 4,
    lookup,
  });
  logger?.info('MongoDB connected', { database: mongoose.connection.name });
  return mongoose;
}

export async function disconnectMongo({ logger } = {}) {
  if (mongoose.connection.readyState === 0) {
    return;
  }

  await mongoose.disconnect();
  logger?.info('MongoDB disconnected');
}

export function getMongoConnection() {
  return mongoose.connection;
}

/** Requires a MongoDB replica set. Standalone servers reject transaction numbers. */
export async function withTransaction(work) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const result = await work(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
}
