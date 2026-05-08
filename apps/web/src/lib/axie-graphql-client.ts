/**
 * Axie GraphQL Gateway client — read-only queries to fetch Axies by owner.
 *
 * Public endpoint: https://graphql-gateway.axieinfinity.com/graphql
 * No auth required for `axies` query (rate-limited).
 *
 * For demo mode (without wallet), we ship a small set of preset example Axies
 * so Sky Mavis evaluators can see the algorithm in action without connecting
 * a wallet. Real wallets fetch live data.
 */

import type { AxieInput, AxiePart, AxieClass } from './axie-card-algorithm';

const AXIE_GQL_URL =
  process.env.NEXT_PUBLIC_AXIE_GQL_URL ?? 'https://graphql-gateway.axieinfinity.com/graphql';

const AXIES_BY_OWNER_QUERY = `
  query GetAxiesByOwner($owner: String!, $size: Int = 24) {
    axies(owner: $owner, from: 0, size: $size, sort: IdDesc) {
      results {
        id
        class
        birthDate
        level
        parts {
          id
          name
          class
          type
          specialGenes
        }
      }
      total
    }
  }
`;

interface RawPart {
  id: string;
  name: string;
  class: string;
  type: string;
  specialGenes?: string | null;
}

interface RawAxie {
  id: string | number;
  class: string;
  birthDate?: number;
  level?: number;
  parts: RawPart[];
}

interface AxiesQueryResponse {
  data?: {
    axies?: {
      results?: RawAxie[];
      total?: number;
    };
  };
  errors?: Array<{ message: string }>;
}

/** Normalize raw part type ('Eyes', 'Mouth') to lowercase ('eyes', 'mouth'). */
function normalizePartType(type: string): AxiePart['type'] {
  const lc = type.toLowerCase().trim();
  if (lc === 'eyes' || lc === 'ears' || lc === 'mouth' || lc === 'horn' || lc === 'back' || lc === 'tail') {
    return lc;
  }
  // Fallback for unexpected types
  return 'eyes';
}

function normalizeClass(c: string): AxieClass {
  const cap = (c ?? '').charAt(0).toUpperCase() + (c ?? '').slice(1).toLowerCase();
  const valid: AxieClass[] = ['Beast', 'Aqua', 'Plant', 'Bird', 'Reptile', 'Bug', 'Mech', 'Dawn', 'Dusk'];
  return (valid.includes(cap as AxieClass) ? cap : 'Beast') as AxieClass;
}

function rawAxieToInput(raw: RawAxie): AxieInput {
  const parts: AxiePart[] = (raw.parts ?? []).map((p) => ({
    type: normalizePartType(p.type),
    id: (p.id ?? '').replace(/^(eyes|ears|mouth|horn|back|tail)-/, '').toLowerCase(),
    class: normalizeClass(p.class),
    rarityTier: p.specialGenes ? 3 : 1,
  }));

  const result: AxieInput = {
    tokenId: String(raw.id),
    class: normalizeClass(raw.class),
    parts,
  };
  if (typeof raw.birthDate === 'number') result.birthDate = raw.birthDate * 1000;
  if (typeof raw.level === 'number') result.level = raw.level;
  return result;
}

/**
 * Fetch all Axies owned by a given Ronin address.
 * Returns parsed AxieInput list ready to feed into partsToCard().
 *
 * Throws on network/GraphQL errors. Caller should handle with fallback.
 */
export async function fetchAxiesByOwner(roninAddress: string): Promise<AxieInput[]> {
  // Normalize address: strip "ronin:" prefix, ensure 0x.
  let addr = roninAddress.trim();
  if (addr.startsWith('ronin:')) addr = '0x' + addr.slice(6);
  if (!addr.startsWith('0x')) addr = '0x' + addr;

  const res = await fetch(AXIE_GQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: AXIES_BY_OWNER_QUERY,
      variables: { owner: addr, size: 24 },
    }),
  });

  if (!res.ok) {
    throw new Error(`Axie GraphQL ${res.status}: ${res.statusText}`);
  }

  const json: AxiesQueryResponse = await res.json();
  if (json.errors?.length) {
    throw new Error('Axie GraphQL errors: ' + json.errors.map((e) => e.message).join('; '));
  }

  const results = json.data?.axies?.results ?? [];
  return results.map(rawAxieToInput);
}

/**
 * Demo example Axies (for /my-axies "Try with example Axies" button).
 * Hand-picked diverse classes to showcase the algorithm. Inspired by public
 * Axie Origins meta picks. NOT real Ronin owners — pure illustrative data.
 */
export const DEMO_AXIES: AxieInput[] = [
  {
    tokenId: '5234',
    class: 'Beast',
    birthDate: Date.UTC(2021, 5, 15),
    parts: [
      { type: 'eyes', id: 'puppy', class: 'Beast' },
      { type: 'ears', id: 'pup', class: 'Beast' },
      { type: 'mouth', id: 'axie-kiss', class: 'Beast' },
      { type: 'horn', id: 'imp', class: 'Beast' },
      { type: 'back', id: 'furball', class: 'Beast' },
      { type: 'tail', id: 'cottontail', class: 'Beast' },
    ],
  },
  {
    tokenId: '12891',
    class: 'Plant',
    birthDate: Date.UTC(2021, 8, 3),
    parts: [
      { type: 'eyes', id: 'puppy-eye', class: 'Plant' },
      { type: 'ears', id: 'rose-bud', class: 'Plant' },
      { type: 'mouth', id: 'lotus', class: 'Plant' },
      { type: 'horn', id: 'little-branch', class: 'Plant' },
      { type: 'back', id: 'snail-shell', class: 'Plant' },
      { type: 'tail', id: 'leaf-bud', class: 'Plant' },
    ],
  },
  {
    tokenId: '777',
    class: 'Bird',
    birthDate: Date.UTC(2020, 11, 1),
    parts: [
      { type: 'eyes', id: 'zigzag', class: 'Bird' },
      { type: 'ears', id: 'feather-fan', class: 'Bird' },
      { type: 'mouth', id: 'lips', class: 'Bird' },
      { type: 'horn', id: 'eggshell', class: 'Bird' },
      { type: 'back', id: 'feather-fan', class: 'Bird' },
      { type: 'tail', id: 'nut-cracker', class: 'Bird' },
    ],
  },
  {
    tokenId: '42069',
    class: 'Bug',
    birthDate: Date.UTC(2021, 2, 20),
    parts: [
      { type: 'eyes', id: 'starry', class: 'Bug' },
      { type: 'ears', id: 'antenna', class: 'Bug' },
      { type: 'mouth', id: 'thorny-cat', class: 'Bug' },
      { type: 'horn', id: 'shoebill', class: 'Bug' },
      { type: 'back', id: 'lagging', class: 'Bug' },
      { type: 'tail', id: 'thorny-cat', class: 'Bug' },
    ],
  },
  {
    tokenId: '99001',
    class: 'Aqua',
    birthDate: Date.UTC(2022, 0, 10),
    parts: [
      { type: 'eyes', id: 'gas', class: 'Aqua' },
      { type: 'ears', id: 'shrimp', class: 'Aqua' },
      { type: 'mouth', id: 'tiny-turtle', class: 'Aqua' },
      { type: 'horn', id: 'risky-fish', class: 'Aqua' },
      { type: 'back', id: 'shrimp', class: 'Aqua' },
      { type: 'tail', id: 'tiny-turtle', class: 'Aqua' },
    ],
  },
];
