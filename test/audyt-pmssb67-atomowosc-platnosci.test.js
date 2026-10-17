// =============================================================================
// PMSSB-67 / L48 — atomowość nieudanej płatności kolorowej (`spendMana`).
//
// Zasada: płatność, która się nie uda, NIE może zmienić stanu — ani tapnąć
// lądu, ani zużyć puli, ani poświęcić Skarbu. Bramki (suma i pokrycie pipów
// `planGrantManaColors`) stoją PRZED pierwszą mutacją w gałęzi kolorowej.
//
// Pin regresyjny, lekki: trzy deterministyczne scenariusze, bez symulacji partii.
// Asercje opisują KONTRAKT (rzut + brak zmian), nie wartości wyceny bota.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { spendMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

const REGISTRY = createCardRegistry();
const PURPOSE = Object.freeze({ castingSpell: true, artifactSpell: false });

function putLand(state, id, cardId) {
  const def = REGISTRY.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', ...gameObjectDataOf(def),
  });
}

/** Migawka tego, co płatność może ruszyć: tapnięcia lądów, pula i licznik many. */
function snapshotPayable(state, player) {
  const lands = [...state.zones.battlefield]
    .map((id) => state.objects.get(id))
    .filter((o) => o && o.controllerId === 'p2')
    .map((o) => ({ id: o.id, tapped: o.tapped === true, zone: o.zone }));
  return {
    lands,
    pool: JSON.parse(JSON.stringify(player.manaPool ?? {})),
    mana: player.mana ?? 0,
    battlefield: [...state.zones.battlefield],
  };
}

const CASES = [
  {
    name: 'trzy lasy, pip {W} bez źródła W: suma wystarcza, kolor nie',
    lands: ['basic-forest', 'basic-forest', 'basic-forest'],
    amount: 3,
    requirements: [['W'], [], []],
  },
  {
    name: 'dwa lasy, pip {W}: suma za mała (bramka sumy)',
    lands: ['basic-forest', 'basic-forest'],
    amount: 3,
    requirements: [['W'], [], []],
  },
  {
    name: 'wyspa + dwa lasy, pipy {W} i {G}: brak W przy pełnej sumie',
    lands: ['basic-island', 'basic-forest', 'basic-forest'],
    amount: 3,
    requirements: [['W'], ['G'], []],
  },
];

for (const c of CASES) {
  test(`L48 atomowość: ${c.name} — rzut i zero mutacji`, () => {
    const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
    jumpToStep(state, 'main1', 'p2');
    const player = state.players.find((p) => p.id === 'p2');
    c.lands.forEach((cardId, i) => putLand(state, `L${i}`, cardId));
    const before = snapshotPayable(state, player);

    assert.throws(
      () => spendMana(state, 'p2', c.amount, c.requirements, PURPOSE),
      /Niewystarczająca mana|Brak kolorowej many/,
    );

    assert.deepEqual(snapshotPayable(state, player), before,
      'nieudana płatność zmieniła stan (tapnięcie, pula lub mana) — brak atomowości');
  });
}
