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
import { BrandedLoadingScreen } from '../../components/BrandedLoadingScreen';

interface ArchetypeMeta {
  id: 'plant' | 'bird' | 'beast';
  name: string;
  axieClass: 'Plant' | 'Bird' | 'Beast';
  leadCard: string;
  emoji: string;
  vibeEmojis: string[];
  tagline: string;
  description: string;
  playstyle: string;
  highlights: string[];
  strongVs: string[];
  weakVs: string[];
  totalCards: number;
}

interface StarterStatus {
  starterPicked: boolean;
  archetype?: 'plant' | 'bird' | 'beast' | null;
  starterDeckId?: string;
}

const ARCHETYPE_GRADIENT: Record<string, string> = {
  plant: 'linear-gradient(140deg, rgba(52, 211, 153, 0.25), rgba(34, 197, 94, 0.08) 60%, rgba(15, 10, 31, 0.6))',
  bird:  'linear-gradient(140deg, rgba(244, 114, 182, 0.25), rgba(192, 132, 252, 0.08) 60%, rgba(15, 10, 31, 0.6))',
  beast: 'linear-gradient(140deg, rgba(251, 146, 60, 0.25), rgba(239, 68, 68, 0.08) 60%, rgba(15, 10, 31, 0.6))',
};

const ARCHETYPE_ACCENT: Record<string, string> = {
  plant: '#34d399',
  bird:  '#f472b6',
  beast: '#fb923c',
};

export default function StarterPage() {
  const router = useRouter();
  const [archetypes, setArchetypes] = useState<ArchetypeMeta[]>([]);
  const [status, setStatus] = useState<StarterStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

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
        setError('You already have a starter. Back to dashboard.');
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setClaiming(null);
    }
  }

  if (loading) return <BrandedLoadingScreen subtitle="Choosing your destiny…" />;

  if (status?.starterPicked) {
    return (
      <main className="starter-page">
        <div className="starter-already">
          <div className="starter-already-icon">✨</div>
          <h1>You already have your starter</h1>
          <p>
            You picked <strong>{status.archetype}</strong>. The other two starter decks are available
            in the <Link href="/store">Tienda</Link> for 5 AXS each.
          </p>
          <Link href="/dashboard" className="btn-primary">
            Go to dashboard
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="starter-page-v2">
      <header className="starter-v2-header">
        <h1 className="starter-v2-title">⚔ Choose your destiny</h1>
        <p className="starter-v2-subtitle">
          Each archetype defines your playstyle. The choice is permanent — but you can build more decks later
          and unlock the other two starters in the Tienda.
        </p>
        <div className="starter-v2-bonus">
          <span>🪙</span>
          <strong>+50 Dust</strong>
          <span>welcome bonus on pick</span>
        </div>
      </header>

      {error ? <div className="starter-v2-error">⚠️ {error}</div> : null}

      <div className="starter-v2-grid">
        {archetypes.map((a) => {
          const accent = ARCHETYPE_ACCENT[a.id] ?? '#94a3b8';
          const isHovered = hoveredId === a.id;
          return (
            <article
              key={a.id}
              className={`starter-v2-card starter-v2-${a.id} ${isHovered ? 'is-hovered' : ''}`}
              data-bg={a.id}
              onMouseEnter={() => setHoveredId(a.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {/* Glow halo */}
              <div className="starter-v2-card-halo" data-archetype={a.id} />

              {/* Hero icon + class chip */}
              <div className="starter-v2-card-hero">
                <div className="starter-v2-card-icon">{a.emoji}</div>
                <div className="starter-v2-vibe-emojis">
                  {a.vibeEmojis.map((e, i) => (
                    <span key={i} className="starter-v2-vibe-emoji" style={{ animationDelay: `${i * 120}ms` }}>{e}</span>
                  ))}
                </div>
                <div className="starter-v2-class-chip" data-archetype={a.id}>
                  {a.axieClass}
                </div>
              </div>

              {/* Body */}
              <div className="starter-v2-card-body">
                <h2 className="starter-v2-card-name">{a.name}</h2>
                <p className="starter-v2-card-tagline">{a.tagline}</p>
                <p className="starter-v2-card-desc">{a.description}</p>

                <div className="starter-v2-card-playstyle">
                  <span className="starter-v2-section-label">PLAYSTYLE</span>
                  <p>{a.playstyle}</p>
                </div>

                <div className="starter-v2-card-highlights">
                  <span className="starter-v2-section-label">DECK CORE</span>
                  <ul>
                    {a.highlights.map((h, i) => (
                      <li key={i}>
                        <span className="starter-v2-highlight-dot" data-archetype={a.id}>◆</span>
                        <span>{h}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="starter-v2-card-matchup">
                  <div className="starter-v2-matchup-row strong">
                    <span className="starter-v2-matchup-label">⚔ STRONG VS</span>
                    <span className="starter-v2-matchup-classes">
                      {a.strongVs.map((c) => <span key={c} className="starter-v2-matchup-chip strong">{c}</span>)}
                    </span>
                  </div>
                  <div className="starter-v2-matchup-row weak">
                    <span className="starter-v2-matchup-label">🛡 WEAK VS</span>
                    <span className="starter-v2-matchup-classes">
                      {a.weakVs.map((c) => <span key={c} className="starter-v2-matchup-chip weak">{c}</span>)}
                    </span>
                  </div>
                </div>

                <div className="starter-v2-card-meta">
                  <span className="starter-v2-card-cards">🃏 {a.totalCards} cards</span>
                  <span className="starter-v2-card-bonus">🪙 +50 Dust bonus</span>
                </div>
              </div>

              <button
                type="button"
                className="starter-v2-card-cta"
                onClick={() => claim(a.id)}
                disabled={claiming !== null}
                style={{ borderColor: accent }}
              >
                {claiming === a.id ? '⏳ Creating deck…' : (
                  <>
                    <span>Pick</span>
                    <strong>{a.name}</strong>
                    <span>→</span>
                  </>
                )}
              </button>
            </article>
          );
        })}
      </div>

      <footer className="starter-v2-footer">
        {/* Solo permitir back al dashboard si YA tiene starter — los nuevos users
         * están forzados a elegir uno antes de acceder al juego. */}
        {status?.starterPicked ? (
          <Link href="/dashboard" className="starter-v2-skip">
            ← Back to dashboard
          </Link>
        ) : null}
        <p className="starter-v2-disclaimer">
          The choice is permanent. The other two starters can be unlocked later from the Tienda for 5 AXS each.
        </p>
      </footer>
    </main>
  );
}
