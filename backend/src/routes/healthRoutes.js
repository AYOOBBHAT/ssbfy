import { Router } from 'express';
import { env } from '../config/env.js';

const router = Router();

/** Lightweight liveness — no DB; safe for Railway / uptime monitors. */
export function healthPayload() {
  return {
    success: true,
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    environment: env.nodeEnv,
  };
}

export function healthHandler(_req, res) {
  res.status(200).json(healthPayload());
}

router.get('/health', healthHandler);

export default router;
