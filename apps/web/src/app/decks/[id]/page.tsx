'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch, ApiError, getJwt } from '../../../lib/auth';

interface Card {
  id: string;
  name: string;
  type: string;
  rarity: string;
  imageUrl: string;
}

interface DeckDetail {
  id: string;
  name: string;
  format: string;
  isActive: boolean;
  cards: Array<{ cardId: string; quantity: number; zone: string; card: Card }>;
}

export default function DeckDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id);
  const [deck, setDeck] = useState<DeckDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!getJwt()) {
      router.replace('/login');
      return;
    }
    apiFetch<DeckDetail>(`/decks/${id}`)
      .then(setDeck)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [id, router]);

  async function activate() {
    setBusy(true);
    try {
      await apiFetch(`/decks/${id}/activate`, { method: 'POST' });
      const updated = await apiFetch<DeckDetail>(`/decks/${id}`);
      setDeck(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function removeDeck() {
    if (!confirm('¿Borrar este mazo? Esto no afecta tus cartas — solo borra esta combinación.')) return;
    setBusy(true);
    try {
      await apiFetch(`/decks/${id}`, { method: 'DELETE' });
      router.push('/dashboard');
    } catch (err) {
      if (err instanceof ApiError) alert(err.message);
      setBusy(false);
    }
  }

  if (error) return <main className="loading-screen">Error: {error}</main>;
  if (!deck) return <main className="loading-screen">Cargando mazo…</main>;

  const total = deck.cards.reduce((sum, c) => sum + c.quantity, 0);

  return (
    <main className="cards-page">
      <div className="cards-toolbar">
        <Link href="/dashboard" className="cards-back">
          ← Volver al dashboard
        </Link>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Link href={`/decks/builder?id=${deck.id}`} className="btn-secondary">
            ✏️ Editar
          </Link>
          {!deck.isActive ? (
            <button className="btn-primary" onClick={activate} disabled={busy}>
              ⭐ Marcar como activo
            </button>
          ) : (
            <button className="btn-secondary" disabled>
              ⭐ Activo
            </button>
          )}
          <button
            className="btn-secondary"
            onClick={removeDeck}
            disabled={busy}
            style={{ color: '#ff7676' }}
          >
            🗑️ Borrar
          </button>
        </div>
      </div>

      <div className="card-section">
        <h2>{deck.name}</h2>
        <p style={{ opacity: 0.7, fontSize: '0.875rem' }}>
          {deck.format} · {total} cartas{deck.isActive ? ' · ⭐ activo' : ''}
        </p>
      </div>

      <div className="cards-grid">
        {deck.cards.map((entry) => (
          <article key={entry.cardId} className="card-tile builder-card-tile">
            <div className="qty-badge">×{entry.quantity}</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={entry.card.imageUrl} alt={entry.card.name} className="card-tile-image" loading="lazy" />
            <div className="card-tile-body">
              <div className="card-tile-name">{entry.card.name}</div>
              <div className="card-tile-meta">
                <span className={`card-tile-type ${entry.card.type}`}>{entry.card.type}</span>
                <span className={`card-tile-rarity rarity-${entry.card.rarity}`}>{entry.card.rarity}</span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
