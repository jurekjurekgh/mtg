// Regresja (2026-10-10): czar, którego OSTATNI (lub jedyny) efekt kolejkuje
// blokującą decyzję, zostawał na stosie na zawsze — `state.pendingSpell`
// wisiało z `effects: []`, a pierwszy późniejszy ruch obiektu wywalał
// niezmiennik „Pending spell odwołuje się do nieistniejącego czaru spell-N”.
//
// Znalezione przez czerwone CI (nie przez test jednostkowy): pełne B0
// `node tools/run-tests.mjs all` → test/audyt-bot-walka-remisy.test.js, para
// talii dominaria-wu | worek-mroczny, seed 4012, karta Impulse. `npm test`
// tego NIE łapał (audyt remisów jest poza szybkim zestawem).
//
// Dlaczego istniejący test Impulse (real-cards-batch65, B65/348) nie złapał:
// asertował `handIds.length === 1` z komentarzem „impulse poszedł do grobu”,
// ale ta własność jest prawdziwa TAKŻE, gdy impulse utknął na stosie — test
// sprawdzał słabszą rzecz, niż twierdził jego komentarz. Poniżej asercja jest
// wprost o `pendingSpell`, o zejściu ze stosu i o grobie.
//
// Naprawa: hook w `accepted()` (game-state.js) — jeśli czar wciąż jest na
// stosie i `firstPendingDecision` nic nie zwraca (nikt go już nie wznowi),
// dokańczamy go tam. To naprawa KLASY (handlerów decyzji bez wznowienia jest
// ~35), nie samego look_top.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';

const registry = createCardRegistry();

function game(players = ['p1', 'p2'], libSize = 8) {
  const state = createGameState({ seed: 4012, players: players.map((id) => ({ id })) });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  for (const playerId of players) for (let i = 0; i < libSize; i++) put(state, `lib-${playerId}-${i}`, 'basic-island', playerId, 'library');
  return state;
}

function put(state, id, cardId, playerId = 'p1', zone = 'hand', patch = {}) {
  const def = registry.get(cardId);
  assert.ok(def, `${cardId} w prawdziwym rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId,
    zone, ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes, keywords: def.keywords,
  });
  if (Object.keys(patch).length) state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  return state.objects.get(id);
}

const commands = (s, p = s.turn.priorityPlayerId) => playerView(s, p).legalCommands;

function run(s, cmd) {
  assert.ok(cmd, 'oferta komendy istnieje');
  const r = execute(s, cmd);
  assert.ok(r.ok, JSON.stringify(r.events));
  return r;
}

const find = (s, cardId, zone) => [...s.objects.values()].find((o) => o.cardId === cardId && o.zone === zone);

/** Rzuca Impulse i doprowadza do otwartej decyzji look_top. Zwraca id czaru na stosie. */
function rzucImpulseDoDecyzji(st) {
  put(st, 'imp', 'impulse', 'p1', 'hand');
  addMana(st, 'p1', 2, { colors: ['U'] });
  run(st, commands(st).find((c) => c.type === 'cast_spell' && c.objectId === 'imp'));
  for (let i = 0; i < 12 && !st.pendingLookTopN; i++) run(st, commands(st).find((c) => c.type === 'pass_priority'));
  assert.ok(st.pendingLookTopN, 'decyzja look_top otwarta');
  assert.equal(st.zones.stack.length, 1, 'Impulse jest na stosie');
  return st.zones.stack[0];
}

test('Regresja: czar wstrzymany decyzją look_top — pendingSpell ustawiony z pustą listą efektów', () => {
  const st = game();
  const stackId = rzucImpulseDoDecyzji(st);
  // Stan PRZED decyzją: czar wisi na decyzji (to jest poprawne i oczekiwane).
  assert.ok(st.pendingSpell, 'pendingSpell ustawiony — rozstrzyganie wstrzymane');
  assert.equal(st.pendingSpell.stackId, stackId, 'wstrzymany czar to Impulse na stosie');
  assert.deepEqual(st.pendingSpell.effects, [], 'look_top to JEDYNY efekt Impulse → pusty sufiks');
});

test('Regresja: po decyzji look_top czar SCHODZI ze stosu, a pendingSpell jest wyczyszczone', () => {
  const st = game();
  const stackId = rzucImpulseDoDecyzji(st);
  const looked = [...st.pendingLookTopN.objectIds];
  assert.equal(looked.length, 4, 'cztery karty odsłonięte');

  run(st, { type: 'resolve_look_top_choice', playerId: 'p1', cardId: looked[1],
    bottomOrder: [looked[3], looked[2], looked[0]] });

  // Rdzeń regresji — te trzy asercje padały przed naprawą.
  assert.equal(st.pendingSpell, null, 'pendingSpell wyczyszczone po dokończeniu czaru');
  assert.equal(st.zones.stack.length, 0, 'stos pusty — czar nie utknął');
  assert.equal(st.objects.has(stackId), false, 'obiekt czaru zdjęty ze stosu');
  assert.ok(find(st, 'impulse', 'graveyard'), 'Impulse w grobie (CR 704.3 / instant po rozstrzygnięciu)');
  assert.ok(st.events.some((e) => e.type === 'spell_resolved' && e.cardId === 'impulse'),
    'zdarzenie spell_resolved dla Impulse');
});

test('Regresja: po decyzji look_top stan przechodzi niezmienniki przy kolejnym ruchu obiektu', () => {
  const st = game();
  rzucImpulseDoDecyzji(st);
  const looked = [...st.pendingLookTopN.objectIds];
  run(st, { type: 'resolve_look_top_choice', playerId: 'p1', cardId: looked[0], bottomOrder: looked.slice(1) });

  // Oryginalny ślad awarii: assertStateInvariants odpalał z moveObjectDirectly,
  // więc dopiero NASTĘPNY ruch obiektu ujawniał wiszące pendingSpell. Rzut
  // kolejnego czaru rusza obiekty i musi przejść bez wyjątku.
  put(st, 'imp2', 'impulse', 'p1', 'hand');
  addMana(st, 'p1', 2, { colors: ['U'] });
  run(st, commands(st).find((c) => c.type === 'cast_spell' && c.objectId === 'imp2'));
  // Doprowadzamy drugi czar DO ROZSTRZYGNIĘCIA — to na tej ścieżce
  // (resolveTopOfStack → moveObjectDirectly → assertStateInvariants) wiszące
  // pendingSpell wybuchało w audycie.
  for (let i = 0; i < 12 && !st.pendingLookTopN; i++) run(st, commands(st).find((c) => c.type === 'pass_priority'));
  assert.ok(st.pendingLookTopN, 'drugi Impulse też otwiera decyzję');
  const looked2 = [...st.pendingLookTopN.objectIds];
  const r = execute(st, { type: 'resolve_look_top_choice', playerId: 'p1', cardId: looked2[0],
    bottomOrder: looked2.slice(1) });
  assert.ok(r.ok, 'rozstrzygnięcie drugiego Impulse przechodzi (bez „Pending spell odwołuje się do nieistniejącego czaru”)');
  assert.equal(st.pendingSpell, null, 'po obu rozstrzygnięciach pendingSpell wyczyszczone');
  assert.equal(st.zones.stack.length, 0, 'stos pusty');
});

test('Kontrola: hook NIE dokańcza czaru, póki decyzja look_top jest otwarta', () => {
  const st = game();
  const stackId = rzucImpulseDoDecyzji(st);
  // Anty-prze-naprawa: centralny hook jest strzeżony przez firstPendingDecision,
  // więc w normalnym stanie (decyzja wisi) czar MUSI zostać na stosie.
  assert.ok(st.pendingSpell, 'pendingSpell nadal ustawione');
  assert.equal(st.pendingSpell.stackId, stackId);
  assert.ok(st.objects.get(stackId), 'czar wciąż na stosie');
  assert.equal(st.objects.get(stackId).zone, 'stack');
  assert.ok(find(st, 'impulse', 'graveyard') === undefined, 'Impulse jeszcze NIE w grobie');
});

test('Kontrola: decyzja z JEDNĄ kartą (L144) — bez pending, czar schodzi od razu', () => {
  // Jedna karta w bibliotece p1 → „look at the top four” odsłania jedną,
  // a decyzja z jedną opcją to nie decyzja (L144): silnik rozstrzyga sam.
  const st = game(['p1', 'p2'], 1);
  put(st, 'imp', 'impulse', 'p1', 'hand');
  addMana(st, 'p1', 2, { colors: ['U'] });
  run(st, commands(st).find((c) => c.type === 'cast_spell' && c.objectId === 'imp'));
  for (let i = 0; i < 12 && st.zones.stack.length; i++) run(st, commands(st).find((c) => c.type === 'pass_priority'));
  assert.equal(st.pendingLookTopN, null, 'bez decyzji (jedna karta — L144)');
  assert.equal(st.pendingSpell, null, 'pendingSpell wyczyszczone');
  assert.equal(st.zones.stack.length, 0, 'stos pusty');
  assert.ok(find(st, 'impulse', 'graveyard'), 'Impulse w grobie');
});
