'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch, ApiError, getJwt } from '../../../lib/auth';

interface Card {
  id: string;
  name: string;
  type: 'Monster' | 'Spell' | 'Trap';
  rarity: string;
  attribute: string | null;
  level: number | null;
  atk: number | null;
  def: number | null;
  imageUrl: string;
  description: string;
}

type DeckCardEntry = { cardId: string; quantity: number };

const MAIN_MIN = 40;
const MAIN_MAX = 60;
const MAX_COPIES = 3;

export default function DeckBuilderPage() {
  const router = useRouter();
  const search = useSearchParams();
  const editingId = search.get('id'); // si presente, edit mode

  const [cards, setCards] = useState<Card[]>([]);
  const [deckMain, setDeckMain] = useState<DeckCardEntry[]>([]);
  const [name, setName] = useState('Mi mazo');
  const [typeFilter, setTypeFilter] = useState<'all' | 'Monster' | 'Spell' | 'Trap'>('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!getJwt()) {
      router.replace('/login');
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [catalog, deck] = await Promise.all([
        apiFetch<{ count: number; cards: Card[] }>('/cards'),
        editingId
          ? apiFetch<{ id: string; name: string; cards: Array<{ cardId: string; quantity: number; zone: string }> }>(
              `/decks/${editingId}`,
            )
          : Promise.resolve(null),
      ]);
      setCards(catalog.cards);
      if (deck) {
        setName(deck.name);
        setDeckMain(
          deck.cards
            .filter((c) => c.zone === 'Main')
            .map((c) => ({ cardId: c.cardId, quantity: c.quantity })),
        );
      }
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const cardsById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);

  const mainCount = deckMain.reduce((sum, e) => sum + e.quantity, 0);
  const isValid = mainCount >= MAIN_MIN && mainCount <= MAIN_MAX;

  const filtered = useMemo(() => {
    if (typeFilter === 'all') return cards;
    return cards.filter((c) => c.type === typeFilter);
  }, [cards, typeFilter]);

  function addCard(cardId: string) {
    setDeckMain((curr) => {
      const total = curr.reduce((s, e) => s + e.quantity, 0);
      if (total >= MAIN_MAX) return curr;
      const existing = curr.find((e) => e.cardId === cardId);
      if (existing) {
        if (existing.quantity >= MAX_COPIES) return curr;
        return curr.map((e) => (e.cardId === cardId ? { ...e, quantity: e.quantity + 1 } : e));
      }
      return [...curr, { cardId, quantity: 1 }];
    });
  }

  function removeCard(cardId: string) {
    setDeckMain((curr) => {
      const existing = curr.find((e) => e.cardId === cardId);
      if (!existing) return curr;
      if (existing.quantity <= 1) return curr.filter((e) => e.cardId !== cardId);
      return curr.map((e) => (e.cardId === cardId ? { ...e, quantity: e.quantity - 1 } : e));
    });
  }

  function quantityOf(cardId: string): number {
    return deckMain.find((e) => e.cardId === cardId)?.quantity ?? 0;
  }

  async function save() {
    if (!isValid) {
      setErrMsg(`El mazo principal debe tener entre ${MAIN_MIN} y ${MAIN_MAX} cartas.`);
      return;
    }
    setSaving(true);
    setErrMsg(null);
    const body = {
      name,
      format: 'Standard',
      cards: deckMain.map((e) => ({ cardId: e.cardId, zone: 'Main' as const, quantity: e.quantity })),
    };
    try {
      const path = editingId ? `/decks/${editingId}` : '/decks';
      const method = editingId ? 'PUT' : 'POST';
      const result = await apiFetch<{ id: string }>(path, {
        method,
        body: JSON.stringify(body),
      });
      router.push(`/dashboard?savedDeck=${result.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrMsg(err.message);
      } else {
        setErrMsg(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main className="loading-screen">Cargando builder…</main>;

  const errors: string[] = [];
  if (mainCount < MAIN_MIN) errors.push(`Faltan ${MAIN_MIN - mainCount} cartas para llegar al mínimo.`);
  if (mainCount > MAIN_MAX) errors.push(`Te pasaste por ${mainCount - MAIN_MAX} cartas del máximo.`);

  const types = ['all', 'Monster', 'Spell', 'Trap'] as const;

  return (
    <main className="builder-page">
      <div className="builder-toolbar">
        <Link href="/dashboard" className="cards-back">
          ← Volver al dashboard
        </Link>
        <input
          className="builder-name-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre del mazo"
          maxLength={60}
        />
      </div>

      <div className="builder-grid">
        {/* Lado izquierdo: catálogo */}
        <div>
          <div className="cards-toolbar">
            <div className="cards-filters">
              {types.map((t) => (
                <button
                  key={t}
                  className={`filter-chip ${typeFilter === t ? 'active' : ''}`}
                  onClick={() => setTypeFilter(t)}
                >
                  {t === 'all' ? 'Todas' : t}
                </button>
              ))}
            </div>
            <div style={{ fontSize: '0.75rem', opacity: 0.65 }}>
              Click para sumar · Click derecho para quitar
            </div>
          </div>

          <div className="cards-grid">
            {filtered.map((c) => {
              const qty = quantityOf(c.id);
              return (
                <article
                  key={c.id}
                  className="card-tile builder-card-tile"
                  onClick={() => addCard(c.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    removeCard(c.id);
                  }}
                  style={qty > 0 ? { borderColor: 'rgba(255, 217, 102, 0.5)' } : undefined}
                >
                  {qty > 0 ? <div className="qty-badge">×{qty}</div> : null}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.imageUrl} alt={c.name} className="card-tile-image" loading="lazy" />
                  <div className="card-tile-body">
                    <div className="card-tile-name">{c.name}</div>
                    <div className="card-tile-meta">
                      <span className={`card-tile-type ${c.type}`}>{c.type}</span>
                      <span className={`card-tile-rarity rarity-${c.rarity}`}>{c.rarity}</span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        {/* Lado derecho: panel del deck */}
        <aside className="builder-side">
          <h2>Tu mazo</h2>
          <div className="builder-counter">
            <span>Cartas Main</span>
            <strong className={isValid ? 'valid' : 'invalid'}>
              {mainCount} / {MAIN_MIN}-{MAIN_MAX}
            </strong>
          </div>
          <div className="builder-progress">
            <div
              className={`builder-progress-fill ${isValid ? '' : 'invalid'}`}
              style={{ width: `${Math.min(100, (mainCount / MAIN_MAX) * 100)}%` }}
            />
          </div>

          {errors.length > 0 ? (
            <div className="builder-errors">
              {errors.map((e, i) => (
                <div key={i}>• {e}</div>
              ))}
            </div>
          ) : null}

          {errMsg ? <div className="builder-errors">⚠️ {errMsg}</div> : null}

          <div className="builder-deck-list">
            {deckMain.length === 0 ? (
              <p className="section-empty" style={{ padding: '0.5rem 0' }}>
                Vacío. Click en cartas del catálogo para sumarlas.
              </p>
            ) : (
              deckMain.map((entry) => {
                const card = cardsById.get(entry.cardId);
                return (
                  <div key={entry.cardId} className="builder-deck-row">
                    <span className="qty-pill">×{entry.quantity}</span>
                    <span className="name">{card?.name ?? entry.cardId}</span>
                    <button onClick={() => removeCard(entry.cardId)}>−</button>
                  </div>
                );
              })
            )}
          </div>

          <div className="builder-actions">
            <button className="btn-primary" onClick={save} disabled={saving || !isValid}>
              {saving ? 'Guardando…' : editingId ? 'Actualizar mazo' : 'Guardar mazo'}
            </button>
            <button
              className="btn-secondary"
              onClick={() => setDeckMain([])}
              disabled={deckMain.length === 0}
            >
              Vaciar
            </button>
          </div>
        </aside>
      </div>
    </main>
  );
}
