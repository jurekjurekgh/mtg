// M172 — uwagi właściciela z testów (2026-08-21): C (okno odpowiedzi
// obrońcy po deklaracji bloków — CR 509.4), potem B/B2/D w kolejnych
// transzach tego pliku.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { processTriggers } from '../src/engine/triggers.js';
import { describeGameEvent } from '../src/table/session.js';
import { commandLabel } from '../src/table/render.js';

const REGISTRY = createCardRegistry();

function game(activeId = 'p2') {
  const state = createGameState({ seed: 172, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', activeId);
  state.turn.activePlayerId = activeId;
  state.turn.priorityPlayerId = activeId;
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

/** Bot p2 atakuje stworem `atk`; człowiek p1 blokuje Elkiem. */
function setupBlockedCombat(state) {
  const atk = putCard(state, 'atk', 'highland-game', 'p2');
  state.objects.set('atk', Object.freeze({ ...atk, summoningSickness: false }));
  putCard(state, 'elk', 'dawntreader-elk', 'p1', 'battlefield', { summoningSickness: false });
  state.turn = { ...state.turn, phase: 'combat', step: 'declare_attackers', activePlayerId: 'p2', priorityPlayerId: 'p2' };
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['atk'] }).ok);
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p1', assignments: { atk: ['elk'] } }).ok);
}

test('C1: po deklaracji bloków PRIORYTET ma obrońca — może aktywować Elka (CR 509.4)', () => {
  const state = game('p2');
  setupBlockedCombat(state);
  assert.equal(state.turn.step, 'combat_damage', 'krok obrażeń (deklaracje zamknięte)');
  assert.equal(state.turn.priorityPlayerId, 'p1',
    'obrońca dostaje okno odpowiedzi po deklaracji bloków (dotąd: atakujący od razu)');
  addMana(state, 'p1', 1, { colors: ['G'] });
  const activate = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'elk');
  assert.ok(activate, 'oferta aktywacji Dawntreader Elk ({G}, poświęć) po bloku');
  assert.ok(execute(state, activate).ok, 'aktywacja przyjęta');
  // Zdolność na stosie — rozstrzygnij passami; potem decyzja szukania.
  for (let i = 0; i < 12 && state.zones.stack.length > 0; i += 1) {
    assert.ok(execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId }).ok);
  }
  if (state.pendingSearchChoice) {
    assert.ok(execute(state, { type: 'resolve_search_choice', playerId: 'p1', found: null }).ok);
  }
  assert.equal(state.objects.get('elk')?.zone ?? 'graveyard-moved', 'graveyard-moved',
    'Elk poświęcony (koszt aktywacji)');
  // Atakujący domyka walkę.
  const done = execute(state, { type: 'resolve_combat', playerId: 'p2', defendingPlayerId: 'p1' });
  assert.ok(done.ok, `walka rozstrzygnięta po oknie obrońcy: ${done.events?.[0]?.reason ?? ''}`);
});

test('C2: okno obrońcy nie pozwala OMINĄĆ obrażeń — pełna runda passów odrzucona', () => {
  const state = game('p2');
  setupBlockedCombat(state);
  // Obrońca pasuje (nic nie robi) — priorytet wraca do atakującego.
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok, 'pass obrońcy dozwolony');
  assert.equal(state.turn.priorityPlayerId, 'p2', 'priorytet u atakującego');
  // Atakujący NIE może spasować obrażeń (pełna runda passów = pominięcie walki).
  const skip = execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.equal(skip.ok, false, 'pass domykający rundę odrzucony');
  assert.match(skip.events?.[0]?.reason ?? '', /combat_unresolved/, 'powód: combat_unresolved');
  assert.ok(execute(state, { type: 'resolve_combat', playerId: 'p2', defendingPlayerId: 'p1' }).ok);
});

test('C3: instant obrońcy w oknie po blokach rozstrzyga się PRZED obrażeniami', () => {
  // Wzorzec zgłoszenia: obrońca chce zareagować po deklaracji bloków.
  // Po rozstrzygnięciu czaru walka nadal wymaga resolve_combat.
  const state = game('p2');
  setupBlockedCombat(state);
  putCard(state, 'bolt', 'brute-force', 'p1', 'hand'); // {R}? Brute Force {R} +3/+3
  addMana(state, 'p1', 1, { colors: ['R'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'bolt' && c.targets?.[0] === 'elk');
  assert.ok(cast, 'instant obrońcy oferowany w oknie po blokach');
  assert.ok(execute(state, cast).ok);
  for (let i = 0; i < 12 && state.zones.stack.length > 0; i += 1) {
    assert.ok(execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId }).ok);
  }
  const elk = state.objects.get('elk');
  assert.equal(elk.powerModifier ?? 0, 3, 'Elk +3/+3 przed obrażeniami');
  assert.ok(execute(state, { type: 'resolve_combat', playerId: 'p2', defendingPlayerId: 'p1' }).ok);
  // 2/2 atakujący vs 5/5 bloker: atakujący ginie, Elk przeżywa.
  assert.equal(state.objects.get('elk')?.zone, 'battlefield', 'wzmocniony Elk przeżywa walkę');
});

// ---- B/B2: rozdziały Sagi + badge czasowych ograniczeń ----------------------

/** Shiva na polu bitwy (tylna strona DFC — jak w trigger-target-decisions). */
function addShiva(state, id, controllerId = 'p1') {
  const def = REGISTRY.get('shiva-warden-of-ice');
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'shiva-warden-of-ice', controllerId, ownerId: controllerId,
    zone: 'battlefield', kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, abilities: data.abilities ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], types: def.types ?? [], colors: data.colors ?? [],
    saga: data.saga ?? null,
  });
  return state.objects.get(id);
}

test('B1: decyzja celu rozdziału Sagi niesie TYTUŁ rozdziału i typ efektu', () => {
  const state = game('p1');
  putCard(state, 'ally', 'highland-game', 'p1', 'battlefield', { summoningSickness: false });
  const shiva = addShiva(state, 'shiva', 'p1');
  // Realna ścieżka wejścia Sagi: ETB -> licznik lore -> rozdział I.
  processTriggers(state, [{ type: 'permanent_entered_battlefield', object: shiva }]);
  assert.ok(state.pendingTriggerTargets.length > 0, 'rozdział I kolejkuje decyzję celu');
  const view = playerView(state, 'p1');
  assert.equal(view.pendingTriggerTarget?.chapterName, 'Mesmerize', 'tytuł rozdziału z Oracle');
  assert.equal(view.pendingTriggerTarget?.effectType, 'cant_be_blocked', 'typ efektu rozdziału (extra)');
  const required = state.events.findLast((e) => e.type === 'trigger_target_required');
  assert.equal(required?.chapterName, 'Mesmerize', 'zdarzenie niesie tytuł rozdziału');
  const text = describeGameEvent(required, {
    nameOf: (id) => (id === 'shiva-warden-of-ice' ? 'Shiva, Warden of Ice' : '?'),
    nameOfObject: () => '?',
    isPlayer: (id) => id === 'p1' || id === 'p2',
    controllerOf: () => null,
  });
  assert.match(text, /Mesmerize/, `log nazywa rozdział: ${text}`);
});

test('B2: cel Mesmerize ma w WIDOKU cantBeBlocked (badge „nie do zablokowania")', () => {
  const state = game('p1');
  putCard(state, 'ally', 'highland-game', 'p1', 'battlefield', { summoningSickness: false });
  const shiva = addShiva(state, 'shiva', 'p1');
  processTriggers(state, [{ type: 'permanent_entered_battlefield', object: shiva }]);
  assert.ok(execute(state, { type: 'resolve_trigger_target', playerId: 'p1', targetId: 'ally' }).ok);
  for (let i = 0; i < 12 && state.zones.stack.length > 0; i += 1) {
    assert.ok(execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId }).ok);
  }
  assert.equal(state.objects.get('ally').cantBeBlocked, true, 'stan: cel nie może być blokowany');
  const entry = playerView(state, 'p2').zones.battlefield.find((o) => o.id === 'ally');
  assert.equal(entry?.cantBeBlocked, true,
    'WIDOK niesie cantBeBlocked (klasa L1/ADR 0017 — render liczy badge z widoku, nie ze stanu)');
});

test('B2b: utrata keyworda do EOT (Krotiq) jest w WIDOKU (badge „bez: defender")', () => {
  const state = game('p1');
  putCard(state, 'krotiq', 'krotiq-nestguard', 'p1', 'battlefield', { summoningSickness: false });
  addMana(state, 'p1', 3, { colors: ['G'] });
  const activate = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'krotiq');
  assert.ok(activate, 'oferta {2}{G}: atak mimo defendera');
  assert.ok(execute(state, activate).ok);
  for (let i = 0; i < 12 && state.zones.stack.length > 0; i += 1) {
    assert.ok(execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId }).ok);
  }
  const entry = playerView(state, 'p2').zones.battlefield.find((o) => o.id === 'krotiq');
  assert.ok((entry?.lostKeywordsUntilEOT ?? []).includes('defender'),
    'WIDOK niesie lostKeywordsUntilEOT (badge „bez: obrońca")');
});

// ---- D: kopie rozróżnialne na stole -----------------------------------------

test('D1: token-kopia dostaje copyNumber (1, 2, ...) i widok go niesie', () => {
  const state = game('p1');
  // Cogwork Assembler + artefakt do skopiowania.
  putCard(state, 'asm', 'cogwork-assembler', 'p1', 'battlefield', { summoningSickness: false });
  putCard(state, 'art', 'brawlers-plate', 'p1', 'battlefield');
  const copyOnce = () => {
    addMana(state, 'p1', 7, { colors: [] });
    const activate = playerView(state, 'p1').legalCommands
      .find((c) => c.type === 'activate_ability' && c.objectId === 'asm' && c.targets?.[0] === 'art');
    assert.ok(activate, 'oferta kopiowania artefaktu');
    assert.ok(execute(state, activate).ok);
    for (let i = 0; i < 12 && state.zones.stack.length > 0; i += 1) {
      assert.ok(execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId }).ok);
    }
  };
  copyOnce();
  copyOnce();
  const copies = [...state.objects.values()]
    .filter((o) => o.isToken && o.zone === 'battlefield' && o.name === "Brawler's Plate")
    .sort((a, b) => (a.copyNumber ?? 0) - (b.copyNumber ?? 0));
  assert.equal(copies.length, 2, 'dwie kopie na stole');
  assert.deepEqual(copies.map((o) => o.copyNumber), [1, 2], 'numery kopii 1 i 2');
  const entries = playerView(state, 'p2').zones.battlefield.filter((o) => o.copyNumber);
  assert.deepEqual(entries.map((o) => o.copyNumber).sort(), [1, 2], 'widok niesie copyNumber (publiczny)');
});

test('D2: etykieta celu nazywa kopię „Nazwa (kopia N)" (commandLabel)', () => {
  const fakeView = {
    playerId: 'p1',
    players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Nieprzyjaciel' }],
    zones: {
      hand: [], stack: [], graveyard: [], library: [], exile: [],
      battlefield: [{ id: 't1', isToken: true, name: "Brawler's Plate", copyNumber: 1, controllerId: 'p2', zone: 'battlefield' }],
    },
  };
  const fakeSession = { nameOf: (id) => id ?? '?', nameOfObject: () => '?', faceDownName: () => 'morph' };
  const label = commandLabel({ type: 'cast_spell', objectId: 'x', targets: ['t1'] }, fakeSession, fakeView);
  // Nazwa w etykiecie jest HTML-escapowana (apostrof -> &#39;).
  assert.match(String(label), /Plate \(kopia 1\)/, `etykieta celu z numerem kopii: ${label}`);
});

