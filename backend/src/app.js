import express from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import './models/index.js';
import apiRoutes from './routes/index.js';
import { env, normalizeCorsOrigin } from './config/env.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import { requestContext } from './middlewares/requestContext.js';
import { httpLogger } from './middlewares/httpLogger.js';
import { healthHandler } from './routes/healthRoutes.js';

const CORS_DENIED_MESSAGE = 'Not allowed by CORS';

/** Production: ALLOWED_ORIGINS only (no *). Dev: any origin. Mobile & Razorpay webhook pass when Origin is absent. */
const corsOptions = {
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
  origin(origin, callback) {
    if (env.nodeEnv === 'development') {
      return callback(null, true);
    }
    if (!origin) {
      return callback(null, true);
    }
    if (env.allowedOrigins.includes(normalizeCorsOrigin(origin))) {
      return callback(null, true);
    }
    return callback(new Error(CORS_DENIED_MESSAGE));
  },
};

const app = express();

app.set('trust proxy', 1);

app.use(requestContext);

app.use(helmet());

app.use(
  compression({
    threshold: 1024,
    filter: (req, res) => {
      if (req.headers['x-no-compression']) return false;
      return compression.filter(req, res);
    },
  })
);

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(
  express.json({
    limit: '1mb',
    verify: (req, res, buf) => {
      // Razorpay webhook HMAC is computed over the raw JSON bytes.
      const pathOnly = String(req.originalUrl || '').split('?')[0];
      if (pathOnly === '/api/payments/webhook') {
        req.rawBody = buf;
      }
    },
  })
);
app.use(httpLogger);

/** Same payload as `GET /api/health` — many monitors ping `/health` at root. */
app.get('/health', healthHandler);

app.get('/api', (req, res) => {
  res.json({
    success: true,
    message: 'SSBFY API is running 🚀',
  });
});

app.use('/api', apiRoutes);

app.use(notFoundHandler);
app.use((err, req, res, next) => {
  if (err?.message === CORS_DENIED_MESSAGE) {
    return res.status(403).json({ success: false, message: CORS_DENIED_MESSAGE });
  }
  return next(err);
});
app.use(errorHandler);

export default app;
