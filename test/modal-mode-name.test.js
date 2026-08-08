import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commandLabel } from '../src/table/render.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';

const REGISTRY = createCardRegistry();

function buildSession() {
  // Minimalna sesja, by commandLabel miał dostęp do view i nameOf.
  const session = {
    state: createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] }),
    nameOf(cardId) { return REGISTRY.get(cardId)?.name ?? cardId; },
    nameOfObject(id) { return `obj-${id}`; },
    cardDetails(cardId) { return REGISTRY.get(cardId) ?? null; },
    abilitiesOf(cardId) { return REGISTRY.get(cardId)?.abilities ?? []; },
    colorsOf(cardId) { return REGISTRY.get(cardId)?.colors ?? []; },
  };
  session.state.turn = jumpToStep(session.state.turn, 'main', 'p1');
  return session;
}

function viewForCard(state, card) {
  // view.zones.hand musi zawierać kartę z id, by commandLabel ją znalazł.
  return {
    status: 'active',
    zones: {
      hand: [card],
      battlefield: [],
      stack: [],
      graveyard: [],
      library: [],
    },
    players: state.players,
    turn: state.turn,
  };
}

// =============================================================================
// Modalne Choose one (M30/M17/M19/M20): tryby mają nazwę widoczną w etykiecie
// akcji, żeby gracz odróżnił "Pray for Protection" od "Strike a Deal" (i
// analogiczne warianty w 3 innych kartach). Zgłoszenie właściciela 2026-08-08.
// =============================================================================

const MODAL_CASES = [
  {
    name: 'Your Temple Is Under Attack',
    cardId: 'your-temple-is-under-attack',
    modes: [
      { name: 'Pray for Protection', modeIndex: 0 },
      { name: 'Strike a Deal', modeIndex: 1 },
    ],
  },
  {
    name: 'Aerith Rescue Mission',
    cardId: 'aerith-rescue-mission',
    modes: [
      { name: 'Take the Elevator', modeIndex: 0 },
      { name: 'Take 59 Flights of Stairs', modeIndex: 1 },
    ],
  },
  {
    name: "You're Confronted by Robbers",
    cardId: 'youre-confronted-by-robbers',
    modes: [
      { name: 'Stall for Time', modeIndex: 0 },
      { name: 'Call for Aid', modeIndex: 1 },
    ],
  },
  {
    name: 'Ruinous Rampage',
    cardId: 'ruinous-rampage',
    modes: [
      { name: 'Ruinous Rampage', modeIndex: 0 },
      { name: 'Exile Artifacts', modeIndex: 1 },
    ],
  },
];

for (const { name, cardId, modes } of MODAL_CASES) {
  test(`modal ${name}: commandLabel pokazuje nazwę trybu dla modeIndex`, () => {
    const session = buildSession();
    const cardDef = REGISTRY.get(cardId);
    assert.ok(cardDef?.spell?.modes, `${cardId} should have spell.modes`);
    // Assert: catalog ma nazwę dla każdego trybu
    for (const expected of modes) {
      assert.equal(cardDef.spell.modes[expected.modeIndex]?.name, expected.name,
        `katalog ${cardId} tryb ${expected.modeIndex} powinien mieć name: ${expected.name}`);
    }
    // Assert: commandLabel dla cast_spell z modeIndex dokleja "— {modeName}"
    // Obiekt ręki musi mieć spell (jak realna playerView) — inaczej commandLabel
    // nie widzi `spell.modes[modeIndex].name`. Propagujemy definicję.
    const handCard = {
      id: `hand-${cardId}`,
      cardId,
      controllerId: 'p1',
      zone: 'hand',
      kind: 'instant',
      spell: cardDef.spell,
    };
    for (const expected of modes) {
      const label = commandLabel(
        { type: 'cast_spell', objectId: handCard.id, targets: [], modeIndex: expected.modeIndex },
        session,
        viewForCard(session.state, handCard),
      );
      assert.ok(label.includes(expected.name),
        `${name} tryb ${expected.modeIndex} powinien pokazać "${expected.name}" w etykiecie, dostałem: ${label}`);
    }
  });
}

test('modal bez modeIndex: commandLabel NIE pokazuje nazwy trybu (fallback do "{Karta} (koszt …)")', () => {
  // Karta modalna, ale komenda cast_spell bez modeIndex (np. podgląd z oferty
  // bez wybranego trybu) — nie doklejamy nazwy.
  const session = buildSession();
  const handCard = {
    id: 'hand-yosr',
    cardId: 'youre-confronted-by-robbers',
    controllerId: 'p1',
    zone: 'hand',
    kind: 'instant',
    spell: REGISTRY.get('youre-confronted-by-robbers').spell,
  };
  const label = commandLabel(
    { type: 'cast_spell', objectId: handCard.id, targets: [] },
    session,
    viewForCard(session.state, handCard),
  );
  assert.ok(!label.includes('Stall for Time'), `nie powinno być nazwy trybu w: ${label}`);
  assert.ok(!label.includes('Call for Aid'), `nie powinno być nazwy trybu w: ${label}`);
});

test('catalog invariant: wszystkie 4 karty modalne mają name w każdym trybie (regression)', () => {
  for (const { cardId, modes } of MODAL_CASES) {
    const cardDef = REGISTRY.get(cardId);
    for (const expected of modes) {
      assert.ok(cardDef.spell.modes[expected.modeIndex]?.name,
        `${cardId} tryb ${expected.modeIndex} musi mieć name (regression)`);
    }
  }
});
