// Audyt PR #93 (2026-09-03), znalezisko C — trzecie wyłączenie „prostego
// zakresu”: karta z KOSZTEM DODATKOWYM (CR 601.2h / 118.9) wygnana w oknie
// zdolności albo trafiona przez Discover nie miała żadnej oferty rzutu, choć
// Oracle mówi „You may cast it” / CR 701.53 pozwala rzucić bez kosztu many
// (koszty dodatkowe nadal się płaci — CR 118.9d).
//
// Ta sama klasa co znaleziska A i B, kolejna ścieżka płatności. Zakres:
// koszt dodatkowy „poświęć stwora” (i wariant „albo zapłać {4}”) jest
// rozliczany w obu oknach; koszt wymagający WYBORU kart w trakcie płacenia
// (Cathartic Reunion: „discard two cards”) nadal milczy — silnik nie ma
// takiej ścieżki płatności i nie wolno jej pominąć (złamanie reguł).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';

const REGISTRY = createCardRegistry();
const SAC_SPELL = 'village-rites';                 // dodatkowy koszt: poświęć stwora
const OR_PAY_SPELL = 'lash-of-the-balrog';         // poświęć stwora ALBO zapłać {4}
const DISCARD_SPELL = 'cathartic-reunion';         // koszt nieobsługiwany: odrzuć dwie karty

function game(playerId = 'p1', step = 'main') {
  const state = createGameState({ seed: 93, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function put(state, id, cardId, controllerId, zone = 'exile', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  if (Object.keys(patch).length) {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  }
  return state.objects.get(id);
}

function addSimpleCreature(state, id, controllerId, { power = 2, toughness = 2 } = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId, ownerId: controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 1, abilities: [], keywords: [],
    subtypes: [], types: ['Creature'], colors: [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

/** Okno zdolności Vaana: `topCardId` wygnane z wierzchu biblioteki p2. */
function exileState(topCardId) {
  const state = game('p1', 'main');
  addMana(state, 'p1', 10, { colors: ['W', 'U', 'B', 'R', 'G'] });
  addSimpleCreature(state, 'mine', 'p1');
  addSimpleCreature(state, 'foe', 'p2');
  put(state, 'stolen', topCardId, 'p2', 'exile');
  biblioteka(state);
  state.pendingExileCast = {
    playerId: 'p1', objectId: 'stolen', cardId: topCardId, sourceId: 'vaan', restorePriorityTo: 'p1',
  };
  return state;
}

/** Decyzja Discover: znaleziona karta `cardId` leży w exile. */
function discoverState(cardId) {
  const state = game('p1', 'main');
  addMana(state, 'p1', 10, { colors: ['W', 'U', 'B', 'R', 'G'] });
  addSimpleCreature(state, 'mine', 'p1');
  addSimpleCreature(state, 'foe', 'p2');
  put(state, 'found', cardId, 'p1', 'exile');
  biblioteka(state);
  state.pendingDiscover = {
    playerId: 'p1', foundExileId: 'found', foundCardId: cardId,
    restExileIds: [], restorePriorityTo: 'p1', amount: 3,
  };
  return state;
}

/**
 * Biblioteka z kartami — bez tego dobieranie z pustej biblioteki kończy partię
 * (CR 704.5a) i test mierzyłby przegraną zamiast efektu czaru.
 */
function biblioteka(state) {
  for (let i = 0; i < 6; i += 1) {
    addObject(state, {
      id: `lib${i}`, instanceId: `i-lib${i}`, cardId: 'test-lib', controllerId: 'p1', ownerId: 'p1',
      zone: 'library', kind: 'spell', manaCost: 1, types: ['Instant'], colors: [], subtypes: [],
      keywords: [], spell: { timing: 'instant', targets: [], effects: [] },
    });
  }
}

const exileCasts = (state) => playerView(state, 'p1').legalCommands
  .filter((c) => c.type === 'resolve_exile_cast' && c.cast === true);
const discoverFrees = (state) => playerView(state, 'p1').legalCommands
  .filter((c) => c.type === 'resolve_discover_choice' && c.castFree === true);

function resolveStack(state, limit = 40) {
  for (let i = 0; i < limit && state.zones.stack.length > 0; i += 1) {
    const pass = playerView(state, state.turn.priorityPlayerId).legalCommands.find((c) => c.type === 'pass_priority');
    if (!pass) break;
    const r = execute(state, pass);
    if (!r.ok && /(_unresolved|not_your_decision)$/.test(r.events[0]?.reason ?? '')) break;
  }
}

test('A93/C: Vaan — czar z kosztem „poświęć stwora” jest rzucalny (wariant per ofiara)', () => {
  const state = exileState(SAC_SPELL);
  const offers = exileCasts(state);
  assert.ok(offers.length > 0,
    'Oracle: „You may cast it” — koszt dodatkowy nie wyłącza rzutu (CR 601.2h); '
    + 'dziś karta nie ma żadnej oferty');
  assert.ok(offers.some((c) => c.sacrificeTargetId === 'mine'),
    'wariant niesie KOGO poświęcamy (koszt płaci się przy rzucie, CR 601.2h)');
});

test('A93/C: Vaan — rzut pobiera koszt many i poświęca ofiarę, potem rozstrzyga efekt', () => {
  const state = exileState(SAC_SPELL);
  const handBefore = state.zones.hand.length;
  const manaBefore = state.players.find((p) => p.id === 'p1').mana;
  const cast = exileCasts(state).find((c) => c.sacrificeTargetId === 'mine');
  const r = execute(state, cast);
  assert.ok(r.ok, `rzut przyjęty (${r.events[0]?.reason ?? ''})`);
  assert.ok(!state.zones.battlefield.includes('mine'), 'ofiara znika z pola bitwy jako KOSZT rzutu (CR 601.2h)');
  assert.ok(state.zones.graveyard.some((id) => state.objects.get(id)?.cardId === 'test-mine'),
    'ofiara ląduje w cmentarzu');
  assert.ok(state.players.find((p) => p.id === 'p1').mana < manaBefore, 'koszt many czaru pobrany (MV 1)');
  assert.equal(state.pendingExileCast, null, 'okno zamknięte');
  resolveStack(state);
  assert.equal(state.zones.hand.length, handBefore + 2, 'efekt czaru: dobierz dwie karty');
});

test('A93/C: Vaan — wariant „albo zapłać {4}” (Lash of the Balrog) zamiast ofiary', () => {
  const state = exileState(OR_PAY_SPELL);
  const offers = exileCasts(state);
  assert.ok(offers.some((c) => c.payAltCost === true), 'wariant z dopłatą {4}');
  assert.ok(offers.some((c) => c.sacrificeTargetId === 'mine'), 'wariant z poświęceniem');
  const alt = offers.find((c) => c.payAltCost === true && (c.targets ?? []).includes('foe'));
  assert.ok(execute(state, alt).ok, 'rzut z dopłatą przyjęty');
  assert.ok(state.zones.battlefield.includes('mine'), 'bez poświęcenia — zapłacono maną');
  resolveStack(state);
  assert.ok(!state.zones.battlefield.includes('foe'), 'cel czaru zniszczony');
});

test('A93/C: Vaan — koszt nieobsługiwany (odrzuć karty) nadal bez oferty, bez łamania reguł', () => {
  const state = exileState(DISCARD_SPELL);
  assert.equal(exileCasts(state).length, 0,
    '„discard two cards” wymaga wyboru kart w trakcie płacenia — silnik nie ma '
    + 'tej ścieżki; oferta milczy zamiast pominąć koszt (L5: jawne ograniczenie)');
  assert.equal(execute(state, { type: 'resolve_exile_cast', playerId: 'p1', cast: true, targets: [] }).ok, false);
});

test('A93/C: Vaan — ofiara spoza twojej kontroli jest odrzucona', () => {
  const state = exileState(SAC_SPELL);
  const r = execute(state, { type: 'resolve_exile_cast', playerId: 'p1', cast: true, targets: [], sacrificeTargetId: 'foe' });
  assert.equal(r.ok, false, 'stwór przeciwnika nie może być kosztem (CR 601.2h)');
  assert.ok(state.zones.battlefield.includes('foe'), 'nie wolno poświęcić cudzego stwora');
});

test('A93/C: Discover — darmowy rzut płaci koszt dodatkowy (poświęcenie), nie koszt many', () => {
  const state = discoverState(SAC_SPELL);
  const offers = discoverFrees(state);
  assert.ok(offers.some((c) => c.sacrificeTargetId === 'mine'),
    'CR 701.53 + 118.9d: rzut bez kosztu many nadal wymaga kosztu dodatkowego');
  const handBefore = state.zones.hand.length;
  const manaBefore = state.players.find((p) => p.id === 'p1').mana;
  const r = execute(state, offers.find((c) => c.sacrificeTargetId === 'mine'));
  assert.ok(r.ok, `rzut przyjęty (${r.events[0]?.reason ?? ''})`);
  assert.ok(!state.zones.battlefield.includes('mine'), 'ofiara poświęcona mimo darmowego rzutu');
  assert.equal(state.players.find((p) => p.id === 'p1').mana, manaBefore, 'mana czaru NIE jest pobierana (za darmo)');
  resolveStack(state);
  assert.equal(state.zones.hand.length, handBefore + 2, 'efekt czaru: dobierz dwie karty');
});

test('A93/C: Discover — koszt nieobsługiwany: brak oferty darmowego rzutu', () => {
  const state = discoverState(DISCARD_SPELL);
  assert.equal(discoverFrees(state).length, 0, 'Cathartic Reunion: brak ścieżki zapłaty = brak oferty');
  const r = execute(state, { type: 'resolve_discover_choice', playerId: 'p1', castFree: true });
  assert.equal(r.ok, false, 'komenda spoza oferty odrzucona (L48)');
  assert.equal(state.zones.stack.length, 0);
});
