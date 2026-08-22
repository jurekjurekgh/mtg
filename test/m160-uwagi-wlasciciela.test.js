// M160 — uwagi właściciela z testów (2026-08-20):
//
// A. Selhoff Occultist: przy TRZECH jednoczesnych zgonach (walka — Selhoff,
//    inny stwór i token) mill rozstrzygał się tylko RAZ. CR 603.10a: triggery
//    leave-battlefield „patrzą wstecz" — stwór, który zginął razem z innymi,
//    widzi ich zgony. Pętla źródeł w skanie triggerów widziała tylko pole
//    bitwy, więc poległy Selhoff nie odpalał za współzgony.
// B. Seismic Monstrosaur ({2}{R}, poświęć ląd: dobierz kartę):
//    B1 — warianty per ląd nie grupowały się w panelu „Twoje działania";
//    B2 — etykieta nie nazywała poświęcanego lądu (N identycznych wpisów).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { commandLabel, buildActionEntries, choiceGroupTitle } from '../src/table/render.js';

const REGISTRY = createCardRegistry();

function game() {
  return createGameState({ seed: 160, players: [{ id: 'p1' }, { id: 'p2' }] });
}

function addRealCard(state, id, cardId, controllerId, zone = 'battlefield') {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [], types: def.types ?? [],
    colors: data.colors ?? [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function addCreature(state, id, controllerId, power, toughness, { token = false } = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'highland-game', controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 1,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [],
  });
  const patch = { summoningSickness: false, ...(token ? { isToken: true, name: 'Soldier' } : {}) };
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  return state.objects.get(id);
}

function addLib(state, id, controllerId) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'shatter', controllerId, zone: 'library',
    kind: 'spell', manaCost: 1, spell: null, abilities: [], keywords: [], subtypes: [], types: ['Instant'], colors: [],
  });
}

/** Walka: p2 atakuje N wielkimi stworami, p1 blokuje wskazanymi — blokerzy giną razem. */
function combatKillBlockers(state, blockers) {
  const assignments = {};
  const attackers = [];
  blockers.forEach((blockerId, index) => {
    const atkId = `atk${index}`;
    addCreature(state, atkId, 'p2', 5, 5);
    attackers.push(atkId);
    assignments[atkId] = [blockerId];
  });
  state.turn = { ...state.turn, number: 3, activePlayerId: 'p2', priorityPlayerId: 'p2', phase: 'combat', step: 'declare_attackers', stepIndex: 5, passes: 0 };
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p2', attackerIds: attackers }).ok);
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p1', assignments }).ok);
  execute(state, { type: 'pass_priority', playerId: 'p1' }); // M172/C: okno obrońcy po blokach (CR 509.4)
  assert.ok(execute(state, { type: 'resolve_combat', playerId: 'p2', defendingPlayerId: 'p1' }).ok);
}

/** Rozstrzyga wszystkie decyzje celu Selhoffa (zawsze p2) i stos. */
function resolveAllMillTriggers(state) {
  for (let i = 0; i < 30; i += 1) {
    if (state.pendingTriggerTargets.length > 0) {
      const pending = state.pendingTriggerTargets[0];
      const done = execute(state, { type: 'resolve_trigger_target', playerId: pending.playerId, targetId: 'p2' });
      assert.ok(done.ok, done.events?.[0]?.reason);
      continue;
    }
    if (state.zones.stack.length > 0) {
      const done = execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
      assert.ok(done.ok, done.events?.[0]?.reason);
      continue;
    }
    break;
  }
}

function milledCount(state) {
  return [...state.objects.values()]
    .filter((o) => o.cardId === 'shatter' && o.zone === 'graveyard' && o.controllerId === 'p2').length;
}

test('A1: trzy jednoczesne zgony (Selhoff + stwór + token) = TRZY mille (CR 603.10a)', () => {
  const state = game();
  addRealCard(state, 'occ', 'selhoff-occultist', 'p1'); // 2/3, ginie od 5
  addCreature(state, 'vic', 'p1', 1, 1);
  addCreature(state, 'tok', 'p1', 1, 1, { token: true });
  for (let i = 0; i < 5; i += 1) addLib(state, `p2lib${i}`, 'p2');
  combatKillBlockers(state, ['occ', 'vic', 'tok']);
  assert.equal(state.objects.get('occ'), undefined, 'Selhoff zginął');
  assert.equal(state.pendingTriggerTargets.length, 3,
    'trzy zgony = trzy decyzje celu triggera (własny + dwa współzgony)');
  resolveAllMillTriggers(state);
  assert.equal(milledCount(state), 3, 'p2 zmielił 3 karty (po jednej za każdy zgon)');
});

test('A2: Selhoff przeżywa, dwa inne stwory giną razem = DWA mille', () => {
  const state = game();
  addRealCard(state, 'occ', 'selhoff-occultist', 'p1');
  addCreature(state, 'vic1', 'p1', 1, 1);
  addCreature(state, 'vic2', 'p1', 1, 1);
  for (let i = 0; i < 5; i += 1) addLib(state, `p2lib${i}`, 'p2');
  combatKillBlockers(state, ['vic1', 'vic2']);
  assert.ok(state.objects.get('occ'), 'Selhoff żyje');
  resolveAllMillTriggers(state);
  assert.equal(milledCount(state), 2, 'dwa zgony = dwa mille');
});

test('A3: współzgon nie dubluje triggera „another creature dies" za własną śmierć', () => {
  // excludeSelf (wzorzec Murder of Crows): źródło ginące RAZEM z innym stworem
  // odpala za CUDZY zgon (to „another creature"), ale nie za własny.
  const state = game();
  const def = REGISTRY.get('selhoff-occultist');
  const excludeSelfAbility = {
    ...def.abilities[0],
    trigger: { ...def.abilities[0].trigger, excludeSelf: true },
  };
  addObject(state, {
    id: 'crow', instanceId: 'i-crow', cardId: 'selhoff-occultist', controllerId: 'p1',
    zone: 'battlefield', kind: 'creature', power: 2, toughness: 3, manaCost: 3,
    abilities: [excludeSelfAbility], keywords: [], subtypes: [], types: ['Creature'], colors: [],
  });
  state.objects.set('crow', Object.freeze({ ...state.objects.get('crow'), summoningSickness: false }));
  addCreature(state, 'vic', 'p1', 1, 1);
  for (let i = 0; i < 5; i += 1) addLib(state, `p2lib${i}`, 'p2');
  combatKillBlockers(state, ['crow', 'vic']);
  resolveAllMillTriggers(state);
  assert.equal(milledCount(state), 1, 'excludeSelf: tylko cudzy zgon liczy się (1 mill, nie 2)');
});

// ---- B: Seismic Monstrosaur — grupowanie i nazwa poświęcanego lądu ---------

function monstrosaurFixtures() {
  const battlefield = [
    { id: 'mon', cardId: 'seismic-monstrosaur', controllerId: 'p1', zone: 'battlefield', kind: 'creature' },
    { id: 'landA', cardId: 'basic-mountain', controllerId: 'p1', zone: 'battlefield', kind: 'land' },
    { id: 'landB', cardId: 'basic-island', controllerId: 'p1', zone: 'battlefield', kind: 'land' },
    { id: 'landC', cardId: 'basic-forest', controllerId: 'p1', zone: 'battlefield', kind: 'land' },
  ];
  const session = {
    nameOf: (cardId) => REGISTRY.get(cardId)?.name
      ?? ({ 'basic-mountain': 'Mountain', 'basic-island': 'Island', 'basic-forest': 'Forest' }[cardId] ?? cardId),
    nameOfObject: (id) => id,
    cardDetails: (cardId) => REGISTRY.get(cardId) ?? null,
    colorsOf: (cardId) => REGISTRY.get(cardId)?.colors ?? [],
    abilitiesOf: (cardId) => REGISTRY.get(cardId)?.abilities ?? [],
    log: [], reasoning: [], state: { seed: 1, objects: new Map() },
  };
  const view = {
    status: 'active', winnerId: null, playerId: 'p1',
    players: [{ id: 'p1', name: 'Ty', life: 20 }, { id: 'p2', name: 'On', life: 20 }],
    zones: { battlefield, hand: [], stack: [], graveyard: [], library: [], exile: [] },
    turn: { number: 1, activePlayerId: 'p1', phase: 'precombat_main', step: 'precombat_main' },
    legalCommands: [],
  };
  const commands = ['landA', 'landB', 'landC'].map((landId) => ({
    type: 'activate_ability', playerId: 'p1', objectId: 'mon', abilityIndex: 0, sacrificeLandId: landId,
  }));
  return { session, view, commands };
}

test('B1: warianty „poświęć ląd" grupują się w JEDEN wpis panelu', () => {
  const { session, view, commands } = monstrosaurFixtures();
  const entries = buildActionEntries(commands, session, view);
  const grouped = entries.filter((entry) => entry.request);
  assert.equal(grouped.length, 1, `trzy lądy = jedna grupa wyboru, a było wpisów: ${entries.length}`);
  assert.equal(grouped[0].request.options.length, 3, 'grupa niesie wszystkie trzy warianty');
  const single = entries.filter((entry) => entry.command?.type === 'activate_ability');
  assert.equal(single.length, 0, 'brak luźnych, niezgrupowanych wpisów aktywacji');
  const title = choiceGroupTitle(grouped[0].request, session, view);
  assert.ok(title.includes('Seismic Monstrosaur'), `tytuł grupy nazywa kartę: ${title}`);
});

test('B2: etykieta wariantu nazywa poświęcany ląd', () => {
  const { session, view, commands } = monstrosaurFixtures();
  const labels = commands.map((cmd) => commandLabel(cmd, session, view).replace(/<[^>]*>/g, ''));
  assert.ok(labels[0].includes('poświęć: Mountain'), `brak nazwy lądu: ${labels[0]}`);
  assert.ok(labels[1].includes('poświęć: Island'), `brak nazwy lądu: ${labels[1]}`);
  assert.ok(labels[2].includes('poświęć: Forest'), `brak nazwy lądu: ${labels[2]}`);
  assert.equal(new Set(labels).size, 3, 'trzy warianty mają trzy RÓŻNE etykiety');
});
