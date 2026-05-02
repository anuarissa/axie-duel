/**
 * Tipos de Axie. Reflejan el shape del API GraphQL público de Axie Infinity.
 * Source: https://graphql-gateway.axieinfinity.com/graphql
 */

export type AxieClass =
  | 'Beast'
  | 'Aquatic'
  | 'Plant'
  | 'Bird'
  | 'Bug'
  | 'Reptile'
  | 'Dawn'
  | 'Dusk'
  | 'Mech';

export type AxiePartType = 'eyes' | 'ears' | 'mouth' | 'horn' | 'back' | 'tail';

export type AxieStage = 1 | 2 | 3 | 4;

export interface AxieAbility {
  id: string;
  name: string;
  attack: number;
  defense: number;
  energy: number;
  description: string;
  backgroundUrl?: string;
  effectIconUrl?: string;
}

export interface AxiePart {
  id: string;
  name: string;
  class: AxieClass;
  type: AxiePartType;
  specialGenes?: string;
  stage: AxieStage;
  abilities: AxieAbility[];
}

export interface AxieStats {
  hp: number;
  speed: number;
  skill: number;
  morale: number;
}

export interface Axie {
  id: string;
  name: string;
  class: AxieClass;
  image: string;
  stats: AxieStats;
  parts: AxiePart[];
  /** Marca interna: si proviene de un NFT real (true) o es Starter generado (false). */
  isNFT: boolean;
  /** tokenId del NFT en Ronin si aplica. */
  tokenId?: string;
}
