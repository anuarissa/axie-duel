'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch, ApiError, getJwt } from '../../../lib/auth';
import { resolveCardImage, placeholderSvgFor } from '../../../lib/cardArt';
import { BrandedLoadingScreen } from '../../../components/BrandedLoadingScreen';

// useSearchParams() requires a Suspense boundary in Next.js 14 app router.
export default function DeckBuilderPageWrapper() {
  return (
    <Suspense fallback={<BrandedLoadingScreen subtitle="Forging your deck workshop…" />}>
      <DeckBuilderPage />
    </Suspense>
  );
}

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
  /** true si la carta proviene de un NFT minteado en Ronin. Hoy todas son false (off-chain). */
  isNFT?: boolean;
}

type DeckCardEntry = { cardId: string; quantity: number };

const DECK_SIZE = 40;
const MAX_COPIES = 3;
const LOCAL_STORAGE_KEY = 'user_active_deck';

type ClassFilter = 'all' | 'Plant' | 'Beast' | 'Bug' | 'Aquatic' | 'Bird' | 'Reptile' | 'Spell' | 'Trap';

const CLASS_FILTERS: ClassFilter[] = ['all', 'Plant', 'Beast', 'Bug', 'Aquatic', 'Bird', 'Reptile', 'Spell', 'Trap'];

const CLASS_COLORS: Record<string, string> = {
  Plant: '#34d399', Beast: '#fb923c', Aquatic: '#22d3ee', Bird: '#f472b6',
  Reptile: '#a3e635', Bug: '#ef4444', Mech: '#cbd5e1', Dawn: '#c084fc', Dusk: '#5eead4',
  Spell: '#8b5cf6', Trap: '#a855f7',
};

function classColorOf(c: Card): string {
  if (c.type === 'Spell') return CLASS_COLORS.Spell!;
  if (c.type === 'Trap') return CLASS_COLORS.Trap!;
  return CLASS_COLORS[c.attribute ?? ''] ?? '#94a3b8';
}

function DeckBuilderPage() {
  const router = useRouter();
  const search = useSearchParams();
  const editingId = search.get('id');

  const [cards, setCards] = useState<Card[]>([]);
  const [deckMain, setDeckMain] = useState<DeckCardEntry[]>([]);
  const [name, setName] = useState('My deck');
  const [classFilter, setClassFilter] = useState<ClassFilter>('all');
  const [levelFilter, setLevelFilter] = useState<'all' | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8>('all');
  const [roninFilter, setRoninFilter] = useState<'all' | 'ronin' | 'non-ronin'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [hoverCardId, setHoverCardId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [userDecks, setUserDecks] = useState<Array<{ id: string; name: string; isActive: boolean; cardCount: number }>>([]);
  const [currentDeckId, setCurrentDeckId] = useState<string | null>(editingId);
  const [dirty, setDirty] = useState(false);
  const [deckPickerOpen, setDeckPickerOpen] = useState(false);
  /** Debounced search input — evita re-render por keystroke. */
  const [searchInput, setSearchInput] = useState('');

  useEffect(() => {
    if (!getJwt()) {
      router.replace('/login');
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Debounce 250ms del search input → searchQuery (usado por filtered useMemo). */
  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(searchInput), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  /** RAF-throttled hover handler — evita repaints excesivos al pasar el mouse rápido
   * sobre las cards de la collection. Solo el último evento por frame se aplica. */
  const hoverRafRef = useRef<number | null>(null);
  const onHoverCard = useCallback((id: string | null) => {
    if (hoverRafRef.current) cancelAnimationFrame(hoverRafRef.current);
    hoverRafRef.current = requestAnimationFrame(() => {
      setHoverCardId(id);
      hoverRafRef.current = null;
    });
  }, []);

  /** Mobile master scale: el desktop layout 1280×720 se escala vía CSS var
   * --builder-scale calculado por viewport. NO afecta desktop (>900px). */
  useEffect(() => {
    const calcScale = () => {
      if (typeof window === 'undefined') return;
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;
      // Solo aplicar scale si el viewport es mobile-size (<900px o landscape compacto)
      if (viewportW >= 900 && viewportH >= 600) {
        document.documentElement.style.setProperty('--builder-scale', '1');
        return;
      }
      // Pad ~16px de safe-area lateral y ~32px vertical
      const targetW = 1280;
      const targetH = 720;
      const scaleW = (viewportW - 16) / targetW;
      const scaleH = (viewportH - 16) / targetH;
      const scale = Math.max(0.4, Math.min(scaleW, scaleH));
      document.documentElement.style.setProperty('--builder-scale', String(scale));
    };
    calcScale();
    window.addEventListener('resize', calcScale);
    window.addEventListener('orientationchange', calcScale);
    return () => {
      window.removeEventListener('resize', calcScale);
      window.removeEventListener('orientationchange', calcScale);
    };
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [catalog, deck, decksList] = await Promise.all([
        apiFetch<{ count: number; cards: Card[] }>('/cards'),
        editingId
          ? apiFetch<{ id: string; name: string; cards: Array<{ cardId: string; quantity: number; zone: string }> }>(
              `/decks/${editingId}`,
            )
          : Promise.resolve(null),
        apiFetch<{ decks: Array<{ id: string; name: string; isActive: boolean; cards: Array<{ quantity: number }> }> }>('/decks').catch(() => ({ decks: [] })),
      ]);
      setCards(catalog.cards);
      // Reorder decks: active deck first, then by name. Sirve para que el picker dropdown
      // priorice visualmente el deck activo.
      const sortedDecks = [...decksList.decks].sort((a, b) => {
        if (a.isActive && !b.isActive) return -1;
        if (!a.isActive && b.isActive) return 1;
        return a.name.localeCompare(b.name);
      });
      setUserDecks(
        sortedDecks.map((d) => ({
          id: d.id,
          name: d.name,
          isActive: d.isActive,
          cardCount: d.cards.reduce((s, c) => s + c.quantity, 0),
        })),
      );
      if (deck) {
        // Llegó vía ?id= → cargar ese deck explícito.
        setName(deck.name);
        setDeckMain(
          deck.cards
            .filter((c) => c.zone === 'Main')
            .map((c) => ({ cardId: c.cardId, quantity: c.quantity })),
        );
      } else {
        // Sin ?id= → si el user tiene un deck activo, cargarlo por default. Si no, deck nuevo vacío.
        const activeDeck = sortedDecks.find((d) => d.isActive);
        if (activeDeck) {
          try {
            const full = await apiFetch<{ id: string; name: string; cards: Array<{ cardId: string; quantity: number; zone: string }> }>(`/decks/${activeDeck.id}`);
            setCurrentDeckId(activeDeck.id);
            setName(full.name);
            setDeckMain(
              full.cards
                .filter((c) => c.zone === 'Main')
                .map((c) => ({ cardId: c.cardId, quantity: c.quantity })),
            );
            // Mantener URL limpia para que el user pueda compartir/refresh sin perder contexto.
            router.replace(`/decks/builder?id=${activeDeck.id}`);
          } catch {
            // Si falla la carga del activo, dejar deck vacío como fallback.
          }
        }
      }
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function switchToDeck(deckId: string | null) {
    if (dirty && !confirm('Discard unsaved changes to current deck?')) return;
    setDeckPickerOpen(false);
    if (deckId === null) {
      setCurrentDeckId(null);
      setName('My new deck');
      setDeckMain([]);
      setDirty(false);
      router.replace('/decks/builder');
      return;
    }
    try {
      const deck = await apiFetch<{ id: string; name: string; cards: Array<{ cardId: string; quantity: number; zone: string }> }>(`/decks/${deckId}`);
      setCurrentDeckId(deckId);
      setName(deck.name);
      setDeckMain(
        deck.cards
          .filter((c) => c.zone === 'Main')
          .map((c) => ({ cardId: c.cardId, quantity: c.quantity })),
      );
      setDirty(false);
      router.replace(`/decks/builder?id=${deckId}`);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : String(err));
    }
  }

  const cardsById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);

  const mainCount = deckMain.reduce((sum, e) => sum + e.quantity, 0);
  const monsterCount = deckMain.reduce((sum, e) => {
    const c = cardsById.get(e.cardId);
    return c?.type === 'Monster' ? sum + e.quantity : sum;
  }, 0);
  const spellCount = deckMain.reduce((sum, e) => {
    const c = cardsById.get(e.cardId);
    return c?.type === 'Spell' ? sum + e.quantity : sum;
  }, 0);
  const trapCount = deckMain.reduce((sum, e) => {
    const c = cardsById.get(e.cardId);
    return c?.type === 'Trap' ? sum + e.quantity : sum;
  }, 0);
  const isValid = mainCount === DECK_SIZE;

  const filtered = useMemo(() => {
    return cards.filter((c) => {
      if (classFilter !== 'all') {
        if (classFilter === 'Spell' && c.type !== 'Spell') return false;
        if (classFilter === 'Trap' && c.type !== 'Trap') return false;
        const isAxieClass = ['Plant', 'Beast', 'Bug', 'Aquatic', 'Bird', 'Reptile'].includes(classFilter);
        if (isAxieClass && (c.type !== 'Monster' || c.attribute !== classFilter)) return false;
      }
      // Level filter (solo aplica a monsters; spells/traps no tienen level → siempre visibles
      // cuando levelFilter === 'all', invisibles cuando se filtra por estrellas específicas).
      if (levelFilter !== 'all') {
        if (c.type !== 'Monster' || c.level !== levelFilter) return false;
      }
      // Ronin filter: 'ronin' solo muestra NFT minteadas, 'non-ronin' las off-chain.
      // Hoy todas son non-ronin (isNFT=false), así que 'ronin' filter retorna lista vacía →
      // el user ve un mensaje "Coming soon — on-chain Beta".
      if (roninFilter === 'ronin' && !c.isNFT) return false;
      if (roninFilter === 'non-ronin' && c.isNFT) return false;
      if (searchQuery && !c.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [cards, classFilter, levelFilter, roninFilter, searchQuery]);

  // Flatten deck → ordered slots: Monsters first (by level desc), then Spells, then Traps. Each copy is one slot.
  const deckSlots = useMemo(() => {
    const order: Array<{ cardId: string; copyIndex: number }> = [];
    const sortedEntries = [...deckMain].sort((a, b) => {
      const ca = cardsById.get(a.cardId);
      const cb = cardsById.get(b.cardId);
      const typeOrder: Record<string, number> = { Monster: 0, Spell: 1, Trap: 2 };
      const ta = typeOrder[ca?.type ?? ''] ?? 9;
      const tb = typeOrder[cb?.type ?? ''] ?? 9;
      if (ta !== tb) return ta - tb;
      const la = ca?.level ?? 0;
      const lb = cb?.level ?? 0;
      if (la !== lb) return lb - la;
      return (ca?.name ?? '').localeCompare(cb?.name ?? '');
    });
    for (const entry of sortedEntries) {
      for (let i = 0; i < entry.quantity; i++) {
        order.push({ cardId: entry.cardId, copyIndex: i });
      }
    }
    return order;
  }, [deckMain, cardsById]);

  function addCard(cardId: string) {
    setDeckMain((curr) => {
      const total = curr.reduce((s, e) => s + e.quantity, 0);
      if (total >= DECK_SIZE) return curr;
      const existing = curr.find((e) => e.cardId === cardId);
      if (existing) {
        if (existing.quantity >= MAX_COPIES) return curr;
        return curr.map((e) => (e.cardId === cardId ? { ...e, quantity: e.quantity + 1 } : e));
      }
      return [...curr, { cardId, quantity: 1 }];
    });
    setDirty(true);
  }

  function removeCardOne(cardId: string) {
    setDeckMain((curr) => {
      const existing = curr.find((e) => e.cardId === cardId);
      if (!existing) return curr;
      if (existing.quantity <= 1) return curr.filter((e) => e.cardId !== cardId);
      return curr.map((e) => (e.cardId === cardId ? { ...e, quantity: e.quantity - 1 } : e));
    });
    setDirty(true);
  }

  function quantityOf(cardId: string): number {
    return deckMain.find((e) => e.cardId === cardId)?.quantity ?? 0;
  }

  /** Persist el active deck en localStorage para que /play/pve lo lea sin round-trip al api. */
  function persistLocalActiveDeck(): void {
    if (typeof window === 'undefined') return;
    const flatIds: string[] = [];
    for (const e of deckMain) for (let i = 0; i < e.quantity; i++) flatIds.push(e.cardId);
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(flatIds));
    } catch {
      // QuotaExceeded o storage disabled → silenciar (el flujo deckId via API sigue funcionando).
    }
  }

  async function save() {
    if (!isValid) {
      setErrMsg(`Main deck must have exactly ${DECK_SIZE} cards.`);
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
      const path = currentDeckId ? `/decks/${currentDeckId}` : '/decks';
      const method = currentDeckId ? 'PUT' : 'POST';
      const result = await apiFetch<{ id: string }>(path, {
        method,
        body: JSON.stringify(body),
      });
      // localStorage save ahead of redirect so /play/pve reads the latest composition.
      persistLocalActiveDeck();
      setDirty(false);
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

  if (loading) return <BrandedLoadingScreen subtitle="Forging your deck workshop…" />;

  const hoverCard = hoverCardId ? cardsById.get(hoverCardId) : null;

  return (
    <div className="builder3-master">
    <main className="builder3-page">
      {/* Top bar */}
      <header className="builder3-topbar">
        <Link href="/dashboard" className="builder3-back" title="Back to dashboard">←</Link>
        <div className="builder3-deck-picker">
          <button
            type="button"
            className="builder3-deck-picker-btn"
            onClick={() => setDeckPickerOpen((v) => !v)}
            title="Switch deck"
          >
            <span>📋</span>
            <span className="builder3-deck-picker-label">
              {currentDeckId ? userDecks.find((d) => d.id === currentDeckId)?.name ?? 'Editing…' : '+ New deck'}
            </span>
            {currentDeckId && userDecks.find((d) => d.id === currentDeckId)?.isActive ? (
              <span className="builder3-deck-picker-active-badge">⭐ Active</span>
            ) : null}
            {dirty ? <span className="builder3-deck-picker-dirty">●</span> : null}
            <span>▾</span>
          </button>
          {deckPickerOpen ? (
            <div className="builder3-deck-picker-menu">
              <button
                type="button"
                className="builder3-deck-picker-item new"
                onClick={() => switchToDeck(null)}
              >
                ＋ New deck
              </button>
              {userDecks.length === 0 ? (
                <div className="builder3-deck-picker-empty">No saved decks yet.</div>
              ) : (
                userDecks.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    className={`builder3-deck-picker-item ${d.id === currentDeckId ? 'current' : ''}`}
                    onClick={() => switchToDeck(d.id)}
                  >
                    <span>{d.name}</span>
                    <span className="builder3-deck-picker-item-meta">
                      {d.isActive ? '⭐ ' : ''}{d.cardCount} cards
                    </span>
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>
        <input
          className="builder3-name"
          value={name}
          onChange={(e) => { setName(e.target.value); setDirty(true); }}
          placeholder="Deck name"
          maxLength={60}
        />
        <div className={`builder3-counter ${isValid ? 'ok' : mainCount > DECK_SIZE ? 'over' : 'warn'}`}>
          <strong>{mainCount}</strong> / {DECK_SIZE}
        </div>
        <div className="builder3-counter-sub">
          <span title="Axies">🐾 {monsterCount}</span>
          <span title="Spells">✦ {spellCount}</span>
          <span title="Traps">⚠ {trapCount}</span>
        </div>
        <button
          type="button"
          className="builder3-clear"
          onClick={() => { if (confirm('Clear the deck?')) { setDeckMain([]); setDirty(true); } }}
          disabled={deckMain.length === 0}
          title="Clear deck"
        >
          🗑 Clear
        </button>
        <button
          type="button"
          className={`builder3-save ${isValid ? 'ready' : ''}`}
          onClick={save}
          disabled={saving || !isValid}
          title={isValid ? 'Save and set active deck' : `Need exactly ${DECK_SIZE} cards`}
        >
          {saving ? '⏳ Saving…' : isValid ? (currentDeckId ? '💾 UPDATE' : '💾 SAVE') : `⚠ ${DECK_SIZE - mainCount > 0 ? 'Need ' + (DECK_SIZE - mainCount) : 'Over by ' + (mainCount - DECK_SIZE)}`}
        </button>
      </header>

      {errMsg ? <div className="builder3-error">⚠️ {errMsg}</div> : null}

      {/* 2-col layout */}
      <div className="builder3-grid">
        {/* LEFT: Collection */}
        <section className="builder3-collection">
          <div className="builder3-collection-header">
            <span className="builder3-collection-label">📚 Collection ({filtered.length}/{cards.length})</span>
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="🔍 Search by name…"
              className="builder3-search"
            />
          </div>
          <div className="builder3-class-filters">
            {CLASS_FILTERS.map((c) => (
              <button
                key={c}
                type="button"
                className={`builder3-class-chip ${classFilter === c ? 'active' : ''}`}
                onClick={() => setClassFilter(c)}
                style={c !== 'all' ? { borderColor: CLASS_COLORS[c] ?? '#94a3b8' } : undefined}
              >
                {c === 'all' ? 'All' : c}
              </button>
            ))}
          </div>

          {/* Level filter — 1 a 8 estrellas (sólo aplica a Axies/Monsters). */}
          <div className="builder3-class-filters builder3-level-filters">
            <span className="builder3-filter-label">⭐ Level:</span>
            <button
              type="button"
              className={`builder3-class-chip ${levelFilter === 'all' ? 'active' : ''}`}
              onClick={() => setLevelFilter('all')}
              title="Show all levels"
            >
              All
            </button>
            {([1, 2, 3, 4, 5, 6, 7, 8] as const).map((lvl) => (
              <button
                key={lvl}
                type="button"
                className={`builder3-class-chip builder3-level-chip ${levelFilter === lvl ? 'active' : ''}`}
                onClick={() => setLevelFilter(lvl)}
                title={`Show only Level ${lvl} Axies`}
              >
                ⭐{lvl}
              </button>
            ))}
          </div>

          {/* Ronin/On-chain filter — placeholder para Beta. Hoy todas las cartas son off-chain. */}
          <div className="builder3-class-filters builder3-ronin-filters">
            <span className="builder3-filter-label">🔗 Origin:</span>
            <button
              type="button"
              className={`builder3-class-chip ${roninFilter === 'all' ? 'active' : ''}`}
              onClick={() => setRoninFilter('all')}
            >
              All
            </button>
            <button
              type="button"
              className={`builder3-class-chip ${roninFilter === 'non-ronin' ? 'active' : ''}`}
              onClick={() => setRoninFilter('non-ronin')}
              title="Cards from Dust / packs (off-chain)"
            >
              🪙 Off-chain
            </button>
            <button
              type="button"
              className={`builder3-class-chip builder3-ronin-chip ${roninFilter === 'ronin' ? 'active' : ''}`}
              onClick={() => setRoninFilter('ronin')}
              title="Cards minted as NFT on Ronin Network — coming in Beta"
            >
              💎 Ronin NFT
              <span className="builder3-soon-badge">Beta</span>
            </button>
          </div>
          <div className="builder3-collection-grid">
            {filtered.map((c) => {
              const qty = quantityOf(c.id);
              const maxed = qty >= MAX_COPIES;
              const full = mainCount >= DECK_SIZE;
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`builder3-card type-${c.type.toLowerCase()} rarity-${c.rarity} ${maxed || full ? 'unavailable' : ''}`}
                  onClick={() => { if (!maxed && !full) addCard(c.id); }}
                  onMouseEnter={() => onHoverCard(c.id)}
                  onMouseLeave={() => onHoverCard(null)}
                  title={maxed ? `Already ${MAX_COPIES} copies` : full ? 'Deck is full (40)' : `Add ${c.name}`}
                >
                  {/* Class chip top-left */}
                  <span
                    className="builder3-card-class-chip"
                    style={{ background: classColorOf(c) }}
                  >
                    {c.type === 'Monster' ? c.attribute : c.type}
                  </span>
                  {/* Stars top-right */}
                  {c.level !== null ? (
                    <span className="builder3-card-stars" title={`Level ${c.level}`}>
                      ⭐{c.level}
                    </span>
                  ) : null}
                  {/* Image */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={resolveCardImage(c, c.imageUrl)}
                    alt={c.name}
                    loading="lazy"
                    onError={(e) => {
                      const img = e.currentTarget;
                      const fallback = placeholderSvgFor(c);
                      if (img.src !== fallback) img.src = fallback;
                    }}
                  />
                  {/* Name + ATK/DEF */}
                  <div className="builder3-card-info">
                    <div className="builder3-card-name">{c.name}</div>
                    {c.type === 'Monster' && c.atk !== null ? (
                      <div className="builder3-card-stats">{c.atk}/{c.def}</div>
                    ) : null}
                  </div>
                  {/* Quantity badge */}
                  {qty > 0 ? <span className="builder3-card-qty">×{qty}</span> : null}
                </button>
              );
            })}
            {filtered.length === 0 ? (
              <div className="builder3-empty">
                {roninFilter === 'ronin'
                  ? '💎 No Ronin NFT cards yet — minting integration arrives in the Beta phase. Switch to "All" or "🪙 Off-chain" to see your collection.'
                  : 'No cards match your filters.'}
              </div>
            ) : null}
          </div>
        </section>

        {/* RIGHT: Active deck */}
        <section className="builder3-deck">
          <div className="builder3-deck-header">
            <span className="builder3-deck-label">🃏 Active Deck</span>
            <span className={`builder3-deck-progress ${isValid ? 'ok' : ''}`}>
              {mainCount} / {DECK_SIZE}
            </span>
          </div>
          <div className="builder3-deck-bar">
            <div
              className={`builder3-deck-bar-fill ${isValid ? 'ok' : mainCount > DECK_SIZE ? 'over' : 'warn'}`}
              style={{ width: `${Math.min(100, (mainCount / DECK_SIZE) * 100)}%` }}
            />
          </div>
          <div className="builder3-deck-grid">
            {deckSlots.length === 0 ? (
              <div className="builder3-deck-empty">
                <div className="builder3-deck-empty-icon">🃏</div>
                <p>Click cards from your collection to add them.</p>
                <p className="builder3-deck-empty-hint">You need exactly {DECK_SIZE} cards.</p>
              </div>
            ) : (
              deckSlots.map((slot, idx) => {
                const card = cardsById.get(slot.cardId);
                if (!card) return null;
                return (
                  <button
                    key={`${slot.cardId}-${slot.copyIndex}-${idx}`}
                    type="button"
                    className={`builder3-deck-slot type-${card.type.toLowerCase()} rarity-${card.rarity}`}
                    onClick={() => removeCardOne(card.id)}
                    onMouseEnter={() => onHoverCard(card.id)}
                    onMouseLeave={() => onHoverCard(null)}
                    title={`${card.name} — click to remove`}
                  >
                    <span
                      className="builder3-deck-slot-class-chip"
                      style={{ background: classColorOf(card) }}
                    >
                      {card.type === 'Monster' ? (card.attribute?.[0] ?? '?') : card.type[0]}
                    </span>
                    {card.level !== null ? (
                      <span className="builder3-deck-slot-stars">⭐{card.level}</span>
                    ) : null}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={resolveCardImage(card, card.imageUrl)}
                      alt={card.name}
                      loading="lazy"
                      onError={(e) => {
                        const img = e.currentTarget;
                        const fallback = placeholderSvgFor(card);
                        if (img.src !== fallback) img.src = fallback;
                      }}
                    />
                  </button>
                );
              })
            )}
          </div>
        </section>
      </div>

      {/* Hover preview tooltip (fixed bottom-right) */}
      {hoverCard ? (
        <div className="builder3-hover-preview">
          <div className={`builder3-hover-art type-${hoverCard.type.toLowerCase()}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={resolveCardImage(hoverCard, hoverCard.imageUrl)}
              alt={hoverCard.name}
              onError={(e) => {
                const img = e.currentTarget;
                const fallback = placeholderSvgFor(hoverCard);
                if (img.src !== fallback) img.src = fallback;
              }}
            />
          </div>
          <div className="builder3-hover-body">
            <h3>{hoverCard.name}</h3>
            <div className="builder3-hover-tags">
              <span
                className="builder3-hover-class-chip"
                style={{ background: classColorOf(hoverCard) }}
              >
                {hoverCard.type === 'Monster' ? hoverCard.attribute : hoverCard.type}
              </span>
              {hoverCard.level !== null ? <span className="builder3-hover-stars">⭐ Lv {hoverCard.level}</span> : null}
              <span className={`builder3-hover-rarity rarity-${hoverCard.rarity}`}>{hoverCard.rarity}</span>
            </div>
            {hoverCard.type === 'Monster' && hoverCard.atk !== null ? (
              <div className="builder3-hover-stats">
                <span><strong>ATK</strong> {hoverCard.atk}</span>
                <span><strong>DEF</strong> {hoverCard.def}</span>
              </div>
            ) : null}
            <p className="builder3-hover-desc">{hoverCard.description}</p>
            <div className="builder3-hover-actions">
              <span className="builder3-hover-qty">In deck: {quantityOf(hoverCard.id)}/{MAX_COPIES}</span>
            </div>
          </div>
        </div>
      ) : null}
    </main>
    </div>
  );
}
