/**
 * Cliente del API GraphQL público de Axie Infinity.
 * Endpoint: https://graphql-gateway.axieinfinity.com/graphql
 *
 * - Cachea respuestas en Redis con TTL 1h (los datos del Axie no cambian).
 * - Maneja rate limiting con backoff exponencial (3 reintentos).
 */

import { GraphQLClient, gql } from 'graphql-request';
import { config } from '../config.js';
import { redis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';
import type { Axie } from '@axie-duel/shared-types';

const CACHE_TTL_SECONDS = 3600; // 1h
const RETRY_DELAYS_MS = [500, 1500, 4000];

const client = new GraphQLClient(config.AXIE_GRAPHQL_URL, {
  headers: { 'Content-Type': 'application/json' },
});

const GET_AXIE_DETAIL = gql`
  query GetAxieDetail($axieId: ID!) {
    axie(axieId: $axieId) {
      id
      name
      class
      image
      stats {
        hp
        speed
        skill
        morale
      }
      parts {
        id
        name
        class
        type
        specialGenes
        stage
        abilities {
          id
          name
          attack
          defense
          energy
          description
          backgroundUrl
          effectIconUrl
        }
      }
    }
  }
`;

const GET_AXIES_BY_OWNER = gql`
  query GetAxiesByOwner($owner: String!, $size: Int!, $from: Int!) {
    axies(owner: $owner, size: $size, from: $from) {
      total
      results {
        id
        name
        class
        image
        stats {
          hp
          speed
          skill
          morale
        }
        parts {
          id
          name
          class
          type
          specialGenes
          stage
        }
      }
    }
  }
`;

interface AxieRaw {
  id: string;
  name: string | null;
  class: string;
  image: string;
  stats: { hp: number; speed: number; skill: number; morale: number };
  parts: Array<{
    id: string;
    name: string;
    class: string;
    type: string;
    specialGenes: string | null;
    stage: number;
    abilities?: Array<{
      id: string;
      name: string;
      attack: number;
      defense: number;
      energy: number;
      description: string;
      backgroundUrl?: string;
      effectIconUrl?: string;
    }>;
  }>;
}

function rawToAxie(raw: AxieRaw, isNFT = true, tokenId?: string): Axie {
  return {
    id: raw.id,
    name: raw.name ?? `Axie #${raw.id}`,
    class: raw.class as Axie['class'],
    image: raw.image,
    stats: raw.stats,
    parts: raw.parts.map((p) => ({
      id: p.id,
      name: p.name,
      class: p.class as Axie['class'],
      type: p.type as Axie['parts'][0]['type'],
      ...(p.specialGenes ? { specialGenes: p.specialGenes } : {}),
      stage: p.stage as 1 | 2 | 3 | 4,
      abilities: p.abilities ?? [],
    })),
    isNFT,
    ...(tokenId ? { tokenId } : {}),
  };
}

async function withRetry<T>(fn: () => Promise<T>, ctx: string): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= RETRY_DELAYS_MS.length; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < RETRY_DELAYS_MS.length) {
        const delay = RETRY_DELAYS_MS[i] ?? 1000;
        logger.warn({ err, ctx, delay }, 'AxieGraphQL retry');
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

export class AxieGraphQLService {
  async getAxieById(axieId: string): Promise<Axie | null> {
    const cacheKey = `axie:detail:${axieId}`;
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as Axie;

    const data = await withRetry(
      () => client.request<{ axie: AxieRaw | null }>(GET_AXIE_DETAIL, { axieId }),
      `getAxieById ${axieId}`,
    );
    if (!data.axie) return null;

    const axie = rawToAxie(data.axie, true, axieId);
    await redis.set(cacheKey, JSON.stringify(axie), 'EX', CACHE_TTL_SECONDS);
    return axie;
  }

  async getAxiesByOwner(owner: string, size = 50, from = 0): Promise<{ total: number; axies: Axie[] }> {
    const cacheKey = `axie:owner:${owner.toLowerCase()}:${size}:${from}`;
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as { total: number; axies: Axie[] };

    const data = await withRetry(
      () =>
        client.request<{ axies: { total: number; results: AxieRaw[] } }>(GET_AXIES_BY_OWNER, {
          owner,
          size,
          from,
        }),
      `getAxiesByOwner ${owner}`,
    );

    const result = {
      total: data.axies.total,
      axies: data.axies.results.map((r) => rawToAxie(r, true, r.id)),
    };
    await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL_SECONDS);
    return result;
  }
}

export const axieGraphQLService = new AxieGraphQLService();
