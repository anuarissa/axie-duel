import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { SignJWT } from 'jose';
import { waypointService } from '../services/WaypointService.js';
import { roninService } from '../services/RoninService.js';
import { starterAxieService } from '../services/StarterAxieService.js';
import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { authRateLimit } from '../middleware/rateLimit.middleware.js';
import { RANKED_NFT_MIN_NFT_AXIES } from '@axie-duel/game-rules';
import type { Address } from 'viem';

const router = Router();

const SECRET = new TextEncoder().encode(config.JWT_SECRET);

const LoginBody = z.object({
  waypointIdToken: z.string().min(20),
});

router.post('/waypoint', authRateLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { waypointIdToken } = LoginBody.parse(req.body);
    const claims = await waypointService.verifyIdToken(waypointIdToken);

    const walletAddress = claims.wallet_address?.toLowerCase();
    let hasNFTAxies = false;
    if (walletAddress) {
      const balance = await roninService.getAxieBalance(walletAddress as Address);
      hasNFTAxies = balance >= RANKED_NFT_MIN_NFT_AXIES;
    }

    const user = await prisma.user.upsert({
      where: { waypointSub: claims.sub },
      update: {
        ...(claims.email ? { email: claims.email } : {}),
        ...(walletAddress ? { walletAddress } : {}),
        hasNFTAxies,
      },
      create: {
        waypointSub: claims.sub,
        email: claims.email ?? null,
        username: `player_${claims.sub.slice(0, 8)}`,
        walletAddress: walletAddress ?? null,
        hasNFTAxies,
      },
    });

    // Si es la primera vez, generar starter Axies en DB.
    const existingStarters = await prisma.starterAxie.count({ where: { userId: user.id } });
    if (existingStarters === 0) {
      const starters = starterAxieService.generateStartersForUser(user.id);
      await prisma.starterAxie.createMany({
        data: starters.map((s) => ({
          userId: user.id,
          axieClass: s.class,
          parts: s.parts as object,
          stats: s.stats as object,
          isStarter: true,
        })),
      });
      logger.info({ userId: user.id }, 'starter axies created');
    }

    const gameToken = await new SignJWT({
      userId: user.id,
      username: user.username,
      walletAddress: user.walletAddress ?? undefined,
      hasNFTAxies: user.hasNFTAxies,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('axie-duel')
      .setExpirationTime('7d')
      .setIssuedAt()
      .sign(SECRET);

    res.json({
      token: gameToken,
      user: {
        id: user.id,
        username: user.username,
        walletAddress: user.walletAddress,
        hasNFTAxies: user.hasNFTAxies,
        eloRanked: user.eloRanked,
        level: user.level,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
