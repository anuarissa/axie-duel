'use client';

/**
 * Massive card preview overlay — full-screen modal con todos los detalles de una card.
 *
 * Usado por:
 * - /play/pve: tap-and-hold sobre carta del field/hand → muestra preview con stats efectivos (atkMod + auraAtkBonus).
 * - /decks/builder: tap en botón 🔍 sobre cada card en mobile → preview con stats base (sin mods).
 *
 * Cierra con: tap fuera del card, click en ✕, tecla Escape.
 */

import { useEffect } from 'react';
import { placeholderSvgFor as svgForCard, resolveCardImage } from '../lib/cardArt';

export interface PreviewCardDef {
  id?: string;
  name: string;
  type: 'Monster' | 'Spell' | 'Trap';
  subType?: string | null;
  rarity?: string;
  attribute?: string | null;
  level?: number | null;
  atk?: number | null;
  def?: number | null;
  description?: string;
  effectKind?: string;
  effectDescription?: string;
  spellSpeed?: number;
  imageUrl?: string;
}

export interface PreviewCardMods {
  atkMod?: number;
  defMod?: number;
  auraAtkBonus?: number;
  auraDefBonus?: number;
}

function displayType(t: string): string {
  return t === 'Monster' ? 'AXIE' : t.toUpperCase();
}

export function CardPreviewOverlay({
  def,
  cardId,
  mods,
  onClose,
}: {
  def: PreviewCardDef;
  cardId: string;
  mods?: PreviewCardMods;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isMonster = def.type === 'Monster';
  const tributesNeeded = isMonster ? ((def.level ?? 0) <= 4 ? 0 : (def.level ?? 0) <= 6 ? 1 : 2) : 0;
  const type = def.type.toLowerCase();
  const attrClass = def.attribute ? `attr-${def.attribute.toLowerCase()}` : '';

  const atkMod = mods?.atkMod ?? 0;
  const defMod = mods?.defMod ?? 0;
  const auraAtk = mods?.auraAtkBonus ?? 0;
  const auraDef = mods?.auraDefBonus ?? 0;

  return (
    <div className="tcg-preview-overlay" onClick={onClose}>
      <button
        type="button"
        className="tcg-preview-close"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        title="Close (Esc)"
        aria-label="Close preview"
      >
        ✕
      </button>
      <div className={`tcg-preview-card tcg-card ${type} ${attrClass}`} onClick={(e) => e.stopPropagation()}>
        <div className="tcg-preview-header">
          <span className={`tcg-preview-rarity rarity-${def.rarity?.toLowerCase() ?? 'common'}`}>
            {def.rarity ?? 'Common'}
          </span>
          <span className="tcg-preview-typetag">{displayType(def.type)}{def.subType ? ` · ${def.subType}` : ''}</span>
        </div>
        <div className="tcg-preview-art">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={resolveCardImage({ ...def, id: cardId }, def.imageUrl)}
            alt={def.name}
            className="tcg-preview-art-img"
            onError={(e) => {
              const img = e.currentTarget;
              const fallback = svgForCard({ ...def, id: cardId });
              if (img.src !== fallback) img.src = fallback;
            }}
          />
        </div>
        <div className="tcg-preview-info">
          <h2 className="tcg-preview-name">{def.name}</h2>
          {isMonster && def.level ? (
            <div className="tcg-preview-stars">
              {'★'.repeat(Math.min(def.level, 8))} <span className="tcg-preview-level">L{def.level}</span>
            </div>
          ) : null}
          {def.attribute ? <div className="tcg-preview-attr">{def.attribute}</div> : null}
          {isMonster ? (
            <div className="tcg-preview-statgrid">
              <div><span>ATK</span><strong>{(def.atk ?? 0) + atkMod + auraAtk}</strong></div>
              <div><span>DEF</span><strong>{(def.def ?? 0) + defMod + auraDef}</strong></div>
              <div><span>Burns</span><strong>{tributesNeeded}</strong></div>
            </div>
          ) : null}
          {def.spellSpeed ? (
            <div className="tcg-preview-row">
              <span>Spell Speed</span><strong>{def.spellSpeed}</strong>
            </div>
          ) : null}
          {def.description ? <p className="tcg-preview-desc">{def.description}</p> : null}
          {def.effectDescription && def.effectDescription !== def.description ? (
            <div className="tcg-preview-effect">
              <strong>Effect ({def.effectKind ?? '—'}):</strong> {def.effectDescription}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
