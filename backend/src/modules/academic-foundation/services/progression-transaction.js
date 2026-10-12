import * as mongo from '../../../infrastructure/database/mongo.js';

export function transientTransactionError(error) {
  const labels = error?.errorLabels || error?.errorResponse?.errorLabels || [];
  return error?.code === 112 || labels.includes('TransientTransactionError');
}

export async function runProgressionTransaction(work, transactionRunner = mongo.withTransaction) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await transactionRunner(work);
    } catch (error) {
      lastError = error;
      if (!transientTransactionError(error) || attempt === 3) {
        throw error;
      }
    }
  }
  throw lastError;
}
