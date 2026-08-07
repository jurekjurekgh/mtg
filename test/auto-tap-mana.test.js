import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addMana, initializeResources, producibleMana, untappedLandManaSources } from '../src/engine/resources.js';

/**
 * Auto-tap lądów przy płatności (UX): dostępną akcją jest od razu rzut/zdolność
 * (oferta po manie PRODUKOWALNEJ = pula + nietapnięte landy), a spendMana sam
 * do-tapuje brakujące landy w deterministycznej kolejności (ADR 0005):
 * zwykłe landy przed land creatures; Skarby zostają ręczną decyzją gracza.
 */

function mainPhaseState() {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  initializeResources(state);
  state.turn = { ...state.turn, phase: 'precombat_main', step: 'main' };
  return state;
}

/** T1 (stos permanentów): rozstrzyga stos pełnymi rundami passów (LIFO). */
function resolveStack(state) {
  const all = [];
  let rounds = 0;
  while (state.zones.stack.length > 0 && rounds < 8) {
    const first = state.turn.priorityPlayerId;
    const other = state.players.find((p) => p.id !== first).id;
    const r1 = execute(state, { type: 'pass_priority', playerId: first });
    assert.ok(r1.ok, r1.events[0]?.reason);
    all.push(...r1.events);
    if (state.zones.stack.length === 0) break;
    const r2 = execute(state, { type: 'pass_priority', playerId: other });
    assert.ok(r2.ok, r2.events[0]?.reason);
    all.push(...r2.events);
    rounds += 1;
  }
  return all;
}

function addLand(state, id, controllerId = 'p1') {
  addObject(state, { id, instanceId: `i-${id}`, cardId: `Land-${id}`, controllerId, zone: 'battlefield', kind: 'land' });
}

function addCastableCreature(state, id, manaCost) {
  addObject(state, { id, instanceId: `i-${id}`, cardId: `C-${id}`, controllerId: 'p1', zone: 'hand', kind: 'creature', power: 2, toughness: 2, manaCost });
}

test('płatność tapuje dokładnie tyle landów, ile brakuje do kosztu', () => {
  const state = mainPhaseState();
  addLand(state, 'l1');
  addLand(state, 'l2');
  addLand(state, 'l3');
  addCastableCreature(state, 'cub', 2);
  assert.equal(producibleMana(state, 'p1'), 3);
  const result = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'cub' })
  resolveStack(state);;
  assert.equal(result.ok, true, result.events[0]?.reason);
  const tapped = ['l1', 'l2', 'l3'].filter((id) => state.objects.get(id).tapped);
  assert.deepEqual(tapped, ['l1', 'l2'], 'zatapnione są tylko 2 potrzebne landy (kolejność pola bitwy)');
  assert.equal(state.players[0].mana, 0);
  const produced = result.events.filter((e) => e.type === 'mana_produced');
  assert.equal(produced.length, 2, 'log pokazuje zebranie many');
});

test('płatność preferuje pulę: wystarczająca mana nie tapuje landów', () => {
  const state = mainPhaseState();
  addLand(state, 'l1');
  addCastableCreature(state, 'cub', 1);
  addMana(state, 'p1', 1);
  const result = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'cub' })
  resolveStack(state);;
  assert.equal(result.ok, true, result.events[0]?.reason);
  assert.equal(state.objects.get('l1').tapped, false, 'land zostaje odkręcony');
  assert.equal(state.players[0].mana, 0);
});

test('koszt ponad pulę + landy: odrzucenie bez częściowej płatności (CR 601.2h)', () => {
  const state = mainPhaseState();
  addLand(state, 'l1');
  addLand(state, 'l2');
  addCastableCreature(state, 'big', 3);
  assert.equal(producibleMana(state, 'p1'), 2, 'produkowalna mana pokazuje limit');
  // Oferta już nie zawiera rzutu — ale nawet bezpośrednia komenda nie może
  // zostawić częściowo zatapnianych landów.
  assert.equal(playerView(state, 'p1').legalCommands.some((c) => c.type === 'cast_permanent'), false);
  const result = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'big' })
  resolveStack(state);;
  assert.equal(result.ok, false);
  assert.match(result.events[0].reason, /^illegal_cast:Niewystarczająca mana/);
  assert.equal(state.objects.get('l1').tapped, false);
  assert.equal(state.objects.get('l2').tapped, false);
  assert.equal(state.objects.get('big').zone, 'hand');
});

test('auto-tap oszczędza land creatures: najpierw zwykłe landy', () => {
  const state = mainPhaseState();
  addObject(state, {
    id: 'dryad', instanceId: 'i-dryad', cardId: 'Forest Dryad', controllerId: 'p1', zone: 'battlefield',
    kind: 'creature', power: 1, toughness: 1, types: ['Land', 'Creature'],
  });
  addLand(state, 'l1');
  assert.deepEqual(
    untappedLandManaSources(state, 'p1').map((o) => o.id),
    ['l1', 'dryad'],
    'zwykły land przed land creature',
  );
  addCastableCreature(state, 'cub', 1);
  const result = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'cub' })
  resolveStack(state);;
  assert.equal(result.ok, true, result.events[0]?.reason);
  assert.equal(state.objects.get('l1').tapped, true);
  assert.equal(state.objects.get('dryad').tapped, false, 'land creature zostaje do walki');
  // Dopiero druga płatność (gdy brak innych landów) tapuje land creature.
  addCastableCreature(state, 'cub2', 1);
  const second = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'cub2' })
  resolveStack(state);;
  assert.equal(second.ok, true, second.events[0]?.reason);
  assert.equal(state.objects.get('dryad').tapped, true);
});

test('Skarb NIE jest auto-tapowany: ręczna aktywacja zostaje decyzją gracza', () => {
  const state = mainPhaseState();
  addLand(state, 'l1');
  // Token Skarbu: {T}, poświęć: dodaj 1 manę (identyfikowalna jako treasure mana).
  addObject(state, {
    id: 'treasure', instanceId: 'i-treasure', cardId: 'Treasure', controllerId: 'p1', zone: 'battlefield',
    kind: 'artifact', types: ['Artifact'], subtypes: ['Treasure'],
    abilities: [{
      type: 'activated',
      cost: { mana: 0, tap: true, sacrificeSelf: true },
      effect: { type: 'add_mana', amount: 1, fromTreasure: true },
      trigger: null,
    }],
  });
  addCastableCreature(state, 'cub', 2);
  // Pula 0 + 1 land = 1 produkowalnej many: koszt 2 jest NIEOFEROWANY, mimo
  // że Skarb mógłby dopłacić — jego wydatek (poświęcenie) to wybór gracza.
  assert.equal(producibleMana(state, 'p1'), 1);
  const view = playerView(state, 'p1');
  assert.equal(view.legalCommands.some((c) => c.type === 'cast_permanent' && c.objectId === 'cub'), false);
  // Gracz aktywuje Skarb ręcznie (komenda jest oferowana)…
  const activate = view.legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === 'treasure');
  assert.ok(activate, 'zdolność Skarba ma być oferowana');
  assert.equal(execute(state, activate).ok, true);
  assert.equal(state.players[0].mana, 1);
  assert.equal(state.players[0].treasureMana, 1, 'mana ze Skarba jest identyfikowalna');
  // …a teraz zagranie jest legalne; płatność do-tapuje tylko brakujący land.
  const cast = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'cub' })
  resolveStack(state);;
  assert.equal(cast.ok, true, cast.events[0]?.reason);
  assert.equal(state.objects.get('l1').tapped, true);
  assert.equal(state.players[0].mana, 0);
  assert.equal(state.players[0].treasureMana, 0, 'mana ze Skarba wydana w pierwszej kolejności');
});

test('zdolność z kosztem many jest oferowana z pustą pulą (auto-tap przy aktywacji)', () => {
  const state = mainPhaseState();
  addLand(state, 'l1');
  addObject(state, {
    id: 'pinger', instanceId: 'i-pinger', cardId: 'Pinger', controllerId: 'p1', zone: 'battlefield',
    kind: 'artifact',
    abilities: [{
      type: 'activated',
      cost: { mana: 1 },
      effect: { type: 'gain_life', amount: 1 },
      trigger: null,
      targets: [],
    }],
  });
  const view = playerView(state, 'p1');
  const activate = view.legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === 'pinger');
  assert.ok(activate, 'zdolność za 1 manę oferowana przy pustej puli i nietapniętym landzie');
  assert.equal(execute(state, activate).ok, true);
  assert.equal(state.objects.get('l1').tapped, true, 'aktywacja sama zatapnęła land');
});

test('zdolność z {T} źródła-landu nie płaci sama sobie (CR 601.2h)', () => {
  const state = mainPhaseState();
  // Land ze zdolnością {2}, {T}: wzmocnienie — jedyny land gracza, pusta pula.
  addObject(state, {
    id: 'land-abil', instanceId: 'i-land-abil', cardId: 'Utility Land', controllerId: 'p1', zone: 'battlefield',
    kind: 'land',
    abilities: [{
      type: 'activated',
      cost: { mana: 2, tap: true },
      effect: { type: 'gain_life', amount: 1 },
      trigger: null,
      targets: [],
    }],
  });
  // Produkowalna 1 < 2 — a nawet hipotetyczne 2 (land+mana) nie starczyłoby,
  // bo zatapnięcie kosztem wyklucza źródło z własnej płatności.
  assert.equal(playerView(state, 'p1').legalCommands.some((c) => c.type === 'activate_ability'), false);
  addMana(state, 'p1', 1); // pula 1 + land 1 = 2 produkowalne, ale koszt z {T} odjmuje źródło
  assert.equal(playerView(state, 'p1').legalCommands.some((c) => c.type === 'activate_ability'), false,
    'land z kosztem {T} nie może dać many na własną aktywację');
  addLand(state, 'l2'); // pula 1 + 2 landy = 3; bez źródła 2 — wystarczy
  const view = playerView(state, 'p1');
  const activate = view.legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === 'land-abil');
  assert.ok(activate, 'z drugim landem aktywacja jest już legalna');
  assert.equal(execute(state, activate).ok, true);
  assert.equal(state.objects.get('land-abil').tapped, true, 'tap z kosztu');
  assert.equal(state.objects.get('l2').tapped, true, 'auto-tap drugiego landa na część many');
  assert.equal(state.players[0].mana, 0);
});
