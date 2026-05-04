/**
 * Helpers de auth client-side. JWT del juego vive en localStorage.
 * Funciones puras — sin React, no necesitan ser hooks.
 */

const JWT_KEY = 'axie_duel_jwt';

export function getJwt(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(JWT_KEY);
}

/** Decode JWT payload sin verificar firma. Para sacar userId del lado cliente. */
export function getJwtUserId(): string | null {
  const tok = getJwt();
  if (!tok) return null;
  try {
    const payload = tok.split('.')[1];
    if (!payload) return null;
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { userId?: string };
    return decoded.userId ?? null;
  } catch {
    return null;
  }
}

export function setJwt(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(JWT_KEY, token);
}

export function clearJwt(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(JWT_KEY);
}

export function authHeaders(): Record<string, string> {
  const token = getJwt();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

/**
 * Wrapper de fetch que incluye Authorization automáticamente y parsea JSON.
 * Lanza Error con el body de la respuesta si !ok (útil para mostrar errores claros).
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...(init.headers ?? {}),
    },
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new ApiError(r.status, body);
  }
  // Algunos DELETE devuelven 204 sin body.
  if (r.status === 204) return undefined as T;
  return r.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    body: string,
  ) {
    super(`HTTP ${status}: ${body}`);
    this.name = 'ApiError';
  }
}
