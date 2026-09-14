import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';

/**
 * Znalezisko właściciela K (2026-09-14): „Embalm Tah-Crop Skirmishera jest
 * o jedną manę za tani — {3}{U} kosztuje u nas 3. Sprawdź wszystkie karty pod
 * tym kątem."
 *
 * Audyt całego katalogu (strażnik `test/ability-cost-pips.test.js`, sekcja
 * „znalezisko K") znalazł CZTERY rozjazdy tej samej rodziny: trzy karty
 * zaniżone o generyk (etherium-abomination, brightwood-tracker,
 * tah-crop-skirmisher) i jedną z brakującym pipem (kishla-village). Ten plik
 * pinuje GRANICĘ ZACHOWANIA tych kosztów: o jedną manę mniej = brak oferty
 * i odrzucona komenda, dokładny koszt = oferta. Bez poprawki danych testy są
 * CZERWONE — dokładnie w miejscach, których nie widziały testy kartowe
 * (te używały nadmiaru many, więc zaniżony koszt przechodził).
 *
 * Konwencja (ta sama co `costTextOf` i płatność many): `cost.mana` to ŁĄCZNY
 * koszt many (CR 202.1), a `cost.colors` to pipy; generyk = mana − pipy.
 */
const registry = createCardRegistry();

function game(players = ['p1', 'p2']) {
  const state = createGameState({ seed: 58, players: players.map((id) => ({ id })) });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  for (const playerId of players) for (let i = 0; i < 3; i++) put(state, `lib-${playerId}-${i}`, 'basic-swamp', playerId, 'library');
  return state;
}

function put(state, id, cardId, playerId = 'p1', zone = 'hand') {
  const def = registry.get(cardId);
  assert.ok(def, `${cardId} w prawdziwym rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId,
    zone, ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes, keywords: def.keywords,
  });
  return state.objects.get(id);
}

const commands = (s, p = 'p1') => playerView(s, p).legalCommands;
// UWAGA: `abilityIndex` jest częścią dopasowania — Kishla Village ma DWIE
// aktywacje (0 = {T}: Add {G}, 1 = {3}{G}, {T}: Surveil 2), a sama obecność
// oferty „village" nie mówi nic o koszcie zdolności surveil.
const offer = (s, id, abilityIndex = 0) => commands(s)
  .find((c) => c.type === 'activate_ability' && c.objectId === id && c.abilityIndex === abilityIndex);
const reject = (s, id, abilityIndex = 0) =>
  execute(s, { type: 'activate_ability', playerId: 'p1', objectId: id, abilityIndex });

// --- Etherium Abomination: Unearth {1}{U}{B} (CR 702.84a) -------------------

test('znalezisko K: Unearth to {1}{U}{B} — dwie many (U+B) nie wystarczą', () => {
  const s = game();
  put(s, 'ea', 'etherium-abomination', 'p1', 'graveyard');
  addMana(s, 'p1', 2, { colors: ['U', 'B'] });

  assert.equal(offer(s, 'ea'), undefined, '{U}{B} to nie koszt Unearth — brakuje generyka');
  const r = reject(s, 'ea');
  assert.equal(r.ok, false);
  assert.equal(s.objects.get('ea').zone, 'graveyard', 'odrzucona aktywacja nie rusza grobu');

  addMana(s, 'p1', 1, {}); // dokładnie trzecia mana
  assert.ok(offer(s, 'ea'), '{1}{U}{B} = trzy many odblokowują unearth');
});

// --- Brightwood Tracker: {5}{G}, {T} ----------------------------------------

test('znalezisko K: Brightwood Tracker to {5}{G}, {T} — pięć many nie wystarczy', () => {
  const s = game();
  put(s, 'tracker', 'brightwood-tracker', 'p1', 'battlefield');
  addMana(s, 'p1', 4, {});
  addMana(s, 'p1', 1, { colors: ['G'] });

  assert.equal(offer(s, 'tracker'), undefined, 'pięć many (w tym {G}) to nie {5}{G}');
  const r = reject(s, 'tracker');
  assert.equal(r.ok, false);
  assert.equal(s.objects.get('tracker').tapped, false, 'odrzucona aktywacja nie tapuje');

  addMana(s, 'p1', 1, {});
  assert.ok(offer(s, 'tracker'), 'szósta mana odblokowuje podgląd wierzchu');
});

// --- Tah-Crop Skirmisher: Embalm {3}{U} (CR 702.128a) -----------------------

test('znalezisko K: Embalm to {3}{U} — trzy many (w tym {U}) nie wystarczą', () => {
  const s = game();
  put(s, 'grave', 'tah-crop-skirmisher', 'p1', 'graveyard');
  addMana(s, 'p1', 2, {});
  addMana(s, 'p1', 1, { colors: ['U'] });

  assert.equal(offer(s, 'grave'), undefined, 'zgłoszenie właściciela: {3}{U} to cztery many, nie trzy');
  const r = reject(s, 'grave');
  assert.equal(r.ok, false);
  assert.equal(s.objects.get('grave').zone, 'graveyard', 'odrzucona aktywacja nie wygania karty');

  addMana(s, 'p1', 1, {});
  assert.ok(offer(s, 'grave'), 'czwarta mana odblokowuje Embalm');
});

test('znalezisko K: Embalm za dokładnie {3}{U} płaci cztery many (pula wyczerpana)', () => {
  const s = game();
  put(s, 'grave', 'tah-crop-skirmisher', 'p1', 'graveyard');
  addMana(s, 'p1', 3, {});
  addMana(s, 'p1', 1, { colors: ['U'] });

  const r = execute(s, { type: 'activate_ability', playerId: 'p1', objectId: 'grave', abilityIndex: 0 });
  assert.ok(r.ok, JSON.stringify(r.events));
  assert.equal(s.players.find((p) => p.id === 'p1').mana, 0, 'karta {3}{U} zużywa całą pulę czterech many');
});

// --- Kishla Village: {3}{G}, {T}: Surveil 2 ---------------------------------

test('znalezisko K: Kishla Village wymaga {3}{G} — cztery many bez zieleni nie wystarczą', () => {
  const s = game();
  put(s, 'village', 'kishla-village', 'p1', 'battlefield');
  addMana(s, 'p1', 4, { colors: ['R'] });

  assert.ok(offer(s, 'village', 0), 'zdolność many {T}: Add {G} działa niezależnie od braku zieleni');
  assert.equal(offer(s, 'village', 1), undefined, 'brakuje pipu {G}, nie tylko ilości many');
  const r = reject(s, 'village', 1);
  assert.equal(r.ok, false);
  assert.equal(s.objects.get('village').tapped, false, 'odrzucona aktywacja nie tapuje landu');

  addMana(s, 'p1', 3, {});
  addMana(s, 'p1', 1, { colors: ['G'] });
  assert.ok(offer(s, 'village', 1), 'trzy dowolne many + {G} pokrywają {3}{G}');
});
