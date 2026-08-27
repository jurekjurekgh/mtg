// M103 — zgłoszenia właściciela A/B/D (2026-08-16): decyzje bota.
//
// A: bot rzucił Forge Devil przy pustym stole — obowiązkowy ETB trigger
//    „1 obrażenie celowemu stworowi + 1 obrażenie tobie" miał wtedy JEDYNY
//    legalny cel: samego Forge Devila. Stwór wchodził, dostawał 1, ginął,
//    a kontroler tracił życie. Czysta strata.
// B: bot rzucił Enter the Enigma („cel nie może być blokowany + dobierz")
//    na stworza PRZECIWNIKA w swojej turze — dawał ewazję wrogowi i płacił
//    za to kartę (efekt cant_be_blocked nie miał wyceny zależnej od celu).
// D: bot rzucił Sweet Oblivion (mill 4) W SIEBIE, a potem Escape z własnego
//    grobu, wyganiając 4 własne karty — cast_escape w ogóle nie miał wyceny
//    (default 0), więc bot wybierał warianty bez oceny skutków.
// Testy RED→GREEN; wyceny generyczne, bez nazw kart (ADR 0002).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function put(state, { id, cardId, controllerId, zone, kind }) {
  const card = REGISTRY.get(cardId);
  assert.ok(card, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone, kind,
    ...gameObjectDataOf(card), types: card.types ?? [], keywords: card.keywords ?? [],
    subtypes: card.subtypes ?? [], spell: card.spell,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function putCreature(state, id, controllerId, power, toughness) {
  put(state, { id, cardId: 'highland-game', controllerId, zone: 'battlefield', kind: 'creature' });
  const obj = state.objects.get(id);
  state.objects.set(id, Object.freeze({ ...obj, power, toughness }));
  return state.objects.get(id);
}

/** Tura bota (p2), priorytet bota, pełna mana. */
function botTurn() {
  const state = createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 10);
  return state;
}

const choose = (state) => {
  const bot = createHeuristicBot({ seed: 2026 });
  return bot.chooseCommand(playerView(state, 'p2'), {});
};

// ---------------------------------------------------------------------------
// A — Forge Devil
// ---------------------------------------------------------------------------

test('A: bot NIE rzuca stwora z ETB „dmg cel + dmg sobie" przy PUSTYM stole (RED)', () => {
  const state = botTurn();
  put(state, { id: 'devil', cardId: 'forge-devil', controllerId: 'p2', zone: 'hand', kind: 'creature' });
  // Stół pusty — po wejściu jedynym legalnym celem triggera jest sam devil.
  const choice = choose(state);
  assert.notEqual(choice.type, 'cast_permanent',
    `Forge Devil przy pustym stole to samobójstwo; bot wybrał: ${JSON.stringify(choice)}`);
});

test('A: bot nadal rzuca stwora z ETB-pingiem, gdy jest cel przeciwnika (anty-over-fix)', () => {
  const state = botTurn();
  put(state, { id: 'devil', cardId: 'forge-devil', controllerId: 'p2', zone: 'hand', kind: 'creature' });
  putCreature(state, 'enemy-x1', 'p1', 1, 1);
  const choice = choose(state);
  assert.equal(choice.type, 'cast_permanent', `ping wroga 1/1 jest opłacalny; bot wybrał: ${JSON.stringify(choice)}`);
});

// ---------------------------------------------------------------------------
// B — Enter the Enigma
// ---------------------------------------------------------------------------

test('B: bot NIE daje ewazji stworowi przeciwnika (RED)', () => {
  const state = botTurn();
  put(state, { id: 'enigma', cardId: 'enter-the-enigma', controllerId: 'p2', zone: 'hand', kind: 'spell' });
  putCreature(state, 'enemy-c', 'p1', 2, 2);
  const choice = choose(state);
  assert.notEqual(choice.type, 'cast_spell',
    `cant_be_blocked na stworze wroga to strata; bot wybrał: ${JSON.stringify(choice)}`);
});

test('B: bot nadal celuje ewazją we WŁASNEGO stwora (anty-over-fix)', () => {
  const state = botTurn();
  put(state, { id: 'enigma', cardId: 'enter-the-enigma', controllerId: 'p2', zone: 'hand', kind: 'spell' });
  putCreature(state, 'own-c', 'p2', 2, 2);
  putCreature(state, 'enemy-c', 'p1', 2, 2);
  const choice = choose(state);
  assert.equal(choice.type, 'cast_spell', `ewazja + dobranie na własnym stworze to dobry ruch; bot wybrał: ${JSON.stringify(choice)}`);
  assert.deepEqual(choice.targets, ['own-c']);
});

// ---------------------------------------------------------------------------
// D — Sweet Oblivion + Escape
// ---------------------------------------------------------------------------

function sweetOblivionGrave(state) {
  put(state, { id: 'oblivion', cardId: 'sweet-oblivion', controllerId: 'p2', zone: 'graveyard', kind: 'spell' });
  put(state, { id: 'g1', cardId: 'basic-swamp', controllerId: 'p2', zone: 'graveyard', kind: 'land' });
  put(state, { id: 'g2', cardId: 'basic-swamp', controllerId: 'p2', zone: 'graveyard', kind: 'land' });
  put(state, { id: 'g3', cardId: 'basic-swamp', controllerId: 'p2', zone: 'graveyard', kind: 'land' });
  put(state, { id: 'g4', cardId: 'basic-swamp', controllerId: 'p2', zone: 'graveyard', kind: 'land' });
}

test('D: Escape Sweet Oblivion celuje w PRZECIWNIKA, nie w siebie (RED)', () => {
  const state = botTurn();
  sweetOblivionGrave(state);
  const choice = choose(state);
  assert.equal(choice.type, 'cast_escape', `Escape z celem-wrogiem jest opłacalny; bot wybrał: ${JSON.stringify(choice)}`);
  assert.deepEqual(choice.targets, ['p1'], 'mill 4 celuje w przeciwnika');
});

test('D: Escape z kosztem 4 STWORÓW z grobu jest za drogi — bot nie ucieka (anty-over-fix)', () => {
  const state = botTurn();
  put(state, { id: 'oblivion', cardId: 'sweet-oblivion', controllerId: 'p2', zone: 'graveyard', kind: 'spell' });
  // 4 realne 5/5 (Gloomfang Mauler) jako jedyny możliwy koszt wygnania —
  // wycena bierze cechy z rejestru, bo widok grobu redaguje pola obiektów.
  for (const id of ['c1', 'c2', 'c3', 'c4']) {
    put(state, { id, cardId: 'gloomfang-mauler', controllerId: 'p2', zone: 'graveyard', kind: 'creature' });
  }
  const choice = choose(state);
  assert.notEqual(choice.type, 'cast_escape',
    `wygnanie 4 stworów za mill 4 to strata; bot wybrał: ${JSON.stringify(choice)}`);
});

// ---------------------------------------------------------------------------
// D2 — cap enumeracji wariantów Escape (perf + UX modala)
// ---------------------------------------------------------------------------

test('D2: Escape z dużym grobem — oferty bez wybuchu: cast tylko po celach,'
  + ' wygnanie jako pending z capowanymi ofertami (jak crew/combat)', () => {
  const state = botTurn();
  put(state, { id: 'oblivion', cardId: 'sweet-oblivion', controllerId: 'p2', zone: 'graveyard', kind: 'spell' });
  // 10 innych kart w grobie → dawny kształt to C(10,4)=210 podzbiorów × 2 cele
  // = 420 wariantów (M103/D capował na 64); M241 usuwa eksplozję z deklaracji:
  // rzut mówi tylko o celu (+1/J), a wybór wygnania to osobna decyzja
  // pending (M241) z capowanymi ofertami dla botów.
  for (let i = 0; i < 10; i += 1) {
    put(state, { id: `g${i}`, cardId: 'basic-swamp', controllerId: 'p2', zone: 'graveyard', kind: 'land' });
  }
  const view = playerView(state, 'p2');
  const casts = view.legalCommands.filter((c) => c.type === 'cast_escape');
  assert.equal(casts.length, 2, `rzuty TYLKO po celach (bez mnożenia podzbiorów): ${casts.length}`);
  assert.ok(casts.every((c) => !('escapeExileIds' in c) || (c.escapeExileIds ?? []).length === 0),
    'komenda rzutu nie niesie już pre-baked podzbioru wygnania');
  const first = execute(state, casts[0]);
  assert.ok(first.ok, 'deklaracja kolejkuje pending wygnania');
  assert.ok(state.pendingEscapeExile, 'pending Escape jest');
  const view2 = playerView(state, 'p2');
  const exiles = view2.legalCommands.filter((c) => c.type === 'resolve_escape_exile');
  assert.ok(exiles.length <= 32,
    `enumeracja podzbiorów dla bota nadal capowana do 32 (jak M103/D): ${exiles.length}`);
  assert.ok(exiles.length > 0, 'bot ma oferty resolve_escape_exile');
});
