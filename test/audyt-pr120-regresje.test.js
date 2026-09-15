// AUDYT PR #120 (2026-09-15) — regresje dla znalezisk A2/A3/A4/D/C/G.
//
// A2: PR #120 nie naniósł ŻADNEGO pliku testowego (ADR 0020 B) — ten plik
// pinuje zachowania wprowadzone tam i naprawione w tej sesji:
//   T1 (A4) — okno wyceny protection-trick (Spare from Evil): end_of_combat
//      WYPADA (CR 510.2/511.1 — obrażenia tam już rozdane, ochrona prewenuje,
//      nie cofa); combat_damage zostaje (model silnika ADR 0011, M255/F:
//      rozdanie po pasie aktywnego — jeszcze da się prewenować).
//   T2 (A3) — `artifactPurposeFor` używany w realnym przepływie
//      (manaWizardFor), nie leży martwy (L41/L5).
//   T3 (D)  — źródła many niosą `spendOnly` (Powerstone, CR 106.3):
//      gałąż zdolności i mostek lądowy w `manaSourcesOf`.
//   T4 (C)  — `card_discarded` jako skutek zdolności nazywa ŹRÓDŁO w logu
//      (Civilized Scholar, CR 400.2).
//   T5 (G)  — badge Altar X = typy kart we WSZYSTKICH grobach; supertypy
//      (Basic) się nie liczą (CR 709.2a, CR 205.2a).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { createSession, HUMAN_ID, BOT_ID, describeGameEvent } from '../src/table/session.js';
import { cardInfo } from '../src/table/render.js';
import { manaSourcesOf } from '../src/table/mana-wizard.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

// =============================================================================
// T1 (A4) — okno wyceny Spare from Evil (protection from non-Human)
// =============================================================================

function put(state, id, cardId, controllerId, zone, extra = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  const d = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: d.kind, power: d.power, toughness: d.toughness, manaCost: d.manaCost, spell: d.spell,
    abilities: d.abilities ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
    types: def.types ?? [], colors: d.colors ?? [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false, ...extra }));
  return state.objects.get(id);
}

// p1 (atakujący, Gorger Wurm 5/5 Wurm — nie-Human) blokuje p2 (bot,
// krumar-initiate 2/2 Human). Ochrona nie-Humanów zeruje obrażenia 5
// (lethal 5>=2 bez ochrony; 0>=2 z ochroną) → `protectionPreventsAnyLethal`
// zwraca true — wartość sztuczki zależy WYŁĄCZNIE od okna (krok).
function spareScenario(step) {
  const state = createGameState({ seed: 120, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.step = step;
  state.turn.phase = 'combat';
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 10);
  put(state, 'spare', 'spare-from-evil', 'p2', 'hand');
  put(state, 'mine', 'krumar-initiate', 'p2', 'battlefield');
  put(state, 'wurm', 'gorger-wurm', 'p1', 'battlefield', { tapped: true });
  state.combat = {
    attackers: ['wurm'],
    blockers: new Map([['wurm', ['mine']]]),
    attackingPlayerId: 'p1',
    defendingPlayerId: 'p2',
  };
  return state;
}

function spareScores(state) {
  const bot = createHeuristicBot({ seed: 120 });
  const choice = bot.chooseCommand(playerView(state, 'p2'), {});
  const options = bot.trace()[0].options;
  const labels = options.map((o) => o.cmd);
  const label = labels.find((l) => String(l).startsWith('cast_spell(spare'));
  assert.ok(label, `w śladzie jest rzut Spare: [${labels}]`);
  const opt = options.find((o) => o.cmd === label);
  const pass = options.find((o) => o.cmd === 'pass_priority')?.score ?? 0;
  return { opt, pass, choice };
}

test('AUDYT-PR120/A4a: end_of_combat — Spare schodzi PONIŻEJ passu (obrażenia już rozdane)', () => {
  const { opt, pass } = spareScores(spareScenario('end_of_combat'));
  assert.ok(opt.score < pass,
    `w end_of_combat obrażenia są już zadane (CR 510.2/511.1) — rzut (${opt.score}) musi być < pass (${pass})`);
});

test('AUDYT-PR120/A4b: end_of_combat — bot NIE rzuca Spare (wybór)', () => {
  const { choice } = spareScores(spareScenario('end_of_combat'));
  assert.ok(!(choice.type === 'cast_spell' && choice.objectId === 'spare'),
    `bot nie rzuca Spare w end_of_combat: ${JSON.stringify(choice)}`);
});

test('AUDYT-PR120/A4c: combat_damage — okno wciąż ważne (anty-over-fix)', () => {
  const { opt, pass } = spareScores(spareScenario('combat_damage'));
  assert.ok(opt.score > pass,
    `w combat_damage (przed rozdaniem, model silnika M255/F) rzut (${opt.score}) ma być > pass (${pass})`);
});

// =============================================================================
// T2 (A3) — artifactPurposeFor w realnym przepływie (guard źródłowy)
// =============================================================================

test('AUDYT-PR120/A3: manaWizardFor używa wspólnego artifactPurposeFor', () => {
  const src = readFileSync(new URL('../src/table/main.js', import.meta.url), 'utf8');
  // Wywołanie w realnym przepływie (przedtem: definicja martwa, kopia inline
  // w manaWizardFor + druga kopia w refreshManaWizard). Wzorzec celowo
  // od definicji: `const isArtifact = artifactPurposeFor(...)`.
  assert.ok(
    /const isArtifact\s*=\s*artifactPurposeFor\(cmd, descriptor\)/.test(src),
    'manaWizardFor woła artifactPurposeFor(cmd, descriptor) — mutacja: zamień na kopię inline → RED');
});

// =============================================================================
// T3 (D) — spendOnly przepływa przez manaSourcesOf (Powerstone, CR 106.3)
// =============================================================================

test('AUDYT-PR120/D: źródła many niosą spendOnly (zdolność + mostek lądowy)', () => {
  const view = Object.freeze({
    zones: Object.freeze({
      battlefield: Object.freeze([
        Object.freeze({ id: 'forest1', cardId: 'basic-forest', controllerId: 'p1', tapped: false, kind: 'land', colors: ['G'] }),
        Object.freeze({ id: 'ps', cardId: 'powerstone', controllerId: 'p1', tapped: false, kind: 'artifact' }),
      ]),
    }),
    legalCommands: Object.freeze([
      Object.freeze({ type: 'activate_ability', playerId: 'p1', objectId: 'ps', abilityIndex: 0 }),
    ]),
  });
  // abilityInfo = zwrotna z pełnego stanu (w main.js: session.state); tu
  // kontrakt: {cardId, colors, amount, manaCost, costColors, isLand, spendOnly}.
  const abilityInfo = (objectId, abilityIndex) => (objectId === 'ps' && abilityIndex === 0
    ? Object.freeze({ cardId: 'powerstone', colors: [], amount: 1, manaCost: 0, costColors: [], isLand: false, spendOnly: 'artifact' })
    : null);
  const sources = manaSourcesOf(view, 'p1', abilityInfo, {});
  const land = sources.find((s) => s.id === 'forest1');
  const ps = sources.find((s) => s.id === 'ps');
  assert.ok(land, 'ląd na liście źródeł');
  assert.ok(ps, 'Powerstone na liście źródeł (activate_ability)');
  assert.equal(ps.spendOnly, 'artifact', 'zdolność niesie spendOnly z pełnego stanu');
  assert.equal(land.spendOnly, null, 'ląd bez spendOnly w pełnym stanie → null');
  // Mostek: gdyby źródło lądowe miało spendOnly w pełnym stanie, wędruje dalej.
  const view2 = view;
  const abilityInfo2 = (objectId) => (objectId === 'forest1'
    ? Object.freeze({ colors: ['G'], amount: 1, spendOnly: 'artifact' })
    : null);
  const sources2 = manaSourcesOf(view2, 'p1', abilityInfo2, {});
  assert.equal(sources2.find((s) => s.id === 'forest1')?.spendOnly, 'artifact',
    'mostek lądowy: abilityInfo(s.id, null) dostarcza spendOnly (L48: oferta i filtr ta sama droga)');
});

// =============================================================================
// T4 (C) — log odrzucenia nazywa źródło (Civilized Scholar, CR 400.2)
// =============================================================================

const NAMES = { p1: 'Ty', p2: 'Nieprzyjaciel' };
const HELPERS = { nameOf: (id) => REGISTRY.get(id)?.name ?? String(id), nameOfObject: () => 'Obiekt' };

test('AUDYT-PR120/C: card_discarded z sourceCardId nazywa źródło w logu', () => {
  const text = describeGameEvent({
    type: 'card_discarded', playerId: 'p2', cardId: 'basic-forest', sourceCardId: 'civilized-scholar',
  }, HELPERS, NAMES);
  assert.ok(text.includes('odrzuca'), `log odrzucenia: ${text}`);
  assert.ok(text.includes('Forest'), `log nazywa kartę: ${text}`);
  assert.ok(text.includes('(Civilized Scholar)'),
    `log nazywa ŹRÓDŁO (skutek zdolności, nie koszt): ${text}`);
});

test('AUDYT-PR120/Cb: card_discarded bez sourceCardId — bez pustego dopisku', () => {
  const text = describeGameEvent({
    type: 'card_discarded', playerId: 'p2', cardId: 'basic-forest',
  }, HELPERS, NAMES);
  assert.ok(!/\(\s*\)/.test(text), `brak pustych nawiasów: ${text}`);
  const cost = describeGameEvent({
    type: 'card_discarded', playerId: 'p2', cardId: 'basic-forest', cost: true,
  }, HELPERS, NAMES);
  assert.ok(cost.includes('(koszt zdolności)'), `odrzucenie jako koszt: ${cost}`);
});

// =============================================================================
// T5 (G) — badge Altaru: typy kart we wszystkich grobach (CR 709.2a)
// =============================================================================

test('AUDYT-PR120/G: altarX = typy kart (Basic się nie liczy, CR 205.2a)', () => {
  const registry = createCardRegistry();
  const decks = new Map([
    [HUMAN_ID, parseDeckText('# A\n60x Forest', registry).cardIds],
    [BOT_ID, parseDeckText('# B\n60x Swamp', registry).cardIds],
  ]);
  const session = createSession({ registry, decks, seed: 120 });
  addObject(session.state, {
    id: 'altar', instanceId: 'i-altar', cardId: 'altar-of-the-goyf',
    controllerId: HUMAN_ID, ownerId: HUMAN_ID, zone: 'battlefield',
    kind: 'artifact', power: 0, toughness: 0,
    types: ['Kindred', 'Artifact'], subtypes: ['Lhurgoyf'],
  });
  // Groby: 2x Forest (supertyp Basic NIE liczy się — CR 205.2a: Land)
  // + Goblin Piker (Creature) → 2 typy. Stara wersja (z supertypami) dawała 3.
  addObject(session.state, { id: 'g1', instanceId: 'i-g1', cardId: 'basic-forest', controllerId: BOT_ID, zone: 'graveyard' });
  addObject(session.state, { id: 'g2', instanceId: 'i-g2', cardId: 'basic-forest', controllerId: HUMAN_ID, zone: 'graveyard' });
  addObject(session.state, { id: 'g3', instanceId: 'i-g3', cardId: 'goblin-piker', controllerId: BOT_ID, zone: 'graveyard' });
  const entry = session.view().zones.battlefield.find((o) => o.id === 'altar');
  assert.ok(entry, 'Altar na polu w widoku');
  const info = cardInfo(session, entry);
  assert.equal(info.altarX, 2, `Land + Creature; Basic (supertyp) się nie liczy, a dwoje Forest to 1 typ (faktycznie ${info.altarX})`);
});
