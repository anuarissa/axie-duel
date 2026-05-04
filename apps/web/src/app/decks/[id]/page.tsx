'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch, ApiError, getJwt } from '../../../lib/auth';
import { BrandedLoadingScreen } from '../../../components/BrandedLoadingScreen';
import { resolveCardImage, placeholderSvgFor } from '../../../lib/cardArt';

interface CardLite {
  id: string;
  name: string;
  type: 'Monster' | 'Spell' | 'Trap';
  rarity: string;
  attribute: string | null;
  imageUrl: string;
}

interface CardFull extends CardLite {
  subType: string | null;
  level: number | null;
  atk: number | null;
  def: number | null;
  description: string;
  effectJson: { kind: string; description?: string; spellSpeed?: number } | null;
}

interface DeckDetail {
  id: string;
  name: string;
  format: string;
  isActive: boolean;
  cards: Array<{ cardId: string; quantity: number; zone: string; card: CardLite }>;
}

const CLASS_COLORS: Record<string, string> = {
  Plant: '#34d399', Beast: '#fb923c', Aquatic: '#22d3ee', Bird: '#f472b6',
  Reptile: '#a3e635', Bug: '#ef4444', Mech: '#cbd5e1', Dawn: '#c084fc', Dusk: '#5eead4',
  Spell: '#8b5cf6', Trap: '#a855f7',
};

export default function DeckDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id);
  const [deck, setDeck] = useState<DeckDetail | null>(null);
  const [catalog, setCatalog] = useState<Record<string, CardFull>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewCardId, setPreviewCardId] = useState<string | null>(null);

  useEffect(() => {
    if (!getJwt()) {
      router.replace('/login');
      return;
    }
    Promise.all([
      apiFetch<DeckDetail>(`/decks/${id}`),
      apiFetch<{ cards: CardFull[] }>('/cards').catch(() => ({ cards: [] as CardFull[] })),
    ])
      .then(([d, cat]) => {
        setDeck(d);
        const map: Record<string, CardFull> = {};
        for (const c of cat.cards) map[c.id] = c;
        setCatalog(map);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [id, router]);

  // Esc cierra el modal de preview.
  useEffect(() => {
    if (!previewCardId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewCardId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [previewCardId]);

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
    if (!confirm('Delete this deck? This does not affect your cards — only deletes this combination.')) return;
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
  if (!deck) return <BrandedLoadingScreen subtitle="Opening your deck…" />;

  const total = deck.cards.reduce((sum, c) => sum + c.quantity, 0);
  const previewCard = previewCardId ? catalog[previewCardId] : null;
  const classColorOf = (c: { type: string; attribute: string | null }): string => {
    if (c.type === 'Spell') return CLASS_COLORS.Spell!;
    if (c.type === 'Trap') return CLASS_COLORS.Trap!;
    return CLASS_COLORS[c.attribute ?? ''] ?? '#94a3b8';
  };

  return (
    <main className="cards-page">
      <div className="cards-toolbar">
        <Link href="/dashboard" className="cards-back">
          ← Back to dashboard
        </Link>
        <div className="cards-toolbar-actions">
          <Link href={`/decks/builder?id=${deck.id}`} className="btn-secondary">
            ✏️ Edit
          </Link>
          {!deck.isActive ? (
            <button className="btn-primary" onClick={activate} disabled={busy}>
              ⭐ Set active
            </button>
          ) : (
            <button className="btn-secondary" disabled>
              ⭐ Active
            </button>
          )}
          <button
            className="btn-secondary deck-detail-delete"
            onClick={removeDeck}
            disabled={busy}
          >
            🗑️ Delete
          </button>
        </div>
      </div>

      <div className="card-section">
        <h2>{deck.name}</h2>
        <p className="deck-detail-meta">
          {deck.format} · {total} cards{deck.isActive ? ' · ⭐ active' : ''}
        </p>
        <p className="deck-detail-hint">Click any card to view its specifications.</p>
      </div>

      <div className="cards-grid">
        {deck.cards.map((entry) => {
          const artInfo = {
            id: entry.card.id,
            name: entry.card.name,
            type: entry.card.type,
            attribute: entry.card.attribute,
          };
          return (
            <button
              key={entry.cardId}
              type="button"
              className="card-tile builder-card-tile deck-detail-card-clickable"
              onClick={() => setPreviewCardId(entry.cardId)}
              title={`${entry.card.name} — view specs`}
            >
              <div className="qty-badge">×{entry.quantity}</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolveCardImage(artInfo, entry.card.imageUrl)}
                alt={entry.card.name}
                className="card-tile-image"
                loading="lazy"
                onError={(e) => {
                  const img = e.currentTarget;
                  const fallback = placeholderSvgFor(artInfo);
                  if (img.src !== fallback) img.src = fallback;
                }}
              />
              <div className="card-tile-body">
                <div className="card-tile-name">{entry.card.name}</div>
                <div className="card-tile-meta">
                  <span className={`card-tile-type ${entry.card.type}`}>
                    {entry.card.type === 'Monster' ? 'AXIE' : entry.card.type.toUpperCase()}
                  </span>
                  <span className={`card-tile-rarity rarity-${entry.card.rarity}`}>{entry.card.rarity}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Specs preview modal */}
      {previewCard ? (
        <div
          className="deck-detail-modal-backdrop"
          onClick={() => setPreviewCardId(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="deck-detail-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="deck-detail-modal-close"
              onClick={() => setPreviewCardId(null)}
              aria-label="Close"
            >
              ✕
            </button>
            <div className="deck-detail-modal-art">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolveCardImage(previewCard, previewCard.imageUrl)}
                alt={previewCard.name}
                onError={(e) => {
                  const img = e.currentTarget;
                  const fallback = placeholderSvgFor(previewCard);
                  if (img.src !== fallback) img.src = fallback;
                }}
              />
            </div>
            <div className="deck-detail-modal-body">
              <h3>{previewCard.name}</h3>
              <div className="deck-detail-modal-tags">
                <span
                  className="deck-detail-modal-class-chip"
                  style={{ background: classColorOf(previewCard) }}
                >
                  {previewCard.type === 'Monster' ? previewCard.attribute : previewCard.type}
                </span>
                {previewCard.subType ? (
                  <span className="deck-detail-modal-subtype">{previewCard.subType}</span>
                ) : null}
                {previewCard.level !== null ? (
                  <span className="deck-detail-modal-stars">⭐ Lv {previewCard.level}</span>
                ) : null}
                <span className={`deck-detail-modal-rarity rarity-${previewCard.rarity}`}>
                  {previewCard.rarity}
                </span>
              </div>
              {previewCard.type === 'Monster' && previewCard.atk !== null ? (
                <div className="deck-detail-modal-stats">
                  <div><span>ATK</span><strong>{previewCard.atk}</strong></div>
                  <div><span>DEF</span><strong>{previewCard.def}</strong></div>
                </div>
              ) : null}
              <p className="deck-detail-modal-desc">{previewCard.description}</p>
              {previewCard.effectJson ? (
                <div className="deck-detail-modal-effect">
                  <span className="deck-detail-modal-effect-label">EFFECT</span>
                  <span className="deck-detail-modal-effect-kind">{previewCard.effectJson.kind}</span>
                  {previewCard.effectJson.description ? (
                    <p>{previewCard.effectJson.description}</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
