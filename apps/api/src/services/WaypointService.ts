/**
 * Verificación de ID Token JWT emitido por Ronin Waypoint.
 * El frontend abre el pop-up de Waypoint, recibe un JWT firmado por Sky Mavis,
 * lo manda al backend; este servicio valida la firma contra la JWK pública.
 *
 * Source: https://docs.skymavis.com/mavis/waypoint/overview
 *
 * Si Sky Mavis cambia el endpoint de JWKS, ajustar `JWKS_URL` y `WAYPOINT_ISSUER`
 * en `.env`. La verificación de firma es cacheada por `jose` automáticamente.
 */

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { AuthError } from '../lib/errors.js';

// DECISION: el endpoint JWKS de Waypoint vive en {issuer}/.well-known/jwks.json
// según el patrón estándar OIDC que sigue Sky Mavis. Si su prod usa otro path,
// se sobrescribe vía env (no implementado aún). TODO: verify endpoint exacto en docs Waypoint cuando se cree app real.
const JWKS_URL = new URL('/.well-known/jwks.json', config.WAYPOINT_ISSUER);
const jwks = createRemoteJWKSet(JWKS_URL);

export interface WaypointTokenClaims extends JWTPayload {
  /** Subject estable del usuario en Sky Mavis. */
  sub: string;
  email?: string;
  /** Address EVM del Waypoint MPC wallet del usuario. */
  wallet_address?: string;
  /** Tipo de wallet: 'ronin' | 'eoa'. */
  wallet_type?: string;
}

export class WaypointService {
  /**
   * Verifica un ID token de Waypoint y devuelve sus claims.
   * Lanza `AuthError` si la firma es inválida, expiró, o el issuer no coincide.
   */
  async verifyIdToken(idToken: string): Promise<WaypointTokenClaims> {
    if (!idToken || typeof idToken !== 'string') {
      throw new AuthError('Missing or malformed ID token');
    }
    try {
      const { payload } = await jwtVerify(idToken, jwks, {
        issuer: config.WAYPOINT_ISSUER,
        // El audience es el WAYPOINT_CLIENT_ID si está configurado.
        ...(config.WAYPOINT_CLIENT_ID ? { audience: config.WAYPOINT_CLIENT_ID } : {}),
      });
      return payload as WaypointTokenClaims;
    } catch (err) {
      logger.warn({ err }, 'waypoint token verification failed');
      throw new AuthError('Invalid Waypoint ID token', 'WAYPOINT_INVALID');
    }
  }
}

export const waypointService = new WaypointService();
