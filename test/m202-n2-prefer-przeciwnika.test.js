// M202/N2 — audyt PR #73 (znalezisko N2): `prefer` w celach czarów/zdolności.
//
// M201 (znalezisko #4, CR 115.4) zamieniło cel Dementia Bat z `opponent` na
// `{ type: 'player', prefer: 'opponent' }` — kontroler stał się legalnym celem
// („Target player discards two cards”), a deterministyczna preferencja
// przeciwnika miała zostać zachowana. Deskryptor `prefer` czytało jednak
// WYŁĄCZNIE `triggerTargetCandidates` (triggery); w `targetCandidatesBySpec`
// (czary i zdolności) był martwy (klasa L21: pole spoza kontraktu ginie po
// cichu). Kolejność „przeciwnik pierwszy” istniała przypadkiem — z
// `state.players.map()` (kontroler pierwszy) i `unshift` w `playerView`.
// Zmiana porządku graczy albo `push` zamiast `unshift` odwróciłaby domyślny cel
// na WŁASNEGO gracza: „odrzuć 2 własne karty” jako pierwsza propozycja stołu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView, execute } from '../src/engine/game-state.js';
import { legalTargetCandidates } from '../src/engine/spells.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { TURN_STEPS, initialTurn } from '../src/engine/turn.js';

const REGISTRY = createCardRegistry();

function batState({ controllerId = 'p1' } = {}) {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = { ...initialTurn('p1'), ...TURN_STEPS[3], stepIndex: 3, activePlayerId: 'p1', priorityPlayerId: 'p1', passes: 0 };
  const def = REGISTRY.get('dementia-bat');
  addObject(state, {
    id: 'bat', instanceId: 'i-bat', cardId: 'dementia-bat', controllerId, ownerId: controllerId,
    zone: 'battlefield', ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  state.objects.set('bat', Object.freeze({ ...state.objects.get('bat'), summoningSickness: false, tapped: false }));
  addMana(state, controllerId, 10, { colors: ['B'] });
  return state;
}

test('M202/N2: `prefer: opponent` ustawia przeciwnika PIERWSZYM kandydatem (cel-gracz)', () => {
  const state = batState();
  const spec = REGISTRY.get('dementia-bat').abilities[0].targets[0];
  assert.equal(spec.prefer, 'opponent', 'dane karty niosą preferencję');
  const candidates = legalTargetCandidates(state, 'p1', spec, state.objects.get('bat'));
  assert.deepEqual(candidates, ['p2', 'p1'],
    'przeciwnik pierwszy, kontroler pozostaje legalnym celem (CR 115.4)');
});

test('M202/N2: kontroler nadal JEST legalnym celem (anty-over-fix do M201)', () => {
  const state = batState();
  const spec = REGISTRY.get('dementia-bat').abilities[0].targets[0];
  const candidates = legalTargetCandidates(state, 'p1', spec, state.objects.get('bat'));
  assert.ok(candidates.includes('p1'), 'Oracle: „Target player” — nie „target opponent”');
  const offer = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'bat' && c.targets?.[0] === 'p1');
  assert.ok(offer, 'oferta z własnym celem istnieje');
  assert.equal(execute(state, offer).ok, true, 'i jest akceptowana przez walidację');
});

test('M202/N2: pierwsza oferta stołu celuje w PRZECIWNIKA (bot i gracz biorą pierwszą)', () => {
  const state = batState();
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'activate_ability' && c.objectId === 'bat');
  assert.ok(offers.length >= 2, 'oba cele są oferowane');
  assert.equal(offers[0].targets[0], 'p2',
    'pierwsza propozycja nie może być „odrzuć 2 WŁASNE karty” (klasa L15)');
});

test('M202/N2: preferencja działa też dla drugiego gracza (nie jest zaszyta w p1/p2)', () => {
  const state = batState({ controllerId: 'p2' });
  const spec = REGISTRY.get('dementia-bat').abilities[0].targets[0];
  const candidates = legalTargetCandidates(state, 'p2', spec, state.objects.get('bat'));
  assert.deepEqual(candidates, ['p1', 'p2'], 'przeciwnik kontrolera pierwszy — generycznie');
});

test('M202/N2 (anty-over-fix): cel `player` BEZ preferencji zachowuje naturalną kolejność', () => {
  const state = batState();
  const candidates = legalTargetCandidates(state, 'p1', { type: 'player' }, state.objects.get('bat'));
  assert.deepEqual(candidates, ['p1', 'p2'],
    'brak `prefer` = brak zmiany porządku (nie nadpisujemy innych kart)');
});

test('M202/N2 (anty-over-fix): `opponent` nadal zawęża cele do przeciwników', () => {
  const state = batState();
  assert.deepEqual(legalTargetCandidates(state, 'p1', { type: 'opponent' }, state.objects.get('bat')), ['p2'],
    'deskryptor `opponent` (np. Plague Reaver) nie zyskuje własnego celu');
  assert.deepEqual(legalTargetCandidates(state, 'p1', { type: 'player', opponent: true }, state.objects.get('bat')), ['p2'],
    'wariant `player` + `opponent` (Dreams of Steel and Oil) bez zmian');
});
