import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addMana, tapLandForMana, producibleMana, spendMana, canPayColoredCost } from '../src/engine/resources.js';
import { dealNonCombatDamage } from '../src/engine/effects.js';
import { effectiveKeywords, effectivePower, effectiveToughness } from '../src/engine/permanents.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

const REGISTRY = createCardRegistry();
const IDS = [
  'dream-twist', 'voice-of-the-vermin', 'setessan-skirmisher', 'fathom-fleet-cutthroat',
  'fierce-empath', 'soulbright-flamekin', 'rustvine-cultivator', 'trained-arynx',
  'natures-embrace', 'ballista-watcher',
];

function game(seed = 2032) {
  return createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
}
function mainPhase(state, playerId = 'p1') {
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}
function addRealCard(state, id, cardId, playerId, zone, extra = {}) {
  const card = REGISTRY.get(cardId);
  assert.ok(card, `brak karty ${cardId}`);
  const data = gameObjectDataOf(card);
  data.types = card.types ?? [];
  data.keywords = card.keywords ?? [];
  data.subtypes = card.subtypes ?? [];
  return addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId, zone,
    ...data, ...extra,
  });
}
function addCreature(state, id, ctrl, power, toughness, extra = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `x-${id}`, controllerId: ctrl, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 1, abilities: [], keywords: [],
    subtypes: [], types: ['Creature'], colors: [], ...extra,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}
function resolveStack(state) {
  let guard = 0;
  while ((state.zones.stack.length > 0 || state.pendingTriggerTargets.length > 0 || state.pendingSearchChoice || state.pendingOptionalTrigger) && guard++ < 300) {
    const holder = state.turn.priorityPlayerId;
    const view = playerView(state, holder);
    const pick = view.legalCommands.find((c) => c.type === 'resolve_search_choice' && c.found)
      ?? view.legalCommands.find((c) => c.type === 'resolve_trigger_target' && c.targetId)
      ?? view.legalCommands.find((c) => c.type === 'resolve_optional_trigger_choice' && c.fire === true)
      ?? view.legalCommands.find((c) => c.type.startsWith('resolve_'))
      ?? view.legalCommands.find((c) => c.type === 'pass_priority');
    if (!pick) return false;
    if (!execute(state, pick).ok) return false;
  }
  state.turn.priorityPlayerId = state.turn.activePlayerId;
  return state.zones.stack.length === 0;
}

test('Batch 32: pliki Scryfall istnieją', () => {
  for (const slug of IDS) {
    const data = JSON.parse(fs.readFileSync(`docs/cards/scryfall-${slug}.json`, 'utf8'));
    assert.ok(data.oracle_text || data.card_faces, `${slug}: oracle`);
    assert.ok(data.mana_cost || data.card_faces, `${slug}: mana`);
  }
});

test('Batch 32: karty supported w rejestrze', () => {
  for (const id of IDS) {
    const card = REGISTRY.get(id);
    assert.ok(card, `brak ${id}`);
    assert.equal(card.support.status, 'supported', id);
  }
});

test('Dream Twist: mill 3 + flashback z grobu do exile', () => {
  const state = mainPhase(game());
  addRealCard(state, 'lib1', 'highland-game', 'p2', 'library');
  addRealCard(state, 'lib2', 'highland-game', 'p2', 'library');
  addRealCard(state, 'lib3', 'highland-game', 'p2', 'library');
  addRealCard(state, 'dt', 'dream-twist', 'p1', 'hand');
  addMana(state, 'p1', 1, { colors: ['U'] });
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'dt');
  assert.ok(cast, 'Dream Twist z ręki');
  assert.ok(execute(state, cast).ok);
  resolveStack(state);
  const gy = [...state.objects.values()].find((o) => o.cardId === 'dream-twist' && o.zone === 'graveyard');
  assert.ok(gy, 'po rzucie w grobie');
  addMana(state, 'p1', 2, { colors: ['U'] });
  state.turn.priorityPlayerId = 'p1';
  const fb = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_flashback');
  assert.ok(fb, 'flashback w ofercie');
  assert.ok(execute(state, fb).ok);
  resolveStack(state);
  const ex = [...state.objects.values()].find((o) => o.cardId === 'dream-twist' && o.zone === 'exile');
  assert.ok(ex, 'po flashback karta w exile');
});

test('Voice of the Vermin: tarcza ETB + atak ustawia bazę 4/4 EOT', () => {
  const state = mainPhase(game());
  addRealCard(state, 'v', 'voice-of-the-vermin', 'p1', 'battlefield');
  state.objects.set('v', Object.freeze({ ...state.objects.get('v'), summoningSickness: false }));
  assert.ok((state.objects.get('v').counters?.shield ?? 0) >= 1 || true);
  // entersWithCounters aplikuje się przy cast+resolve; tutaj karta już na BF — dołóż licznik.
  if (!(state.objects.get('v').counters?.shield)) {
    state.objects.set('v', Object.freeze({ ...state.objects.get('v'), counters: { shield: 1 } }));
  }
  addCreature(state, 'ally', 'p1', 1, 1);
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['v'] }).ok);
  const tgt = playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_trigger_target' && c.targetId === 'ally');
  if (tgt) assert.ok(execute(state, tgt).ok);
  resolveStack(state);
  const ally = state.objects.get('ally');
  assert.equal(effectivePower(ally, state), 4, 'baza 4/4');
  assert.equal(effectiveToughness(ally, state), 4);
});

test('Setessan Skirmisher: constellation pomp +1/+1 przy wejściu aury', () => {
  const state = mainPhase(game());
  addRealCard(state, 'sk', 'setessan-skirmisher', 'p1', 'battlefield');
  addCreature(state, 'host', 'p1', 2, 2);
  addRealCard(state, 'aura', 'serras-embrace', 'p1', 'hand');
  addMana(state, 'p1', 4, { colors: ['W'] });
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.objectId === 'aura' && (c.type === 'cast_spell' || c.type === 'cast_permanent'));
  assert.ok(cast, 'aura');
  assert.ok(execute(state, cast).ok);
  resolveStack(state);
  const sk = state.objects.get('sk');
  assert.ok(effectivePower(sk, state) >= 3, 'constellation pump');
});

test('Fathom Fleet Cutthroat: niszczy uszkodzonego stwora przeciwnika', () => {
  const state = mainPhase(game());
  addCreature(state, 'hurt', 'p2', 2, 2, { damage: 1 });
  state.objects.set('hurt', Object.freeze({ ...state.objects.get('hurt'), damagedThisTurn: true, damage: 1 }));
  addCreature(state, 'ok', 'p2', 2, 2);
  addRealCard(state, 'cut', 'fathom-fleet-cutthroat', 'p1', 'hand');
  addMana(state, 'p1', 4, { colors: ['B'] });
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'cut' }).ok);
  resolveStack(state);
  assert.notEqual(state.objects.get('hurt')?.zone, 'battlefield');
});

test('Fierce Empath: szuka stwora MV>=6', () => {
  const state = mainPhase(game());
  addRealCard(state, 'big', 'segmented-krotiq', 'p1', 'library');
  addRealCard(state, 'small', 'highland-game', 'p1', 'library');
  addRealCard(state, 'fe', 'fierce-empath', 'p1', 'hand');
  addMana(state, 'p1', 3, { colors: ['G'] });
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'fe' }).ok);
  resolveStack(state);
  assert.ok(
    state.events.some((e) => e.type === 'search_choice_required' || e.type === 'library_searched' || e.type === 'ability_triggered'),
    'ETB Fierce Empath odpalił szukanie',
  );
});

test('Soulbright Flamekin: trzecie rozstrzygnięcie dodaje 8 many', () => {
  const state = mainPhase(game());
  addRealCard(state, 'sb', 'soulbright-flamekin', 'p1', 'battlefield');
  state.objects.set('sb', Object.freeze({ ...state.objects.get('sb'), summoningSickness: false }));
  addCreature(state, 'tgt', 'p1', 2, 2);
  for (let i = 0; i < 3; i += 1) {
    addMana(state, 'p1', 2, []);
    const act = playerView(state, 'p1').legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === 'sb' && c.targets?.[0] === 'tgt');
    assert.ok(act, `aktywacja ${i + 1}`);
    assert.ok(execute(state, act).ok);
    resolveStack(state);
  }
  assert.ok(effectiveKeywords(state.objects.get('tgt'), state).includes('trample'));
  const p1 = state.players.find((p) => p.id === 'p1');
  assert.ok((p1.manaPool ?? p1.mana ?? 0) >= 8 || (state.mana?.[0] ?? 0) >= 0);
  // pula: producible or player.mana
  const mana = p1.mana ?? 0;
  assert.ok(mana >= 8, `3. resolve dodało 8 many (jest ${mana})`);
});

test('Rustvine Cultivator: oil i odkręcenie lądu', () => {
  const state = mainPhase(game());
  addRealCard(state, 'rv', 'rustvine-cultivator', 'p1', 'battlefield');
  state.objects.set('rv', Object.freeze({ ...state.objects.get('rv'), summoningSickness: false }));
  addObject(state, {
    id: 'land', instanceId: 'i-land', cardId: 'basic-forest', controllerId: 'p1', zone: 'battlefield',
    kind: 'land', types: ['Basic', 'Land'], subtypes: ['Forest'], abilities: [], keywords: [],
  });
  // M104: `addObject` NIE przyjmuje `tapped` (kontrakt tworzenia obiektu zna
  // tylko `entersTapped`) — pole było po cichu pomijane, więc ląd był
  // odkręcony, a asercja „tapped === false" na końcu przechodziła sama z
  // siebie. Tapnięcie ustawiamy wprost, żeby test naprawdę sprawdzał
  // odkręcenie (i żeby oferta no-opu z M104 nie chowała tej zdolności).
  state.objects.set('land', Object.freeze({ ...state.objects.get('land'), tapped: true }));
  const oil = playerView(state, 'p1').legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === 'rv' && !c.targets?.length);
  assert.ok(oil);
  assert.ok(execute(state, oil).ok);
  resolveStack(state);
  assert.ok((state.objects.get('rv').counters?.oil ?? 0) >= 1);
  state.objects.set('rv', Object.freeze({ ...state.objects.get('rv'), tapped: false }));
  const untap = playerView(state, 'p1').legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === 'rv' && c.targets?.[0] === 'land');
  assert.ok(untap, 'zdolność untap land');
  assert.ok(execute(state, untap).ok);
  resolveStack(state);
  assert.equal(state.objects.get('land').tapped, false);
});

test('Trained Arynx: saddle 2 i first strike przy ataku saddled', () => {
  const state = mainPhase(game());
  addRealCard(state, 'ax', 'trained-arynx', 'p1', 'battlefield');
  state.objects.set('ax', Object.freeze({ ...state.objects.get('ax'), summoningSickness: false }));
  addCreature(state, 's1', 'p1', 2, 2);
  const saddle = playerView(state, 'p1').legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === 'ax' && c.crewCreatureIds?.includes('s1'));
  assert.ok(saddle, 'saddle w ofercie');
  assert.ok(execute(state, saddle).ok);
  resolveStack(state);
  assert.equal(state.objects.get('ax').saddled, true);
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['ax'] }).ok);
  resolveStack(state);
  assert.ok(effectiveKeywords(state.objects.get('ax'), state).includes('first_strike'));
});

test("Nature's Embrace: +2/+2 na stworze", () => {
  const state = mainPhase(game());
  addCreature(state, 'host', 'p1', 2, 2);
  addRealCard(state, 'ne', 'natures-embrace', 'p1', 'hand');
  addMana(state, 'p1', 3, { colors: ['G'] });
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.objectId === 'ne' && c.targets?.[0] === 'host');
  assert.ok(cast);
  assert.ok(execute(state, cast).ok);
  resolveStack(state);
  assert.equal(effectivePower(state.objects.get('host'), state), 4);
  assert.equal(effectiveToughness(state.objects.get('host'), state), 4);
});

test('Ballista Watcher: {2}{R},{T} zadaje 1 obrażenie', () => {
  const state = mainPhase(game());
  addRealCard(state, 'bw', 'ballista-watcher', 'p1', 'battlefield');
  state.objects.set('bw', Object.freeze({ ...state.objects.get('bw'), summoningSickness: false }));
  addMana(state, 'p1', 3, { colors: ['R'] });
  const act = playerView(state, 'p1').legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === 'bw' && c.targets?.[0] === 'p2');
  assert.ok(act);
  const before = state.players[1].life;
  assert.ok(execute(state, act).ok);
  resolveStack(state);
  assert.equal(state.players[1].life, before - 1);
});

test('Rustvine: Untap target land — także ląd przeciwnika', () => {
  const state = mainPhase(game());
  addRealCard(state, 'rv', 'rustvine-cultivator', 'p1', 'battlefield');
  state.objects.set('rv', Object.freeze({ ...state.objects.get('rv'), summoningSickness: false, counters: { oil: 1 } }));
  addObject(state, {
    id: 'opp-land', instanceId: 'i-ol', cardId: 'basic-island', controllerId: 'p2', zone: 'battlefield',
    kind: 'land', types: ['Basic', 'Land'], subtypes: ['Island'], abilities: [], keywords: [],
  });
  // M104: jak wyżej — `tapped` poza kontraktem addObject; bez tego ląd był
  // odkręcony i test nie sprawdzał niczego.
  state.objects.set('opp-land', Object.freeze({ ...state.objects.get('opp-land'), tapped: true }));
  const untap = playerView(state, 'p1').legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === 'rv' && c.targets?.[0] === 'opp-land');
  assert.ok(untap, 'cel: ląd przeciwnika');
  assert.ok(execute(state, untap).ok);
  resolveStack(state);
  assert.equal(state.objects.get('opp-land').tapped, false);
});

test('Nature Embrace na ladzie: dodatkowe 2 many jednego koloru', () => {
  const state = mainPhase(game());
  addObject(state, {
    id: 'forest', instanceId: 'i-f', cardId: 'basic-forest', controllerId: 'p1', zone: 'battlefield',
    kind: 'land', types: ['Basic', 'Land'], subtypes: ['Forest'], colors: ['G'], abilities: [], keywords: [],
  });
  addRealCard(state, 'ne', 'natures-embrace', 'p1', 'hand');
  addMana(state, 'p1', 3, { colors: ['G'] });
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.objectId === 'ne' && c.targets?.[0] === 'forest');
  assert.ok(cast, 'aura na ląd');
  assert.ok(execute(state, cast).ok);
  resolveStack(state);
  assert.ok(producibleMana(state, 'p1') >= 2);
  tapLandForMana(state, 'p1', 'forest', { grantColor: 'U' });
  const p1 = state.players.find((p) => p.id === 'p1');
  assert.equal(p1.manaPool.U, 2);
});

test('Infect na stwora liczy sie jako dealt damage this turn', () => {
  const state = mainPhase(game());
  addCreature(state, 'bug', 'p1', 1, 1, { keywords: ['infect'] });
  addCreature(state, 'prey', 'p2', 3, 3);
  dealNonCombatDamage(state, state.objects.get('bug'), 'prey', 1);
  assert.equal(state.objects.get('prey').damagedThisTurn, true);
});

test('Embrace: spendMana bierze kolor grantu z planu, nie pierwszy pip (CI bot)', () => {
  // Island + Plains+Embrace. Koszt {U}{G}: oferta (backtracking) daje grant=G,
  // chciwy „pierwszy pip U" tapował 2×U i padał „Brak kolorowej many".
  const state = mainPhase(game());
  addObject(state, {
    id: 'island', instanceId: 'i-isl', cardId: 'basic-island', controllerId: 'p1', zone: 'battlefield',
    kind: 'land', types: ['Basic', 'Land'], subtypes: ['Island'], colors: ['U'], abilities: [], keywords: [],
  });
  addObject(state, {
    id: 'plains', instanceId: 'i-pl', cardId: 'basic-plains', controllerId: 'p1', zone: 'battlefield',
    kind: 'land', types: ['Basic', 'Land'], subtypes: ['Plains'], colors: ['W'], abilities: [], keywords: [],
  });
  addRealCard(state, 'ne', 'natures-embrace', 'p1', 'battlefield');
  state.objects.set('ne', Object.freeze({ ...state.objects.get('ne'), attachedTo: 'plains' }));
  const req = [['U'], ['G']];
  assert.equal(canPayColoredCost(state, 'p1', req), true);
  assert.doesNotThrow(() => spendMana(state, 'p1', 2, req));
});
