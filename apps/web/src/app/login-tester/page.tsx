'use client';

/**
 * Página de testing del flujo Google Identity Services → POST /auth/google.
 *
 * Usa el SDK oficial de Google "Sign in with Google" (gsi/client). El SDK renderiza
 * un botón nativo, el usuario clickea, hace login con su cuenta Google, y nos devuelve
 * un ID Token JWT firmado por Google.
 *
 * Después llamamos POST /auth/google con ese ID Token. El backend lo verifica contra
 * la JWK pública de Google, crea/encuentra el User en DB, y devuelve un JWT propio
 * del juego que guardamos en localStorage.
 *
 * NO es la página de login final del juego — es un tester para validar que el flujo
 * end-to-end con Google funciona antes de hacer el frontend completo.
 */

import { useEffect, useState } from 'react';

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

interface GoogleCredentialResponse {
  credential: string; // ID Token JWT
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
          prompt: () => void;
        };
      };
    };
  }
}

interface BackendUser {
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

interface BackendAuthResponse {
  token: string;
  user: BackendUser;
}

export default function LoginTester() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [authResp, setAuthResp] = useState<BackendAuthResponse | null>(null);
  const [meResp, setMeResp] = useState<unknown>(null);

  useEffect(() => {
    if (!CLIENT_ID) return;

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (!window.google) return;
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: handleGoogleCredential,
      });
      const btnEl = document.getElementById('gsi-button');
      if (btnEl) {
        window.google.accounts.id.renderButton(btnEl, {
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
  }, []);

  async function handleGoogleCredential(resp: GoogleCredentialResponse) {
    setStatus('loading');
    setError(null);
    try {
      const r = await fetch(`${API_BASE}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: resp.credential }),
      });
      if (!r.ok) {
        const errBody = await r.text();
        throw new Error(`HTTP ${r.status}: ${errBody}`);
      }
      const data = (await r.json()) as BackendAuthResponse;
      setAuthResp(data);
      localStorage.setItem('axie_duel_jwt', data.token);
      setStatus('success');

      // Como bonus: probar GET /users/me con el token recién obtenido.
      const meR = await fetch(`${API_BASE}/users/me`, {
        headers: { Authorization: `Bearer ${data.token}` },
      });
      if (meR.ok) {
        setMeResp(await meR.json());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }

  if (!CLIENT_ID) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <h1 style={{ margin: 0, color: '#ff7676' }}>⚠️ NEXT_PUBLIC_GOOGLE_CLIENT_ID no configurado</h1>
          <p style={{ marginTop: '1rem' }}>
            Agregalo a <code>C:\dev\axie-duel\.env</code> y reiniciá el dev server.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Axie Duel — Google Login Tester</h1>
        <p style={{ opacity: 0.7, fontSize: '0.875rem', marginTop: '0.5rem' }}>
          Sign-in con Google → POST /auth/google → JWT del juego → GET /users/me
        </p>

        <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'center' }}>
          <div id="gsi-button" />
        </div>

        {status === 'loading' && (
          <p style={{ marginTop: '2rem', textAlign: 'center', opacity: 0.7 }}>Verificando con backend…</p>
        )}

        {status === 'error' && (
          <div style={{ marginTop: '2rem', padding: '1rem', background: 'rgba(255,118,118,0.1)', borderRadius: 8 }}>
            <strong style={{ color: '#ff7676' }}>Error</strong>
            <pre style={preStyle}>{error}</pre>
          </div>
        )}

        {status === 'success' && authResp && (
          <div style={{ marginTop: '2rem' }}>
            <h2 style={{ fontSize: '1rem', margin: '0 0 0.5rem' }}>✅ Login exitoso</h2>
            <p style={{ fontSize: '0.875rem', opacity: 0.8, margin: '0.25rem 0' }}>
              <strong>Username:</strong> {authResp.user.username}
            </p>
            <p style={{ fontSize: '0.875rem', opacity: 0.8, margin: '0.25rem 0' }}>
              <strong>Email:</strong> {authResp.user.email}
            </p>
            <p style={{ fontSize: '0.875rem', opacity: 0.8, margin: '0.25rem 0' }}>
              <strong>Display:</strong> {authResp.user.displayName ?? '—'}
            </p>
            <p style={{ fontSize: '0.875rem', opacity: 0.8, margin: '0.25rem 0' }}>
              <strong>ELO Ranked:</strong> {authResp.user.eloRanked} | <strong>Level:</strong> {authResp.user.level}
            </p>
            <p style={{ fontSize: '0.875rem', opacity: 0.8, margin: '0.25rem 0' }}>
              <strong>Wallet:</strong> {authResp.user.walletAddress ?? 'no linkeada'} | <strong>NFT Axies:</strong>{' '}
              {String(authResp.user.hasNFTAxies)}
            </p>
            <details style={{ marginTop: '1rem' }}>
              <summary style={{ cursor: 'pointer', opacity: 0.7 }}>Ver JWT del juego (guardado en localStorage)</summary>
              <pre style={preStyle}>{authResp.token}</pre>
            </details>
            {meResp ? (
              <details style={{ marginTop: '1rem' }} open>
                <summary style={{ cursor: 'pointer', opacity: 0.7 }}>GET /users/me con el token</summary>
                <pre style={preStyle}>{JSON.stringify(meResp, null, 2)}</pre>
              </details>
            ) : null}
          </div>
        )}
      </div>
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'grid',
  placeItems: 'center',
  padding: '2rem',
};

const cardStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '1rem',
  padding: '2rem',
  maxWidth: 600,
  width: '100%',
};

const preStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.4)',
  padding: '0.75rem',
  borderRadius: '0.5rem',
  fontSize: '0.75rem',
  overflow: 'auto',
  margin: '0.5rem 0 0',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
};
