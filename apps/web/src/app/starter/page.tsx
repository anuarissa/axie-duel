'use client';

/**
 * Pantalla de selección de starter deck.
 * El user elige uno de 3 archetypes (Plant/Bird/Beast) inspirados en Starter Axies.
 * Al claim → +50 LC bonus + Deck creado en DB → redirect a /dashboard.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch, getJwt, ApiError } from '../../lib/auth';

interface ArchetypeMeta {
  id: 'plant' | 'bird' | 'beast';
  name: string;
  axieClass: 'Plant' | 'Bird' | 'Beast';
  leadCard: string;
  description: string;
  playstyle: string;
  totalCards: number;
}

interface StarterStatus {
  starterPicked: boolean;
  archetype?: 'plant' | 'bird' | 'beast' | null;
  starterDeckId?: string;
}

const ARCHETYPE_VISUAL: Record<string, { icon: string; gradient: string; advantageText: string }> = {
  plant: {
    icon: '🌿',
    gradient: 'linear-gradient(140deg, rgba(93, 255, 160, 0.18), rgba(20, 195, 244, 0.1))',
    advantageText: 'Ventaja vs Bird, Aqua',
  },
  bird: {
    icon: '🐦',
    gradient: 'linear-gradient(140deg, rgba(20, 195, 244, 0.22), rgba(140, 93, 246, 0.1))',
    advantageText: 'Ventaja vs Beast, Aqua',
  },
  beast: {
    icon: '🐺',
    gradient: 'linear-gradient(140deg, rgba(255, 210, 63, 0.2), rgba(255, 122, 58, 0.12))',
    advantageText: 'Ventaja vs Plant, Reptile',
  },
};

export default function StarterPage() {
  const router = useRouter();
  const [archetypes, setArchetypes] = useState<ArchetypeMeta[]>([]);
  const [status, setStatus] = useState<StarterStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getJwt()) {
      router.replace('/login');
      return;
    }
    void (async () => {
      try {
        const [archRes, statRes] = await Promise.all([
          apiFetch<{ archetypes: ArchetypeMeta[] }>('/starter/archetypes'),
          apiFetch<StarterStatus>('/starter/status'),
        ]);
        setArchetypes(archRes.archetypes);
        setStatus(statRes);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  async function claim(archetype: 'plant' | 'bird' | 'beast') {
    setClaiming(archetype);
    setError(null);
    try {
      await apiFetch('/starter/claim', {
        method: 'POST',
        body: JSON.stringify({ archetype }),
      });
      router.push('/dashboard');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError('Ya tenés un starter elegido. Volvé al dashboard.');
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setClaiming(null);
    }
  }

  if (loading) return <main className="loading-screen">Cargando archetypes…</main>;

  if (status?.starterPicked) {
    return (
      <main className="starter-page">
        <div className="starter-already">
          <h1>Ya tenés tu starter</h1>
          <p>
            Elegiste el arquetipo <strong>{status.archetype}</strong>. No se puede cambiar.
          </p>
          <Link href="/dashboard" className="btn-primary">
            Ir al dashboard
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="starter-page">
      <header className="starter-header">
        <h1>Elegí tu mazo inicial</h1>
        <p>Cada archetype define tu estilo de juego. La elección es permanente — pero podés crear más decks después.</p>
        <p className="starter-bonus">🪙 Bonus: <strong>+50 Lunacian Coins</strong> al elegir.</p>
      </header>

      {error ? <div className="starter-error">⚠️ {error}</div> : null}

      <div className="starter-grid">
        {archetypes.map((a) => {
          const v = ARCHETYPE_VISUAL[a.id];
          return (
            <article
              key={a.id}
              className={`starter-card starter-${a.id}`}
              style={{ background: v?.gradient }}
            >
              <div className="starter-icon">{v?.icon}</div>
              <h2>{a.name}</h2>
              <div className="starter-class">{a.axieClass}</div>
              <p className="starter-desc">{a.description}</p>
              <div className="starter-playstyle">{a.playstyle}</div>
              <div className="starter-advantage">⚡ {v?.advantageText}</div>
              <div className="starter-cards-count">{a.totalCards} cartas en el mazo</div>
              <button
                type="button"
                className="starter-cta"
                onClick={() => claim(a.id)}
                disabled={claiming !== null}
              >
                {claiming === a.id ? 'Creando deck…' : `Elegir ${a.name}`}
              </button>
            </article>
          );
        })}
      </div>

      <footer className="starter-footer">
        <Link href="/dashboard" className="starter-skip">
          ← Volver al dashboard
        </Link>
      </footer>
    </main>
  );
}
