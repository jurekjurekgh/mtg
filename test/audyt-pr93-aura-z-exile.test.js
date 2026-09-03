// Audyt PR #93 (2026-09-03), znalezisko E — czysta aura wygnana w oknie
// zdolności nie miała ŻADNEJ oferty rzutu, choć Oracle Vaana mówi bez
// ograniczenia „You may cast it” (wygnana jest karta, nie „instant or
// sorcery”). Aura to czar z celem wybieranym przy rzucie (CR 303.4a /
// 601.2c) — okno, które potrafi wyliczyć gospodarza, może ją rozliczyć.
//
// Miara: 22 aury w 12 z 23 talii (`decks/*.txt`), Vaan w `final-fantasy` —
// więc przeciwnik z talią Theros/Innistrad/Ravnica dokłada żywy przypadek.
//
// Discover zostaje przy aurach zamknięte ŚWIADOMIE (jak przy trybach z celem,
// CR 608.2b): tamto okno nie wylicza celów, a czaru wymagającego celu nie
// da się rzucić bez wyboru celu. Przypięte testem, nie milczeniem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';

const REGISTRY = createCardRegistry();
const AURA_CREATURE = 'grounded';                 // {1}{G}, Enchant creature
const AURA_PLAYER = 'curse-of-the-pierced-heart'; // {1}{R}, Enchant player (Curse)

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

/** Gospodarze wszystkich typów: stwór, artefakt, land, enchantment — po jednym na gracza. */
function gospodarze(state) {
  addSimpleCreature(state, 'mine', 'p1');
  addSimpleCreature(state, 'foe', 'p2');
  for (const [id, kind, types] of [['art', 'artifact', ['Artifact']], ['land', 'land', ['Land']], ['ench', 'enchantment', ['Enchantment']]]) {
    addObject(state, {
      id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
      kind, manaCost: 1, abilities: [], keywords: [], subtypes: [], types, colors: [],
    });
  }
}

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
function exileState(topCardId, { mana = 10, colors = ['W', 'U', 'B', 'R', 'G'] } = {}) {
  const state = game('p1', 'main');
  addMana(state, 'p1', mana, { colors });
  gospodarze(state);
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
  addMana(state, 'p1', 10, { colors: ['W', 'U', 'B', 'R', 'G'] });
  gospodarze(state);
  biblioteka(state);
  put(state, 'found', cardId, 'p1', 'exile');
  state.pendingDiscover = {
    playerId: 'p1', foundExileId: 'found', foundCardId: cardId,
    restExileIds: [], restorePriorityTo: 'p1', amount: 3,
  };
  return state;
}

/** Obiekt po rzucie: karta wędruje na stos pod nowym id, więc szukamy po cardId. */
const findByCard = (state, cardId) => [...state.objects.values()].find((o) => o.cardId === cardId);

const exileCasts = (state) => playerView(state, 'p1').legalCommands
  .filter((c) => c.type === 'resolve_exile_cast' && c.cast === true);

function resolveStack(state, limit = 40) {
  for (let i = 0; i < limit && state.zones.stack.length > 0; i += 1) {
    const pass = playerView(state, state.turn.priorityPlayerId).legalCommands.find((c) => c.type === 'pass_priority');
    if (!pass) break;
    const r = execute(state, pass);
    if (!r.ok && /(_unresolved|not_your_decision)$/.test(r.events[0]?.reason ?? '')) break;
  }
  return state;
}

test('A93/E: Vaan — czysta aura jest rzucalna, a gospodarza wybiera gracz (CR 303.4a)', () => {
  const state = exileState(AURA_CREATURE);
  const offers = exileCasts(state);
  assert.ok(offers.length > 0, 'Oracle: „You may cast it” — aura to czar; dziś nie ma żadnej oferty');
  assert.ok(offers.every((c) => (c.targets ?? []).length === 1),
    'każdy wariant niesie dokładnie jeden cel (gospodarza)');
  const hosts = new Set(offers.map((c) => c.targets[0]));
  assert.ok(hosts.has('foe') && hosts.has('mine'),
    `„Enchant creature” bez ograniczenia kontrolera: gospodarzem bywa stwór obu graczy ([${[...hosts]}])`);
  assert.ok(!hosts.has('land'), 'land nie jest stworem — nie bywa gospodarzem tej aury');
});

test('A93/E: Vaan — rzut aury z okna: koszt many i wejście na pole bitwy załączona', () => {
  const state = exileState(AURA_CREATURE);
  const cast = exileCasts(state).find((c) => c.targets?.[0] === 'foe');
  assert.ok(cast, 'wariant z gospodarzem „foe”');
  const manaBefore = state.players.find((p) => p.id === 'p1').mana;
  assert.ok(execute(state, cast).ok, 'rzut przyjęty');
  assert.equal(manaBefore - state.players.find((p) => p.id === 'p1').mana, 2, 'koszt aury {1}{G}');
  resolveStack(state);
  const aura = findByCard(state, AURA_CREATURE);
  assert.ok(aura, 'karta aury istnieje po rzucie (nowy obiekt na stosie/polu bitwy)');
  assert.equal(aura.zone, 'battlefield', 'aura wchodzi na pole bitwy po rozstrzygnięciu');
  assert.equal(aura.attachedTo, 'foe', 'załączona do wybranego gospodarza');
});

test('A93/E: Vaan — aura „Enchant player” (Curse) celuje w gracza, nie w stwora', () => {
  const state = exileState(AURA_PLAYER);
  const offers = exileCasts(state);
  assert.ok(offers.length > 0, 'Curse jest rzucalna z okna zdolności');
  const hosts = new Set(offers.map((c) => c.targets?.[0]));
  assert.deepEqual([...hosts].sort(), ['p1', 'p2'], `celami są obaj gracze ([${[...hosts]}])`);
  const cast = offers.find((c) => c.targets?.[0] === 'p2');
  assert.ok(execute(state, cast).ok, 'rzut przyjęty');
  resolveStack(state);
  const curse = findByCard(state, AURA_PLAYER);
  assert.ok(curse, 'Curse po rzucie');
  assert.equal(curse.zone, 'battlefield', 'Curse wchodzi na pole bitwy');
  assert.equal(curse.enchantedPlayerId, 'p2', 'Curse zaczepiona o wybranego gracza');
});

test('A93/E: Vaan — aura (timing sorcery) w oknie zdolności nie pyta o fazę', () => {
  const state = exileState(AURA_CREATURE);
  state.turn.phase = 'combat';
  const cast = exileCasts(state).find((c) => c.targets?.[0] === 'mine');
  assert.ok(cast, 'oferta istnieje poza main phase');
  assert.ok(execute(state, cast).ok, 'rzut w oknie zdolności ignoruje timing (ruling WotC 2025-02-10)');
});

test('A93/E: Discover — aura bez oferty (okno nie wylicza celów) i komenda odrzucona', () => {
  const state = discoverState(AURA_CREATURE);
  const free = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'resolve_discover_choice' && c.castFree === true);
  assert.equal(free.length, 0, 'czar wymagający celu nie ma oferty w oknie darmowego rzutu');
  assert.equal(execute(state, { type: 'resolve_discover_choice', playerId: 'p1', castFree: true }).ok, false);
  assert.equal(state.zones.stack.length, 0);
});

test('A93/E: strażnik klasy — KAŻDA aura katalogu jest rzucalna w oknie zdolności', () => {
  const aury = REGISTRY.all().filter((card) => card.aura || card.bestow);
  assert.ok(aury.length >= 20, `katalog ma aury (znaleziono ${aury.length})`);
  const bezOferty = [];
  for (const card of aury) {
    const state = exileState(card.id);
    if (exileCasts(state).length === 0) bezOferty.push(card.id);
  }
  assert.deepEqual(bezOferty, [],
    'każda aura katalogu musi mieć ofertę w oknie zdolności (Oracle: „You may cast it”) '
    + '— reguła nie zależy od wybranej karty (ADR 0002)');
});
