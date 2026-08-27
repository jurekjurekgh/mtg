// M237/4 — model właściciela dla czarów/zdolności SKALUJĄCYCH obrażenia
// (Fireball, Consume Spirit, Blazing Torch — X z maną / poświęcenie). Taki
// premium-zasób rzucamy (X≥1, nigdy 0) TYLKO gdy:
//   - zabija stwora o TMC ≥ 2, ALBO
//   - stwora z deathtouch (odstrasza/blokuje mój atak), ALBO
//   - stwora z protekcją od mojego koloru (nie do przejścia w walce), ALBO
//   - stwora z flying/reach, gdy JA mam latacza, którego on blokuje, ALBO
//   - dobija gracza / zdejmuje ≥ 25% jego życia.
// Inaczej trzymaj. „Letalność" liczona z POZOSTAŁEGO życia (toughness − damage).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, zone, extra = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  const d = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: d.kind, power: d.power, toughness: d.toughness, manaCost: d.manaCost, spell: d.spell,
    abilities: d.abilities ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
    types: def.types ?? [], colors: d.colors ?? [], ...extra,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false, ...extra }));
  return state.objects.get(id);
}

// Consume Spirit (X-drain, spend only black) — reprezentatywny czar skalujący.
function drainState(enemyId, extra = {}, myFlyer = false) {
  const state = createGameState({ seed: 238, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 6, { colors: ['B'] });
  state.players.find((p) => p.id === 'p1').life = 20;
  put(state, 'cs', 'consume-spirit', 'p2', 'hand');
  put(state, 'foe', enemyId, 'p1', 'battlefield', extra);
  if (myFlyer) put(state, 'myflyer', 'crawling-chorus', 'p2', 'battlefield', { keywords: ['flying'] });
  return state;
}

function castsAtFoe(state) {
  const c = createHeuristicBot({ seed: 238 }).chooseCommand(playerView(state, 'p2'), {});
  return c.type === 'cast_spell' && c.objectId === 'cs' && (c.targets ?? [])[0] === 'foe';
}

test('M237/4: skalujący zabija stwora TMC≥2', () => {
  // guildsworn-prowler: 2/1 deathtouch, TMC 2
  assert.ok(castsAtFoe(drainState('guildsworn-prowler')), 'TMC2 (i deathtouch) — wart zabicia');
});

test('M237/4: skalujący zabija TANIEGO stwora z DEATHTOUCH (TMC1)', () => {
  // 1/1 TMC1 z nadanym deathtouch — wart, mimo taniości
  assert.ok(castsAtFoe(drainState('crawling-chorus', { keywords: ['deathtouch'] })),
    'deathtouch — nie do przejścia w walce, wart zabicia skalującym');
});

test('M237/4: skalujący zabija TANIEGO latacza, gdy JA mam latacza', () => {
  assert.ok(castsAtFoe(drainState('crawling-chorus', { keywords: ['flying'] }, true)),
    'wrogi latacz blokuje mojego latacza — wart zabicia');
});

test('M237/4: skalujący NIE zabija TANIEGO latacza, gdy JA nie mam latacza', () => {
  assert.ok(!castsAtFoe(drainState('crawling-chorus', { keywords: ['flying'] }, false)),
    'bez mojego latacza wrogi latacz nie jest problemem — trzymaj skalujący');
});

test('M237/4: skalujący NIE marnuje się na taniego chumpa (TMC1, bez zdolności)', () => {
  assert.ok(!castsAtFoe(drainState('crawling-chorus')),
    'TMC1 vanilla — nie wart skalującego zasobu, trzymaj');
});
