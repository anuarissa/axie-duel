/**
 * REST API entry point. Express :3001.
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { config, allowedOrigins } from './config.js';
import { logger } from './lib/logger.js';
import { generalRateLimit } from './middleware/rateLimit.middleware.js';
import { errorHandler } from './middleware/error.middleware.js';
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import cardRoutes from './routes/card.routes.js';
import deckRoutes from './routes/deck.routes.js';
import axieRoutes from './routes/axie.routes.js';
import matchRoutes from './routes/match.routes.js';
import leaderboardRoutes from './routes/leaderboard.routes.js';
import axsRoutes from './routes/axs.routes.js';
import tournamentRoutes from './routes/tournament.routes.js';
import adminRoutes from './routes/admin.routes.js';
import internalRoutes from './routes/internal.routes.js';

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(pinoHttp({ logger }));
app.use(generalRateLimit);

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'axie-duel-api', env: config.NODE_ENV });
});

app.use('/auth', authRoutes);
app.use('/users', userRoutes);
app.use('/cards', cardRoutes);
app.use('/decks', deckRoutes);
app.use('/axies', axieRoutes);
app.use('/matches', matchRoutes);
app.use('/leaderboard', leaderboardRoutes);
app.use('/axs', axsRoutes);
app.use('/tournaments', tournamentRoutes);
app.use('/admin', adminRoutes);
app.use('/internal', internalRoutes);

app.use(errorHandler);

app.listen(config.API_PORT, () => {
  logger.info(`axie-duel-api listening on :${config.API_PORT}`);
});
