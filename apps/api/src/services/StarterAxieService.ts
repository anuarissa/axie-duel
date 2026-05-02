/**
 * Genera Axies "Starter" (no-NFT) para nuevos usuarios al registrarse.
 * Master prompt sección 5.1: cada jugador Free recibe 3 mazos starter
 * (Beast, Aquatic, Plant) con configuraciones de partes pre-definidas.
 *
 * NOTA: los Starter NO se mintaran nunca como NFT — son data en DB.
 */

import type { Axie, AxieClass } from '@axie-duel/shared-types';

interface StarterTemplate {
  axieClass: AxieClass;
  name: string;
  stats: { hp: number; speed: number; skill: number; morale: number };
  partIds: { eyes: string; ears: string; mouth: string; horn: string; back: string; tail: string };
}

// 3 templates pre-definidos. Stats base balanceadas (~total 200, nivel ~10-11 con la heurística).
const STARTERS: StarterTemplate[] = [
  {
    axieClass: 'Beast',
    name: 'Starter Beast',
    stats: { hp: 35, speed: 50, skill: 45, morale: 40 },
    partIds: {
      eyes: 'eyes_beast_starter',
      ears: 'ears_beast_starter',
      mouth: 'mouth_beast_starter',
      horn: 'horn_beast_starter',
      back: 'back_beast_starter',
      tail: 'tail_beast_starter',
    },
  },
  {
    axieClass: 'Aquatic',
    name: 'Starter Aquatic',
    stats: { hp: 45, speed: 55, skill: 35, morale: 35 },
    partIds: {
      eyes: 'eyes_aqua_starter',
      ears: 'ears_aqua_starter',
      mouth: 'mouth_aqua_starter',
      horn: 'horn_aqua_starter',
      back: 'back_aqua_starter',
      tail: 'tail_aqua_starter',
    },
  },
  {
    axieClass: 'Plant',
    name: 'Starter Plant',
    stats: { hp: 60, speed: 30, skill: 35, morale: 45 },
    partIds: {
      eyes: 'eyes_plant_starter',
      ears: 'ears_plant_starter',
      mouth: 'mouth_plant_starter',
      horn: 'horn_plant_starter',
      back: 'back_plant_starter',
      tail: 'tail_plant_starter',
    },
  },
];

export class StarterAxieService {
  generateStartersForUser(userId: string): Axie[] {
    return STARTERS.map((template, idx) => this.makeStarter(userId, template, idx));
  }

  private makeStarter(userId: string, t: StarterTemplate, idx: number): Axie {
    return {
      id: `starter_${userId}_${idx}`,
      name: t.name,
      class: t.axieClass,
      image: `https://placehold.co/420x420/1a1a1a/ffffff?text=${encodeURIComponent(t.name)}`,
      stats: t.stats,
      parts: (Object.entries(t.partIds) as Array<[keyof typeof t.partIds, string]>).map(([type, id]) => ({
        id,
        name: id,
        class: t.axieClass,
        type,
        stage: 2 as const,
        abilities: [],
      })),
      isNFT: false,
    };
  }
}

export const starterAxieService = new StarterAxieService();
