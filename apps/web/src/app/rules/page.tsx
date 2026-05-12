'use client';

/**
 * /rules — página estática con el manual completo del juego.
 * Pública (sin auth required). Linkeada desde el dashboard ("📖 How to play")
 * y accesible directamente para visitors curiosos.
 *
 * Al final tiene un CTA "▶ Replay welcome tour" que dispara el TutorialWelcomeModal
 * en modo replay (sin tocar la DB). Útil para users que ya pasaron el tutorial.
 */

import { useState } from 'react';
import Link from 'next/link';
import { TutorialWelcomeModal } from '../../components/TutorialWelcomeModal';

export default function RulesPage() {
  const [replay, setReplay] = useState(false);

  return (
    <main className="rules-page">
      <header className="rules-header">
        <Link href="/dashboard" className="rules-back">← Back to dashboard</Link>
        <h1 className="rules-title">📖 How to play Axie Duel</h1>
        <p className="rules-sub">Complete rules and mechanics. Bookmark this page for reference.</p>
      </header>

      <section className="rules-section rules-disclaimer-section">
        <h2>ℹ️ About this project</h2>
        <p>
          <strong>Axie Duel</strong> (working title) is an independent <strong>fan-made project</strong> leveraging
          Axie Infinity&apos;s public APIs to render NFT data as playable cards. <em>Not officially affiliated with
          Sky Mavis.</em> All Axie Infinity branding, art, and NFTs are property of Sky Mavis Pte. Ltd.
        </p>
        <p>
          Built as a candidate for the <a href="https://blog.axieinfinity.com/p/builders" target="_blank" rel="noopener noreferrer" className="rules-link">Sky Mavis Builders Program</a>.
          Open source on <a href="https://github.com/anuarissa/axie-duel" target="_blank" rel="noopener noreferrer" className="rules-link">GitHub</a>.
          Working title — open to renaming on partnership terms.
        </p>
      </section>

      <section className="rules-section">
        <h2>🌐 Web 2.5 design</h2>
        <p>
          Axie Duel is built for two audiences simultaneously:
        </p>
        <ul>
          <li><strong>Web2 players:</strong> Sign in with Google in 5 seconds. Get a competitive starter deck. No wallet required to play, win, climb the ladder.</li>
          <li><strong>Web3 players:</strong> Connect your Ronin Wallet. Your Axie NFTs become unique playable cards via a deterministic <em>parts → stats</em> algorithm. Unlock Ranked Premium tier + Tournaments with AXS/SLP entry (<strong>90 % players · 5 % burn · 5 % game treasury</strong>).</li>
        </ul>
        <p>
          <strong>Free-to-play promise:</strong> starter cards are <em>side-grade competitive</em> with NFT cards. Top ladder is reachable F2P with skill. NFT advantage is <strong>flavor + collectibility</strong>, not raw power.
        </p>
      </section>

      <section className="rules-section">
        <h2>1. Overview</h2>
        <p>
          Axie Duel is a tactical card game blending the depth of classic TCGs with Axie&apos;s iconic universe
          and Web3 digital ownership. Two players face off, each with their own deck of
          <strong> 40 to 60 cards</strong>. Reduce the opponent&apos;s Life Points (LP) from 8000 to 0 to win.
        </p>
        <ul>
          <li><strong>Starting hand:</strong> 5 cards</li>
          <li><strong>Field:</strong> 5 monster zones + 5 spell/trap zones per side</li>
          <li><strong>Win conditions:</strong> opponent LP = 0, opponent decks out (no cards left), or surrender</li>
          <li><strong>Match length:</strong> ~5–10 minutes per match. 60-second timer per turn</li>
        </ul>
      </section>

      <section className="rules-section">
        <h2>2. Game Phases</h2>
        <p>Each turn cycles through 6 phases. The active player advances them with the ▶ phase wheel button.</p>
        <ol>
          <li><strong>Extraction (Draw)</strong> — draw 1 card from your deck</li>
          <li><strong>Sync (Standby)</strong> — triggered effects fire (e.g. start-of-turn auras)</li>
          <li><strong>Tactical Phase 1</strong> — Main phase: deploy axies, set spells/traps, activate effects, change positions</li>
          <li><strong>Combat</strong> — declare attacks with monsters in ATK position. Trap responses can fire</li>
          <li><strong>Tactical Phase 2</strong> — second main phase, more deploys/spells after combat</li>
          <li><strong>Resolution (End)</strong> — turn ends. If you have more than 6 cards in hand, you must discard the excess (you choose which)</li>
        </ol>
      </section>

      <section className="rules-section">
        <h2>3. Card Types</h2>
        <h3 className="rules-subhead">Axies (Monsters)</h3>
        <ul>
          <li><strong>Stars/Level (1–8):</strong> determines Burn cost (sacrifices) for deploying</li>
          <li><strong>ATK / DEF:</strong> combat stats</li>
          <li><strong>Class:</strong> Beast / Plant / Aqua / Bird / Reptile / Bug / Mech / Dawn / Dusk (drives the Class Triangle)</li>
          <li><strong>Effects (optional):</strong> onDeploy, beastSwarm, antiPlantDebuff, onDeath, etc.</li>
        </ul>
        <h3 className="rules-subhead">Spells</h3>
        <ul>
          <li><strong>Quick-Play:</strong> activate from hand any time on your turn</li>
          <li><strong>Continuous:</strong> stays on the field with persistent effect</li>
          <li><strong>Field:</strong> only one active per side, applies a global effect</li>
          <li><strong>Equip:</strong> attaches to a monster, granting bonus stats</li>
        </ul>
        <h3 className="rules-subhead">Traps</h3>
        <ul>
          <li>Set face-down. Activated in response to enemy attacks or specific triggers</li>
          <li>Examples: <em>Mirror Web</em> (negate attack), <em>Lethal Strike</em> (1000 burn damage), <em>Webbed Roots</em> (lock monster)</li>
        </ul>
      </section>

      <section className="rules-section">
        <h2>4. Combat Math</h2>
        <p>When you declare an attack, ATK and DEF stats determine the outcome:</p>
        <ul>
          <li>
            <strong>ATK vs ATK:</strong> the lower-stat monster is destroyed; its owner takes
            <em> (winner ATK − loser ATK)</em> damage. If equal, both destroyed, no damage.
          </li>
          <li>
            <strong>ATK vs DEF:</strong> defender destroyed only if attacker ATK &gt; defender DEF.
            <em> No LP damage</em> in either case (unless attacker has piercing).
          </li>
          <li>
            <strong>Direct attack:</strong> only allowed when opponent has zero monsters. Full ATK damage to LP.
          </li>
        </ul>
        <h3 className="rules-subhead">Burns (sacrifices)</h3>
        <p>Higher-level axies need Burns (other monsters sacrificed) to deploy:</p>
        <ul>
          <li>Levels 1–4: <strong>0 burns</strong></li>
          <li>Levels 5–6: <strong>1 burn</strong> (sacrifice 1 monster on your field)</li>
          <li>Levels 7–8: <strong>2 burns</strong></li>
        </ul>
      </section>

      <section className="rules-section">
        <h2>5. Class Triangle</h2>
        <p>
          The 9 classes are split into 3 groups, forming a rock-paper-scissors triangle that modifies effective
          ATK by ±15%.
        </p>
        <div className="rules-triangle">
          <div className="rules-triangle-group group-a">
            <strong>Group A</strong>
            <span>Reptile · Plant · Dusk</span>
          </div>
          <div className="rules-triangle-arrow">beats →</div>
          <div className="rules-triangle-group group-b">
            <strong>Group B</strong>
            <span>Aqua · Bird · Dawn</span>
          </div>
          <div className="rules-triangle-arrow">beats →</div>
          <div className="rules-triangle-group group-c">
            <strong>Group C</strong>
            <span>Beast · Bug · Mech</span>
          </div>
          <div className="rules-triangle-arrow rules-triangle-arrow-loop">↩ beats Group A</div>
        </div>
        <ul>
          <li><strong>Same group:</strong> neutral, no modifier</li>
          <li><strong>You beat the other:</strong> +15% effective ATK (advantage)</li>
          <li><strong>You are beaten:</strong> −15% effective ATK (disadvantage)</li>
        </ul>
      </section>

      <section className="rules-section">
        <h2>6. Deck Rules</h2>
        <ul>
          <li><strong>Main deck:</strong> 40 to 60 cards (classic TCG sizing)</li>
          <li><strong>Maximum 3 copies</strong> of any single card across all zones</li>
          <li><strong>Hand limit:</strong> 6 cards at end of turn. If you have more, you choose which to discard</li>
          <li>Build your deck from <Link href="/decks/builder" className="rules-link">/decks/builder</Link>; choose your active deck before each match</li>
        </ul>
      </section>

      <section className="rules-section">
        <h2>7. Effects & Keywords</h2>
        <ul>
          <li><strong>onDeploy:</strong> triggers when summoned (e.g. heal LP, draw card, destroy enemy spell)</li>
          <li><strong>onDeath:</strong> triggers when destroyed (direct damage, permanent debuff to killer)</li>
          <li><strong>beastSwarm:</strong> +300 ATK while you control 2+ Beasts</li>
          <li><strong>antiPlantDebuff:</strong> aura that reduces enemy Plant ATK</li>
          <li><strong>fieldTrigger:</strong> spell that buffs all newly summoned axies</li>
          <li><strong>continuousAura:</strong> persistent stat boost while on field</li>
          <li><strong>piercingDirect:</strong> ignores DEF position; deals damage to LP through tank</li>
        </ul>
      </section>

      <footer className="rules-footer">
        <h2>Need a refresher?</h2>
        <p>Replay the welcome tour — same 5 slides you saw on first login. Doesn&apos;t reset anything.</p>
        <button
          type="button"
          className="rules-replay-btn"
          onClick={() => setReplay(true)}
        >
          ▶ Replay welcome tour
        </button>
      </footer>

      {replay ? (
        <TutorialWelcomeModal isReplay onClose={() => setReplay(false)} />
      ) : null}
    </main>
  );
}
