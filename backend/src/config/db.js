import mongoose from 'mongoose';
import { env, isProd } from './env.js';

export async function connectDb() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongoUri, {
    autoIndex: !isProd,
    serverSelectionTimeoutMS: 10_000,
  });
}

export async function disconnectDb() {
  await mongoose.disconnect();
}
