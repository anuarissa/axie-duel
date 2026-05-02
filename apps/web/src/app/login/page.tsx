'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GoogleSignIn, type BackendUser } from '../../components/GoogleSignIn';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  function handleSuccess(_user: BackendUser) {
    router.replace('/dashboard');
  }

  return (
    <main className="login-page">
      <div className="login-card">
        <h1 className="login-title">AXIE DUEL</h1>
        <p className="login-subtitle">TCG Web3 estilo Yu-Gi-Oh!</p>

        <div className="login-button-wrap">
          <GoogleSignIn onSuccess={handleSuccess} onError={setError} />
        </div>

        {error ? (
          <div className="login-error">
            <strong>Error</strong>
            <pre>{error}</pre>
          </div>
        ) : null}

        <p className="login-hint">
          Login con Google. Los otros providers (Microsoft / Facebook) y la
          opción de wallet de Ronin se agregan después — primero validamos el
          flujo completo end-to-end.
        </p>
      </div>
    </main>
  );
}
