/**
 * Game server entry point. Colyseus 0.15 + Express + WS transport.
 */

import { createServer } from 'node:http';
import express from 'express';
import { Server } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { monitor } from '@colyseus/monitor';
import { config } from './config.js';
import { logger } from './logger.js';
import { DuelRoom } from './rooms/DuelRoom.js';
import { PvERoom } from './rooms/PvERoom.js';

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'axie-duel-game-server', env: config.NODE_ENV });
});

// Colyseus Monitor (dashboard de salas activas en /colyseus)
app.use('/colyseus', monitor());

const httpServer = createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define('duel', DuelRoom);
gameServer.define('pve', PvERoom);

httpServer.listen(config.GAME_SERVER_PORT, () => {
  logger.info(`game-server listening on :${config.GAME_SERVER_PORT}`);
  logger.info(`monitor: http://localhost:${config.GAME_SERVER_PORT}/colyseus`);
});
