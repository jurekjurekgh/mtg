// Audyt PR #92 (2026-09-02), znalezisko 5 — „prosty zakres” darmowego rzutu:
// oferta została zawężona w M280/F, ale walidacja w `execute()` została po
// staremu. Skutek: `resolve_discover_choice { castFree: true }` dla czaru
// celowanego/X/modów był AKCEPTOWANY i kładł czar na stos bez celów
// (fizzle, CR 608.2b) — a ten sam filtr miał trzy kopie (oferta Discover,
// bramka Vaana, oferta Vaana), z których bramka Vaana nie znała `modes`.
// Reguła L48: oferta i walidacja to JEDEN filtr.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';

function game(playerId = 'p1') {
  const state = createGameState({ seed: 92, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

/** Stan z decyzją Discover i wygnaną kartą `found` o zadanych cechach. */
function discoverState(foundPatch) {
  const state = game();
  addObject(state, {
    id: 'found', instanceId: 'i-found', cardId: 'test-found', controllerId: 'p1',
    ownerId: 'p1', zone: 'exile', manaCost: foundPatch.manaCost ?? 0, ...foundPatch,
  });
  state.pendingDiscover = {
    playerId: 'p1', foundExileId: 'found', foundCardId: 'test-found',
    restExileIds: [], restorePriorityTo: 'p1', amount: 3,
  };
  return state;
}

/**
 * Stan z decyzją Vaana (resolve_exile_cast) i wygnaną kartą `stolen`.
 *
 * Bez stempla `playableUntilTurn` (audyt PR #93: zdjęty z karty Vaana — ruling
 * WotC 2025-02-10 zabrania czekać z rzutem do później w turze). JEDYNYM
 * uprawnieniem do rzutu z exile jest teraz `abilityWindowCast`, które niesie
 * bramka `resolve_exile_cast`; dawniej ten test zakładał stempel, więc
 * przechodził nawet bez naprawy (L5/L44: test zgodny z kodem, a nie z Oracle).
 */
function exileState(patch) {
  const state = game();
  addObject(state, {
    id: 'stolen', instanceId: 'i-stolen', cardId: 'test-stolen', controllerId: 'p2',
    ownerId: 'p2', zone: 'exile', manaCost: 0, ...patch,
  });
  state.pendingExileCast = {
    playerId: 'p1', objectId: 'stolen', cardId: 'test-stolen', sourceId: 'vaan',
    restorePriorityTo: 'p1',
  };
  addMana(state, 'p1', 10, { colors: ['W', 'U', 'B', 'R', 'G'] });
  return state;
}

const TARGETED_SORCERY = {
  kind: 'spell',
  spell: { timing: 'sorcery', targets: [{ type: 'creature' }], effects: [{ type: 'destroy_permanent' }] },
};
// Kształt `spell.modes` = TABLICA trybów (jak w katalogu: `modes: [` —
// 15 wystąpień, zero w starym kształcie `{ choose, options }`).
const MODAL_INSTANT = {
  kind: 'spell',
  spell: {
    timing: 'instant', targets: [],
    modes: [
      { name: 'A', effects: [{ type: 'gain_life', amount: 1 }] },
      { name: 'B', effects: [{ type: 'gain_life', amount: 2 }] },
    ],
  },
};

// Etap F/4 (PR #135, polecenie właściciela: „żadnych ograniczeń wpływających
// na grę"): Discover (CR 701.57a) rzuca czar Z CELAMI — oferta per zestaw
// celów, walidacja celów przy wykonaniu. Dawny pin (M280/F: „celowany czar
// bez oferty") utrwalał ograniczenie; L48 (oferta = walidacja) zostaje:
// komenda bez celów nadal nie wchodzi na stos (nie fizzluje).
test('A92/5 → F/4: Discover — czar celowany: oferta per cel, komenda bez celu odrzucona', () => {
  const state = discoverState(TARGETED_SORCERY);
  addObject(state, {
    id: 'victim', instanceId: 'i-victim', cardId: 'test-victim', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, types: ['Creature'], colors: [],
  });
  const offers = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'resolve_discover_choice' && c.castFree);
  assert.ok(offers.some((c) => (c.targets ?? []).includes('victim')), 'oferta: darmowy rzut z celem');
  const bad = execute(state, { type: 'resolve_discover_choice', playerId: 'p1', castFree: true });
  assert.equal(bad.ok, false, 'komenda bez celu odrzucona (L48), nie fizzle na stosie');
  assert.match(String(bad.events[0]?.reason ?? ''), /free_cast/, 'powód maszynowo rozpoznawalny');
  assert.equal(state.zones.stack.length, 0, 'żaden czar nie wszedł na stos');
  const ok = execute(state, offers.find((c) => (c.targets ?? []).includes('victim')));
  assert.equal(ok.ok, true, 'rzut z celem przyjęty');
  const stacked = state.objects.get(state.zones.stack[0]);
  assert.deepEqual(stacked.chosenTargets, ['victim'], 'cel na stosie');
});

test('A92/5 → F/4: Discover — X-cost rzucany z X = 0 (CR 107.3b), X > 0 odrzucone; permanent bez celów', () => {
  const withX = discoverState({ kind: 'spell', spell: { timing: 'sorcery', targets: [], xCost: true, effects: [{ type: 'gain_life', amount: 1 }] } });
  const xOffers = playerView(withX, 'p1').legalCommands.filter((c) => c.type === 'resolve_discover_choice' && c.castFree);
  assert.deepEqual(xOffers.map((c) => c.xValue), [0], 'jedna oferta, X = 0');
  assert.equal(execute(withX, { type: 'resolve_discover_choice', playerId: 'p1', castFree: true, xValue: 3 }).ok, false,
    'X > 0 bez płacenia kosztu many — odrzucone');
  assert.equal(execute(withX, xOffers[0]).ok, true, 'X = 0 — przyjęte');
  assert.equal(withX.objects.get(withX.zones.stack[0]).spellX, 0, 'X na stosie = 0');

  const creatureState = discoverState({ kind: 'creature', power: 2, toughness: 2, types: ['Creature'], colors: [] });
  const ok = execute(creatureState, { type: 'resolve_discover_choice', playerId: 'p1', castFree: true });
  assert.equal(ok.ok, true, 'pozytyw: permanent w zakresie nadal rzuca się za darmo');
  assert.equal(creatureState.zones.stack.length, 1, 'czar na stosie, nie w ręce');
});

test('A92/5: Vaan — bramka i oferta mają ten sam zakres (czar modalny: zgoda po obu stronach)', () => {
  const state = exileState({ kind: 'spell', colors: ['R'], spell: MODAL_INSTANT.spell });
  const offers = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'resolve_exile_cast');
  assert.ok(offers.some((c) => c.cast === false), 'rezygnacja (→ Skarb) zawsze dostępna');
  // Audyt PR #93: ten test ODWRÓCONO. Pierwotna wersja piętnowała brak oferty
  // dla czaru modalnego — była zgodna z kodem, ale nie z Oracle („You may cast
  // it” bez wyjątku dla „Choose one”, ADR 0022). Zgodność oferty i bramki
  // sprawdzamy teraz w stronę DOZWOLONĄ: obie strony czar modalny przyjmują.
  const castOffers = offers.filter((c) => c.cast === true);
  assert.ok(castOffers.length > 0, 'oferta proponuje rzut czaru modalnego');
  assert.deepEqual([...new Set(castOffers.map((c) => c.modeIndex))].sort(), [0, 1],
    'każdy tryb jest osobnym wariantem oferty');
  const r = execute(state, castOffers[0]);
  assert.equal(r.ok, true,
    'to samo co oferta musi przyjąć bramka execute() — jeden filtr, jedno '
    + 'uprawnienie (`abilityWindowCast`) dla oferty i wykonania (L48)');
  const stacked = [...state.objects.values()].find((o) => o.zone === 'stack');
  assert.ok(stacked && stacked.chosenMode != null, 'czar na stosie pamięta wybrany tryb');
});

test('A92/5: Vaan — prosty instant spoza ręki nadal rzuca się TERAZ (pozytyw)', () => {
  const state = exileState({
    kind: 'spell', colors: ['W'], manaCost: 1,
    spell: { timing: 'instant', targets: [], effects: [{ type: 'gain_life', amount: 1 }] },
  });
  const offers = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'resolve_exile_cast');
  assert.ok(offers.some((c) => c.cast === true), 'oferta zawiera rzut');
  assert.equal(execute(state, { type: 'resolve_exile_cast', playerId: 'p1', cast: true, targets: [] }).ok, true);
  assert.equal(state.pendingExileCast, null, 'decyzja zamknięta');
});
