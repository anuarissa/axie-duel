import { describe, expect, it } from 'vitest';
import {
  HERO_PRESETS,
  HERO_PRESET_IDS,
  isHeroAvatar,
  heroPresetId,
  generateHeroSvg,
  resolveAvatar,
  levelTier,
  tierForDifficulty,
} from '../../../apps/web/src/lib/heroAvatar.js';

/**
 * Tests for the hero avatar + level-tier-frame system.
 * Lives here (not apps/web) to reuse the existing vitest setup — same pattern
 * as axie-card-algorithm.test.ts. Tests don't ship with the package.
 */

describe('HERO_PRESETS', () => {
  it('has exactly 9 presets (the 9 Axie classes)', () => {
    expect(HERO_PRESETS).toHaveLength(9);
    expect(HERO_PRESET_IDS).toEqual([
      'beast', 'plant', 'aqua', 'bird', 'reptile', 'bug', 'mech', 'dawn', 'dusk',
    ]);
  });

  it('every preset has id, label, 2-stop gradient and a glyph', () => {
    for (const p of HERO_PRESETS) {
      expect(p.id).toMatch(/^[a-z]+$/);
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.gradient).toHaveLength(2);
      expect(p.gradient[0]).toMatch(/^#[0-9a-f]{6}$/i);
      expect(p.glyph.length).toBeGreaterThan(0);
    }
  });
});

describe('isHeroAvatar / heroPresetId', () => {
  it('recognizes valid hero: scheme', () => {
    expect(isHeroAvatar('hero:beast')).toBe(true);
    expect(heroPresetId('hero:beast')).toBe('beast');
    expect(heroPresetId('hero:dusk')).toBe('dusk');
  });

  it('rejects unknown preset ids even with hero: prefix', () => {
    expect(heroPresetId('hero:dragon')).toBeNull();
    expect(heroPresetId('hero:')).toBeNull();
  });

  it('rejects plain URLs and null', () => {
    expect(isHeroAvatar('https://example.com/a.png')).toBe(false);
    expect(isHeroAvatar(null)).toBe(false);
    expect(isHeroAvatar(undefined)).toBe(false);
    expect(isHeroAvatar('')).toBe(false);
  });
});

describe('generateHeroSvg', () => {
  it('returns a data:image/svg+xml URL containing the preset glyph', () => {
    const url = generateHeroSvg('beast');
    expect(url.startsWith('data:image/svg+xml;utf8,')).toBe(true);
    // glyph is URL-encoded inside; decode and check the SVG markup
    const decoded = decodeURIComponent(url.replace('data:image/svg+xml;utf8,', ''));
    expect(decoded).toContain('<svg');
    expect(decoded).toContain('🦊'); // beast glyph
    expect(decoded).toContain('radialGradient');
  });

  it('falls back to first preset for an unknown id (no throw)', () => {
    const url = generateHeroSvg('does-not-exist');
    expect(url.startsWith('data:image/svg+xml;utf8,')).toBe(true);
  });
});

describe('resolveAvatar', () => {
  it('hero: scheme → generated SVG data URL', () => {
    const r = resolveAvatar('hero:plant');
    expect(r).not.toBeNull();
    expect(r!.startsWith('data:image/svg+xml;utf8,')).toBe(true);
  });

  it('http(s) URL → passthrough unchanged', () => {
    const u = 'https://lh3.googleusercontent.com/a/abc';
    expect(resolveAvatar(u)).toBe(u);
  });

  it('data:image URL → passthrough unchanged', () => {
    const d = 'data:image/png;base64,iVBORw0KGgo=';
    expect(resolveAvatar(d)).toBe(d);
  });

  it('null / empty / junk → null (caller shows letter fallback)', () => {
    expect(resolveAvatar(null)).toBeNull();
    expect(resolveAvatar('')).toBeNull();
    expect(resolveAvatar('hero:nope')).toBeNull();
    expect(resolveAvatar('javascript:alert(1)')).toBeNull();
  });
});

describe('levelTier — boundaries', () => {
  it('maps each level range to the correct tier', () => {
    expect(levelTier(1)).toMatchObject({ tier: 1, name: 'Initiate', frameClass: 'hero-frame-t1' });
    expect(levelTier(2).tier).toBe(1);
    expect(levelTier(3)).toMatchObject({ tier: 2, name: 'Ranger' });
    expect(levelTier(4).tier).toBe(2);
    expect(levelTier(5)).toMatchObject({ tier: 3, name: 'Vanguard' });
    expect(levelTier(7).tier).toBe(3);
    expect(levelTier(8)).toMatchObject({ tier: 4, name: 'Ascendant' });
    expect(levelTier(11).tier).toBe(4);
    expect(levelTier(12)).toMatchObject({ tier: 5, name: 'Mythic', frameClass: 'hero-frame-t5' });
    expect(levelTier(999).tier).toBe(5);
  });

  it('clamps level < 1 (and null/undefined) to tier 1', () => {
    expect(levelTier(0).tier).toBe(1);
    expect(levelTier(-5).tier).toBe(1);
    expect(levelTier(null).tier).toBe(1);
    expect(levelTier(undefined).tier).toBe(1);
  });

  it('floors fractional levels', () => {
    expect(levelTier(4.9).tier).toBe(2); // 4.9 → 4 → Ranger
    expect(levelTier(5.0).tier).toBe(3);
  });
});

describe('tierForDifficulty (opponent bot)', () => {
  it('Easy→t1, Normal→t3, Hard→t5', () => {
    expect(tierForDifficulty('Easy')).toMatchObject({ tier: 1, frameClass: 'hero-frame-t1' });
    expect(tierForDifficulty('Normal').tier).toBe(3);
    expect(tierForDifficulty('Hard')).toMatchObject({ tier: 5, frameClass: 'hero-frame-t5' });
  });
});
