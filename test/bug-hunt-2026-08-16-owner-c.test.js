// M103/C (zgłoszenie właściciela 2026-08-16) — Warmaker Gunship / Station:
// C2: grupa wariantów station pokazywała się jako „Wybierz: Wariant (2 opcje)"
//     zamiast nazwać kartę i zdolność;
// C3: po przekroczeniu progu liczników obiekt stawał się stworzeniem (kind),
//     ale TYPY zostawały ['Artifact'] — kafel i każda ścieżka sprawdzająca
//     `types.includes('Creature')` nie widziały stwora (CR 205.1: Artifact
//     Creature musi nieść oba typy).
// Testy RED→GREEN.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, execute, addObject, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { choiceGroupTitle, choiceGroupLabel } from '../src/table/render.js';
import { removeCounter } from '../src/engine/counters.js';
import { legalAttackerOptions, legalBlockerOptions } from '../src/engine/combat.js';

const REGISTRY = createCardRegistry();

function newState({ turnNumber = 5 } = {}) {
  const state = createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = turnNumber;
  return state;
}

function addRealCard(state, id, cardId, controllerId, zone, extra = {}) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [], types: def.types ?? [],
    colors: data.colors ?? [], cardName: def.name, station: def.station, ...extra,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function resolveStack(state, limit = 12) {
  for (let i = 0; i < limit && state.zones.stack.length > 0; i += 1) {
    const r = execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
    if (!r.ok) break;
  }
  return state.zones.stack.length === 0;
}

function station(state, tapId) {
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  const cmd = playerView(state, 'p1').legalCommands.find((c) => c.type === 'activate_ability'
    && c.objectId === 'ship' && c.tapOtherCreatureId === tapId);
  assert.ok(cmd, `oferta station (tap ${tapId}) istnieje`);
  assert.ok(execute(state, cmd).ok, 'station aktywowane');
  assert.ok(resolveStack(state), 'stos rozstrzygnięty');
}

// ---------------------------------------------------------------------------
// C3 — typy obiektu po przekroczeniu progu station
// ---------------------------------------------------------------------------

test('C3: po progu 6+ gunship ma TYP Creature, nie tylko kind (RED)', () => {
  const state = newState();
  addRealCard(state, 'ship', 'warmaker-gunship', 'p1', 'battlefield');
  addRealCard(state, 'c3b', 'highland-game', 'p1', 'battlefield', { power: 3 });
  addRealCard(state, 'c2a', 'highland-game', 'p1', 'battlefield', { power: 2 });
  addRealCard(state, 'c2b', 'highland-game', 'p1', 'battlefield', { power: 2 });
  station(state, 'c3b'); // 3
  station(state, 'c2a'); // 5
  station(state, 'c2b'); // 7 → próg 6
  const ship = state.objects.get('ship');
  assert.equal(ship.kind, 'creature');
  assert.ok((ship.types ?? []).includes('Creature'),
    `typ Creature w types: ${JSON.stringify(ship.types)}`);
  assert.ok((ship.types ?? []).includes('Artifact'), 'Artifact zostaje');
});

test('C3: przed progiem gunship NIE jest stworem i nie ma typu Creature', () => {
  const state = newState();
  addRealCard(state, 'ship', 'warmaker-gunship', 'p1', 'battlefield');
  addRealCard(state, 'c3b', 'highland-game', 'p1', 'battlefield', { power: 3 });
  station(state, 'c3b'); // 3 < 6
  const ship = state.objects.get('ship');
  assert.equal(ship.kind, 'artifact');
  assert.ok(!(ship.types ?? []).includes('Creature'), 'poniżej progu bez typu Creature');
});

test('C3: zejście poniżej progu (usunięcie liczników) cofa typ Creature', () => {
  const state = newState();
  addRealCard(state, 'ship', 'warmaker-gunship', 'p1', 'battlefield');
  addRealCard(state, 'c3b', 'highland-game', 'p1', 'battlefield', { power: 3 });
  addRealCard(state, 'c2a', 'highland-game', 'p1', 'battlefield', { power: 2 });
  addRealCard(state, 'c2b', 'highland-game', 'p1', 'battlefield', { power: 2 });
  station(state, 'c3b');
  station(state, 'c2a');
  station(state, 'c2b');
  const ship = state.objects.get('ship');
  assert.ok((ship.types ?? []).includes('Creature'));
  // Usunięcie liczników do 2 (< 6) — wraca do Artifact (realna ścieżka
  // removeCounter, która synchronizuje kind przez syncStationKind).
  removeCounter(state, 'ship', 'charge', 5);
  const back = state.objects.get('ship');
  assert.equal(back.kind, 'artifact');
  assert.ok(!(back.types ?? []).includes('Creature'), 'typ Creature cofnięty pod progiem');
});

// ---------------------------------------------------------------------------
// C1 — regresja: stwór-station JEST na listach ataku i bloku po progu
// (zgłoszenie właściciela „nie mogłem nim blokować" — niezreprodukowane;
// te testy pilnują, żeby tak zostało)
// ---------------------------------------------------------------------------

test('C1: gunship przy 7 licznikach jest na liście atakujących', () => {
  const state = newState();
  addRealCard(state, 'ship', 'warmaker-gunship', 'p1', 'battlefield');
  addRealCard(state, 'c3b', 'highland-game', 'p1', 'battlefield', { power: 3 });
  addRealCard(state, 'c2a', 'highland-game', 'p1', 'battlefield', { power: 2 });
  addRealCard(state, 'c2b', 'highland-game', 'p1', 'battlefield', { power: 2 });
  station(state, 'c3b');
  station(state, 'c2a');
  station(state, 'c2b');
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.combat = { attackingPlayerId: 'p1', attackers: [], blockers: new Map(), blockedAttackers: [] };
  const options = legalAttackerOptions(state, 'p1');
  const ids = new Set(options.flat());
  assert.ok(ids.has('ship'), 'gunship-stwór oferowany jako atakujący');
});

test('C1: gunship przy 7 licznikach jest na liście blokujących (nawet z chorobą przywołania)', () => {
  const state = newState();
  addRealCard(state, 'ship', 'warmaker-gunship', 'p1', 'battlefield', { summoningSickness: true });
  addRealCard(state, 'c3b', 'highland-game', 'p1', 'battlefield', { power: 3 });
  addRealCard(state, 'c2a', 'highland-game', 'p1', 'battlefield', { power: 2 });
  addRealCard(state, 'c2b', 'highland-game', 'p1', 'battlefield', { power: 2 });
  addRealCard(state, 'e1', 'highland-game', 'p2', 'battlefield', { power: 2 });
  station(state, 'c3b');
  station(state, 'c2a');
  station(state, 'c2b');
  state.turn = jumpToStep(state.turn, 'declare_blockers', 'p1');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p1';
  state.combat = { attackingPlayerId: 'p2', attackers: ['e1'], blockers: new Map(), blockedAttackers: [] };
  const options = legalBlockerOptions(state, 'p1');
  const ids = new Set(options.flatMap((o) => Object.values(o).flat()));
  assert.ok(ids.has('ship'), 'blokowanie nie zależy od choroby przywołania (CR 302.6)');
});

// ---------------------------------------------------------------------------
// C2 — etykieta grupy wariantów station
// ---------------------------------------------------------------------------

const fakeSession = {
  nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? cardId,
};

function stationGroupView() {
  return {
    status: 'active',
    turn: { number: 5, activePlayerId: 'p1', phase: 'precombat_main', step: 'main' },
    zones: {
      hand: [], stack: [], graveyard: [], library: [], exile: [],
      battlefield: [{
        id: 'ship', cardId: 'warmaker-gunship', controllerId: 'p1', zone: 'battlefield',
        kind: 'artifact',
      }],
    },
    legalCommands: [],
  };
}

test('C2: grupa wariantów station nazywa kartę, nie „Wariant" (RED)', () => {
  const request = {
    id: 'c1', type: 'variant',
    options: [
      { type: 'activate_ability', objectId: 'ship', abilityIndex: 1, tapOtherCreatureId: 'c2a' },
      { type: 'activate_ability', objectId: 'ship', abilityIndex: 1, tapOtherCreatureId: 'c2b' },
    ],
  };
  const title = choiceGroupTitle(request, fakeSession, stationGroupView());
  assert.match(title, /Warmaker Gunship/, 'nazwa karty w tytule grupy');
  assert.doesNotMatch(title, /^Wybierz: Wariant$/, 'bez generycznego „Wariant"');
  const label = choiceGroupLabel(request, fakeSession, stationGroupView());
  assert.match(label, /2 opcje/, 'licznik opcji zostaje');
});
