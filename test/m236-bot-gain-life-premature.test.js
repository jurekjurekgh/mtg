// M236/2+3 — audyt Żywym Testerem (2026-08-27) + KOREKTA właściciela.
//
// Obserwacje: bot aktywował Instant Ramen ({2},{T},poświęć: 3 życia) przy 22
// życia i Soulmender ({T}: 1 życia) 6× przy 20+ życia.
//
// KOREKTA właściciela: życie POWYŻEJ 20 NIE marnuje się — to bufor (21, 22…).
// Różnica jest w KOSZCIE:
//  - „{T}: zyskaj życie" (tap, bez poświęcenia) jest DARMOWE → rób bufor bez
//    końca, CHYBA że stwór jest potrzebny do bloku w tej turze;
//  - „poświęć permanent: zyskaj życie" to strata karty → tylko gdy życie
//    krytyczne, permanent i tak ginie w tej turze (bloker/cel removalu na
//    stosie), albo permanent bardzo tani (TMC ≤ 1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, zone, extra = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  const d = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: d.kind, power: d.power, toughness: d.toughness, manaCost: d.manaCost, spell: d.spell,
    abilities: d.abilities ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
    types: def.types ?? [], colors: d.colors ?? [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false, ...extra }));
  return state.objects.get(id);
}

function botMain(botLife) {
  const state = createGameState({ seed: 236, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 10);
  state.players.find((p) => p.id === 'p2').life = botLife;
  return state;
}

function scoreOf(state, objId) {
  const bot = createHeuristicBot({ seed: 236 });
  bot.chooseCommand(playerView(state, 'p2'), {});
  const opts = bot.trace()[0].options;
  return {
    act: opts.find((o) => o.cmd.startsWith(`activate_ability(${objId}`))?.score,
    pass: opts.find((o) => o.cmd === 'pass_priority')?.score ?? 0,
  };
}

// --- Poświęcenie permanentu za życie (Instant Ramen) ---

test('M236/2: bot NIE poświęca Food za życie przy bezpiecznym życiu (22)', () => {
  const s = botMain(22);
  put(s, 'ramen', 'instant-ramen', 'p2', 'battlefield');
  const { act, pass } = scoreOf(s, 'ramen');
  assert.ok(act < pass, `sac-za-życie przy 22 ż. (${act}) musi być < pass (${pass}) — trzymaj permanent`);
});

test('M236/2: przy KRYTYCZNYM życiu (4) poświęcenie za życie jest warte aktywacji', () => {
  const s = botMain(4);
  put(s, 'ramen', 'instant-ramen', 'p2', 'battlefield');
  const { act, pass } = scoreOf(s, 'ramen');
  assert.ok(act > pass, `sac-za-życie przy 4 ż. (${act}) ma być > pass (${pass}) — ratunek`);
});

test('M236/2: poświęcenie DARMOWE, gdy permanent jest celem destroy na stosie (nawet przy 22 ż.)', () => {
  const s = botMain(22);
  s.turn = jumpToStep(s.turn, 'main', 'p1'); // tura przeciwnika, my mamy priorytet
  s.turn.activePlayerId = 'p1';
  s.turn.priorityPlayerId = 'p2';
  addMana(s, 'p2', 10);
  s.players.find((p) => p.id === 'p2').life = 22;
  put(s, 'ramen', 'instant-ramen', 'p2', 'battlefield');
  put(s, 'destroyer', 'shatter', 'p1', 'stack');
  s.objects.set('destroyer', Object.freeze({ ...s.objects.get('destroyer'), chosenTargets: ['ramen'] }));
  const { act, pass } = scoreOf(s, 'ramen');
  assert.ok(act > pass, `permanent skazany (cel destroy na stosie) → sac darmowy (${act}) > pass (${pass})`);
});

// --- Tap za życie (Soulmender): DARMOWE, bufor jest OK ---

test('M236/3: bot LECZY się tapem za życie przy 20 ż. (bufor jest wartościowy)', () => {
  const s = botMain(20);
  put(s, 'soul', 'soulmender', 'p2', 'battlefield');
  const { act, pass } = scoreOf(s, 'soul');
  assert.ok(act > pass, `tap-za-życie (bufor) przy 20 ż. (${act}) ma być > pass (${pass}) — to darmowe`);
});

test('M236/3: bot NIE tapuje Soulmender za życie, gdy jest potrzebny do BLOKU', () => {
  const s = createGameState({ seed: 236, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main', 'p1'); // tura przeciwnika
  s.turn.activePlayerId = 'p1';
  s.turn.priorityPlayerId = 'p2';
  s.turn.step = 'declare_attackers';
  s.turn.phase = 'combat';
  addMana(s, 'p2', 10);
  s.players.find((p) => p.id === 'p2').life = 20;
  put(s, 'soul', 'soulmender', 'p2', 'battlefield'); // mój jedyny potencjalny bloker
  put(s, 'atk', 'hill-giant', 'p1', 'battlefield');
  s.combat = { attackers: ['atk'], blockers: new Map(), attackingPlayerId: 'p1' };
  const { act, pass } = scoreOf(s, 'soul');
  assert.ok(act < pass, `tap Soulmendera potrzebnego do bloku (${act}) musi być < pass (${pass})`);
});
