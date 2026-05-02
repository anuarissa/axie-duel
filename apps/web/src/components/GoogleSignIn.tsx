'use client';

/**
 * Botón "Sign in with Google" usando Google Identity Services SDK.
 * Al recibir el ID Token, hace POST /auth/google y guarda el JWT del juego en localStorage.
 *
 * Props:
 *   - onSuccess(user): callback cuando el login completa (típicamente: navegar a /dashboard).
 *   - onError(message): callback cuando falla.
 */

import { useEffect } from 'react';
import { setJwt, API_BASE } from '../lib/auth';

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';

interface GoogleCredentialResponse {
  credential: string;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (resp: GoogleCredentialResponse) => void;
          }) => void;
          renderButton: (parent: HTMLElement, opts: Record<string, unknown>) => void;
        };
      };
    };
  }
}

export interface BackendUser {
  id: string;
  username: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  walletAddress: string | null;
  hasNFTAxies: boolean;
  eloRanked: number;
  level: number;
}

export interface GoogleSignInProps {
  onSuccess: (user: BackendUser) => void;
  onError?: (message: string) => void;
}

export function GoogleSignIn({ onSuccess, onError }: GoogleSignInProps) {
  useEffect(() => {
    if (!CLIENT_ID) {
      onError?.('NEXT_PUBLIC_GOOGLE_CLIENT_ID no configurado en .env');
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (!window.google) return;
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: handleCredential,
      });
      const btn = document.getElementById('gsi-button');
      if (btn) {
        window.google.accounts.id.renderButton(btn, {
          theme: 'filled_blue',
          size: 'large',
          shape: 'pill',
          text: 'signin_with',
          logo_alignment: 'left',
        });
      }
    };
    document.body.appendChild(script);
    return () => {
      script.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCredential(resp: GoogleCredentialResponse) {
    try {
      const r = await fetch(`${API_BASE}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: resp.credential }),
      });
      if (!r.ok) {
        const errBody = await r.text();
        onError?.(`Auth backend error (${r.status}): ${errBody}`);
        return;
      }
      const data = (await r.json()) as { token: string; user: BackendUser };
      setJwt(data.token);
      onSuccess(data.user);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : String(err));
    }
  }

  if (!CLIENT_ID) {
    return (
      <div style={errStyle}>⚠️ NEXT_PUBLIC_GOOGLE_CLIENT_ID no configurado</div>
    );
  }

  return <div id="gsi-button" />;
}

const errStyle: React.CSSProperties = {
  padding: '1rem',
  background: 'rgba(255,118,118,0.1)',
  borderRadius: 8,
  color: '#ff7676',
  fontSize: '0.875rem',
};
