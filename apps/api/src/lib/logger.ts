import pino from 'pino';
import { config } from '../config.js';

export const logger = pino({
  level: config.NODE_ENV === 'production' ? 'info' : 'debug',
  base: { service: 'axie-duel-api' },
  redact: {
    paths: ['req.headers.authorization', '*.password', '*.privateKey', 'JWT_SECRET'],
    censor: '[REDACTED]',
  },
  ...(config.NODE_ENV !== 'production' && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l' },
    },
  }),
});
