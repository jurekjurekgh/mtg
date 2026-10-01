// =============================================================================
// Audyt PR #149 (sesja 2026-10-01g) — dwa stemple uprawnień „tylko w wygnaniu"
// czytane z samej strefy, bez źródła wygnania.
//
// F1 (`reboundReady`, CR 702.88a + 400.7): reset `exilePermissionReset` w
//     `moveObjectDirectly` zerował plot/warp/suspend/madness/okno impulsu, ale
//     NIE gotowość rebound. Sonda: obiekt z reboundReady w exile → grób →
//     ponowne wygnanie (inny efekt) → flaga dalej `true`, więc upkeep oferował
//     darmowy rzut z dowolnie wygnanej karty.
// F2 („on an adventure", CR 715.3d): `legalAdventureCreatureCasts` i
//     `castAdventureCreature` pytały tylko o `zone==='exile' && object.adventure`,
//     a `adventure` to STAŁY druk karty (CR 715.2a). Sonda: Gray Slaad na polu
//     wygnany cudzym efektem → oferta i `execute` cast_adventure_creature OK.
//     Ruling (FIN Release Notes 2025-01-15): „If an adventurer card ends up in
//     exile for any other reason than by exiling itself while resolving, it
//     won't give you permission to play it with its primary characteristics.\"
//     Naprawa: stempel źródła `meta.exiledBy === 'adventure'`, nadawany tylko
//     przy rozstrzygnięciu czaru przygody, kasowany razem z `meta`.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createGameState, playerView, addObject, execute } from '../src/engine/game-state.js';
import { moveObjectDirectly } from '../src/engine/objects.js';
import { isOnAdventure } from '../src/engine/zones.js';
import { addMana } from '../src/engine/resources.js';
import { jumpToStep } from '../src/engine/turn.js';
import { exileSourceLabel } from '../src/table/render.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function game() {
  const state = createGameState({ seed: 4149, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = 5;
  return state;
}

function dodaj(state, id, cardId, zone, over = {}) {
  const def = REGISTRY.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: 'p1', ownerId: 'p1', zone,
    kind: def.types.includes('Creature') ? 'creature' : 'spell',
    ...gameObjectDataOf(def),
    types: def.types ?? [], subtypes: def.subtypes ?? [],
    keywords: def.keywords ?? [], abilities: def.abilities ?? [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...over }));
  return state.objects.get(id);
}

const oferty = (state) => playerView(state, 'p1').legalCommands
  .filter((cmd) => cmd.type === 'cast_adventure_creature').map((cmd) => cmd.objectId);

function passBoth(state) {
  for (let i = 0; i < 4 && state.zones.stack.length > 0; i += 1) {
    for (const playerId of ['p1', 'p2']) {
      if (state.zones.stack.length === 0) break;
      execute(state, { type: 'pass_priority', playerId });
    }
  }
}

// ---------------------------------------------------------------------------
// F1
// ---------------------------------------------------------------------------
test('F1: reboundReady żyje tylko w jednym pobycie w wygnaniu (CR 400.7)', () => {
  const state = game();
  dodaj(state, 'rb', 'ojutais-breath', 'exile', { reboundReady: true, reboundCast: true });
  const wGrobie = moveObjectDirectly(state, 'rb', 'graveyard', 'rb-g');
  assert.equal(wGrobie.reboundReady, false, 'opuszczenie wygnania zeruje gotowość rebound');
  const znowuWygnana = moveObjectDirectly(state, 'rb-g', 'exile', 'rb-e', { exiledBy: 'effect' });
  assert.equal(znowuWygnana.zone, 'exile');
  assert.equal(znowuWygnana.reboundReady, false, 'ponowne wygnanie innym efektem nie przywraca darmowego rzutu');
});

// ---------------------------------------------------------------------------
// F2
// ---------------------------------------------------------------------------
test('F2: karta z przygodą wygnana cudzym efektem NIE jest „on an adventure"', () => {
  const state = game();
  addMana(state, 'p1', 6, { colors: ['B', 'B', 'B', 'B', 'B', 'B'] });
  dodaj(state, 'gs', 'gray-slaad', 'battlefield');
  const wygnany = moveObjectDirectly(state, 'gs', 'exile', 'gs-e', { exiledBy: 'effect' });
  assert.equal(isOnAdventure(wygnany), false);
  assert.deepEqual(oferty(state), [], 'brak oferty rzutu stwora z exile');
  const proba = execute(state, { type: 'cast_adventure_creature', playerId: 'p1', objectId: 'gs-e' });
  assert.equal(proba.ok, false, 'walidacja zgodna z ofertą (L41/L48)');
});

test('F2: ten sam brak uprawnienia z ręki, z cmentarza i przy wygnaniu bez wskazanego źródła', () => {
  for (const zrodlo of ['hand', 'graveyard']) {
    const state = game();
    addMana(state, 'p1', 6, { colors: ['B', 'B', 'B', 'B', 'B', 'B'] });
    dodaj(state, 'gs', 'gray-slaad', zrodlo);
    const wygnany = moveObjectDirectly(state, 'gs', 'exile', 'gs-e');
    assert.equal(isOnAdventure(wygnany), false, `z ${zrodlo} (fallback źródła 'effect')`);
    assert.deepEqual(oferty(state), [], `z ${zrodlo}`);
  }
});

test('F2: przygoda rozstrzygnięta → „on an adventure" → rzut stwora; opuszczenie wygnania i ponowne wygnanie kasuje uprawnienie', () => {
  const state = game();
  addMana(state, 'p1', 8, { colors: Array(8).fill('B') });
  dodaj(state, 'gs', 'gray-slaad', 'hand');
  const adv = execute(state, { type: 'cast_adventure', playerId: 'p1', objectId: 'gs' });
  assert.ok(adv.ok, adv.events?.[0]?.reason);
  passBoth(state);
  const naPrzygodzie = [...state.objects.values()].find((o) => o.cardId === 'gray-slaad' && o.zone === 'exile');
  assert.ok(naPrzygodzie, 'karta w wygnaniu po rozstrzygnięciu przygody');
  assert.equal(naPrzygodzie.meta?.exiledBy, 'adventure');
  assert.equal(isOnAdventure(naPrzygodzie), true);
  assert.deepEqual(oferty(state), [naPrzygodzie.id], 'oferta rzutu stwora z przygody');

  // Cudzy efekt wyciąga kartę (ręka) i wygania ją ponownie — to już NIE przygoda.
  const wReku = moveObjectDirectly(state, naPrzygodzie.id, 'hand', 'gs-h');
  assert.equal(isOnAdventure(wReku), false);
  const wygnanaPonownie = moveObjectDirectly(state, 'gs-h', 'exile', 'gs-e2', { exiledBy: 'effect' });
  assert.equal(isOnAdventure(wygnanaPonownie), false, 'CR 400.7: nowy obiekt nie dziedziczy przygody');
  assert.deepEqual(oferty(state), []);
});

test('F2: etykieta źródła wygnania „adventure" jest nazwana w stole', () => {
  const session = { nameOf: (id) => id };
  assert.equal(exileSourceLabel(session, 'adventure'), 'Przygoda');
});

// ---------------------------------------------------------------------------
// Domknięcie pinu (mutacja przeżyła w audycie PR #149): drabinka premii za
// ratunek życia w `declare_blockers` (PMSSB-31/B4, O2 z audytu #148) miała
// piny dla pasma 7 życia i M146 (5 życia), ale pasmo „≤ 2” (+6) było
// niepilnowane — zamiana `+6` na `+0` nie czerwieniła żadnego testu.
// ---------------------------------------------------------------------------
function wynikBloku(zycie) {
  const state = createGameState({ seed: 4242, players: [{ id: 'p1' }, { id: 'p2' }] });
  const cialo = (id, p, t, ctrl) => {
    addObject(state, {
      id, instanceId: `i-${id}`, cardId: `x-${id}`, controllerId: ctrl, zone: 'battlefield',
      kind: 'creature', power: p, toughness: t, manaCost: 3, abilities: [], keywords: [],
      subtypes: [], types: ['Creature'], colors: [], cardName: id,
    });
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  };
  cialo('a', 2, 2, 'p1');
  cialo('b', 3, 3, 'p2');
  state.players.find((p) => p.id === 'p2').life = zycie;
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['a'] });
  state.turn = jumpToStep(state.turn, 'declare_blockers', 'p2');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p2';
  const bot = createHeuristicBot({ seed: 7 });
  bot.chooseCommand(playerView(state, 'p2'), {});
  return bot.trace().at(-1).options.find((o) => o.cmd === 'block[a<b]').score;
}

test('Drabinka presji życia przy bloku: pasma ≤2 / ≤5 / ≤8 / wyżej = 43 (z lethalem) / 11 / 9 / 7', () => {
  assert.equal(wynikBloku(2), 43, 'pasmo ≤2: +6 (43 = 37 + 6; przy życiu 2 atak 2 jest lethalem)');
  assert.equal(wynikBloku(3), 11);
  assert.equal(wynikBloku(5), 11, 'granica pasma ≤5 (+4)');
  assert.equal(wynikBloku(6), 9, 'pasmo ≤8 (+2)');
  assert.equal(wynikBloku(8), 9);
  assert.equal(wynikBloku(9), 7, 'powyżej 8 brak premii');
  assert.equal(wynikBloku(20), 7);
});
