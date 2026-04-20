import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import './models/index.js';
import apiRoutes from './routes/index.js';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';

const app = express();

app.use(helmet());

// CORS — open to the world for API access.
// - Mobile (React Native) clients do not send an Origin header at all, so CORS
//   is effectively bypassed for them; this config is mainly for web clients.
// - We use Bearer tokens (not cookies), so `credentials: true` is intentionally
//   omitted — it is incompatible with origin: "*" per the CORS spec.
// - The `cors` package handles OPTIONS preflight automatically.
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));

app.get('/health', (req, res) => {
  res.status(200).json({ success: true, message: 'OK', uptime: process.uptime() });
});

app.get('/api', (req, res) => {
  res.json({
    success: true,
    message: 'SSBFY API is running 🚀',
  });
});

app.use('/api', apiRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
