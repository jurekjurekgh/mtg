// M201/U2 (kolejka z audytu PR #68, CR 601.2h): rzut BEZ KOSZTU MANY nadal
// wymaga zapłacenia KOSZTÓW DODATKOWYCH.
//
// CR 601.2h: „the player … pays the total cost” — koszt całkowity zawiera
// koszty dodatkowe („As an additional cost to cast this spell, sacrifice
// a creature”). Rzut „without paying its mana cost” (Epic Experiment,
// suspend, rebound) zwalnia WYŁĄCZNIE z kosztu many (CR 118.5).
//
// Stan przed fixem: `epicCastOffers` nie patrzyło na `additionalCost`, więc
// Epic Experiment rzucał Village Rites (i Bone Splinters, Severed Strands,
// Lash of the Balrog) ZA DARMO, bez poświęcenia stwora — złamanie reguł na
// korzyść rzucającego. Ścieżki siostrzane (madness, Halo Forager) takie
// karty pomijały; ta jedna ich nie filtrowała ani nie płaciła.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView, execute } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { TURN_STEPS, initialTurn } from '../src/engine/turn.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, zone, patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  if (Object.keys(patch).length) state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  return state.objects.get(id);
}

function epicState({ exiles = [], creatures = 0, lands = 0, foeCreatures = 0 } = {}) {
  const state = createGameState({ seed: 33, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = { ...initialTurn('p1'), ...TURN_STEPS[3], stepIndex: 3, activePlayerId: 'p1', priorityPlayerId: 'p1', passes: 0 };
  const exileIds = [];
  exiles.forEach((cardId, i) => {
    put(state, `ex${i}`, cardId, 'p1', 'exile');
    exileIds.push(`ex${i}`);
  });
  for (let i = 0; i < creatures; i += 1) {
    addObject(state, {
      id: `cre${i}`, instanceId: `i-cre${i}`, cardId: 'hill-giant', controllerId: 'p1', ownerId: 'p1',
      zone: 'battlefield', kind: 'creature', power: 3, toughness: 3, types: ['Creature'], abilities: [],
    });
  }
  for (let i = 0; i < foeCreatures; i += 1) {
    addObject(state, {
      id: `foe${i}`, instanceId: `i-foe${i}`, cardId: 'hill-giant', controllerId: 'p2', ownerId: 'p2',
      zone: 'battlefield', kind: 'creature', power: 3, toughness: 3, types: ['Creature'], abilities: [],
    });
  }
  for (let i = 0; i < lands; i += 1) put(state, `sw${i}`, 'basic-swamp', 'p1', 'battlefield');
  state.pendingEpicExperiment = { playerId: 'p1', exileIds, maxMV: 5, restorePriorityTo: 'p1' };
  return state;
}

const epicOffers = (state) => playerView(state, 'p1').legalCommands
  .filter((c) => c.type === 'resolve_epic_choice' && !c.done);

test('M201/U2: bez stwora do poświęcenia darmowy rzut Village Rites NIE jest oferowany', () => {
  const state = epicState({ exiles: ['village-rites'], creatures: 0 });
  assert.deepEqual(epicOffers(state), [],
    'CR 601.2h: nieopłacalny koszt dodatkowy = czaru nie da się rzucić (nawet „za darmo”)');
});

test('M201/U2: ze stworem oferta niesie cel poświęcenia, a rzut faktycznie go poświęca', () => {
  const state = epicState({ exiles: ['village-rites'], creatures: 1 });
  const offers = epicOffers(state);
  assert.equal(offers.length, 1, 'jedna oferta = jeden kandydat do poświęcenia');
  assert.equal(offers[0].sacrificeTargetId, 'cre0', 'oferta nazywa płatność kosztu dodatkowego');
  const before = state.events.length;
  assert.equal(execute(state, offers[0]).ok, true);
  const events = state.events.slice(before);
  assert.ok(events.some((e) => e.type === 'permanent_sacrificed' && e.fromId === 'cre0' && e.additionalCost === true),
    'koszt dodatkowy zapłacony przy rzucie (CR 601.2h)');
  assert.equal(state.objects.get('cre0'), undefined, 'stwór opuścił pole bitwy');
  assert.ok(state.zones.stack.some((id) => state.objects.get(id)?.cardId === 'village-rites'),
    'czar trafił na stos');
});

test('M201/U2: komenda BEZ zapłaty kosztu dodatkowego jest odrzucona', () => {
  const state = epicState({ exiles: ['village-rites'], creatures: 1 });
  const forced = execute(state, {
    type: 'resolve_epic_choice', playerId: 'p1', cardId: 'ex0', targets: [],
  });
  assert.equal(forced.ok, false, 'darmowy rzut nie może pominąć kosztu dodatkowego');
  assert.equal(state.objects.get('cre0')?.zone, 'battlefield', 'stwór nietknięty');
});

test('M201/U2: wariant „albo zapłać {4}” (Lash of the Balrog) przy dostępnej manie', () => {
  // Lash of the Balrog celuje w stwora — cel daje przeciwnik, więc brak
  // WŁASNEGO stwora zostawia wyłącznie wariant „zapłać {4}".
  const state = epicState({ exiles: ['lash-of-the-balrog'], creatures: 0, foeCreatures: 1, lands: 4 });
  const offers = epicOffers(state);
  assert.ok(offers.some((o) => o.payAltCost === true),
    'brak stwora, ale mana na {4} jest — Oracle daje wybór alternatywny');
});

test('M201/U2: granica zakresu — koszt „discard N” nie jest oferowany na darmowej ścieżce', () => {
  // Cathartic Reunion: koszt wymaga WYBORU kart (blokująca decyzja w trakcie
  // płacenia). Darmowa ścieżka jej nie obsługuje — zamiast łamać reguły
  // (rzut bez zapłaty) NIE oferuje rzutu; komenda wymuszona = jawny reject.
  const state = epicState({ exiles: ['cathartic-reunion'], creatures: 1 });
  assert.deepEqual(epicOffers(state), []);
  const forced = execute(state, { type: 'resolve_epic_choice', playerId: 'p1', cardId: 'ex0', targets: [] });
  assert.equal(forced.ok, false, 'jawny reject zamiast cichego pominięcia kosztu');
});

test('M201/U2: anty-over-fix — czar BEZ kosztu dodatkowego jest oferowany jak dotąd', () => {
  const state = epicState({ exiles: ['raise-the-alarm'], creatures: 1 });
  const offers = epicOffers(state);
  assert.ok(offers.length > 0, 'zwykły czar nadal rzucalny za darmo');
  assert.ok(offers.every((o) => o.sacrificeTargetId === undefined),
    'brak sztucznego kosztu tam, gdzie karta go nie ma');
});
