// Audyt PR #93 (2026-09-03), znalezisko D — czwarte wyłączenie „prostego
// zakresu”: karta z kosztem X (CR 107.3a) wygnana w oknie zdolności nie miała
// ŻADNEJ oferty rzutu, choć Oracle Vaana mówi „You may cast it”, a X wybiera
// gracz w chwili rzutu.
//
// Zakres naprawy wyznacza CR 107.3b:
//   • okno zdolności (Vaan) płaci koszt many → X wybiera gracz (0..budżet),
//   • darmowy rzut Discover NIE płaci kosztu many → „the only legal choice for
//     X is 0”, a obie karty X w katalogu robią wtedy NIC (Epic Experiment
//     wygania 0 kart, Consume Spirit zadaje 0 obrażeń). Oferta takiego ruchu
//     byłaby no-opem — tę samą klasę właściciel zgłaszał jako uwagę F (M280),
//     więc Discover dla kart X zostaje ŚWIADOMIE zamknięty i przypięty testem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';

const REGISTRY = createCardRegistry();
const X_BLACK = 'consume-spirit';      // {2}{B} + X, „spend only black mana on X”
const X_UNTARGETED = 'epic-experiment'; // {U}{R} + X, bez celów
const FIREBALL = 'fireball';            // {R} + X + {1} za każdy cel ponad pierwszy

function game(playerId = 'p1', step = 'main') {
  const state = createGameState({ seed: 93, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function put(state, id, cardId, controllerId, zone, patch = {}) {
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
}

/** Biblioteka — bez niej Epic Experiment (wyganianie) i dobieranie kończą partię (CR 704.5a). */
function biblioteka(state) {
  for (let i = 0; i < 8; i += 1) {
    addObject(state, {
      id: `lib${i}`, instanceId: `i-lib${i}`, cardId: 'test-lib', controllerId: 'p1', ownerId: 'p1',
      zone: 'library', kind: 'spell', manaCost: 1, types: ['Instant'], colors: [], subtypes: [],
      keywords: [], spell: { timing: 'instant', targets: [], effects: [] },
    });
  }
}

/** Okno zdolności Vaana: `topCardId` wygnane z biblioteki przeciwnika. */
function exileState(topCardId, { mana = 10, colors = ['B', 'R', 'U'] } = {}) {
  const state = game('p1', 'main');
  addMana(state, 'p1', mana, { colors });
  addSimpleCreature(state, 'foe', 'p2');
  biblioteka(state);
  put(state, 'stolen', topCardId, 'p2', 'exile');
  state.pendingExileCast = {
    playerId: 'p1', objectId: 'stolen', cardId: topCardId, sourceId: 'vaan', restorePriorityTo: 'p1',
  };
  return state;
}

/** Decyzja Discover: znaleziona karta `cardId` leży w exile. */
function discoverState(cardId) {
  const state = game('p1', 'main');
  addMana(state, 'p1', 10, { colors: ['B', 'R', 'U', 'G', 'W'] });
  addSimpleCreature(state, 'foe', 'p2');
  biblioteka(state);
  put(state, 'found', cardId, 'p1', 'exile');
  state.pendingDiscover = {
    playerId: 'p1', foundExileId: 'found', foundCardId: cardId,
    restExileIds: [], restorePriorityTo: 'p1', amount: 3,
  };
  return state;
}

const exileCasts = (state) => playerView(state, 'p1').legalCommands
  .filter((c) => c.type === 'resolve_exile_cast' && c.cast === true);

function resolveStack(state, limit = 40) {
  for (let i = 0; i < limit && state.zones.stack.length > 0; i += 1) {
    const pass = playerView(state, state.turn.priorityPlayerId).legalCommands.find((c) => c.type === 'pass_priority');
    if (!pass) break;
    const r = execute(state, pass);
    if (!r.ok && /(_unresolved|not_your_decision)$/.test(r.events[0]?.reason ?? '')) break;
  }
}

test('A93/D: Vaan — czar z kosztem X jest rzucalny, a X wybiera gracz (CR 107.3a)', () => {
  const state = exileState(X_BLACK);
  const offers = exileCasts(state);
  assert.ok(offers.length > 0,
    'Oracle: „You may cast it” — X nie wyłącza rzutu; dziś karta nie ma żadnej oferty');
  const xValues = new Set(offers.map((c) => c.xValue));
  assert.ok(xValues.size > 1, `warianty różnią się wartością X (${[...xValues].join(',')})`);
  assert.ok([...xValues].every((x) => Number.isInteger(x) && x >= 0), 'X jest nieujemną liczbą całkowitą');
  assert.ok(offers.every((c) => (c.targets ?? []).length === 1), 'każdy wariant niesie cel czaru');
});

test('A93/D: Vaan — X wybrany w ofercie jest rozliczony: mana, efekt i życie', () => {
  const state = exileState(X_BLACK);
  const offers = exileCasts(state).filter((c) => (c.targets ?? []).includes('foe'));
  const cast = offers.find((c) => c.xValue === 2);
  assert.ok(cast, 'wariant X=2 z celem wróg');
  const manaBefore = state.players.find((p) => p.id === 'p1').mana;
  const lifeBefore = state.players.find((p) => p.id === 'p1').life;
  const r = execute(state, cast);
  assert.ok(r.ok, `rzut z X przyjęty (${r.events[0]?.reason ?? ''})`);
  // {2}{B} bazy (manaCost 2 + pip B) + X = 2 → 4 many.
  assert.equal(manaBefore - state.players.find((p) => p.id === 'p1').mana, 4, 'koszt = baza + X');
  resolveStack(state);
  assert.ok(!state.zones.battlefield.includes('foe'), 'cel z X=2 obrażeń ginie (stwór 2/2)');
  assert.equal(state.players.find((p) => p.id === 'p1').life, lifeBefore + 2, 'zyskujesz X życia');
});

test('A93/D: Vaan — sorcery z X w oknie zdolności ignoruje timing (ruling WotC 2025-02-10)', () => {
  const state = exileState(X_BLACK);
  state.turn.phase = 'combat';   // poza main phase: zwykły sorcery zostałby odrzucony
  const cast = exileCasts(state).find((c) => c.xValue === 1);
  assert.ok(cast, 'oferta istnieje także poza main phase');
  assert.ok(execute(state, cast).ok, 'rzut w oknie zdolności nie pyta o fazę');
});

test('A93/D: Vaan — maksymalny oferowany X jest opłacalny (L48: oferta = wykonanie)', () => {
  const state = exileState(X_BLACK, { mana: 6 });
  const offers = exileCasts(state).filter((c) => (c.targets ?? []).includes('foe'));
  const maxX = Math.max(...offers.map((c) => c.xValue));
  const cast = offers.find((c) => c.xValue === maxX);
  const r = execute(state, cast);
  assert.ok(r.ok, `najwyższy oferowany X (${maxX}) musi dać się zapłacić (${r.events[0]?.reason ?? ''})`);
  assert.ok(offers.every((c) => c.xValue <= maxX), 'żaden wariant nie przekracza budżetu');
});

test('A93/D: Vaan — Fireball: X i liczba celów w ofercie, koszt {1} za cel ponad pierwszy', () => {
  const manaOf = (st) => st.players.find((p) => p.id === 'p1').mana;
  // (a) jeden cel: całe X idzie w stwora (2/2 ginie), koszt = {R} + X.
  const one = exileState(FIREBALL, { mana: 10, colors: ['R'] });
  const single = exileCasts(one).find((c) => (c.targets ?? []).length === 1 && c.xValue === 3);
  assert.ok(single, 'wariant z jednym celem i X=3');
  const beforeOne = manaOf(one);
  assert.ok(execute(one, single).ok, 'rzut przyjęty');
  assert.equal(beforeOne - manaOf(one), 4, 'koszt = {R} (1) + X (3)');
  resolveStack(one);
  assert.ok(!one.zones.battlefield.includes('foe'), 'obrażenia X=3 zabijają stwora 2/2');

  // (b) dwa cele: X dzieli się po równo w dół, a drugi cel kosztuje {1} więcej.
  const two = exileState(FIREBALL, { mana: 10, colors: ['R'] });
  const pair = exileCasts(two).find((c) => (c.targets ?? []).length === 2 && c.xValue === 3);
  assert.ok(pair, 'wariant z dwoma celami i X=3');
  const beforeTwo = manaOf(two);
  const lifeBefore = two.players.find((p) => p.id === 'p1').life;
  const lifeFoe = two.players.find((p) => p.id === 'p2').life;
  assert.ok(execute(two, pair).ok, 'rzut przyjęty');
  assert.equal(beforeTwo - manaOf(two), 5, 'koszt = {R} (1) + X (3) + {1} za drugi cel');
  resolveStack(two);
  const foe = two.objects.get('foe');
  assert.ok(two.zones.battlefield.includes('foe'), 'X=3 dzielone na dwa cele = 1 obrażenie każdy — stwór 2/2 przeżywa');
  assert.equal(foe.damage, 1, 'znacznik obrażeń na stworze');
  const lifeLost = (lifeBefore - two.players.find((p) => p.id === 'p1').life)
    + (lifeFoe - two.players.find((p) => p.id === 'p2').life);
  assert.equal(lifeLost, 1, 'gracz-cel traci 1 życie (3 / 2 = 1 w dół)');
});

test('A93/D: Discover — karta z X pozostaje bez oferty: CR 107.3b wymusza X=0, czyli no-op', () => {
  for (const cardId of [X_BLACK, X_UNTARGETED]) {
    const state = discoverState(cardId);
    const free = playerView(state, 'p1').legalCommands
      .filter((c) => c.type === 'resolve_discover_choice' && c.castFree === true);
    assert.equal(free.length, 0,
      `${cardId}: rzut bez kosztu many zmusza X=0 (CR 107.3b), a przy X=0 karta `
      + 'nie robi nic — oferta byłaby no-opem (uwaga właściciela F z M280)');
    assert.equal(execute(state, { type: 'resolve_discover_choice', playerId: 'p1', castFree: true }).ok, false,
      'komenda spoza oferty odrzucona (L48)');
    assert.equal(state.zones.stack.length, 0);
  }
});

test('A93/D: strażnik klasy — KAŻDA karta X katalogu jest rzucalna w oknie zdolności', () => {
  const xCards = REGISTRY.all().filter((card) => card.spell?.xCost || card.spell?.fireball);
  assert.ok(xCards.length >= 3, `katalog ma karty X (znaleziono ${xCards.length})`);
  const bezOferty = [];
  for (const card of xCards) {
    const state = exileState(card.id, { mana: 10, colors: ['B', 'R', 'U', 'G', 'W'] });
    if (exileCasts(state).length === 0) bezOferty.push(card.id);
  }
  assert.deepEqual(bezOferty, [],
    'każda karta z kosztem X w katalogu musi mieć ofertę w oknie zdolności '
    + '(CR 107.3a — X wybiera gracz); reguła nie zależy od wybranej karty (ADR 0002)');
});
