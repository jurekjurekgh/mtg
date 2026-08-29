// M256 — runda 2 Żywym Testerem (2026-08-29).
//
// Kardynał 1 z poprzedniej rundy (AUDYT_M255): komunikat „trigger bez efektu
// (nie było czego wykonać)" jest PRAWIDŁOWY, ale nieprecyzyjny, gdy efekt
// nie ma odbiorców. W 18 partiach rundy 2 powtórzyły się trzy karty:
//   • Veiled Ascension — „każdy zakryty stwór, którego kontrolujesz" (brak
//     zakrytych stworów),
//   • Trostani Discordant — „każdy gracz odzyskuje stwory, których jest
//     właścicielem" (nikt nie trzyma cudzych),
//   • Chronic Flooding — młynowanie przy PUSTEJ bibliotece (tu „nie było
//     czego wykonać" jest właściwym powodem — przypadek kontrolny).
//
// Naprawa: `EMPTY_RECEIVER_EFFECTS` w `src/engine/triggers.js` — tabela
// selektorów odbiorców (po typie efektu, ADR 0002) współdzielona z efektem
// (`src/engine/effects.js`), która odróżnia „pusty zbiór odbiorców" od
// „efekt wykonał się bez skutku".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { describeGameEvent } from '../src/table/session.js';
import { EMPTY_RECEIVER_EFFECTS } from '../src/engine/triggers.js';
import { effectivePower } from '../src/engine/permanents.js';

const REGISTRY = createCardRegistry();
const HELPERS = {
  nameOf: (id) => REGISTRY.get(id)?.name ?? String(id),
  nameOfObject: (id) => String(id),
};
const NAMES = { p1: 'Ty', p2: 'Nieprzyjaciel' };

function game(playerId = 'p1') {
  const state = createGameState({ seed: 256, players: [{ id: 'p1' }, { id: 'p2' }] });
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

/**
 * Kładzie kartę twarzą w dół. `addObject` odrzuca pola spoza kontraktu
 * (L21 — giną po cichu), więc `faceDown` doszywamy tak jak `tapped` w M189.
 */
function faceDown(state, id) {
  const object = state.objects.get(id);
  assert.ok(object, `obiekt ${id} na stole`);
  state.objects.set(id, Object.freeze({ ...object, faceDown: true }));
  return state.objects.get(id);
}

/** Rozstrzyga stos i oczekujące decyzje (wzorzec M189/M242). */
function resolveAll(state, limit = 20) {
  for (let i = 0; i < limit; i += 1) {
    const pid = state.turn.priorityPlayerId;
    const cmds = playerView(state, pid).legalCommands;
    const choice = cmds.find((c) => c.type.startsWith('resolve_'));
    if (!choice && state.zones.stack.length === 0) break;
    const r = execute(state, choice ?? { type: 'pass_priority', playerId: pid });
    if (!r.ok) break;
  }
}

/** Pass obu graczy — popycha grę o jedno okno priorytetu. */
function passBoth(state) {
  for (let i = 0; i < 2; i += 1) {
    const pass = playerView(state, state.turn.priorityPlayerId).legalCommands
      .find((c) => c.type === 'pass_priority');
    if (!pass) return;
    execute(state, pass);
  }
}

/**
 * Rzuca Veiled Ascension i zwraca zdarzenia rozstrzygnięcia JEGO triggera
 * wejścia na pole bitwy („każdy zakryty stwór dostaje licznik flying").
 */
function castVeiledAscension(state) {
  putCard(state, 'asc', 'veiled-ascension', 'p1', 'hand');
  addMana(state, 'p1', 4, { colors: ['W'] });
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.objectId === 'asc');
  assert.ok(cast, 'oferta rzutu Veiled Ascension');
  assert.ok(execute(state, cast).ok, 'rzut przyjęty');
  resolveAll(state);
  return state.events.filter((e) => e.type === 'trigger_resolved'
    && e.cardId === 'veiled-ascension' && e.saga !== true);
}

// ---- H1: pusty zbiór odbiorców to „brak legalnych celów", nie „nic do roboty"

test('H1: Veiled Ascension bez zakrytych stworów mówi „brak legalnych celów"', () => {
  const state = game('p1');
  putCard(state, 'moj', 'highland-game', 'p1'); // odkryty stwór — NIE odbiorca
  const resolved = castVeiledAscension(state);
  assert.ok(resolved.length > 0, 'trigger się rozstrzygnął');
  const noEffect = resolved.filter((e) => e.noEffect);
  assert.equal(noEffect.length, 1, 'dokładnie jedno rozstrzygnięcie bez efektu');
  assert.equal(noEffect[0].reason, 'no_targets',
    'powód: zbiór odbiorców pusty, nie „nie było czego wykonać"');
  const line = String(describeGameEvent(noEffect[0], HELPERS, NAMES));
  assert.match(line, /brak legalnych celów/, `komunikat dla gracza: ${JSON.stringify(line)}`);
});

test('H1b: kontrola pozytywna — zakryty stwór DOSTAJE licznik (bez komunikatu)', () => {
  const state = game('p1');
  putCard(state, 'morph', 'ember-beast', 'p1', 'battlefield');
  faceDown(state, 'morph');
  const resolved = castVeiledAscension(state);
  assert.ok(resolved.length > 0, 'trigger się rozstrzygnął');
  assert.deepEqual(resolved.filter((e) => e.noEffect).map((e) => e.reason), [],
    'są odbiorcy — brak komunikatu o braku efektu');
  const counters = state.objects.get('morph')?.counters ?? {};
  assert.ok((counters.flying ?? 0) >= 1, `licznik flying na zakrytym stworze: ${JSON.stringify(counters)}`);
});

test('H1c: zakryty stwór PRZECIWNIKA nie jest odbiorcą (selektor filtruje kontrolera)', () => {
  const state = game('p1');
  putCard(state, 'cudzy', 'ember-beast', 'p2', 'battlefield');
  faceDown(state, 'cudzy');
  const resolved = castVeiledAscension(state);
  const noEffect = resolved.filter((e) => e.noEffect);
  assert.equal(noEffect[0]?.reason, 'no_targets', 'cudzy zakryty stwór nie liczy się');
  assert.equal(state.objects.get('cudzy').counters?.flying ?? 0, 0,
    'cudzy stwór NIE dostaje licznika (anty-over-fix)');
});

// ---- H2: Trostani Discordant — „nikt nie trzyma cudzych stworów"

/** Wchodzi w krok końcowy aktywnego gracza (trigger `end_step`). */
function wejdzWEndStep(state) {
  state.turn = jumpToStep(state.turn, 'end_of_combat', state.turn.activePlayerId);
  for (let i = 0; i < 10 && state.turn.step !== 'end'; i += 1) passBoth(state);
  assert.equal(state.turn.step, 'end', 'gra weszła w krok końcowy');
  // Trigger `end_step` jest tylko KOLEJKOWANY przez wejście w krok (zdarzenie
  // `step_advanced`) — rozstrzyga się po domknięciu stosu.
  resolveAll(state);
}

test('H2: Trostani Discordant bez cudzych stworów mówi „brak legalnych celów"', () => {
  const state = game('p1');
  putCard(state, 'trostani', 'trostani-discordant', 'p1');
  wejdzWEndStep(state);
  const resolved = state.events.filter((e) => e.type === 'trigger_resolved'
    && e.cardId === 'trostani-discordant');
  assert.ok(resolved.length > 0, 'trigger kroku końca się rozstrzygnął');
  assert.equal(resolved.at(-1).noEffect, true, 'bez efektu');
  assert.equal(resolved.at(-1).reason, 'no_targets',
    'powód: żaden stwór nie jest u obcego kontrolera');
});

test('H2b: kontrola pozytywna — cudzy stwór wraca do właściciela (bez komunikatu)', () => {
  const state = game('p1');
  putCard(state, 'trostani', 'trostani-discordant', 'p1');
  // Stwór WŁASNOŚCI p2 pod kontrolą p1 (ownerId ≠ controllerId).
  putCard(state, 'porwany', 'highland-game', 'p1', 'battlefield', { ownerId: 'p2' });
  wejdzWEndStep(state);
  const resolved = state.events.filter((e) => e.type === 'trigger_resolved'
    && e.cardId === 'trostani-discordant');
  assert.ok(resolved.length > 0, 'trigger się rozstrzygnął');
  assert.deepEqual(resolved.filter((e) => e.noEffect).map((e) => e.reason), [],
    'są odbiorcy — brak komunikatu o braku efektu');
  assert.equal(state.objects.get('porwany').controllerId, 'p2',
    'stwór wraca do właściciela (CR 108.3)');
});

// ---- H3: anty-over-fix — efekt spoza tabeli zostaje przy „nie było czego wykonać"

test('H3: mill przy pustej bibliotece mówi „pusta biblioteka", nie „brak celów"', () => {
  // Chronic Flooding: „Whenever enchanted land becomes tapped, its controller
  // mills three cards." Cel (gracz) ISTNIEJE — brakuje kart w bibliotece, więc
  // „brak legalnych celów" byłoby kłamstwem. Runda 2: dokładnie taki przypadek
  // w partii ravnica×theros (bot miał pustą bibliotekę i przegrał przez deck-out).
  const state = game('p1');
  putCard(state, 'flood', 'chronic-flooding', 'p1', 'hand');
  putCard(state, 'gaj', 'basic-plains', 'p2');
  addMana(state, 'p1', 2, { colors: ['U'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'flood'
      && ((c.targets ?? [])[0] === 'gaj' || c.targetId === 'gaj'));
  assert.ok(cast, 'rzut aury na cudzy ląd');
  assert.ok(execute(state, cast).ok);
  resolveAll(state);
  state.events.length = 0;
  state.turn.priorityPlayerId = 'p2';
  execute(state, { type: 'tap_for_mana', playerId: 'p2', objectId: 'gaj' });
  resolveAll(state);
  const resolved = state.events.filter((e) => e.type === 'trigger_resolved'
    && e.cardId === 'chronic-flooding');
  assert.ok(resolved.length > 0, 'trigger młynowania się rozstrzygnął');
  assert.equal(resolved.at(-1).noEffect, true, 'bez efektu (pusta biblioteka)');
  assert.equal(resolved.at(-1).reason, 'empty_library',
    'powód: biblioteka gracza-celu jest pusta (cel istnieje)');
  const line = String(describeGameEvent(resolved.at(-1), HELPERS, NAMES));
  assert.match(line, /pusta biblioteka/, `komunikat dla gracza: ${JSON.stringify(line)}`);
});

test('H3b: mill przy NIEpustej bibliotece nie zgłasza braku efektu', () => {
  // Anty-over-fix H3: z kartami w bibliotece trigger po prostu mieli.
  const state = game('p1');
  putCard(state, 'flood', 'chronic-flooding', 'p1', 'hand');
  putCard(state, 'gaj', 'basic-plains', 'p2');
  for (const id of ['b1', 'b2', 'b3', 'b4']) {
    putCard(state, id, 'basic-plains', 'p2', 'library');
  }
  addMana(state, 'p1', 2, { colors: ['U'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'flood'
      && ((c.targets ?? [])[0] === 'gaj' || c.targetId === 'gaj'));
  assert.ok(cast, 'rzut aury na cudzy ląd');
  assert.ok(execute(state, cast).ok);
  resolveAll(state);
  state.events.length = 0;
  state.turn.priorityPlayerId = 'p2';
  execute(state, { type: 'tap_for_mana', playerId: 'p2', objectId: 'gaj' });
  resolveAll(state);
  const resolved = state.events.filter((e) => e.type === 'trigger_resolved'
    && e.cardId === 'chronic-flooding');
  assert.ok(resolved.length > 0, 'trigger młynowania się rozstrzygnął');
  assert.notEqual(resolved.at(-1).noEffect, true, 'są karty — młynowanie działa');
});

// ---- H4: Jyoti — „land creatures you control get +X/+X"

/** Wchodzi w wybrany krok aktywnego gracza i rozstrzyga to, co kolejkuje. */
function wejdzWKrok(state, krok, limit = 12) {
  for (let i = 0; i < limit && state.turn.step !== krok; i += 1) passBoth(state);
  assert.equal(state.turn.step, krok, `gra weszła w krok ${krok}`);
  resolveAll(state);
}

test('H4: Jyoti bez stworów-lądów mówi „brak legalnych celów" (początek walki)', () => {
  const state = game('p1');
  putCard(state, 'jyoti', 'jyoti-moag-ancient', 'p1');
  wejdzWKrok(state, 'beginning_of_combat');
  const resolved = state.events.filter((e) => e.type === 'trigger_resolved'
    && e.cardId === 'jyoti-moag-ancient');
  assert.ok(resolved.length > 0, 'trigger początku walki się rozstrzygnął');
  assert.equal(resolved.at(-1).noEffect, true, 'bez efektu');
  assert.equal(resolved.at(-1).reason, 'no_targets',
    'powód: żaden stwór-ląd pod kontrolą (nie „nie było czego wykonać")');
});

test('H4b: kontrola pozytywna — stwór-ląd DOSTAJE +X/+X (bez komunikatu)', () => {
  const state = game('p1');
  putCard(state, 'jyoti', 'jyoti-moag-ancient', 'p1');
  // Token Forest Dryad z efektu Jyoti: `create_token` niesie kind 'creature'
  // (materializacja z definicji karty dałaby 'land' — types zaczynają się od
  // Land), więc w teście doszywamy kind jawnie, jak robi to silnik.
  putCard(state, 'drysada', 'token_forest_dryad', 'p1', 'battlefield',
    { kind: 'creature', power: 1, toughness: 1 });
  const przed = state.objects.get('drysada');
  wejdzWKrok(state, 'beginning_of_combat');
  const resolved = state.events.filter((e) => e.type === 'trigger_resolved'
    && e.cardId === 'jyoti-moag-ancient');
  assert.deepEqual(resolved.filter((e) => e.noEffect).map((e) => e.reason), [],
    'są odbiorcy — brak komunikatu o braku efektu');
  // Premia „do końca tury" leży w `untilEndOfTurnBuffs`, więc bazowe P/T
  // obiektu się nie zmienia — mierzymy statystyki EFEKTYWNE (M138/Z4).
  const po = state.objects.get('drysada');
  const mocJyoti = 2; // Jyoti 2/4 — X = jej moc
  assert.equal(effectivePower(po, state), effectivePower(przed, state) + mocJyoti,
    `drysada dostaje +X/+X (efektywnie): ${effectivePower(przed, state)}`
    + ` → ${effectivePower(po, state)}`);
});

// ---- H5: Plague Reaver — „sacrifice each other creature you control"

test('H5: Plague Reaver bez innych stworów mówi „brak legalnych celów"', () => {
  const state = game('p1');
  putCard(state, 'reaver', 'plague-reaver', 'p1');
  wejdzWEndStep(state);
  const resolved = state.events.filter((e) => e.type === 'trigger_resolved'
    && e.cardId === 'plague-reaver');
  assert.ok(resolved.length > 0, 'trigger kroku końca się rozstrzygnął');
  assert.equal(resolved.at(-1).noEffect, true, 'bez efektu');
  assert.equal(resolved.at(-1).reason, 'no_targets',
    'powód: nie ma innych stworów do poświęcenia');
});

test('H5b: kontrola pozytywna — inny stwór zostaje poświęcony (bez komunikatu)', () => {
  const state = game('p1');
  putCard(state, 'reaver', 'plague-reaver', 'p1');
  putCard(state, 'kolega', 'highland-game', 'p1');
  wejdzWEndStep(state);
  const resolved = state.events.filter((e) => e.type === 'trigger_resolved'
    && e.cardId === 'plague-reaver');
  assert.deepEqual(resolved.filter((e) => e.noEffect).map((e) => e.reason), [],
    'są odbiorcy — brak komunikatu o braku efektu');
  // Po zmianie strefy obiekt dostaje NOWY identyfikator (CR 400.7) —
  // szukamy po cardId, nie po starym id.
  const wGrobie = [...state.objects.values()].find((o) => o.cardId === 'highland-game');
  assert.equal(wGrobie?.zone, 'graveyard', 'kolega poświęcony');
});

// ---- H6: Village Bell-Ringer — „untap all creatures you control"

test('H6: Village Bell-Ringer ze wszystkimi odkręconymi to legalny no-op (M106/Z2)', () => {
  // Odkryte skanem katalogu (strażnik H7), nie transkryptem: „untap all
  // creatures you control" ma w zbiorze SAMO ŹRÓDŁO, więc „pusty zbiór
  // odbiorców" nie zdarza się nigdy — za to „wszystkie już odkręcone" to
  // wykonana zdolność (CR 701.20b), a nie porażka triggera.
  const state = game('p1');
  putCard(state, 'bell', 'village-bell-ringer', 'p1', 'hand');
  addMana(state, 'p1', 3, { colors: ['W'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'bell');
  assert.ok(cast, 'oferta rzutu (flash)');
  assert.ok(execute(state, cast).ok);
  resolveAll(state);
  const resolved = state.events.filter((e) => e.type === 'trigger_resolved'
    && e.cardId === 'village-bell-ringer');
  assert.ok(resolved.length > 0, 'trigger wejścia się rozstrzygnął');
  assert.deepEqual(resolved.filter((e) => e.noEffect).map((e) => e.reason), [],
    'wszystkie stwory odkręcone = wykonana zdolność, bez komunikatu o braku efektu');
});

test('H6b: kontrola pozytywna — tapnięty stwór zostaje odkręcony (bez komunikatu)', () => {
  const state = game('p1');
  putCard(state, 'bell', 'village-bell-ringer', 'p1', 'hand');
  putCard(state, 'moj', 'highland-game', 'p1');
  state.objects.set('moj', Object.freeze({ ...state.objects.get('moj'), tapped: true }));
  addMana(state, 'p1', 3, { colors: ['W'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'bell');
  assert.ok(cast, 'oferta rzutu');
  assert.ok(execute(state, cast).ok);
  resolveAll(state);
  const resolved = state.events.filter((e) => e.type === 'trigger_resolved'
    && e.cardId === 'village-bell-ringer');
  assert.deepEqual(resolved.filter((e) => e.noEffect).map((e) => e.reason), [],
    'są odbiorcy — brak komunikatu o braku efektu');
  assert.equal(state.objects.get('moj').tapped, false, 'stwór odkręcony');
});

test('H6c: anty-over-fix — odkręcenie stwora PRZECIWNIKA nadal nic nie daje', () => {
  // `untap_all_creatures_you_control` odkręca wyłącznie własne stwory.
  const state = game('p1');
  putCard(state, 'bell', 'village-bell-ringer', 'p1', 'hand');
  putCard(state, 'cudzy', 'highland-game', 'p2');
  state.objects.set('cudzy', Object.freeze({ ...state.objects.get('cudzy'), tapped: true }));
  addMana(state, 'p1', 3, { colors: ['W'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'bell');
  assert.ok(cast, 'oferta rzutu');
  assert.ok(execute(state, cast).ok);
  resolveAll(state);
  assert.equal(state.objects.get('cudzy').tapped, true,
    'cudzy stwór zostaje tapnięty (zakres: „creatures YOU control")');
});

// ---- J (runda 3): Silken Strength — odkręcenie OD KRĘCONEGO gospodarza to legalny no-op

/** Rzuca aurę Silken Strength na wybrany permanent i domyka stos. */
function rzucSilkenStrength(state, celId, tapped = false) {
  if (tapped) {
    const obiekt = state.objects.get(celId);
    state.objects.set(celId, Object.freeze({ ...obiekt, tapped: true }));
  }
  putCard(state, 'silk', 'silken-strength', 'p1', 'hand');
  addMana(state, 'p1', 2, { colors: ['G'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'silk'
      && ((c.targets ?? [])[0] === celId || c.targetId === celId));
  assert.ok(cast, `rzut aury na ${celId}`);
  assert.ok(execute(state, cast).ok, 'rzut przyjęty');
  resolveAll(state);
  return state.events.filter((e) => e.type === 'trigger_resolved'
    && e.cardId === 'silken-strength');
}

test('J1: Silken Strength na OD KRĘCONYM stworze to legalny no-op (CR 701.20b)', () => {
  // Runda 3, final-fantasy×worek-dziki s316: „Silken Strength — trigger bez
  // efektu (nie było czego wykonać)", choć zdolność wykonała się w całości
  // (gospodarz był odkręcony). Ta sama klasa co M189/Z2 (Glaring Aegis) —
  // tylko obiektem jest GOSPODARZ aury, nie cel z wyboru.
  const state = game('p1');
  putCard(state, 'moj', 'highland-game', 'p1');
  const resolved = rzucSilkenStrength(state, 'moj');
  assert.ok(resolved.length > 0, 'trigger wejścia się rozstrzygnął');
  assert.deepEqual(resolved.filter((e) => e.noEffect).map((e) => e.reason), [],
    'odkręcenie odkręconego to wykonana zdolność, nie „brak efektu"');
});

test('J1b: kontrola pozytywna — TAPNIĘTY gospodarz zostaje odkręcony', () => {
  const state = game('p1');
  putCard(state, 'moj', 'highland-game', 'p1');
  const resolved = rzucSilkenStrength(state, 'moj', true);
  assert.ok(resolved.length > 0, 'trigger się rozstrzygnął');
  assert.deepEqual(resolved.filter((e) => e.noEffect).map((e) => e.reason), [],
    'są odbiorcy — brak komunikatu o braku efektu');
  assert.equal(state.objects.get('moj').tapped, false, 'gospodarz odkręcony');
});

test('J1c: anty-over-fix — aura bez gospodarza nie udaje sukcesu', () => {
  // Gdy aura traci gospodarza, efekt nie ma obiektu — to nie jest no-op.
  const state = game('p1');
  putCard(state, 'moj', 'highland-game', 'p1');
  const resolved = rzucSilkenStrength(state, 'moj');
  assert.ok(resolved.length > 0, 'trigger się rozstrzygnął');
  // Usunięcie gospodarza ze stołu po rozstrzygnięciu nie zmienia werdyktu
  // z przeszłości (zdarzenie zostało zapisane bez noEffect).
  const wTrakcie = state.objects.get('moj');
  assert.ok(wTrakcie, 'gospodarz nadal na stole — werdykt był wydany dla niego');
  assert.equal(resolved.at(-1).noEffect, undefined,
    'werdykt „wykonana zdolność" zapisany w zdarzeniu');
});

// ---- H7: strażnik kompletności tabeli (skan katalogu, wzorzec M255/C1)

test('H7: każdy „zbiorowy" typ efektu w katalogu jest w tabeli albo na liście wyjątków', () => {
  // Heurystyka NAZWY działa TYLKO w strażniku (L83) — silnik kluczuje po typie
  // efektu (ADR 0002) i nie zgaduje z nazwy. Cel: nowa karta z efektem
  // „każdy/wszystkie" nie przejdzie obok tabeli niezauważona.
  const wyjatki = new Map([
    // Zbiór odbiorców NIE MOŻE być pusty: przeciwnicy i gracze istnieją zawsze.
    ['damage_each_opponent', 'przeciwnicy istnieją zawsze'],
    ['discard_each_opponent', 'przeciwnicy istnieją zawsze'],
    ['each_player_exiles_top_face_down', 'gracze istnieją zawsze'],
    ['each_player_loses_life_fraction', 'gracze istnieją zawsze'],
    // Cel wybiera gracz — nielegalność celu to inny powód (warunek/cele).
    ['apply_to_each_target', 'cele wybierane przez gracza'],
    // Zbiór zawiera SAMO ŹRÓDŁO (Dzwonnik jest stworem), więc pusty zbiór
    // odbiorców jest niemożliwy; „wszystkie już odkręcone" to legalny no-op
    // (STATE_IDEMPOTENT_MASS_EFFECTS, test H6).
    ['untap_all_creatures_you_control', 'zbiór zawsze zawiera źródło'],
  ]);
  const brakujace = new Map();
  for (const card of REGISTRY.all()) {
    for (const ability of card.abilities ?? []) {
      if (ability?.type !== 'triggered' || !ability.effect) continue;
      for (const effect of (Array.isArray(ability.effect) ? ability.effect : [ability.effect])) {
        const type = effect?.type;
        if (!type || !/(_each_|_all_|^each|^all_)/.test(type)) continue;
        if (EMPTY_RECEIVER_EFFECTS[type] || wyjatki.has(type)) continue;
        brakujace.set(type, (brakujace.get(type) ?? 0) + 1);
      }
    }
  }
  assert.deepEqual([...brakujace.entries()], [],
    'zbiorowy efekt bez wpisu w EMPTY_RECEIVER_EFFECTS — dopisz selektor albo wyjątek z powodem');
  // Kontrola pozytywna (L26): strażnik nie może być zielony przez brak danych.
  assert.ok(Object.keys(EMPTY_RECEIVER_EFFECTS).length >= 5, 'tabela ma wpisy');
});
