/**
 * OpenAPI 3.1 spec del API. Mantenido manualmente — los devs frontend
 * leen esto para ver qué endpoints existen + shapes.
 *
 * Cuando agregues una ruta nueva, sumá su entrada acá. Si crece >2000 líneas,
 * migrar a auto-gen con @asteasolutions/zod-to-openapi.
 *
 * Visible en /docs cuando la API está corriendo.
 */

const okResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: { type: 'object' } } },
});

const errorResponses = {
  '400': { description: 'Validation error' },
  '401': { description: 'Auth required' },
  '403': { description: 'Forbidden (admin/ownership)' },
  '404': { description: 'Not found' },
  '422': { description: 'Rule violation (insufficient AXS, deck invalid, etc.)' },
};

export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'Axie Duel API',
    version: '0.1.0',
    description:
      'REST API del backend de Axie Duel. Filosofía Web2-first: login social opcionalmente complementado con wallet de Ronin para NFTs y premios cripto.',
    contact: { name: 'Axie Duel Team' },
  },
  servers: [
    { url: 'http://localhost:3001', description: 'Dev local' },
  ],
  tags: [
    { name: 'auth', description: 'Login (Web2 + Web3 opcional) y link de wallet' },
    { name: 'users', description: 'Perfil + cartas del usuario' },
    { name: 'cards', description: 'Catálogo público de cartas' },
    { name: 'decks', description: 'CRUD de mazos' },
    { name: 'axies', description: 'Sync de Axies NFT desde Ronin' },
    { name: 'matches', description: 'Historial + replays' },
    { name: 'leaderboard', description: 'Top players por ELO' },
    { name: 'axs', description: 'Balance + transacciones AXS (off-chain)' },
    { name: 'tournaments', description: 'Torneos PvP con entrada y premios en AXS' },
    { name: 'quests', description: 'Daily quests' },
    { name: 'notifications', description: 'Feed in-app del usuario' },
    { name: 'admin', description: 'Endpoints admin (requiere isAdmin=true)' },
    { name: 'internal', description: 'Service-to-service (game-server → api)' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT del juego emitido por POST /auth/<provider>',
      },
      internalToken: {
        type: 'apiKey',
        in: 'header',
        name: 'X-Internal-Token',
        description: 'Token compartido entre game-server y api',
      },
    },
  },
  paths: {
    '/health': {
      get: {
        tags: ['cards'],
        summary: 'Healthcheck',
        responses: { '200': okResponse('OK + service info') },
      },
    },
    // ── Auth ───────────────────────────────────────────────────────────
    '/auth/google': {
      post: {
        tags: ['auth'],
        summary: 'Login con Google ID Token',
        requestBody: {
          content: { 'application/json': { schema: { type: 'object', required: ['idToken'], properties: { idToken: { type: 'string' } } } } },
        },
        responses: { '200': okResponse('JWT + user'), ...errorResponses },
      },
    },
    '/auth/microsoft': {
      post: {
        tags: ['auth'],
        summary: 'Login con Microsoft (Outlook/Hotmail) ID Token',
        responses: { '200': okResponse('JWT + user'), ...errorResponses },
      },
    },
    '/auth/facebook': {
      post: {
        tags: ['auth'],
        summary: 'Login con Facebook access token (Graph API debug_token)',
        responses: { '200': okResponse('JWT + user'), ...errorResponses },
      },
    },
    '/auth/waypoint': {
      post: {
        tags: ['auth'],
        summary: 'Login con Ronin Waypoint (incluye wallet auto)',
        responses: { '200': okResponse('JWT + user con walletAddress'), ...errorResponses },
      },
    },
    '/auth/wallet/nonce': {
      post: {
        tags: ['auth'],
        summary: 'Emite nonce para flujo SIWE EIP-4361',
        requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['walletAddress'], properties: { walletAddress: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' } } } } } },
        responses: { '200': okResponse('{ nonce, messageTemplate }'), ...errorResponses },
      },
    },
    '/auth/link/wallet': {
      post: {
        tags: ['auth'],
        summary: 'Linkea wallet directa al user logueado (firma EIP-4361)',
        security: [{ bearerAuth: [] }],
        responses: { '200': okResponse('user actualizado'), ...errorResponses },
      },
    },
    '/auth/link/waypoint': {
      post: {
        tags: ['auth'],
        summary: 'Linkea wallet via Waypoint al user logueado',
        security: [{ bearerAuth: [] }],
        responses: { '200': okResponse('user actualizado'), ...errorResponses },
      },
    },
    // ── Users ──────────────────────────────────────────────────────────
    '/users/me': {
      get: {
        tags: ['users'],
        summary: 'Perfil del usuario logueado',
        security: [{ bearerAuth: [] }],
        responses: { '200': okResponse('user (incluye axsBalance, isAdmin)'), '401': { description: 'Auth required' } },
      },
      patch: {
        tags: ['users'],
        summary: 'Update username/displayName/avatarUrl',
        security: [{ bearerAuth: [] }],
        responses: { '200': okResponse('user actualizado'), ...errorResponses },
      },
    },
    '/users/me/cards': {
      get: {
        tags: ['users'],
        summary: 'Lista cartas del usuario (filtros: type, rarity, isNFT)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'type', in: 'query', schema: { enum: ['Monster', 'Spell', 'Trap'] } },
          { name: 'rarity', in: 'query', schema: { enum: ['Common', 'Rare', 'Epic', 'Legendary', 'Mystic'] } },
          { name: 'isNFT', in: 'query', schema: { type: 'boolean' } },
        ],
        responses: { '200': okResponse('{ count, cards[] }'), '401': { description: 'Auth required' } },
      },
    },
    '/users/{username}': {
      get: {
        tags: ['users'],
        summary: 'Perfil PÚBLICO (no requiere auth). Sin email/wallet/axsBalance.',
        parameters: [{ name: 'username', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': okResponse('{ ...publicProfile, totalGames, winRate }'),
          '404': { description: 'User not found' },
        },
      },
    },
    // ── Cards (catálogo público) ──────────────────────────────────────
    '/cards': {
      get: {
        tags: ['cards'],
        summary: 'Lista todo el catálogo de cartas',
        responses: { '200': okResponse('{ count, cards[] }') },
      },
    },
    '/cards/{id}': {
      get: {
        tags: ['cards'],
        summary: 'Detalle de una carta',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': okResponse('Card'), '404': { description: 'Not found' } },
      },
    },
    // ── Decks ─────────────────────────────────────────────────────────
    '/decks': {
      get: { tags: ['decks'], summary: 'Lista decks propios', security: [{ bearerAuth: [] }], responses: { '200': okResponse('{ decks[] }'), '401': { description: 'Auth required' } } },
      post: { tags: ['decks'], summary: 'Crea deck (validación 40-60 main, max 3 copias)', security: [{ bearerAuth: [] }], responses: { '201': okResponse('Deck'), ...errorResponses } },
    },
    '/decks/{id}': {
      get: { tags: ['decks'], summary: 'Detalle de deck propio', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': okResponse('Deck con cards'), ...errorResponses } },
      put: { tags: ['decks'], summary: 'Update parcial (name/format/cards)', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': okResponse('Deck'), ...errorResponses } },
      delete: { tags: ['decks'], summary: 'Borra deck', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '204': { description: 'Borrado' }, ...errorResponses } },
    },
    '/decks/{id}/activate': {
      post: { tags: ['decks'], summary: 'Marca este deck como activo (desactiva otros)', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': okResponse('Deck activado'), ...errorResponses } },
    },
    // ── Axies (Ronin) ─────────────────────────────────────────────────
    '/axies/sync': {
      get: { tags: ['axies'], summary: 'Sincroniza Axies NFT del wallet del user (vía Axie GraphQL + on-chain balanceOf)', security: [{ bearerAuth: [] }], responses: { '200': okResponse('{ balance, axies[] }'), ...errorResponses } },
    },
    '/axies/{axieId}': {
      get: { tags: ['axies'], summary: 'Detalle de un Axie por ID (cacheado en Redis 1h)', parameters: [{ name: 'axieId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': okResponse('Axie'), '404': { description: 'Not found' } } },
    },
    // ── Matches ───────────────────────────────────────────────────────
    '/matches/history': {
      get: {
        tags: ['matches'],
        summary: 'Historial del user con filtros',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'mode', in: 'query', schema: { enum: ['PvE', 'PvP_Casual', 'PvP_Ranked', 'PvP_RankedNFT'] } },
          { name: 'opponentId', in: 'query', schema: { type: 'string' } },
          { name: 'finishedOnly', in: 'query', schema: { type: 'boolean' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
        ],
        responses: { '200': okResponse('{ total, count, matches[] (con outcome WIN/LOSS/DRAW) }'), '401': { description: 'Auth required' } },
      },
    },
    '/matches/{id}': {
      get: { tags: ['matches'], summary: 'Resumen de un match (sin replayLog)', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': okResponse('Match summary + outcome + hasReplay'), ...errorResponses } },
    },
    '/matches/{id}/replay': {
      get: { tags: ['matches'], summary: 'Replay log determinista del match (público)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': okResponse('{ matchId, replayLog[], replayUrl? }'), '404': { description: 'Not found' } } },
    },
    // ── Leaderboard ───────────────────────────────────────────────────
    '/leaderboard': {
      get: {
        tags: ['leaderboard'],
        summary: 'Top players por ELO',
        parameters: [
          { name: 'mode', in: 'query', schema: { enum: ['ranked', 'rankedNFT'], default: 'ranked' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
        ],
        responses: { '200': okResponse('{ mode, leaderboard[] }') },
      },
    },
    // ── AXS ───────────────────────────────────────────────────────────
    '/axs/balance': { get: { tags: ['axs'], summary: 'Balance AXS off-chain', security: [{ bearerAuth: [] }], responses: { '200': okResponse('{ balance: string }'), '401': { description: 'Auth required' } } } },
    '/axs/transactions': { get: { tags: ['axs'], summary: 'Historial de movimientos AXS', security: [{ bearerAuth: [] }], parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } }, { name: 'offset', in: 'query', schema: { type: 'integer' } }], responses: { '200': okResponse('{ transactions[] }'), '401': { description: 'Auth required' } } } },
    '/axs/burn': { post: { tags: ['axs'], summary: 'Quema AXS (mint NFT, cosmético, deck slot)', security: [{ bearerAuth: [] }], requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['amount', 'kind', 'reason'], properties: { amount: { type: 'string' }, kind: { enum: ['BURN_NFT_MINT', 'BURN_COSMETIC', 'BURN_DECK_SLOT'] }, reason: { type: 'string' } } } } } }, responses: { '201': okResponse('{ newBalance, txId }'), ...errorResponses } } },
    // ── Tournaments ───────────────────────────────────────────────────
    '/tournaments': {
      get: { tags: ['tournaments'], summary: 'Lista torneos (filtro ?status=)', parameters: [{ name: 'status', in: 'query', schema: { enum: ['REGISTRATION', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] } }], responses: { '200': okResponse('{ tournaments[] }') } },
      post: { tags: ['tournaments'], summary: 'Crea torneo (auth)', security: [{ bearerAuth: [] }], responses: { '201': okResponse('Tournament'), ...errorResponses } },
    },
    '/tournaments/{id}': { get: { tags: ['tournaments'], summary: 'Detalle del torneo (participants + matches)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': okResponse('Tournament + participants + matches'), '404': { description: 'Not found' } } } },
    '/tournaments/{id}/register': { post: { tags: ['tournaments'], summary: 'Inscribirse al torneo (cobra entryCostAxs)', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '201': okResponse('TournamentParticipant'), ...errorResponses } } },
    '/tournaments/{id}/start': { post: { tags: ['tournaments'], summary: 'Genera bracket + arranca el torneo', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': okResponse('Tournament IN_PROGRESS'), ...errorResponses } } },
    '/tournaments/{id}/match/report': { post: { tags: ['tournaments'], summary: 'Reporta resultado de match — auto-avanza ronda + completa al final', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': okResponse('{ advanced, completed, nextRound? }'), ...errorResponses } } },
    '/tournaments/{id}/leaderboard': { get: { tags: ['tournaments'], summary: 'Standings del torneo', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': okResponse('{ leaderboard[] }') } } },
    '/tournaments/{id}/cancel': { post: { tags: ['tournaments'], summary: 'Cancela y reembolsa entradas', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': okResponse('Tournament CANCELLED'), ...errorResponses } } },
    // ── Quests ────────────────────────────────────────────────────────
    '/quests': { get: { tags: ['quests'], summary: 'Quests activas + progreso del user', security: [{ bearerAuth: [] }], responses: { '200': okResponse('{ quests[] }'), '401': { description: 'Auth required' } } } },
    '/quests/{id}/claim': { post: { tags: ['quests'], summary: 'Reclama AXS de quest completada (atómico, anti-doble-claim)', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '201': okResponse('{ rewardAxs, newBalance }'), ...errorResponses } } },
    // ── Notifications ─────────────────────────────────────────────────
    '/notifications': {
      get: {
        tags: ['notifications'],
        summary: 'Feed in-app del user (filtros: unread, limit, offset)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'unread', in: 'query', schema: { type: 'boolean' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
        ],
        responses: { '200': okResponse('{ unreadCount, count, notifications[] }'), '401': { description: 'Auth required' } },
      },
    },
    '/notifications/{id}/read': {
      post: {
        tags: ['notifications'],
        summary: 'Marca una notificación como leída (anti-spoof: WHERE incluye userId)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': okResponse('{ updated: 0 | 1 }'), ...errorResponses },
      },
    },
    '/notifications/read-all': {
      post: {
        tags: ['notifications'],
        summary: 'Marca todas las notificaciones del user como leídas',
        security: [{ bearerAuth: [] }],
        responses: { '200': okResponse('{ updated: number }'), '401': { description: 'Auth required' } },
      },
    },
    // ── Admin ─────────────────────────────────────────────────────────
    '/admin/tournaments': { post: { tags: ['admin'], summary: 'Crea torneo (admin)', security: [{ bearerAuth: [] }], responses: { '201': okResponse('Tournament'), '403': { description: 'Admin only' } } } },
    '/admin/users/{id}/grant-axs': { post: { tags: ['admin'], summary: 'Emite AXS al usuario (compensaciones)', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': okResponse('{ newBalance, txId }'), '403': { description: 'Admin only' } } } },
    '/admin/users/{id}/promote': { post: { tags: ['admin'], summary: 'Promueve user a admin', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': okResponse('user'), '403': { description: 'Admin only' } } } },
    '/admin/users/{id}/demote': { post: { tags: ['admin'], summary: 'Quita admin a un user', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': okResponse('user'), '403': { description: 'Admin only' } } } },
    '/admin/notifications/broadcast': {
      post: {
        tags: ['admin'],
        summary: 'Broadcast SYSTEM notification a múltiples users (filtros: minElo, onlyWithWallet)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['message'],
                properties: {
                  message: { type: 'string', maxLength: 500 },
                  minElo: { type: 'integer', minimum: 0, description: 'Filtra a users con eloRanked >= esto' },
                  onlyWithWallet: { type: 'boolean', description: 'Solo a users con wallet linkeada' },
                  metadata: { type: 'object', description: 'Metadata extra para deep-linking en frontend' },
                },
              },
            },
          },
        },
        responses: { '201': okResponse('{ created: number }'), '403': { description: 'Admin only' } },
      },
    },
    // ── Internal (game-server → api) ──────────────────────────────────
    '/internal/matches': {
      post: {
        tags: ['internal'],
        summary: 'Persiste match al GAME_OVER (game-server → api). Triggea quests + ELO update + replay log.',
        security: [{ internalToken: [] }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['player1Id', 'mode', 'duration', 'turnsPlayed'],
                properties: {
                  player1Id: { type: 'string' },
                  player2Id: { type: ['string', 'null'] },
                  winnerId: { type: ['string', 'null'] },
                  mode: { enum: ['PvE', 'PvP_Casual', 'PvP_Ranked', 'PvP_RankedNFT'] },
                  duration: { type: 'integer' },
                  turnsPlayed: { type: 'integer' },
                  reason: { type: 'string' },
                  replayLog: { type: 'array', items: { type: 'object' } },
                },
              },
            },
          },
        },
        responses: { '201': okResponse('{ matchId, eloDeltas? }'), '401': { description: 'Invalid token' } },
      },
    },
  },
} as const;
