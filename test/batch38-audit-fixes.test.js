// Regresje z audytu Żywym Testerem Batch 38 (2026-08-20):
//   Z1 — damage_dealt z resolve_delirium_target niesie targetCardId/sourceCardId
//        (log pokazywał „(?)" gdy cel ginął w SBA tego samego rozstrzygnięcia)
//   Z2 — log „zawiesza ... (N liczników czasu)" używa poprawnej odmiany
//        (polishPlural zamiast sztywnego „liczników" — zgodnie z render.js/M151)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { describeGameEvent } from '../src/table/session.js';

const REGISTRY = createCardRegistry();

function newState() {
  const state = createGameState({ seed: 38, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = 6;
  return state;
}

function putCard(state, id, cardId, controllerId = 'p1', zone = 'battlefield', over = {}) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: over.kind ?? data.kind, power: over.power ?? data.power, toughness: over.toughness ?? data.toughness,
    manaCost: over.manaCost ?? data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    keywords: over.keywords ?? def.keywords ?? [], subtypes: over.subtypes ?? def.subtypes ?? [],
    types: over.types ?? def.types ?? [], colors: data.colors ?? [], cardName: def.name,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

// --- Z1: delirium damage_dealt niesie targetCardId ---
// Ustawia decyzję delirium identycznie jak trigger Fear of Burning Alive
// (źródło zadaje obrażenia niecombatowe → kolejkuje wybór celu), potem
// rozstrzyga. Cel 1/1 ginie w SBA tego samego rozstrzygnięcia — bez LKI
// cardId log pokazywałby „(?)" (transkrypt green-red-30).
test('Batch38/Z1: damage_dealt z resolve_delirium_target niesie targetCardId', () => {
  const state = newState();
  // Źródło delirium na polu bitwy + 4 typy kart w grobie kontrolera.
  putCard(state, 'src', 'fear-of-burning-alive', 'p1');
  for (const [i, cid] of ['shatter', 'bone-splinters', 'ainok-artillerist', 'basic-forest'].entries()) {
    putCard(state, `gy-${i}`, cid, 'p1', 'graveyard');
  }
  putCard(state, 'victim', 'highland-game', 'p2', 'battlefield', { power: 1, toughness: 1 });
  // Ręcznie zakolejkuj decyzję delirium (jak po niecombat damage triggera).
  state.pendingDeliriumTargets.push({
    playerId: 'p1', sourceId: 'src', amount: 4, opponentId: 'p2',
    candidateIds: ['victim'], restorePriorityTo: 'p1',
  });
  state.turn.priorityPlayerId = 'p1';
  const before = state.events.length;
  const r = execute(state, { type: 'resolve_delirium_target', playerId: 'p1', targetId: 'victim' });
  assert.ok(r.ok, r.events?.[0]?.reason);
  const dd = state.events.slice(before).find((e) => e.type === 'damage_dealt');
  assert.ok(dd, 'jest damage_dealt');
  assert.equal(dd.target, 'victim');
  assert.equal(dd.targetCardId, 'highland-game', 'targetCardId obecny (log pokaże nazwę, nie „?")');
  assert.equal(dd.sourceCardId, 'fear-of-burning-alive', 'sourceCardId obecny');
});

// --- Z2: log odmiany liczników czasu ---
test('Batch38/Z2: log zawieszenia używa poprawnej odmiany „liczniki czasu"', () => {
  const NAMES = { p1: 'Czarodziejka', p2: 'Nieprzyjaciel' };
  const helpers = { nameOf: (cardId) => cardId, nameOfObject: () => '?', isPlayer: (id) => NAMES[id] != null };
  const e = { type: 'card_suspended', playerId: 'p1', cardId: 'mindstab', timeCounters: 4 };
  const text = describeGameEvent(e, helpers, NAMES);
  assert.ok(text, 'jest opis');
  assert.match(text, /4 liczniki czasu/, `poprawna odmiana: ${text}`);
  assert.doesNotMatch(text, /liczników czasu/, 'nie sztywna odmiana');
});

// --- Z5: modalne tryby w kolejności Oracle (mode 0 pierwszy) ---
test('Batch38/Z5: tryby modalne oferowane w kolejności Oracle (Fortify: Ofensywa przed Obroną)', () => {
  const state = newState();
  state.players.find((p) => p.id === 'p1').mana = 3;
  state.players.find((p) => p.id === 'p1').manaPool = { W: 3 };
  putCard(state, 'f', 'fortify', 'p1', 'hand');
  putCard(state, 'c', 'highland-game', 'p1', 'battlefield');
  const casts = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'cast_spell' && c.objectId === 'f');
  assert.ok(casts.length >= 2, 'oba tryby oferowane');
  const modes = casts.map((c) => REGISTRY.get('fortify').spell.modes[c.modeIndex].name);
  assert.equal(modes[0], 'Ofensywa (+2/+0)', `mode 0 pierwszy (domyślna sugestia): ${modes.join(', ')}`);
  assert.equal(modes[1], 'Obrona (+0/+2)', `mode 1 drugi: ${modes.join(', ')}`);
});

// --- Z7: token w widoku niesie jawną nazwę (nie raw id) ---
test('Batch38/Z7: token w playerView niesie jawną nazwę (Squirrel, nie token_squirrel)', () => {
  const state = newState();
  state.players.find((p) => p.id === 'p1').mana = 1;
  state.players.find((p) => p.id === 'p1').manaPool = { G: 1 };
  putCard(state, 'ch', 'chatter-of-the-squirrel', 'p1', 'hand');
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'ch');
  assert.ok(cast);
  execute(state, cast);
  const resolveStack = (s) => {
    for (let i = 0; i < 24 && s.zones.stack.length > 0; i += 1) {
      const v = playerView(s, s.turn.priorityPlayerId);
      const n = v.legalCommands.find((c) => c.type.startsWith('resolve_'))
        ?? v.legalCommands.find((c) => c.type === 'pass_priority');
      if (!n) return false;
      execute(s, n);
    }
    return s.zones.stack.length === 0;
  };
  resolveStack(state);
  const view = playerView(state, 'p1');
  const tok = view.zones.battlefield.find((o) => o.cardId === 'token_squirrel');
  assert.ok(tok, 'token w widoku');
  assert.equal(tok.name, 'Squirrel', `jawna nazwa tokenu: ${tok.name}`);
});

// --- Z8: Sterling Keykeeper nie oferuje tapnięcia samego siebie (no-op) ---
test('Batch38/Z8: tap_permanent z kosztem {T} nie celuje w własne źródło (no-op)', () => {
  const state = newState();
  state.players.find((p) => p.id === 'p1').mana = 5;
  putCard(state, 'sterling', 'sterling-keykeeper', 'p1', 'battlefield');
  putCard(state, 'foe', 'highland-game', 'p2', 'battlefield');
  const acts = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'activate_ability' && c.objectId === 'sterling');
  assert.ok(acts.some((a) => a.targets?.includes('foe')), 'cel-pieprz (stwór wroga) oferowany');
  assert.ok(!acts.some((a) => a.targets?.includes('sterling')), 'brak no-op self-tap');
});

// --- Bot: Z3 (add_counter nie wzmacnia wroga), Z4 (damage_each_opponent
//      w pętli czaru), Z9 (0/1 nie atakuje), Z10 (mana+life rider) ---
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

function blankView(over = {}) {
  return {
    playerId: 'p1',
    players: [{ id: 'p1', life: 20 }, { id: 'p2', life: 20 }],
    zones: { hand: [], battlefield: [], graveyard: [], library: [], stack: [], exile: [] },
    turn: { activePlayerId: 'p1', priorityPlayerId: 'p1', phase: 'precombat_main', step: 'main', number: 5 },
    combat: null,
    ...over,
  };
}

test('Batch38/Z3: bot nie rzuca add_counter na stwora przeciwnika (Courage in Crisis)', () => {
  const bot = createHeuristicBot({ seed: 1 });
  const view = blankView({
    zones: {
      hand: [{ id: 'courage', cardId: 'courage-in-crisis', kind: 'spell', controllerId: 'p1' }],
      battlefield: [
        { id: 'moj', cardId: 'x1', controllerId: 'p1', kind: 'creature', power: 2, toughness: 2 },
        { id: 'wrog', cardId: 'x2', controllerId: 'p2', kind: 'creature', power: 2, toughness: 2 },
      ],
      graveyard: [], library: [], stack: [], exile: [],
    },
    legalCommands: [
      { type: 'cast_spell', playerId: 'p1', objectId: 'courage', targets: ['moj'] },
      { type: 'cast_spell', playerId: 'p1', objectId: 'courage', targets: ['wrog'] },
    ],
  });
  const chosen = bot.chooseCommand(view);
  assert.ok((chosen.targets ?? []).includes('moj'),
    `bot ma wzmocnić WŁASNY stwór, wybrał cel: ${JSON.stringify(chosen.targets)}`);
});

test('Batch38/Z4: bot wybiera damage_each_opponent nad wygnaniem własnego artefaktu (Ruinous Rampage)', () => {
  const bot = createHeuristicBot({ seed: 1 });
  const view = blankView({
    zones: {
      hand: [{ id: 'rr', cardId: 'ruinous-rampage', kind: 'spell', controllerId: 'p1' }],
      battlefield: [
        { id: 'art', cardId: 'x1', controllerId: 'p1', kind: 'artifact', manaCost: 3, power: null, toughness: null },
      ],
      graveyard: [], library: [], stack: [], exile: [],
    },
    legalCommands: [
      // tryb 0: 3 obrażeń każdemu przeciwnikowi
      { type: 'cast_spell', playerId: 'p1', objectId: 'rr', modeIndex: 0, targets: [] },
      // tryb 1: wygnaj artefakty MV <= 3
      { type: 'cast_spell', playerId: 'p1', objectId: 'rr', modeIndex: 1, targets: [] },
    ],
  });
  const chosen = bot.chooseCommand(view);
  assert.equal(chosen.modeIndex, 0,
    `bot ma wybrać tryb obrażeń (mode 0), wybrał mode ${chosen.modeIndex}`);
});

test('Batch38/Z9: bot nie atakuje stworem o mocy 0 (0/1 token Wizard)', () => {
  const bot = createHeuristicBot({ seed: 1 });
  const view = blankView({
    turn: { activePlayerId: 'p1', priorityPlayerId: 'p1', phase: 'combat', step: 'declare_attackers', number: 5 },
    zones: {
      hand: [], graveyard: [], library: [], stack: [], exile: [],
      battlefield: [{ id: 'w0', cardId: 'token_wizard', controllerId: 'p1', kind: 'creature', power: 0, toughness: 1 }],
    },
    legalCommands: [
      { type: 'declare_attackers', playerId: 'p1', attackerIds: [] },
      { type: 'declare_attackers', playerId: 'p1', attackerIds: ['w0'] },
      { type: 'pass_priority', playerId: 'p1' },
    ],
  });
  const chosen = bot.chooseCommand(view);
  assert.ok(!((chosen.attackerIds ?? []).includes('w0')),
    `bot nie ma atakować 0/1, wybrał atak: ${JSON.stringify(chosen)}`);
});

test('Batch38/Z10: bot tapuje Pristine Talisman za darmowe życie (mana+life rider)', () => {
  const bot = createHeuristicBot({ seed: 1 });
  const view = blankView({
    zones: {
      hand: [], graveyard: [], library: [], stack: [], exile: [],
      battlefield: [{ id: 'talisman', cardId: 'pristine-talisman', controllerId: 'p1', kind: 'artifact' }],
    },
    legalCommands: [
      { type: 'activate_ability', playerId: 'p1', objectId: 'talisman', abilityIndex: 0, targets: [] },
      { type: 'pass_priority', playerId: 'p1' },
    ],
  });
  const chosen = bot.chooseCommand(view);
  assert.equal(chosen.type, 'activate_ability',
    `bot ma tapnąć Talisman za darmowe życie, wybrał: ${chosen.type}`);
});
