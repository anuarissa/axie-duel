/**
 * Middleware: extrae JWT del header Authorization y deja el payload en req.user.
 * El JWT del juego (NO el de Waypoint) lo emitimos nosotros tras verificar Waypoint.
 */

import type { NextFunction, Request, Response } from 'express';
import { jwtVerify } from 'jose';
import { config } from '../config.js';
import { AuthError } from '../lib/errors.js';

const SECRET = new TextEncoder().encode(config.JWT_SECRET);

export interface GameJwtPayload {
  userId: string;
  username: string;
  walletAddress?: string;
  hasNFTAxies: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: GameJwtPayload;
    }
  }
}

export async function authRequired(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = req.header('authorization');
    if (!auth || !auth.startsWith('Bearer ')) throw new AuthError('Missing Bearer token');
    const token = auth.slice('Bearer '.length);
    const { payload } = await jwtVerify(token, SECRET, { issuer: 'axie-duel' });
    req.user = payload as unknown as GameJwtPayload;
    next();
  } catch (err) {
    next(err);
  }
}
