/**
 * cardArt — Genera SVG inline (data URL) para usar como `imageUrl` de cualquier carta.
 *
 * Estrategia:
 *   1. Si la carta tiene un override por id (ver `CARD_SVG_BODIES`) → SVG temático específico.
 *      Ej: spl_001 Single Combat → cruzadas espadas naranjas sobre rojo-tierra.
 *   2. Si no, fallback genérico: gradient por clase Axie + emoji glyph.
 *
 * Usado por:
 *   - apps/web/src/app/play/pve/page.tsx (en hover/preview de cartas + onError de <img>)
 *   - apps/web/src/app/decks/builder/page.tsx (preview, deck slots, inventory grid)
 *   - apps/web/src/app/cards/page.tsx (catálogo)
 *
 * Se aplica vía:
 *   <img src={imageUrl} onError={(e) => { e.currentTarget.src = placeholderSvgFor(def); }} />
 *   o directamente cuando `isPlaceholderUrl(imageUrl) === true` (skip network round-trip).
 */

export interface CardArtInfo {
  id?: string;
  name: string;
  type: 'Monster' | 'Spell' | 'Trap';
  attribute?: string | null;
}

const ATTR_COLORS: Record<string, [string, string]> = {
  Plant:    ['#3a8838', '#1f5d3a'],
  Beast:    ['#d4621a', '#7a3a0d'],
  Aqua:     ['#1a7bc4', '#0d3d6a'],
  Aquatic:  ['#1a7bc4', '#0d3d6a'],
  Bird:     ['#ff6b9d', '#b85585'],
  Reptile:  ['#7da93a', '#3d5e1c'],
  Bug:      ['#ef4444', '#7f1d1d'],
  Mech:     ['#cbd5e1', '#475569'],
  Dawn:     ['#c084fc', '#5b21b6'],
  Dusk:     ['#5eead4', '#0f766e'],
};

const ATTR_GLYPHS: Record<string, string> = {
  Plant: '🌿', Beast: '🦊', Aqua: '🐠', Aquatic: '🐠',
  Bird: '🐦', Reptile: '🦎', Bug: '🦋', Mech: '⚙', Dawn: '✨', Dusk: '🌙',
};

type SvgBodyBuilder = () => string;

/**
 * Override per-card-id: cada Spell/Trap tiene SVG inline temático.
 * Si querés agregar más cartas, añade un entry { gradient, body }.
 */
const CARD_SVG_BODIES: Record<string, { gradient: [string, string]; body: SvgBodyBuilder }> = {
  // ── Spells ──────────────────────────────────────────────────────────
  spl_001: {
    // Single Combat (Beast Quick-Play): cruzadas espadas naranjas
    gradient: ['#7a2d12', '#3d1208'],
    body: () => `
      <g transform='translate(100,95)'>
        <line x1='-32' y1='-32' x2='32' y2='32' stroke='#fbbf24' stroke-width='6' stroke-linecap='round'/>
        <line x1='32' y1='-32' x2='-32' y2='32' stroke='#fbbf24' stroke-width='6' stroke-linecap='round'/>
        <circle r='6' fill='#7a2d12' stroke='#fbbf24' stroke-width='3'/>
      </g>`,
  },
  spl_002: {
    // Verdant Renewal (Plant Normal): hoja con círculo de regeneración
    gradient: ['#1f5d3a', '#0a2e1a'],
    body: () => `
      <g transform='translate(100,90)'>
        <circle r='42' fill='none' stroke='#34d399' stroke-width='3' stroke-dasharray='6 4'/>
        <path d='M0,-30 C-22,-15 -22,15 0,30 C22,15 22,-15 0,-30 Z' fill='#34d399'/>
        <line x1='0' y1='-30' x2='0' y2='30' stroke='#0a2e1a' stroke-width='2'/>
      </g>`,
  },
  spl_003: {
    // Tide Surge (Aqua Continuous): ola estilizada cyan
    gradient: ['#0d3d6a', '#0a1e3a'],
    body: () => `
      <g transform='translate(100,100)'>
        <path d='M-60,15 Q-30,-15 0,5 Q30,25 60,-5 L60,30 L-60,30 Z' fill='#22d3ee' opacity='0.85'/>
        <path d='M-60,5 Q-30,-25 0,-5 Q30,15 60,-15' fill='none' stroke='#67e8f9' stroke-width='3'/>
      </g>`,
  },
  spl_004: {
    // Sky Mavis Field (Legendary Field): torii sobre cielo dorado
    gradient: ['#fbbf24', '#7c2d12'],
    body: () => `
      <g transform='translate(100,100)' stroke='#1a0a05' stroke-width='3' fill='#7c2d12'>
        <rect x='-44' y='-40' width='88' height='6' rx='2'/>
        <rect x='-40' y='-30' width='80' height='8' rx='2'/>
        <rect x='-30' y='-22' width='6' height='50'/>
        <rect x='24' y='-22' width='6' height='50'/>
        <rect x='-32' y='-12' width='64' height='4'/>
      </g>`,
  },
  spl_005: {
    // Lunacian Blessing (Equip): luna creciente con haz púrpura
    gradient: ['#3a1a4a', '#1a0a25'],
    body: () => `
      <g transform='translate(100,90)'>
        <circle r='40' fill='#fef9c3'/>
        <circle cx='14' r='40' fill='#3a1a4a'/>
        <g opacity='0.6' stroke='#c084fc' stroke-width='2'>
          <line x1='-50' y1='50' x2='-22' y2='22'/>
          <line x1='0' y1='60' x2='0' y2='42'/>
          <line x1='50' y1='50' x2='22' y2='22'/>
        </g>
      </g>`,
  },
  // ── Traps ───────────────────────────────────────────────────────────
  trp_001: {
    // Poison Backlash: gota verde con calavera
    gradient: ['#3a0a3a', '#1a051a'],
    body: () => `
      <g transform='translate(100,90)'>
        <path d='M0,-40 C-20,-10 -25,10 -25,20 A25,25 0 0,0 25,20 C25,10 20,-10 0,-40 Z' fill='#84cc16'/>
        <circle cx='-7' cy='10' r='3' fill='#1a051a'/>
        <circle cx='7' cy='10' r='3' fill='#1a051a'/>
        <path d='M-6,20 Q0,24 6,20' stroke='#1a051a' stroke-width='2' fill='none'/>
      </g>`,
  },
  trp_002: {
    // Mirror Web: telaraña simétrica
    gradient: ['#1a1a3a', '#0a0a1a'],
    body: () => `
      <g transform='translate(100,95)' stroke='#a5b4fc' stroke-width='1.5' fill='none'>
        <line x1='0' y1='-40' x2='0' y2='40'/>
        <line x1='-40' y1='0' x2='40' y2='0'/>
        <line x1='-28' y1='-28' x2='28' y2='28'/>
        <line x1='28' y1='-28' x2='-28' y2='28'/>
        <circle r='12'/><circle r='22'/><circle r='32'/>
      </g>`,
  },
  trp_003: {
    // Webbed Roots: raíces enredadas verdes
    gradient: ['#0a3a0a', '#051a05'],
    body: () => `
      <g transform='translate(100,100)' stroke='#65a30d' stroke-width='3' fill='none' stroke-linecap='round'>
        <path d='M-50,-30 Q-20,0 -40,30'/>
        <path d='M-30,-40 Q0,-10 -20,30'/>
        <path d='M0,-40 Q20,0 0,30'/>
        <path d='M30,-40 Q0,-10 20,30'/>
        <path d='M50,-30 Q20,0 40,30'/>
      </g>`,
  },
  trp_004: {
    // Lunacian Counterstrike: rayo amarillo
    gradient: ['#3a1a1a', '#1a0808'],
    body: () => `
      <g transform='translate(100,95)'>
        <path d='M-15,-40 L10,-5 L-5,0 L20,40 L-5,10 L10,5 Z' fill='#fbbf24' stroke='#7c2d12' stroke-width='2'/>
      </g>`,
  },
  trp_005: {
    // Lethal Strike: puñal rojo/plata
    gradient: ['#4a0a0a', '#1a0303'],
    body: () => `
      <g transform='translate(100,90)'>
        <path d='M0,-40 L8,30 L0,40 L-8,30 Z' fill='#cbd5e1' stroke='#475569' stroke-width='1.5'/>
        <rect x='-12' y='30' width='24' height='6' fill='#7c2d12' stroke='#3a1208' stroke-width='1.5'/>
        <rect x='-3' y='36' width='6' height='20' fill='#7c2d12' stroke='#3a1208' stroke-width='1.5'/>
      </g>`,
  },
  trp_006: {
    // Chimera Roost: cluster de 3 huevos coloridos sobre un nido
    gradient: ['#2a1a3a', '#0a0515'],
    body: () => `
      <g transform='translate(100,95)'>
        <ellipse cx='0' cy='28' rx='55' ry='12' fill='#7c2d12' opacity='0.75'/>
        <ellipse cx='-22' cy='10' rx='14' ry='20' fill='#fbbf24'/>
        <ellipse cx='0' cy='2' rx='15' ry='22' fill='#34d399'/>
        <ellipse cx='22' cy='10' rx='14' ry='20' fill='#22d3ee'/>
        <line x1='-50' y1='25' x2='-30' y2='35' stroke='#3a1208' stroke-width='2'/>
        <line x1='50' y1='25' x2='30' y2='35' stroke='#3a1208' stroke-width='2'/>
      </g>`,
  },
  // ── Spells (continued) ──────────────────────────────────────────────
  spl_006: {
    // Lunacian Heal: cruz curativa con glow púrpura/cyan
    gradient: ['#1a3a4a', '#0a1a25'],
    body: () => `
      <g transform='translate(100,95)'>
        <circle r='44' fill='none' stroke='#22d3ee' stroke-width='2' opacity='0.6'/>
        <rect x='-10' y='-30' width='20' height='60' rx='3' fill='#5eead4'/>
        <rect x='-30' y='-10' width='60' height='20' rx='3' fill='#5eead4'/>
        <circle r='6' fill='#fef9c3'/>
      </g>`,
  },
};

/** Genera un data: URL SVG temático para una carta. */
export function placeholderSvgFor(def: CardArtInfo): string {
  if (def.id && CARD_SVG_BODIES[def.id]) {
    const tpl = CARD_SVG_BODIES[def.id]!;
    const [c1, c2] = tpl.gradient;
    const shortName = def.name.split(',')[0]?.split(' ').slice(0, 2).join(' ') ?? def.name.slice(0, 12);
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><defs><radialGradient id='g' cx='50%' cy='40%'><stop offset='0%' stop-color='${c1}'/><stop offset='100%' stop-color='${c2}'/></radialGradient></defs><rect width='200' height='200' fill='url(#g)'/>${tpl.body()}<text x='100' y='180' font-size='15' text-anchor='middle' fill='white' font-family='system-ui' font-weight='800'>${shortName}</text></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }
  const [c1, c2] = ATTR_COLORS[def.attribute ?? 'Plant'] ?? ['#8C5DF6', '#3a1a4a'];
  const glyph = def.type === 'Spell' ? '✦' : def.type === 'Trap' ? '⚠' : (ATTR_GLYPHS[def.attribute ?? ''] ?? '🐾');
  const shortName = def.name.split(',')[0]?.split(' ')[0] ?? def.name.slice(0, 8);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><defs><radialGradient id='g' cx='50%' cy='40%'><stop offset='0%' stop-color='${c1}'/><stop offset='100%' stop-color='${c2}'/></radialGradient></defs><rect width='200' height='200' fill='url(#g)'/><circle cx='100' cy='90' r='55' fill='rgba(255,255,255,0.1)'/><text x='100' y='115' font-size='80' text-anchor='middle' font-family='system-ui'>${glyph}</text><text x='100' y='180' font-size='18' text-anchor='middle' fill='white' font-family='system-ui' font-weight='800'>${shortName}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** True si el `imageUrl` apunta a un servicio placeholder externo (placehold.co etc).
 *  Útil para skipear el network request y usar directamente el SVG inline. */
export function isPlaceholderUrl(url: string | undefined | null): boolean {
  if (!url) return true;
  return url.includes('placehold.co') || url.includes('via.placeholder');
}

/** Devuelve un imageUrl utilizable: si el original es placeholder externo, retorna el SVG inline.
 *  Si no, retorna el original. */
export function resolveCardImage(def: CardArtInfo, imageUrl: string | undefined | null): string {
  if (isPlaceholderUrl(imageUrl)) return placeholderSvgFor(def);
  return imageUrl as string;
}
