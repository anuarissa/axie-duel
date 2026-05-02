'use client';

/**
 * Root page. Si hay JWT en localStorage → redirige a /dashboard.
 * Si no, → redirige a /login.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getJwt } from '../lib/auth';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const jwt = getJwt();
    if (jwt) router.replace('/dashboard');
    else router.replace('/login');
  }, [router]);

  return <main className="loading-screen">Cargando…</main>;
}
