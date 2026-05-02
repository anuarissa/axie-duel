/**
 * Middleware: requiere que el JWT ya validado por authRequired sea de un admin.
 * El `isAdmin` flag viene de la DB (no del JWT) para que cambios de rol surtan
 * efecto inmediato sin esperar a que el token expire.
 */

import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { ForbiddenError, AuthError } from '../lib/errors.js';

export async function adminRequired(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AuthError('Authentication required');
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { isAdmin: true },
    });
    if (!user?.isAdmin) throw new ForbiddenError('Admin role required');
    next();
  } catch (err) {
    next(err);
  }
}
