/**
 * Grupowanie wyzwalaczy zbiorczych („Whenever one or more …") deklaruje KARTA,
 * nie rdzeń — audyt PR #93, decyzja właściciela: „Engine jest headless i
 * name-agnostic; różnice zachowań poszczególnych kart przez tag w
 * deskryptorze karty, nie warunkami w core".
 *
 * Dawniej `triggers.js` rozpoznawał grupy po NAZWIE ZDARZENIA i miał dla nich
 * dwa osobne zbiory dedupu (osobny dla obrażeń bojowych, osobny dla
 * poszkodowanych graczy), a przy `combat_damage_to_you` dedup szedł po samym
 * graczu — druga instancja tej samej karty milczała wbrew CR 603.3 (każda
 * instancja zdolności wyzwala osobno).
 *
 * Dziś: `trigger.groupPer` w danych karty (`'affected_player'` |
 * `'controller'`), a w rdzeniu jeden `mayFireGrouped` liczący klucz
 * (instancja zdolności + filtr + grupa). Bez tagu zdolność odpala się od
 * każdego zdarzenia — czyli tag jest PRAWDZIWYM przełącznikiem zachowania, co
 * sprawdza test 4 na syntetycznych zdolnościach.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';

const REGISTRY = createCardRegistry();
const START_LIFE = 20;

/** Zdarzenia zbiorcze i tag, jakiego oczekujemy od karty. */
const AGGREGATE_EVENTS = {
  any_combat_damage_to_player: 'affected_player',
  combat_damage_to_you: 'affected_player',
  permanents_you_control_leave_battlefield: 'controller',
};

/** Wszystkie wyzwalacze katalogu (też zagnieżdżone: mody, granty). */
function allTriggers() {
  const out = [];
  const seen = new WeakSet();
  const walk = (node, cardId) => {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) { node.forEach((item) => walk(item, cardId)); return; }
    const trigger = node.trigger;
    if (trigger && typeof trigger === 'object' && typeof trigger.event === 'string') {
      out.push({ cardId, trigger });
    }
    for (const value of Object.values(node)) walk(value, cardId);
  };
  for (const card of REGISTRY.supported()) walk(card.abilities ?? [], card.id);
  return out;
}

function combatState(seed, attackerIds, setup) {
  const state = createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  setup(state);
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds }).ok);
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: {} }).ok);
  execute(state, { type: 'pass_priority', playerId: 'p2' }); // okno obrońcy (CR 509.4)
  assert.ok(execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' }).ok);
  return state;
}

const addCreature = (state, id, { controllerId = 'p1', subtypes = [], abilities = [], power = 1 } = {}) => {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId, ownerId: controllerId,
    zone: 'battlefield', kind: 'creature', power, toughness: 2, manaCost: 1,
    abilities, keywords: [], subtypes, types: ['Creature'], colors: [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
};

/**
 * Rozstrzyga kolejkę wyzwalaczy: zdolności odpalone przy zdarzeniach wchodzą
 * na stos i rozstrzygają się przy przechodzeniu priorytetu (ten sam porządek
 * co w grze). Przechodzimy dopóki coś jest na stosie; blokująca decyzja
 * (np. `pendingExileCast`) przerywa drenaż — to jej stan badają asercje.
 */
function drain(state, limit = 12) {
  for (let i = 0; i < limit; i += 1) {
    if (state.zones.stack.length === 0) break;
    const holder = state.turn.priorityPlayerId ?? 'p1';
    if (!execute(state, { type: 'pass_priority', playerId: holder }).ok) break;
  }
}

const lifeOf = (state, playerId) => state.players.find((p) => p.id === playerId).life;
const combatDamageEvents = (state) => state.events.filter((e) => e.type === 'damage_dealt' && e.combat === true);

test('katalog: każda zdolność grupowa sama deklaruje sposób grupowania', () => {
  const triggers = allTriggers().filter((t) => AGGREGATE_EVENTS[t.trigger.event]);
  // Pin anty-vacuous (L48): bez prób strażnik nic nie pilnuje.
  assert.ok(triggers.length >= 4,
    `oczekiwałem >= 4 wyzwalaczy grupowych w katalogu, znaleziono ${triggers.length} — zmienił się wzorzec?`);
  const wrong = triggers.filter((t) => t.trigger.groupPer !== AGGREGATE_EVENTS[t.trigger.event]);
  assert.deepEqual(wrong.map((t) => `${t.cardId}:${t.trigger.event}`), [],
    'zdolność grupowa bez tagu (albo z błędnym) — rdzeń nie ma prawa zgadywać po nazwie karty');
});

test('CR 603.3: dwie kopie tej samej zdolności grupowej wyzwala DWUKROTNIE', () => {
  const ball = REGISTRY.get('contested-game-ball');
  const state = combatState(3, ['atk'], (s) => {
    for (const id of ['ball1', 'ball2']) {
      addObject(s, {
        id, instanceId: `i-${id}`, cardId: ball.id, controllerId: 'p2', ownerId: 'p2',
        zone: 'battlefield', ...gameObjectDataOf(ball), types: ['Artifact'],
      });
    }
    addCreature(s, 'atk', { power: 2 });
  });

  drain(state);
  const przejete = ['ball1', 'ball2'].filter((id) => state.objects.get(id).controllerId === 'p1');
  assert.deepEqual(przejete, ['ball1', 'ball2'],
    '„the attacking player gains control of this artifact" — KAŻDA instancja zdolności'
    + ' przechyla własny artefakt (CR 603.3); dedup po samym graczu kasował drugą kopię');
});

test('tag zbiorczy: dwaj atakujący = JEDNO wygnanie wierzchu biblioteki (Vaan)', () => {
  const vaanDef = REGISTRY.get('vaan-street-thief');
  const state = combatState(4, ['scout1', 'scout2'], (s) => {
    addObject(s, {
      id: 'vaan', instanceId: 'i-vaan', cardId: vaanDef.id, controllerId: 'p1', ownerId: 'p1',
      zone: 'battlefield', ...gameObjectDataOf(vaanDef), types: ['Creature'],
    });
    addCreature(s, 'scout1', { subtypes: ['Scout'] });
    addCreature(s, 'scout2', { subtypes: ['Scout'] });
    // `createGameState` bez talii ma strefy puste — wierzch biblioteki
    // poszkodowanego kładziemy ręcznie (wzorzec test/batch52-kart.test.js).
    const victim = REGISTRY.get('highland-game');
    addObject(s, {
      id: 'top', instanceId: 'i-top', cardId: victim.id, controllerId: 'p2', ownerId: 'p2',
      zone: 'library', ...gameObjectDataOf(victim), types: victim.types ?? ['Instant'],
    });
    s.zones.library = ['top', ...s.zones.library.filter((id) => id !== 'top')];
  });
  drain(state);
  assert.ok(combatDamageEvents(state).length >= 2, 'próba: dwa zdarzenia obrażeń');
  // Mierzymy LICZBĘ WYZWALAŃ ZDOLNOŚCI, a nie liczbę wygnań: bez tagu drugi
  // wyzwalacz i tak utknąłby za blokadą pierwszej decyzji, więc samo
  // `object_exiled` nie odróżniałoby agregatu od dwóch odpaleń.
  const fired = state.events.filter((e) => e.type === 'ability_triggered' && e.cardId === 'vaan-street-thief');
  assert.equal(fired.length, 1,
    '„Whenever one or more Scouts, Pirates, and/or Rogues … deal combat damage to a player" —'
    + ' obrażenia od obu stworów to JEDEN wyzwalacz (CR 603.2 + tag groupPer)');
  const exiled = state.events.filter((e) => e.type === 'object_exiled');
  assert.equal(exiled.length, 1, 'jedno wygnanie');
  assert.ok(state.pendingExileCast, 'i jedna decyzja „możesz rzucić“');
});

test('tag jest przełącznikiem: bez `groupPer` ta sama zdolność pali od każdego zdarzenia', () => {
  const build = (groupPer) => {
    const ability = {
      type: 'triggered', timing: 'instant',
      trigger: groupPer === null
        ? { event: 'any_combat_damage_to_player' }
        : { event: 'any_combat_damage_to_player', groupPer },
      effect: [{ type: 'gain_life', amount: 1 }],
    };
    // Dawca zdolności atakuje razem z bezimiennym stworem — dwa zdarzenia
    // obrażeń w jednej komendzie (CR 510.2: jednoczesne, a silnik emituje je
    // per źródło). Z tagiem zbiorczym scala się w jeden wyzwalacz.
    const state = combatState(5, ['carrier', 'mate'], (s) => {
      addCreature(s, 'carrier', { abilities: [ability] });
      addCreature(s, 'mate', {});
    });
    drain(state);
    return {
      state,
      dmg: combatDamageEvents(state).length,
      gained: lifeOf(state, 'p1') - START_LIFE,
    };
  };
  const zTagiem = build('affected_player');
  const bezTagu = build(null);
  assert.ok(zTagiem.dmg >= 2, `walidacja próby: >= 2 zdarzenia obrażeń, jest ${zTagiem.dmg}`);
  assert.equal(zTagiem.gained, 1, 'z tagiem zbiorczym: jedno życie (CR 603.2 scala zdarzenie)');
  assert.equal(bezTagu.gained, 2, 'bez tagu: dawca zdolności widzi oba zdarzenia i odpala się dwa razy');
});
