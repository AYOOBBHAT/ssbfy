import app from './app.js';
import { connectDb } from './config/db.js';
import { env } from './config/env.js';

async function start() {
  try {
    await connectDb();
    app.listen(env.port, '0.0.0.0', () => {
      console.log(`Server running on http://0.0.0.0:${env.port} (${env.nodeEnv})`);
    });
  } catch (err) {
    console.error('Failed to start server', err);
    process.exit(1);
  }
}

start();
