import { randomUUID } from 'crypto';

/**
 * Request correlation id — accepts incoming `X-Request-Id` or generates UUID.
 * Echoes id on the response for client debugging without leaking internals.
 */
export function requestContext(req, res, next) {
  const incoming = req.get('x-request-id')?.trim();
  const id = incoming && incoming.length <= 128 ? incoming : randomUUID();
  req.requestId = id;
  res.setHeader('x-request-id', id);
  next();
}
