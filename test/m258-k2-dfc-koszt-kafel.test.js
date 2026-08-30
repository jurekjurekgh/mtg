import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCardRegistry } from '../src/cards/card-data.js';
import { setupCardMatch } from '../src/cards/materialize.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { createGameState, playerView, execute, addObject } from '../src/engine/game-state.js';
import { moveObjectDirectly } from '../src/engine/objects.js';
import { queueTriggerToStack } from '../src/engine/triggers.js';
import { jumpToStep } from '../src/engine/turn.js';
import { cardInfo } from '../src/table/render.js';

/**
 * M258/K2 (zgłoszone w audycie M257, kandydat „następnej rundy jakości”):
 * kafel TYLNEJ strony DFC na polu bitwy pokazywał koszt „0” — czytał katalog
 * bieżącej twarzy (details.manaCost), a tylna strona nie ma wydrukowanego
 * kosztu (katalog: 0). Wg CR 202.3b mana value permanentu z tylną twarzą
 * w górę liczy się jakby miał koszt twarzy PRZEDNIEJ — i dokładnie tę wartość
 * niesie obiekt/widok (transform nie zmienia manaCost; M149: publiczny MV).
 * Fix: cardInfo czyta OBIEKT najpierw, katalog jest fallbackiem.
 *
 * Weryfikacja mutacyjna (L61): przywrócenie starej priorytetności
 * (details.manaCost ?? object.manaCost) czyni K2a CZERWONYM (0 zamiast 3).
 */

const REGISTRY = createCardRegistry();
const BRG = parseDeckText(readFileSync('decks/innistrad-brg.txt', 'utf8'), REGISTRY).cardIds;
const WU = parseDeckText(readFileSync('decks/innistrad-wu.txt', 'utf8'), REGISTRY).cardIds;

const SESSION_MOCK = {
  nameOf: (id) => REGISTRY.get(id)?.name ?? String(id),
  nameOfObject: (id) => String(id),
  cardDetails: (id) => REGISTRY.get(id) ?? null,
  colorsOf: (id) => REGISTRY.get(id)?.colors ?? [],
  view: () => ({ zones: { battlefield: [] } }),
};

function freshState() {
  const state = setupCardMatch({
    seed: 11,
    players: [{ id: 'p1' }, { id: 'p2' }],
    decks: new Map([['p1', BRG], ['p2', WU]]),
    registry: REGISTRY,
  });
  state.pendingMulligans = [];
  return state;
}

function findCardId(state, cardId) {
  for (const [id, o] of state.objects) {
    if (o.cardId === cardId && (o.zone === 'hand' || o.zone === 'library')) return id;
  }
  return null;
}

function resolveStack(state) {
  let guard = 0;
  while (state.zones.stack.length > 0 && guard++ < 200) {
    const holder = state.turn.priorityPlayerId;
    const view = playerView(state, holder);
    const pass = view.legalCommands.find((c) => c.type === 'pass_priority');
    const pick = pass ?? view.legalCommands.find((c) => c.type.startsWith('resolve_'));
    if (!pick) return false;
    const r = execute(state, pick);
    if (!r.ok) return false;
  }
  return state.zones.stack.length === 0;
}

test('K2a: kafel tylnej strony DFC pokazuje koszt PRZEDNIEJ (CR 202.3b), nie „0” z katalogu', () => {
  const state = createGameState({ seed: 5, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.pendingMulligans = [];
  // Homicidal Brute (tył Civilized Scholar): katalog manaCost = 0 (brak
  // wydrukowanego kosztu), obiekt niesie 3 (przód {2}{U}).
  addObject(state, {
    id: 'hb', instanceId: 'i-hb', cardId: 'homicidal-brute', controllerId: 'p1',
    ownerId: 'p1', zone: 'battlefield', kind: 'creature', manaCost: 3,
    power: 5, toughness: 1, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: ['R'],
  });
  const entry = playerView(state, 'p1').zones.battlefield.find((o) => o.id === 'hb');
  assert.equal(entry.manaCost, 3, 'widok niesie MV przedniej twarzy (kontrakt M149)');
  assert.equal(REGISTRY.get('homicidal-brute').manaCost, 0, 'katalog tyłu: brak kosztu (0)');
  const info = cardInfo(SESSION_MOCK, entry, null);
  assert.equal(info.manaCost, 3, 'CR 202.3b: MV tylnej twarzy = koszt przedniej (3, nie 0)');
});

test('K2b: prawdziwy obrót front→back (Scorned Villager → Moonscarred Werewolf) — kafel dalej 2', () => {
  const state = freshState();
  const hid = findCardId(state, 'scorned-villager');
  assert.ok(hid, 'Scorned Villager w talii BRG');
  const bfId = moveObjectDirectly(state, hid, 'battlefield', `bf-villager-${hid}`).id;
  const ability = REGISTRY.get('scorned-villager').abilities.find((a) => a.trigger?.event === 'upkeep');
  assert.ok(ability, 'trigger upkeep w definicji');
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.passes = 0;
  queueTriggerToStack(state, ability, state.objects.get(bfId), [], []);
  assert.ok(resolveStack(state), 'stos rozstrzygnięty');
  assert.equal(state.objects.get(bfId).cardId, 'moonscarred-werewolf', 'obrót się dokonał');
  const entry = playerView(state, 'p1').zones.battlefield.find((o) => o.id === bfId);
  const info = cardInfo(SESSION_MOCK, entry, null);
  assert.equal(info.manaCost, 2, 'MV po obrocie = 2 (przód {1}{G}); przed fixem katalog też miał 2 — bez zmian');
});

test('K2c: zwykła karta i token — koszt bez zmian (anty-overfix)', () => {
  const state = createGameState({ seed: 5, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.pendingMulligans = [];
  addObject(state, {
    id: 'reg', instanceId: 'i-reg', cardId: 'typhoid-rats', controllerId: 'p1',
    ownerId: 'p1', zone: 'battlefield', kind: 'creature', manaCost: 1,
    power: 1, toughness: 1, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: ['B'],
  });
  addObject(state, {
    id: 'tok', instanceId: 'i-tok', cardId: 'token_squirrel', controllerId: 'p1',
    ownerId: 'p1', zone: 'battlefield', kind: 'creature', manaCost: 0,
    power: 1, toughness: 1, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: ['G'],
  });
  const view = playerView(state, 'p1');
  const regInfo = cardInfo(SESSION_MOCK, view.zones.battlefield.find((o) => o.id === 'reg'), null);
  const tokInfo = cardInfo(SESSION_MOCK, view.zones.battlefield.find((o) => o.id === 'tok'), null);
  assert.equal(regInfo.manaCost, 1, 'zwykła karta: koszt wydrukowany (obiekt = katalog)');
  assert.equal(tokInfo.manaCost, 0, 'token: MV 0 (CR 202.3a — brak kosztu)');
});
