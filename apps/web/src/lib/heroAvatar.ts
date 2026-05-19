/**
 * heroAvatar — Héroe/avatar personalizable + sistema de marcos por nivel.
 *
 * Estrategia (sin assets externos, sin cambio de schema DB):
 *   - El usuario elige uno de 9 presets temáticos (las 9 clases de Axie).
 *   - Se persiste en el campo `avatarUrl` existente con el esquema centinela
 *     `hero:<presetId>` (ej. `hero:beast`). Valor diminuto, render client-side.
 *   - `resolveAvatar()` distingue: `hero:` → SVG generado · URL http(s) → tal cual.
 *
 * Los MARCOS son función pura del `level` (earned, no elegibles) — `levelTier()`.
 * Mismo enfoque de data-URL SVG que `cardArt.ts`.
 *
 * PHASE 2 (cuando haya acceso a Axie GraphQL API): un preset podrá ser un Axie
 * real del wallet (sprite + parts) y el marco dorado NFT (.my-axies-card-nft)
 * se aplicará como tier especial "NFT-backed". Ver docs/WEB_25_MANIFESTO.md.
 */

export interface HeroPreset {
  id: string;
  label: string;
  /** [centro, borde] del radial gradient — alineado con CLASS_GRADIENT de /my-axies. */
  gradient: [string, string];
  /** Glyph central (emoji de clase). */
  glyph: string;
}

/** 9 presets = 9 clases de Axie Origins. On-theme, cero assets externos. */
export const HERO_PRESETS: HeroPreset[] = [
  { id: 'beast',   label: 'Beast',   gradient: ['#fb923c', '#7a3a0d'], glyph: '🦊' },
  { id: 'plant',   label: 'Plant',   gradient: ['#34d399', '#166534'], glyph: '🌿' },
  { id: 'aqua',    label: 'Aqua',    gradient: ['#22d3ee', '#0e7490'], glyph: '🐠' },
  { id: 'bird',    label: 'Bird',    gradient: ['#f472b6', '#be185d'], glyph: '🐦' },
  { id: 'reptile', label: 'Reptile', gradient: ['#a3e635', '#4d7c0f'], glyph: '🦎' },
  { id: 'bug',     label: 'Bug',     gradient: ['#ef4444', '#991b1b'], glyph: '🐞' },
  { id: 'mech',    label: 'Mech',    gradient: ['#cbd5e1', '#475569'], glyph: '⚙' },
  { id: 'dawn',    label: 'Dawn',    gradient: ['#c084fc', '#6b21a8'], glyph: '✨' },
  { id: 'dusk',    label: 'Dusk',    gradient: ['#5eead4', '#115e59'], glyph: '🌙' },
];

const HERO_BY_ID: Record<string, HeroPreset> = Object.fromEntries(
  HERO_PRESETS.map((p) => [p.id, p]),
);

export const HERO_PRESET_IDS = HERO_PRESETS.map((p) => p.id);

const HERO_SCHEME_RE = /^hero:([a-z0-9-]+)$/;

/** True si el valor guardado es un preset de héroe (esquema centinela). */
export function isHeroAvatar(value: string | null | undefined): boolean {
  return !!value && HERO_SCHEME_RE.test(value);
}

/** Extrae el presetId de un `hero:<id>` válido, o null. */
export function heroPresetId(value: string | null | undefined): string | null {
  const m = value ? HERO_SCHEME_RE.exec(value) : null;
  const id = m?.[1];
  return id && HERO_BY_ID[id] ? id : null;
}

/**
 * Genera un data: URL SVG circular para un preset de héroe.
 * Mismo formato que cardArt.placeholderSvgFor: `data:image/svg+xml;utf8,<enc>`.
 */
export function generateHeroSvg(presetId: string): string {
  const p = HERO_BY_ID[presetId] ?? HERO_PRESETS[0]!;
  const [c1, c2] = p.gradient;
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'>` +
    `<defs>` +
    `<radialGradient id='g' cx='50%' cy='42%'><stop offset='0%' stop-color='${c1}'/><stop offset='100%' stop-color='${c2}'/></radialGradient>` +
    `</defs>` +
    `<circle cx='60' cy='60' r='60' fill='url(#g)'/>` +
    `<circle cx='60' cy='60' r='52' fill='none' stroke='rgba(255,255,255,0.18)' stroke-width='2'/>` +
    `<path d='M60 14 A46 46 0 0 1 106 60' fill='none' stroke='rgba(255,255,255,0.28)' stroke-width='3' stroke-linecap='round'/>` +
    `<circle cx='60' cy='56' r='34' fill='rgba(255,255,255,0.10)'/>` +
    `<text x='60' y='78' font-size='52' text-anchor='middle' font-family='system-ui'>${p.glyph}</text>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Resuelve el valor de avatar a un src usable:
 *  - `hero:<id>` válido → SVG generado (data URL)
 *  - URL http(s)        → tal cual
 *  - otro / null        → null (el caller muestra fallback de inicial)
 */
export function resolveAvatar(value: string | null | undefined): string | null {
  if (!value) return null;
  const pid = heroPresetId(value);
  if (pid) return generateHeroSvg(pid);
  if (/^https?:\/\//i.test(value) || /^data:image\//i.test(value)) return value;
  return null;
}

// ─── Sistema de marcos por nivel (earned, función pura de `level`) ──────────

export interface LevelTier {
  /** 1..5 */
  tier: number;
  name: string;
  /** Clase CSS del marco (definida en globals.css). */
  frameClass: string;
}

const TIERS: ReadonlyArray<{ min: number; tier: number; name: string }> = [
  { min: 12, tier: 5, name: 'Mythic' },
  { min: 8,  tier: 4, name: 'Ascendant' },
  { min: 5,  tier: 3, name: 'Vanguard' },
  { min: 3,  tier: 2, name: 'Ranger' },
  { min: 1,  tier: 1, name: 'Initiate' },
];

/**
 * Mapea nivel de cuenta → tier visual.
 *  L1-2 Initiate · L3-4 Ranger · L5-7 Vanguard · L8-11 Ascendant · L12+ Mythic
 * Niveles < 1 se tratan como 1.
 */
export function levelTier(level: number | null | undefined): LevelTier {
  const lvl = Math.max(1, Math.floor(level ?? 1));
  const found = TIERS.find((t) => lvl >= t.min)!; // siempre matchea (min:1)
  return { tier: found.tier, name: found.name, frameClass: `hero-frame-t${found.tier}` };
}

/**
 * Tier del marco para el oponente bot, derivado de la dificultad PvE
 * (Easy=Rookie, Normal=Veteran, Hard=Master). Coherencia temática gratis.
 */
export function tierForDifficulty(difficulty: 'Easy' | 'Normal' | 'Hard'): LevelTier {
  const map: Record<'Easy' | 'Normal' | 'Hard', { tier: number; name: string }> = {
    Easy:   { tier: 1, name: 'Rookie Bot' },
    Normal: { tier: 3, name: 'Veteran Bot' },
    Hard:   { tier: 5, name: 'Master Bot' },
  };
  const m = map[difficulty];
  return { tier: m.tier, name: m.name, frameClass: `hero-frame-t${m.tier}` };
}
