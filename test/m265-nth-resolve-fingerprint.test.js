// M265 (Żywy Tester, worek-mroczny vs alara seed 331, detektor `noop`):
//   „Oferta bez skutku (opcja modala) — jedyna zmiana to zapłacony koszt
//    Aktywuj: Soulbright Flamekin (koszt 2) — zdobądź Zadeptywanie…"
//
// To był FAŁSZYWY alarm sondy, ale z prawdziwej luki w odcisku stanu.
// Soulbright Flamekin: „{2}: Target creature gains trample until end of turn.
// If this is the THIRD time this ability has resolved this turn, you may add
// {R}{R}{R}{R}{R}{R}{R}{R}." Silnik liczy postęp w
// `object.abilityResolvedThisTurn` — i tego pola NIE było w
// `stateFingerprint`. Skutki (klasa L16/M122/#1):
//  (a) sonda „oferta bez skutku" nie widziała postępu do trzeciej rezolucji,
//      więc druga aktywacja na cel, który już ma trample, wyglądała na no-op
//      (`effectDiffs` puste) — a to legalna, sensowna gra pod {R}×8;
//  (b) dwa stany różniące się licznikiem rezolucji miały IDENTYCZNY odcisk,
//      więc weryfikacja replayów ich nie odróżniała (ADR 0005: zamrożony
//      postęp jest częścią stanu gry).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { addObject, createGameState, execute } from '../src/engine/game-state.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { stateFingerprint } from '../src/engine/fingerprint.js';
import { probeCommandEffect } from '../src/table/noop-probe.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone: 'battlefield',
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
}

function board() {
  const state = createGameState({ seed: 331, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  put(state, 'sf', 'soulbright-flamekin', 'p1');
  put(state, 'ct', 'cenns-tactician', 'p1');
  addMana(state, 'p1', 20, { colors: ['R'] });
  return state;
}

function activateOnce(state) {
  const r = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'sf', abilityIndex: 0, targets: ['ct'] });
  assert.ok(r.ok, r.events?.[0]?.reason);
  for (let i = 0; i < 6 && state.zones.stack.length > 0; i += 1) {
    execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  }
}

test('M265: licznik rozstrzygnięć onNthResolve jest częścią odcisku stanu (ADR 0005)', () => {
  const before = board();
  const after = board();
  activateOnce(after);
  // Wyrównujemy WSZYSTKO poza licznikiem: ta sama plansza, ta sama mana,
  // ten sam grant trample — różni je wyłącznie postęp do trzeciej rezolucji.
  const sfBefore = before.objects.get('sf');
  const sfAfter = after.objects.get('sf');
  assert.equal(sfAfter.abilityResolvedThisTurn, 1, 'silnik liczy rezolucje');
  assert.equal(sfBefore.abilityResolvedThisTurn ?? 0, 0);

  const a = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  const b = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  for (const state of [a, b]) {
    state.turn = jumpToStep(state.turn, 'main', 'p1');
    state.turn.activePlayerId = 'p1';
    state.turn.priorityPlayerId = 'p1';
    put(state, 'sf', 'soulbright-flamekin', 'p1');
  }
  b.objects.set('sf', Object.freeze({ ...b.objects.get('sf'), abilityResolvedThisTurn: 2 }));
  assert.notEqual(stateFingerprint(a), stateFingerprint(b),
    'stany różniące się postępem do {R}×8 muszą mieć różne odciski');
});

test('M265: druga aktywacja NIE jest no-opem — sonda widzi postęp do trzeciej rezolucji', () => {
  const state = board();
  activateOnce(state); // cel ma już trample; kolejna aktywacja „nic nie dodaje"
  const probe = probeCommandEffect(state, {
    type: 'activate_ability', playerId: 'p1', objectId: 'sf', abilityIndex: 0, targets: ['ct'],
  });
  assert.equal(probe.ok, true);
  assert.ok(probe.effectDiffs.length > 0,
    'sonda musi zobaczyć realny skutek (postęp licznika), inaczej detektor zgłasza fałszywy no-op');
});

test('M265 (anty-over-fix): pierwsza aktywacja nadal ma skutek widoczny w sondzie', () => {
  // Kontrola pozytywna: fix nie może polegać na „wszystko jest skutkiem".
  const state = board();
  const probe = probeCommandEffect(state, {
    type: 'activate_ability', playerId: 'p1', objectId: 'sf', abilityIndex: 0, targets: ['ct'],
  });
  assert.ok(probe.effectDiffs.some((d) => /keywordGrants/.test(d)),
    `nadanie trample zostaje widoczne jako skutek: ${probe.effectDiffs.join(', ')}`);
});
