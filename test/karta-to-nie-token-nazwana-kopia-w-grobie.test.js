// Audyt PR #153 (F6, sesja 2026-10-03k) — „czy obiekt jest KARTĄ" to JAWNA
// flaga `isToken` (CR 108.2b), nie domysł po polu `name`.
//
// Tło. Audyt PR #136 (F-2) poprawił tym predykatem cel „card from an opponent's
// graveyard", ale bliźniacze gałęzie zostały na heurystyce `name != null`
// („tokeny mają nazwę, karty nie"). Pole `name` nosi jednak także KOPIA
// permanentu z `enterAsCopy` (nazwa kopiowalna, CR 707.2 — `game-state.js`
// „name: target.cardName ?? target.cardId"), a `isToken` na karcie-kopii nie
// jest ustawione. Audyt PR #153/F6 zmierzył rozjazd: dla tego samego stanu
// SILNIK liczył 3 typy kart w grobie, a WIDOK bota 4 (bo grób nie wystawia
// `name`, więc filtr bota był martwy — „martwa bramka" to nie „brak różnicy",
// tylko różnica silnik↔bot, L1/L41/L48).
//
// Naprawa: `zones.isCardObject(object)` = `!object.isToken` — najniższa warstwa
// grafu importów, jedno źródło dla `triggers.js`, `permanents.js`, `effects.js`,
// `game-state.js` i kontrolera bota; widok wystawia flagę poza polem bitwy.
//
// Piny (mutacje w komentarzu przy każdym): A1–A2 liczenie typów kart, A3/A4
// anty-over-fix (token nadal nie jest kartą), B1–B2 warunek Gray Slaada,
// C1 pula celu „permanent card in your graveyard", D zgodność silnik↔bot,
// E kontrakt widoku (flaga czytelna tam, gdzie konsument filtruje).
//
// „Kartą" jest obiekt bez jawnej flagi `isToken`; CR 108.2b (dosłownie, CR
// 2026-09-25): „Tokens aren't considered cards—even a card-sized game
// supplement that represents a token isn't considered a card for rules
// purposes."
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { markDamage, effectiveKeywords, allGraveyardsCardTypeCount } from '../src/engine/permanents.js';
import { runStateBasedActions } from '../src/engine/state-based.js';
import { graveyardCardTypeCount, triggerTargetCandidates } from '../src/engine/triggers.js';
import { createBattlefieldToken } from '../src/engine/tokens.js';
import { moveObjectDirectly } from '../src/engine/objects.js';
import { isCardObject } from '../src/engine/zones.js';
import { temporaryPumpOf } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, zone = 'battlefield', extra = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, ...extra,
  });
  return state.objects.get(id);
}

function game() {
  const state = createGameState({ seed: 153, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p2';
  return state;
}

/**
 * Poległa kopia: Jwari kopiuje Coralhelm Guide (CR 707.2 — kopia nosi nazwę
 * celu i NIE jest tokenem), potem obrażenia śmiertelne + realne SBA. Zwraca
 * obiekt w grobie właściciela.
 */
function diedNamedCopy(state, ownerId = 'p1') {
  const previous = { active: state.turn.activePlayerId, priority: state.turn.priorityPlayerId };
  state.turn.activePlayerId = state.turn.priorityPlayerId = ownerId;
  put(state, `guide-${ownerId}`, 'coralhelm-guide', ownerId);
  put(state, `jwari-${ownerId}`, 'jwari-shapeshifter', ownerId);
  const copy = state.objects.get(`jwari-${ownerId}`);
  // CR 707.2: kopiowana jest NAZWA („name: target.cardName ?? target.cardId").
  state.pendingEnterAsCopy = { playerId: ownerId, sourceId: `jwari-${ownerId}`, candidateIds: [`guide-${ownerId}`], restorePriorityTo: null };
  const cmd = playerView(state, ownerId).legalCommands
    .find((c) => c.type === 'resolve_enter_as_copy' && c.targetId === `guide-${ownerId}`);
  assert.ok(cmd, `kopia guide-${ownerId} oferowana dla jwari-${ownerId}`);
  assert.ok(execute(state, cmd).ok);
  state.turn.activePlayerId = previous.active;
  state.turn.priorityPlayerId = previous.priority;
  const copied = state.objects.get(`jwari-${ownerId}`);
  assert.equal(copied.name, 'Coralhelm Guide', 'kopia nosi nazwę celu (CR 707.2)');
  assert.notEqual(copied.isToken, true, 'karta wchodząca jako kopia to NIE token');
  markDamage(state, `jwari-${ownerId}`, 5, 'x');
  runStateBasedActions(state);
  const graveId = state.zones.graveyard.find((id) => state.objects.get(id).cardId === 'jwari-shapeshifter');
  assert.ok(graveId, 'poległa kopia leży w grobie');
  return state.objects.get(graveId);
}

/** Realny token (jawna flaga z `tokens.js`) przełożony do grobu. */
function realTokenInGraveyard(state, controllerId, { cardId = 'token_clue', name = 'Clue', types = ['Artifact'] } = {}) {
  createBattlefieldToken(state, controllerId, {
    cardId, name, kind: 'artifact', power: null, toughness: null,
    colors: [], types, subtypes: [],
  });
  const tokenId = state.zones.battlefield.find((id) => state.objects.get(id).cardId === cardId);
  assert.ok(tokenId, 'token na polu bitwy');
  const moved = moveObjectDirectly(state, tokenId, 'graveyard', `grave-${cardId}`);
  const token = state.objects.get(moved.id);
  assert.equal(token.isToken, true, 'token niesie jawną flagę');
  assert.equal(token.name, name, 'token niesie nazwę');
  return token;
}

// --- A. Liczenie typów kart (delirium CR 207.2c, Tarmogoyf CR 205.3m) -------

test('A1: poległa nazwana kopia wnosi typ karty do licznika delirium', () => {
  const state = game();
  put(state, 'g1', 'fiery-fall', 'p1', 'graveyard'); // Instant
  put(state, 'g2', 'boulder-salvo', 'p1', 'graveyard'); // Sorcery
  put(state, 'g3', 'basic-swamp', 'p1', 'graveyard'); // Land
  const copy = diedNamedCopy(state, 'p1'); // Creature — JEDYNE źródło tego typu
  assert.equal(copy.name, 'Coralhelm Guide');
  assert.notEqual(copy.zone, 'battlefield');
  // Mutacja m1: przywrócenie `object.name != null` w graveyardCardTypeCount → 3.
  assert.equal(graveyardCardTypeCount(state, 'p1'), 4,
    'Instant + Sorcery + Land + Creature (kopia) — karta-kopia jest kartą (CR 108.2b)');
});

test('A2: allGraveyardsCardTypeCount liczy karty w grobach OBU graczy (także kopia)', () => {
  const state = game();
  put(state, 'g1', 'fiery-fall', 'p1', 'graveyard');
  put(state, 'g2', 'boulder-salvo', 'p1', 'graveyard');
  put(state, 'g3', 'basic-swamp', 'p1', 'graveyard');
  diedNamedCopy(state, 'p2'); // Creature tylko w grobie p2
  assert.equal(graveyardCardTypeCount(state, 'p1'), 3, 'delirium liczy grób KONTROLERA');
  // Mutacja m2: jw. w allGraveyardsCardTypeCount (permanents.js) → 3.
  assert.equal(allGraveyardsCardTypeCount(state), 4,
    'Tarmogoyf/Disy: kopia-stwór leży w grobie p2, ale typ Creature jest policzony');
});

test('A3 anty-over-fix: realny token w grobie nadal nie wnosi typu', () => {
  const state = game();
  put(state, 'g1', 'fiery-fall', 'p1', 'graveyard');
  realTokenInGraveyard(state, 'p1', { cardId: 'token_clue', name: 'Clue', types: ['Artifact'] });
  assert.equal(graveyardCardTypeCount(state, 'p1'), 1, 'token (isToken) nie jest kartą — typ Artifact się nie liczy');
  assert.equal(allGraveyardsCardTypeCount(state), 1);
});

test('A4 anty-over-fix: o byciu kartą orzeka `isToken`, nie pola `name`/`cardId`', () => {
  const state = game();
  const copy = diedNamedCopy(state, 'p1');
  const token = realTokenInGraveyard(state, 'p1');
  assert.equal(isCardObject(copy), true, 'kopia ma name, nie ma isToken → jest kartą');
  assert.equal(isCardObject(token), false, 'token ma name i isToken → nie jest kartą');
  assert.equal(isCardObject(null), false);
  assert.equal(isCardObject(undefined), false);
});

// --- B. Warunek Gray Slaada: „four or more creature cards in your graveyard" -

test('B1: karty-stwory w grobie liczą się z poległą nazwaną kopią (Gray Slaad)', () => {
  const state = game();
  const slaad = put(state, 'slaad', 'gray-slaad', 'p1');
  for (let i = 0; i < 3; i += 1) put(state, `gc${i}`, 'highland-game', 'p1', 'graveyard');
  diedNamedCopy(state, 'p1'); // czwarta karta-stwór (typ Creature TYLKO tutaj niepotrzebny — liczą się KARTY)
  const keywords = effectiveKeywords(slaad, state);
  // Mutacja m3: `candidate.name != null` w warunku (permanents.js) → brak obu.
  assert.ok(keywords.includes('menace'), 'cztery karty-stwory (z kopią) → menace');
  assert.ok(keywords.includes('deathtouch'), 'cztery karty-stwory (z kopią) → deathtouch');
});

test('B2 kontrola: bez kopii (3 karty-stwory) warunek nadal nie jest spełniony', () => {
  const state = game();
  const slaad = put(state, 'slaad', 'gray-slaad', 'p1');
  for (let i = 0; i < 3; i += 1) put(state, `gc${i}`, 'highland-game', 'p1', 'graveyard');
  realTokenInGraveyard(state, 'p1', { cardId: 'token_human', name: 'Human', types: ['Creature'] });
  const keywords = effectiveKeywords(slaad, state);
  assert.ok(!keywords.includes('menace'), 'token nie jest kartą-stworem → próg 4 nie jest spełniony');
  assert.ok(!keywords.includes('deathtouch'));
});

// --- C. Pula celu „permanent card in your graveyard" ------------------------

test('C1: poległa kopia jest celem „permanent card from your graveyard", token nie', () => {
  const state = game();
  const annie = put(state, 'annie', 'annie-flash-the-veteran', 'p1');
  const copy = diedNamedCopy(state, 'p1');
  const token = realTokenInGraveyard(state, 'p1');
  const pool = triggerTargetCandidates(
    state, { type: 'permanent_card_in_graveyard', controlledBy: 'controller', allowLands: true }, annie,
  );
  assert.ok(pool.includes(copy.id), `pula = ${pool.join(', ')} — brakuje poległej kopii`);
  assert.ok(!pool.includes(token.id), 'token nie jest kartą — nie może być celem');
});

// --- D. Jedna reguła dla silnika i bota (L41/L48) ---------------------------

test('D: wycena bota liczy te same typy kart co silnik (kopia + token w grobie)', () => {
  const state = game();
  put(state, 'g1', 'fiery-fall', 'p1', 'graveyard');
  put(state, 'g2', 'boulder-salvo', 'p1', 'graveyard');
  put(state, 'g3', 'basic-swamp', 'p1', 'graveyard');
  diedNamedCopy(state, 'p1');
  realTokenInGraveyard(state, 'p1', { cardId: 'token_clue', name: 'Clue', types: ['Artifact'] });
  const silnik = allGraveyardsCardTypeCount(state);
  const view = playerView(state, 'p1');
  const bot = temporaryPumpOf(
    { type: 'buff_creature_until_end_of_turn', power: 'card_types_in_all_graveyards', toughness: 0 }, view,
  ).power;
  // Mutacja m4: `o.name != null` w filtrze bota (martwa bramka) → bot liczy
  // token → 5 ≠ 4; mutacja m5: brak `isToken` w widoku poza polem bitwy → jw.
  assert.equal(silnik, 4, 'Instant + Sorcery + Land + Creature(kopia); token nie liczy się');
  assert.equal(bot, silnik, 'bot i silnik czytają JEDNĄ regułę (CR 108.2b)');
});

// --- E. Kontrakt widoku: flaga czytelna tam, gdzie konsument filtruje -------

test('E: widok wystawia `isToken` poza polem bitwy, a grobowe wpisy nie mają `name`', () => {
  const state = game();
  const copy = diedNamedCopy(state, 'p1');
  const token = realTokenInGraveyard(state, 'p1');
  const grave = playerView(state, 'p1').zones.graveyard;
  const wpisTokena = grave.find((o) => o.id === token.id);
  const wpisKopii = grave.find((o) => o.id === copy.id);
  assert.equal(wpisTokena.isToken, true, 'token w strefie publicznej niesie flagę (ADR 0017)');
  assert.equal(wpisKopii.isToken, undefined, 'karta nie niesie flagi tokenu');
  // „name" nie jest (i nie może być) wyróżnikiem karty w widoku grobu —
  // dlatego filtr bota oparty na `name` był martwy.
  assert.ok(!grave.some((o) => o.name != null), 'grób nie wystawia `name`');
  assert.ok(grave.some((o) => o.types?.includes('Creature')), 'grób wystawia typy kart (M274)');
});
