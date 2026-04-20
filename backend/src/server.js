import app from './app.js';
import { connectDb } from './config/db.js';
import { env } from './config/env.js';

// process.env.PORT is provided by Railway (and most PaaS) at runtime.
// Fall back to 5000 for local development.
const PORT = Number(process.env.PORT) || env.port || 5000;

async function start() {
  try {
    await connectDb();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server', err);
    process.exit(1);
  }
}

start();
