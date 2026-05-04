'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { apiFetch } from '../../lib/auth';
import { resolveCardImage, placeholderSvgFor } from '../../lib/cardArt';
import { BrandedLoadingScreen } from '../../components/BrandedLoadingScreen';

const displayType = (t: string) => t === 'Monster' ? 'AXIE' : t.toUpperCase();

interface Card {
  id: string;
  name: string;
  type: 'Monster' | 'Spell' | 'Trap';
  subType: string | null;
  rarity: 'Common' | 'Rare' | 'Epic' | 'Legendary' | 'Mystic';
  attribute: string | null;
  level: number | null;
  atk: number | null;
  def: number | null;
  effectJson: { kind: string; description?: string; spellSpeed?: number; params?: Record<string, unknown> } | null;
  imageUrl: string;
  description: string;
}

type TypeFilter = 'all' | 'Monster' | 'Spell' | 'Trap';
type RarityFilter = 'all' | 'Common' | 'Rare' | 'Epic' | 'Legendary' | 'Mystic';

export default function CardsPage() {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [rarityFilter, setRarityFilter] = useState<RarityFilter>('all');
  const [selected, setSelected] = useState<Card | null>(null);

  useEffect(() => {
    apiFetch<{ count: number; cards: Card[] }>('/cards')
      .then((r) => setCards(r.cards))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return cards.filter((c) => {
      if (typeFilter !== 'all' && c.type !== typeFilter) return false;
      if (rarityFilter !== 'all' && c.rarity !== rarityFilter) return false;
      return true;
    });
  }, [cards, typeFilter, rarityFilter]);

  if (loading) return <BrandedLoadingScreen subtitle="Unrolling the card catalog…" />;
  if (error) return <main className="loading-screen">Error: {error}</main>;

  const types: TypeFilter[] = ['all', 'Monster', 'Spell', 'Trap'];
  const rarities: RarityFilter[] = ['all', 'Common', 'Rare', 'Epic', 'Legendary', 'Mystic'];

  return (
    <main className="cards-page">
      <div className="cards-toolbar">
        <Link href="/dashboard" className="cards-back">
          ← Back to dashboard
        </Link>
        <div style={{ fontSize: '0.875rem', opacity: 0.7 }}>
          {filtered.length} of {cards.length} cards
        </div>
      </div>

      <div className="cards-toolbar">
        <div className="cards-filters">
          {types.map((t) => (
            <button
              key={t}
              className={`filter-chip ${typeFilter === t ? 'active' : ''}`}
              onClick={() => setTypeFilter(t)}
            >
              {t === 'all' ? 'All types' : displayType(t)}
            </button>
          ))}
        </div>
        <div className="cards-filters">
          {rarities.map((r) => (
            <button
              key={r}
              className={`filter-chip ${rarityFilter === r ? 'active' : ''}`}
              onClick={() => setRarityFilter(r)}
            >
              {r === 'all' ? 'All rarities' : r}
            </button>
          ))}
        </div>
      </div>

      <div className="cards-grid">
        {filtered.map((card) => (
          <article key={card.id} className="card-tile" onClick={() => setSelected(card)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={resolveCardImage(card, card.imageUrl)}
              alt={card.name}
              className="card-tile-image"
              loading="lazy"
              onError={(e) => {
                const img = e.currentTarget;
                const fallback = placeholderSvgFor(card);
                if (img.src !== fallback) img.src = fallback;
              }}
            />
            <div className="card-tile-body">
              <div className="card-tile-name">{card.name}</div>
              <div className="card-tile-meta">
                <span className={`card-tile-type ${card.type}`}>{displayType(card.type)}</span>
                <span className={`card-tile-rarity rarity-${card.rarity}`}>{card.rarity}</span>
              </div>
              {card.type === 'Monster' && card.atk !== null && card.def !== null ? (
                <div className="card-tile-stats">
                  <span className="card-tile-stat">
                    <strong>ATK</strong> {card.atk}
                  </span>
                  <span className="card-tile-stat">
                    <strong>DEF</strong> {card.def}
                  </span>
                  <span className="card-tile-stat">
                    <strong>Lv</strong> {card.level}
                  </span>
                </div>
              ) : null}
              <div className="card-tile-desc">{card.description}</div>
            </div>
          </article>
        ))}
      </div>

      {selected ? <CardModal card={selected} onClose={() => setSelected(null)} /> : null}
    </main>
  );
}

function CardModal({ card, onClose }: { card: Card; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={resolveCardImage(card, card.imageUrl)}
          alt={card.name}
          className="modal-image"
          onError={(e) => {
            const img = e.currentTarget;
            const fallback = placeholderSvgFor(card);
            if (img.src !== fallback) img.src = fallback;
          }}
        />
        <div className="modal-body">
          <h2 className="modal-title">{card.name}</h2>
          <div className="modal-meta-row">
            <span className={`card-tile-type ${card.type}`}>{displayType(card.type)}</span>
            {card.subType ? <span className="filter-chip">{card.subType}</span> : null}
            <span className={`card-tile-rarity rarity-${card.rarity}`}>{card.rarity}</span>
            {card.attribute ? <span className="filter-chip">{card.attribute}</span> : null}
          </div>

          {card.type === 'Monster' && card.atk !== null && card.def !== null ? (
            <div className="modal-stat-grid">
              <div>
                <strong style={{ color: '#ffd966' }}>ATK</strong>: {card.atk}
              </div>
              <div>
                <strong style={{ color: '#6ec8ff' }}>DEF</strong>: {card.def}
              </div>
              <div>Level: ⭐ {card.level}</div>
              <div>Burns: {(card.level ?? 0) <= 4 ? 0 : (card.level ?? 0) <= 6 ? 1 : 2}</div>
            </div>
          ) : null}

          <p style={{ fontSize: '0.875rem', opacity: 0.85, lineHeight: 1.5 }}>{card.description}</p>

          {card.effectJson ? (
            <div className="modal-effect">
              <strong>Effect: {card.effectJson.kind}</strong>
              {card.effectJson.description ?? card.description}
              {card.effectJson.spellSpeed ? (
                <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', opacity: 0.7 }}>
                  Spell Speed: {card.effectJson.spellSpeed}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
