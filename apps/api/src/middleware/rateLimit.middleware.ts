import rateLimit from 'express-rate-limit';

/** Rate limiter genérico: 100 req/min por IP. */
export const generalRateLimit = rateLimit({
  windowMs: 60_000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

/** Rate limiter estricto para /auth: 10 req/min por IP. */
export const authRateLimit = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});
