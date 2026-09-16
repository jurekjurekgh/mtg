// Znalezisko właściciela A (2026-09-15):
//
//   „Karta Cathartic Reunion. Gdy rzucam ten czar muszę discard 2 karty.
//    Mam dokładnie 2 karty. Pokazuje mi się modal wyboru. Po co? Skoro mam
//    dokładnie 2 karty i mam wyrzucić 2 karty to wyrzucenie powinno być
//    automatyczne."
//
// Reguła pinowana (generyczna, nie pod kartę): wymuszony discard CAŁOŚCI
// (brak allowDecline, kandydaci == liczbie wymaganej, > 0) rozstrzyga się sam
// w tej samej komendzie — bez pendingDiscardChoice, bez discard_choice_required
// (modal), z tymi samymi skutkami co wybór ręczny (madness, onCreatureDiscard,
// kontynuacje kosztu/efektu). Modal ZOSTAJE przy realnym wyborze i przy
// allowDecline (Nightsnare — rezygnacja to prawdziwa opcja).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1') {
  const state = createGameState({ seed: 157, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function putCard(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, ...patch,
  });
  return state.objects.get(id);
}

function handOf(state, playerId) {
  return state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === playerId);
}

function resolveStack(state, max = 16) {
  for (let i = 0; i < max && state.zones.stack.length > 0; i += 1) {
    const r = execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
    if (!r.ok) return false;
  }
  return state.zones.stack.length === 0;
}

test('A: Reunion przy dokładnie 2 kartach — BEZ modala, obie odrzucone kosztem', () => {
  const state = game('p1');
  putCard(state, 'spell', 'cathartic-reunion', 'p1', 'hand');
  putCard(state, 'h1', 'giant-spider', 'p1', 'hand');
  putCard(state, 'h2', 'basic-forest', 'p1', 'hand');
  for (let i = 0; i < 5; i += 1) putCard(state, `lib${i}`, 'basic-island', 'p1', 'library');
  addMana(state, 'p1', 2, { colors: ['R'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'spell');
  assert.ok(cast, 'rzut oferowany (są dwie karty na koszt)');
  const r = execute(state, cast);
  assert.ok(r.ok);
  assert.equal(state.pendingDiscardChoice, null, 'brak decyzji — nie ma wyboru');
  assert.equal(r.events.filter((e) => e.type === 'discard_choice_required').length, 0, 'bez modala');
  assert.equal(r.events.filter((e) => e.type === 'card_discarded').length, 2, 'obie karty odrzucone');
  assert.ok(!playerView(state, 'p1').legalCommands.some((c) => c.type === 'resolve_discard_choice'),
    'brak oferty odrzucenia w widoku');
  assert.deepEqual(handOf(state, 'p1'), [], 'ręka pusta po koszcie');
  assert.equal(state.zones.stack.length, 1, 'czar na stosie');
  assert.ok(resolveStack(state), 'stos schodzi bez decyzji');
  assert.equal(handOf(state, 'p1').length, 3, 'draw 3 po rozstrzygnięciu');
});

test('A: anty-over-fix — przy 3 kartach modal ZOSTAJE (realny wybór 2 z 3)', () => {
  const state = game('p1');
  putCard(state, 'spell', 'cathartic-reunion', 'p1', 'hand');
  putCard(state, 'h1', 'giant-spider', 'p1', 'hand');
  putCard(state, 'h2', 'basic-forest', 'p1', 'hand');
  putCard(state, 'h3', 'basic-island', 'p1', 'hand');
  addMana(state, 'p1', 2, { colors: ['R'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'spell');
  const r = execute(state, cast);
  assert.ok(r.ok);
  assert.ok(state.pendingDiscardChoice, 'decyzja otwarta — wybór 2 z 3 istnieje');
  assert.equal(r.events.filter((e) => e.type === 'discard_choice_required').length, 1, 'modal jest');
  const batch = execute(state, { type: 'resolve_discard_choice', playerId: 'p1', cardIds: ['h1', 'h2'] });
  assert.ok(batch.ok);
  assert.equal(state.pendingDiscardChoice, null);
});

test('A: madness przy auto-discarcie — decyzja rzutu otwiera się w tej samej komendzie', () => {
  const state = game('p1');
  putCard(state, 'spell', 'cathartic-reunion', 'p1', 'hand');
  putCard(state, 'rev', 'revolutionist', 'p1', 'hand');
  putCard(state, 'h2', 'basic-forest', 'p1', 'hand');
  for (let i = 0; i < 5; i += 1) putCard(state, `lib${i}`, 'basic-island', 'p1', 'library');
  addMana(state, 'p1', 2, { colors: ['R'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'spell');
  const r = execute(state, cast);
  assert.ok(r.ok);
  assert.equal(state.pendingDiscardChoice, null, 'discard całości bez decyzji');
  assert.ok(state.pendingMadnessCast, 'madness otwarty w tej samej komendzie (CR 702.35a)');
  assert.equal(state.pendingMadnessCast.cardId, 'revolutionist');
  assert.ok(r.events.findLastIndex((e) => e.type === 'card_discarded')
    < r.events.findIndex((e) => e.type === 'madness_ready_required'),
    'najpierw odrzucenia, potem decyzja madness');
  const decline = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'resolve_madness_cast' && !c.cast);
  assert.ok(decline && execute(state, decline).ok);
  assert.equal(state.pendingMadnessCast, null);
  assert.ok(resolveStack(state));
  assert.equal(handOf(state, 'p1').length, 3, 'draw 3 po rozstrzygnięciu');
});

test('A: Scholar z 1 kartą po doborze — auto-discard + untap/transform po stworze', () => {
  const state = game('p1');
  // Obiekt jak z talii (createCardDeck): druga strona DFC na obiekcie.
  const back = REGISTRY.get('homicidal-brute');
  putCard(state, 'scholar', 'civilized-scholar', 'p1', 'battlefield', {
    frontFaceId: 'civilized-scholar',
    transformTo: {
      cardId: back.id, kind: gameObjectDataOf(back).kind,
      power: back.power, toughness: back.toughness,
      abilities: back.abilities ?? [], keywords: back.keywords ?? [],
      subtypes: back.subtypes ?? [], types: back.types ?? [],
    },
  });
  state.objects.set('scholar', Object.freeze({ ...state.objects.get('scholar'), summoningSickness: false }));
  putCard(state, 'lib0', 'giant-spider', 'p1', 'library');
  const activation = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'scholar');
  assert.ok(activation, 'aktywacja Scholar oferowana');
  assert.ok(execute(state, activation).ok);
  assert.ok(resolveStack(state), 'zdolność schodzi bez decyzji');
  assert.equal(state.pendingDiscardChoice, null, 'discard 1 z 1 bez decyzji');
  assert.deepEqual(handOf(state, 'p1'), [], 'dobrana karta odrzucona');
  assert.equal(state.events.filter((e) => e.type === 'card_discarded').length, 1);
  assert.equal(state.events.filter((e) => e.type === 'discard_choice_required').length, 0, 'bez modala');
  const scholar = state.objects.get('scholar');
  assert.equal(scholar.tapped, false, 'Scholar odkręcony po odrzuceniu stwora');
  assert.equal(scholar.cardId, 'homicidal-brute', 'Scholar przemieniony (tył DFC)');
});

test('A: koszt zdolności Plague Reaver 2 z 2 — auto + aktywacja wykonana', () => {
  const state = game('p1');
  putCard(state, 'reaver', 'plague-reaver', 'p1', 'battlefield');
  putCard(state, 'h1', 'giant-spider', 'p1', 'hand');
  putCard(state, 'h2', 'basic-forest', 'p1', 'hand');
  const activation = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'reaver');
  assert.ok(activation, 'aktywacja Reaver oferowana (są 2 karty na koszt)');
  const r = execute(state, activation);
  assert.ok(r.ok);
  assert.equal(state.pendingDiscardChoice, null, 'koszt 2 z 2 bez decyzji');
  assert.equal(state.pendingAbilityActivation, null, 'wstrzymana aktywacja wykonana od razu');
  assert.notEqual(state.objects.get('reaver')?.zone, 'battlefield', 'Reaver poświęcony kosztem');
  assert.equal(r.events.filter((e) => e.type === 'card_discarded').length, 2);
});

test('A: Toll mandatory z 1 kartą nielądową — auto (wybierający nie ma wyboru), reveal + amass działają', () => {
  const state = game('p1');
  putCard(state, 'toll', 'toll-of-the-invasion', 'p1', 'hand');
  putCard(state, 'oppland', 'basic-swamp', 'p2', 'hand');
  putCard(state, 'oppcrt', 'highland-game', 'p2', 'hand');
  addMana(state, 'p1', 3, { colors: ['B'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'toll' && (c.targets ?? []).includes('p2'));
  assert.ok(cast, 'rzut Toll w p2 oferowany');
  assert.ok(execute(state, cast).ok);
  assert.ok(resolveStack(state), 'stos schodzi bez decyzji');
  assert.equal(state.pendingDiscardChoice, null, 'mandatory 1 z 1 bez decyzji');
  assert.equal(state.events.filter((e) => e.type === 'hand_revealed').length, 1, 'ręka odsłonięta');
  assert.ok([...state.objects.values()].some((o) => o.cardId === 'highland-game' && o.zone === 'graveyard'),
    'jedyny nonland odrzucony');
  assert.equal(handOf(state, 'p2').length, 1, 'ląd zostaje w ręce');
  assert.ok([...state.objects.values()].some((o) => o.isToken && (o.subtypes ?? []).includes('Army')),
    'amass mimo auto-discarda');
});

test('A: anty-over-fix — rezygnacja Nightsnare przy 3 kartach zostawia wybór 2 z 3', () => {
  const state = game('p1');
  putCard(state, 'snare', 'nightsnare', 'p1', 'hand');
  putCard(state, 'h1', 'hill-giant', 'p2', 'hand');
  putCard(state, 'h2', 'goblin-piker', 'p2', 'hand');
  putCard(state, 'h3', 'basic-island', 'p2', 'hand');
  addMana(state, 'p1', 4, { colors: ['B'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'snare' && (c.targets ?? []).includes('p2'));
  assert.ok(execute(state, cast).ok);
  for (let i = 0; i < 8 && !state.pendingDiscardChoice; i += 1) {
    assert.ok(execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId }).ok);
  }
  assert.ok(execute(state, { type: 'resolve_discard_choice', playerId: 'p1', cardId: null }).ok);
  assert.ok(state.pendingDiscardChoice, 'wybór 2 z 3 istnieje — modal właściciela zostaje');
  assert.equal(state.pendingDiscardChoice.count, 2);
  assert.ok(playerView(state, 'p2').legalCommands.some((c) => c.type === 'resolve_discard_choice'),
    'oferta odrzucenia dla właściciela ręki');
  assert.ok(execute(state, { type: 'resolve_discard_choice', playerId: 'p2', cardIds: ['h1', 'h2'] }).ok);
  assert.equal(state.pendingDiscardChoice, null);
});

test('A: anty-over-fix — Nightsnare z 1 kartą nielądową NADAL pyta (rezygnacja to opcja)', () => {
  const state = game('p1');
  putCard(state, 'snare', 'nightsnare', 'p1', 'hand');
  putCard(state, 'h1', 'hill-giant', 'p2', 'hand');
  putCard(state, 'l1', 'basic-forest', 'p2', 'hand');
  addMana(state, 'p1', 4, { colors: ['B'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'snare' && (c.targets ?? []).includes('p2'));
  assert.ok(cast, 'rzut Nightsnare na p2 oferowany');
  assert.ok(execute(state, cast).ok);
  for (let i = 0; i < 8 && !state.pendingDiscardChoice; i += 1) {
    assert.ok(execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId }).ok);
  }
  assert.ok(state.pendingDiscardChoice, 'decyzja otwarta mimo 1 kandydata — rezygnacja to opcja');
  assert.equal(state.pendingDiscardChoice.allowDecline, true);
  const offers = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'resolve_discard_choice');
  assert.ok(offers.some((c) => c.cardId == null), 'oferta rezygnacji („If you don’t") istnieje');
  assert.ok(execute(state, { type: 'resolve_discard_choice', playerId: 'p1', cardId: null }).ok);
  assert.equal(state.pendingDiscardChoice, null, 'po rezygnacji 2 z 2 bez kolejnego modala');
  assert.deepEqual(handOf(state, 'p2'), [], 'właściciel ręki odrzucił obie karty');
});
