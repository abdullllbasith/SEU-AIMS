import mongoose from 'mongoose';

export const objectId = mongoose.Schema.Types.ObjectId;

export const persistenceOptions = {
  timestamps: true,
};

export function defineModel(name, schema) {
  return mongoose.models[name] || mongoose.model(name, schema);
}
