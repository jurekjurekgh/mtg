// M219 — pętla jakości Żywym Testerem (2026-08-26), partia g9 (zendikar-gracz
// vs alara-bot, seed 8): bot aktywował Unstable Frontier co turę i log/modal
// „Rozgrywka" pokazywał za każdym razem DWA identyczne wiersze:
//   • Swamp staje się typem Plains do końca tury
//   • Swamp staje się typem Plains do końca tury
//
// Oś 2 audytu (kompletność logu — „wszystko poza szumem powinno tam być",
// ale każda rzecz RAZ). Przyczyna (L24/L6, wariant „dwa zdarzenia, jedna
// treść"): rozstrzygnięcie decyzji `resolve_land_type_choice` emituje DWA
// zdarzenia — `land_type_changed` (niska warstwa: sama mutacja typu) oraz
// `land_type_choice_resolved` (narracja decyzji) — a `describeGameEvent`
// renderował OBA tym samym zdaniem.
//
// Naprawa u root cause: mechaniczny `land_type_changed` jest wyciszony
// w warstwie OPISU (zwraca null), bo `grantBasicLandTypeUntilEndOfTurn`
// woła się wyłącznie z resolve tej decyzji, więc jest zawsze sparowany
// z `land_type_choice_resolved`, którego opis jest kompletny. Samo zdarzenie
// zostaje w strumieniu (determinizm/fingerprint, real-cards-batch7 sprawdza
// jego OBECNOŚĆ).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeGameEvent } from '../src/table/session.js';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

const REGISTRY = createCardRegistry();
const NAMES = { p1: 'Ty', p2: 'Nieprzyjaciel' };
const HELPERS = {
  nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? String(cardId ?? '?'),
  nameOfObject: (objectId) => (objectId === 'l1' ? 'Swamp' : String(objectId ?? '?')),
  isPlayer: (id) => id === 'p1' || id === 'p2',
};

test('M219: mechaniczny land_type_changed nie ma osobnego opisu (koniec dubla)', () => {
  const text = describeGameEvent(
    { type: 'land_type_changed', objectId: 'l1', cardId: 'swamp', subtype: 'Plains', untilEndOfTurn: true },
    HELPERS, NAMES,
  );
  assert.equal(text, null, 'land_type_changed nie może renderować własnego zdania — to dubel narracji');
});

test('M219: narracja decyzji (land_type_choice_resolved) NADAL opisuje zmianę', () => {
  const text = describeGameEvent(
    { type: 'land_type_choice_resolved', playerId: 'p1', targetId: 'l1', landType: 'Plains' },
    HELPERS, NAMES,
  );
  assert.match(text, /Swamp staje się typem Plains do końca tury/, text);
});

test('M219 (integracja): jedna aktywacja = zdanie w logu DOKŁADNIE raz, choć zdarzeń dwa', () => {
  // Minimalny stan: kontroler ma Unstable Frontier i własny Swamp.
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';

  const ufDef = REGISTRY.get('unstable-frontier');
  const ufData = gameObjectDataOf(ufDef);
  addObject(state, {
    id: 'uf', instanceId: 'i-uf', cardId: 'unstable-frontier', controllerId: 'p1', zone: 'battlefield',
    kind: ufData.kind, abilities: ufData.abilities ?? [], types: ufDef.types ?? ['Land'],
    subtypes: ufDef.subtypes ?? [],
  });
  addObject(state, {
    id: 'l1', instanceId: 'i-l1', cardId: 'basic-swamp', controllerId: 'p1', zone: 'battlefield',
    kind: 'land', abilities: [], subtypes: ['Swamp'], types: ['Basic', 'Land'],
  });

  const view = playerView(state, 'p1');
  const cmd = view.legalCommands.find(
    (c) => c.type === 'activate_ability' && c.objectId === 'uf' && c.targets?.[0] === 'l1',
  );
  assert.ok(cmd, 'zdolność oferuje własny land (l1) jako cel');
  const act = execute(state, cmd);
  assert.ok(act.ok, `aktywacja odrzucona: ${act.events?.[0]?.reason}`);
  // Zdolność na stosie — rozstrzygamy do decyzji wyboru typu.
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.ok(state.pendingLandTypeChoice, 'decyzja wyboru typu czeka');

  const pick = execute(state, { type: 'resolve_land_type_choice', playerId: 'p1', landType: 'Plains' });
  assert.ok(pick.ok, pick.events?.[0]?.reason);

  // Oba zdarzenia MUSZĄ być w strumieniu (determinizm/inni konsumenci)...
  assert.ok(pick.events.some((e) => e.type === 'land_type_changed'), 'land_type_changed zostaje w strumieniu');
  assert.ok(pick.events.some((e) => e.type === 'land_type_choice_resolved'), 'land_type_choice_resolved w strumieniu');

  // ...ale opis widoczny dla gracza pojawia się DOKŁADNIE raz.
  const lines = pick.events
    .map((e) => describeGameEvent(e, HELPERS, NAMES))
    .filter((t) => t && /staje się typem Plains do końca tury/.test(t));
  assert.equal(lines.length, 1, `zdanie o zmianie typu ma paść raz, padło ${lines.length}×: ${JSON.stringify(lines)}`);
});
