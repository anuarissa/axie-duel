/**
 * Verificación de ID Tokens de OAuth providers Web2 puros.
 * El cliente hace login con Google/Microsoft/Facebook desde el browser,
 * recibe un ID token (JWT), y lo manda al backend para verificarlo.
 *
 * NO REQUIERE WALLET. Es la ruta principal de auth — la wallet de Ronin
 * se linkea DESPUÉS si el usuario quiere NFTs/cripto.
 *
 * Setup en developer consoles:
 *  - Google:    https://console.cloud.google.com/ → APIs & Services → Credentials → OAuth 2.0 Client ID (web)
 *  - Microsoft: https://entra.microsoft.com/      → App registrations → New registration (multi-tenant)
 *  - Facebook:  https://developers.facebook.com/  → Apps → Facebook Login → Settings
 */

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { AuthError } from '../lib/errors.js';

// Endpoints estándar OIDC. Estos NO cambian — son fijos del provider.
const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const MICROSOFT_JWKS = createRemoteJWKSet(
  new URL('https://login.microsoftonline.com/common/discovery/v2.0/keys'),
);

const GOOGLE_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);

export interface SocialClaims extends JWTPayload {
  /** ID estable del usuario en el provider (Google `sub`, Microsoft `oid`, Facebook user_id). */
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

export type SocialProvider = 'google' | 'microsoft' | 'facebook';

export class SocialAuthService {
  /**
   * Verifica un ID token de Google (formato JWT estándar OIDC).
   * Lanza `AuthError` si la firma es inválida, expiró, issuer/audience no matchean.
   */
  async verifyGoogle(idToken: string): Promise<SocialClaims> {
    if (!config.GOOGLE_CLIENT_ID) {
      throw new AuthError('GOOGLE_CLIENT_ID not configured', 'PROVIDER_DISABLED');
    }
    try {
      const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
        audience: config.GOOGLE_CLIENT_ID,
      });
      // Issuer check manual porque Google acepta 2 valores.
      if (typeof payload.iss !== 'string' || !GOOGLE_ISSUERS.has(payload.iss)) {
        throw new AuthError('Invalid Google issuer', 'GOOGLE_INVALID');
      }
      return payload as SocialClaims;
    } catch (err) {
      logger.warn({ err }, 'google id token verification failed');
      if (err instanceof AuthError) throw err;
      throw new AuthError('Invalid Google ID token', 'GOOGLE_INVALID');
    }
  }

  /**
   * Verifica un ID token de Microsoft (Entra ID / Azure AD).
   * Soporta apps multi-tenant — el `iss` varía por tenant pero todos firman con el JWKS común.
   */
  async verifyMicrosoft(idToken: string): Promise<SocialClaims> {
    if (!config.MICROSOFT_CLIENT_ID) {
      throw new AuthError('MICROSOFT_CLIENT_ID not configured', 'PROVIDER_DISABLED');
    }
    try {
      const { payload } = await jwtVerify(idToken, MICROSOFT_JWKS, {
        audience: config.MICROSOFT_CLIENT_ID,
      });
      // Microsoft expone `oid` como ID estable cross-tenant. Si no viene, usar `sub`.
      const oid = typeof payload.oid === 'string' ? payload.oid : (payload.sub as string);
      return { ...payload, sub: oid } as SocialClaims;
    } catch (err) {
      logger.warn({ err }, 'microsoft id token verification failed');
      throw new AuthError('Invalid Microsoft ID token', 'MICROSOFT_INVALID');
    }
  }

  /**
   * Verifica un access token de Facebook contra Graph API.
   * Facebook NO usa OIDC estándar — devuelve un access_token opaco que validamos
   * llamando a `/debug_token` con APP_ID + APP_SECRET.
   */
  async verifyFacebook(accessToken: string): Promise<SocialClaims> {
    if (!config.FACEBOOK_APP_ID || !config.FACEBOOK_APP_SECRET) {
      throw new AuthError('FACEBOOK_APP_ID/SECRET not configured', 'PROVIDER_DISABLED');
    }
    const appAccessToken = `${config.FACEBOOK_APP_ID}|${config.FACEBOOK_APP_SECRET}`;
    try {
      // 1. Validar que el access token es válido y para nuestra app.
      const debugUrl = new URL('https://graph.facebook.com/debug_token');
      debugUrl.searchParams.set('input_token', accessToken);
      debugUrl.searchParams.set('access_token', appAccessToken);
      const debugRes = await fetch(debugUrl.toString());
      if (!debugRes.ok) throw new AuthError('Facebook debug_token failed', 'FACEBOOK_INVALID');
      const debugData = (await debugRes.json()) as {
        data: { app_id: string; user_id: string; is_valid: boolean; expires_at?: number };
      };
      if (!debugData.data.is_valid) throw new AuthError('Facebook token invalid', 'FACEBOOK_INVALID');
      if (debugData.data.app_id !== config.FACEBOOK_APP_ID) {
        throw new AuthError('Facebook token for wrong app', 'FACEBOOK_INVALID');
      }
      const userId = debugData.data.user_id;

      // 2. Pedir email y name del usuario.
      const meUrl = new URL('https://graph.facebook.com/v18.0/me');
      meUrl.searchParams.set('fields', 'id,name,email,picture');
      meUrl.searchParams.set('access_token', accessToken);
      const meRes = await fetch(meUrl.toString());
      if (!meRes.ok) throw new AuthError('Facebook /me failed', 'FACEBOOK_INVALID');
      const me = (await meRes.json()) as {
        id: string;
        name?: string;
        email?: string;
        picture?: { data?: { url?: string } };
      };
      return {
        sub: userId,
        ...(me.email ? { email: me.email, email_verified: true } : {}),
        ...(me.name ? { name: me.name } : {}),
        ...(me.picture?.data?.url ? { picture: me.picture.data.url } : {}),
      };
    } catch (err) {
      logger.warn({ err }, 'facebook token verification failed');
      if (err instanceof AuthError) throw err;
      throw new AuthError('Facebook verification failed', 'FACEBOOK_INVALID');
    }
  }
}

export const socialAuthService = new SocialAuthService();
