/**
 * Auth routes. Filosofía Web2-first:
 *
 *   POST /auth/google      — login con Google ID Token (web2 puro, sin wallet)
 *   POST /auth/microsoft   — login con Microsoft ID Token (web2 puro, sin wallet)
 *   POST /auth/facebook    — login con Facebook access token (web2 puro, sin wallet)
 *   POST /auth/waypoint    — login con Waypoint ID Token (incluye wallet de Ronin auto)
 *
 *   POST /auth/link/waypoint — usuario YA logueado linkea Waypoint (agrega wallet a su cuenta web2)
 *   POST /auth/link/wallet   — usuario YA logueado linkea wallet directa (con firma EIP-4361)
 *
 * Todos los login devuelven: { token: <JWT>, user: { id, username, hasNFTAxies, walletAddress?, ... } }
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import type { Address } from 'viem';
import { socialAuthService } from '../services/SocialAuthService.js';
import { waypointService } from '../services/WaypointService.js';
import { accountService } from '../services/AccountService.js';
import { prisma } from '../lib/prisma.js';
import { authRateLimit } from '../middleware/rateLimit.middleware.js';
import { authRequired } from '../middleware/auth.middleware.js';

const router = Router();

const SocialLoginBody = z.object({
  /** El ID token (Google/Microsoft) o access_token (Facebook) recibido en el cliente. */
  idToken: z.string().min(20),
});

function userPublicShape(user: {
  id: string;
  username: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  walletAddress: string | null;
  hasNFTAxies: boolean;
  eloRanked: number;
  level: number;
}) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    walletAddress: user.walletAddress,
    hasNFTAxies: user.hasNFTAxies,
    eloRanked: user.eloRanked,
    level: user.level,
  };
}

router.post('/google', authRateLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { idToken } = SocialLoginBody.parse(req.body);
    const claims = await socialAuthService.verifyGoogle(idToken);
    const user = await accountService.findOrCreateUserBySocial('google', claims);
    const token = await accountService.issueGameJwt(user);
    res.json({ token, user: userPublicShape(user) });
  } catch (err) {
    next(err);
  }
});

router.post('/microsoft', authRateLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { idToken } = SocialLoginBody.parse(req.body);
    const claims = await socialAuthService.verifyMicrosoft(idToken);
    const user = await accountService.findOrCreateUserBySocial('microsoft', claims);
    const token = await accountService.issueGameJwt(user);
    res.json({ token, user: userPublicShape(user) });
  } catch (err) {
    next(err);
  }
});

router.post('/facebook', authRateLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { idToken } = SocialLoginBody.parse(req.body);
    const claims = await socialAuthService.verifyFacebook(idToken);
    const user = await accountService.findOrCreateUserBySocial('facebook', claims);
    const token = await accountService.issueGameJwt(user);
    res.json({ token, user: userPublicShape(user) });
  } catch (err) {
    next(err);
  }
});

const WaypointBody = z.object({
  waypointIdToken: z.string().min(20),
});

router.post('/waypoint', authRateLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { waypointIdToken } = WaypointBody.parse(req.body);
    const claims = await waypointService.verifyIdToken(waypointIdToken);

    // Buscar usuario por waypointSub. Si no existe, crearlo (alguien que su PRIMER login es Waypoint).
    let user = await prisma.user.findUnique({ where: { waypointSub: claims.sub } });
    if (!user) {
      // Crear vía AccountService — usa el flujo común con setup de starter.
      const username = await accountService.generateUniqueUsername(claims.email ?? 'player');
      user = await prisma.user.create({
        data: {
          waypointSub: claims.sub,
          email: claims.email ?? null,
          emailVerified: !!claims.email, // Waypoint los pre-verifica
          username,
          ...(claims.wallet_address ? { walletAddress: claims.wallet_address.toLowerCase() } : {}),
        },
      });
      await accountService.ensureNewUserSetup(user.id);
    }
    // Asegurar que walletAddress + hasNFTAxies estén actualizados.
    user = await accountService.linkWaypoint(user.id, claims);

    const token = await accountService.issueGameJwt(user);
    res.json({ token, user: userPublicShape(user) });
  } catch (err) {
    next(err);
  }
});

router.post('/link/waypoint', authRequired, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { waypointIdToken } = WaypointBody.parse(req.body);
    const claims = await waypointService.verifyIdToken(waypointIdToken);
    const user = await accountService.linkWaypoint(req.user!.userId, claims);
    res.json({ user: userPublicShape(user) });
  } catch (err) {
    next(err);
  }
});

const LinkWalletBody = z.object({
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  /** Firma EIP-4361 (Sign-In With Ethereum). Validación completa en Fase 1. */
  signature: z.string().min(20),
  message: z.string().min(20),
});

router.post('/link/wallet', authRequired, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { walletAddress, signature, message } = LinkWalletBody.parse(req.body);
    // TODO Fase 1: verificar la firma EIP-4361 con viem.verifyMessage(). Por ahora,
    // como el endpoint requiere auth previa Web2 y un signature/message válidos en shape,
    // confiamos del primer cut. NO usar en producción sin verifyMessage.
    void signature;
    void message;
    const user = await accountService.linkWallet(req.user!.userId, walletAddress as Address);
    res.json({ user: userPublicShape(user) });
  } catch (err) {
    next(err);
  }
});

export default router;
