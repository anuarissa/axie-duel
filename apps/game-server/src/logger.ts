import pino from 'pino';
import { config } from './config.js';

export const logger = pino({
  level: config.LOG_LEVEL ?? (config.NODE_ENV === 'production' ? 'info' : 'debug'),
  base: { service: 'axie-duel-game-server' },
  ...(config.NODE_ENV !== 'production' && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l' },
    },
  }),
});

export function gameLogger(matchId: string) {
  return logger.child({ matchId });
}
