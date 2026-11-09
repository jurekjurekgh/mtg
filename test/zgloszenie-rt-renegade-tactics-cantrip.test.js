// Zgłoszenie U (prefiks RT — U/1–3 i U/A–C zajęte): Renegade Tactics.
// Bot przepalał ridera cant_block wyłącznie dla cantripa, gdy rider nie
// kupował nic w oknie walki (pusty stół wroga, cel własny/tapnięty/już
// z zakazem, main2, brak ataku, choroba przywołania, 0 mocy, ewazja).
//
// CR 509.1b (wydanie 2026-11-06, mirror nwgarne/mtg-data, sha d7cdcc11…):
// „The defending player checks each creature they control to see whether
// it’s affected by any restrictions (effects that say a creature can’t
// block, or that it can’t block unless some condition is met). If any
// restrictions are being disobeyed, the declaration of blockers is illegal.”
// CR 307.1: sorcery z ręki tylko we własnej main przy pustym stosie —
// pozytywy w BoC/po deklaracji pinujemy syntetykiem instant/zdolności.
// Oracle: „Target creature can't block this turn. Draw a card.” — cel
// we własnego stwora jest LEGALNY (nie naprawiamy legalności, tylko wycenę).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import {
  DEFAULT_HEURISTIC_PARAMS,
  HEURISTIC_PARAM_KEYS,
  normalizeHeuristicParams,
} from '../src/controllers/heuristic-params.js';
import { resolveUntilDecision } from './helpers/deferred-trigger.js';

const REGISTRY = createCardRegistry();
const RIDER = [{ type: 'cant_block' }, { type: 'draw_cards', amount: 1 }];

function game({ step = 'main1', active = 'p1', library = 10 } = {}) {
  const state = createGameState({ seed: 60, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, active);
  state.turn.activePlayerId = state.turn.priorityPlayerId = active;
  for (const pid of ['p1', 'p2']) {
    for (let i = 0; i < library; i += 1) {
      addObject(state, {
        id: `lib-${pid}-${i}`, instanceId: `ilib-${pid}-${i}`, cardId: 'basic-mountain',
        controllerId: pid, ownerId: pid, zone: 'library', kind: 'land', manaCost: 0,
      });
    }
  }
  return state;
}

function put(state, id, cardId, controllerId, zone = 'hand') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  return state.objects.get(id);
}

function creature(state, id, controllerId, {
  power = 3, toughness = 3, tapped = false, cantBlock = false,
  summoningSickness = false, keywords = [],
} = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId, ownerId: controllerId,
    zone: 'battlefield', kind: 'creature', power, toughness, manaCost: 3,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [],
  });
  // Flagi bojowe PO addObject — kontrakt addObject zrzuca pola spoza listy.
  state.objects.set(id, Object.freeze({
    ...state.objects.get(id), tapped, cantBlock, summoningSickness, keywords,
  }));
  return state.objects.get(id);
}

function syntheticSpell(state, { id = 'syn', timing = 'instant', effects = RIDER, targets = [{ type: 'creature' }], manaCost = 1 } = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId: 'p1', ownerId: 'p1',
    zone: 'hand', kind: 'spell', manaCost, types: [timing === 'instant' ? 'Instant' : 'Sorcery'],
    colors: ['R'], keywords: [], subtypes: [], abilities: [],
    spell: { timing, targets, effects },
  });
  return state.objects.get(id);
}

function abilitySource(state, effects = [{ type: 'cant_block' }, { type: 'draw_cards', amount: 4 }]) {
  addObject(state, {
    id: 'src', instanceId: 'i-src', cardId: 'test-src', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'artifact', manaCost: 0, types: ['Artifact'],
    colors: [], keywords: [], subtypes: [],
    abilities: [{ type: 'activated', timing: 'instant', cost: { mana: 0 }, effect: effects, targets: [{ type: 'creature' }] }],
  });
  return state.objects.get('src');
}

function tacticsScene(opts = {}) {
  const state = game(opts);
  put(state, 'ren', 'renegade-tactics', 'p1', 'hand');
  addMana(state, 'p1', 1, { colors: ['R'] });
  return state;
}

function decide(state, params = undefined) {
  const bot = createHeuristicBot({ seed: 3, registry: REGISTRY, params });
  const chosen = bot.chooseCommand(playerView(state, 'p1'), {});
  const options = bot.trace().at(-1)?.options ?? [];
  return { chosen, options };
}

const scoreOf = (options, prefix) => options.find((o) => String(o.cmd).startsWith(prefix))?.score ?? null;
const handCount = (state, pid = 'p1') => [...state.objects.values()].filter((o) => o.zone === 'hand' && o.controllerId === pid).length;

function assertHold(state, objectId = 'ren') {
  const { chosen, options } = decide(state);
  assert.equal(chosen?.type, 'pass_priority', `ma trzymać kartę, nie rzucać: ${JSON.stringify(chosen)}`);
  const pass = scoreOf(options, 'pass_priority') ?? 0;
  const casts = options.filter((o) => String(o.cmd).startsWith(`cast_spell(${objectId}->`));
  assert.ok(casts.length > 0, 'wariant rzutu istnieje w ofercie');
  for (const o of casts) assert.ok(o.score < pass, `${o.cmd} (${o.score}) musi być poniżej pass (${pass})`);
  assert.ok(state.objects.get(objectId)?.zone === 'hand', 'karta zostaje w ręce');
}

function toExile(state, id) {
  const obj = state.objects.get(id);
  state.zones[obj.zone] = state.zones[obj.zone].filter((x) => x !== id);
  state.objects.set(id, Object.freeze({ ...obj, zone: 'exile' }));
  state.zones.exile.push(id);
}

function declareAttack(state, attackerIds) {
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  const r = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds });
  assert.ok(r.ok, JSON.stringify(r.events));
}

// ——— RT/1–9: hold, gdy rider jałowy ———

test('RT/1: pusty stół wroga — nie rzuca we własnego stwora dla cantripa', () => {
  const state = tacticsScene();
  creature(state, 'me', 'p1');
  assertHold(state);
});

test('RT/2: pusty stół obu stron — brak legalnego celu, pass', () => {
  const state = tacticsScene();
  const view = playerView(state, 'p1');
  assert.ok(!view.legalCommands.some((c) => c.type === 'cast_spell' && c.objectId === 'ren'));
  assert.equal(decide(state).chosen?.type, 'pass_priority');
});

test('RT/3: wróg tapnięty — rider nic nie zmienia, hold', () => {
  const state = tacticsScene();
  creature(state, 'me', 'p1');
  creature(state, 'foe', 'p2', { power: 4, toughness: 4, tapped: true });
  assertHold(state);
});

test('RT/4: wróg już z cantBlock — hold (flaga ustawiona po addObject)', () => {
  const state = tacticsScene();
  creature(state, 'me', 'p1');
  creature(state, 'foe', 'p2', { cantBlock: true });
  assertHold(state);
});

test('RT/5: main2 — zakaz blokowania nie kupuje nic, hold', () => {
  const state = tacticsScene({ step: 'main2' });
  creature(state, 'me', 'p1');
  creature(state, 'foe', 'p2');
  assertHold(state);
});

test('RT/6: brak własnych stworów — nie ma komu odblokować ataku, hold', () => {
  const state = tacticsScene();
  creature(state, 'foe', 'p2');
  assertHold(state);
});

test('RT/7: choroba przywołania — stwór nie zaatakuje w tej turze, hold', () => {
  const state = tacticsScene();
  creature(state, 'me', 'p1', { summoningSickness: true });
  creature(state, 'foe', 'p2');
  assertHold(state);
});

test('RT/8: własny 0/3 — moc zero nie atakuje, hold', () => {
  const state = tacticsScene();
  creature(state, 'me', 'p1', { power: 0, toughness: 3 });
  creature(state, 'foe', 'p2');
  assertHold(state);
});

test('RT/9: flying vs naziemny — bloker i tak nie blokuje, hold', () => {
  const state = tacticsScene();
  creature(state, 'me', 'p1', { keywords: ['flying'] });
  creature(state, 'foe', 'p2');
  assertHold(state);
});

// ——— RT/10–11: okna, w których odmowa zachowuje kartę ———

test('RT/10: darmowy rzut z ręki przy pustym stole wroga — decline, karta zostaje', () => {
  const state = tacticsScene();
  creature(state, 'me', 'p1');
  state.pendingHandFreeCast = {
    playerId: 'p1', sourceId: 'baral', sourceCardId: 'baral-and-kari-zev',
    cardTypes: ['Sorcery'], maxManaValue: 4, elseEffect: null, restorePriorityTo: 'p1',
  };
  const { chosen, options } = decide(state);
  assert.equal(chosen?.type, 'resolve_hand_free_cast');
  assert.equal(chosen.decline, true, `ma odmówić: ${JSON.stringify(chosen)}`);
  const skip = scoreOf(options, 'resolve_hand_free_cast(skip)');
  for (const o of options.filter((x) => String(x.cmd).startsWith('resolve_hand_free_cast(ren->'))) {
    assert.ok(o.score < skip, `${o.cmd} (${o.score}) < skip (${skip})`);
  }
  assert.ok(execute(state, chosen).ok);
  assert.equal(state.objects.get('ren')?.zone, 'hand');
});

test('RT/11: Discover przy pustym stole wroga — weź do ręki, nie przepalaj', () => {
  const state = tacticsScene();
  creature(state, 'me', 'p1');
  toExile(state, 'ren');
  state.pendingDiscover = {
    playerId: 'p1', foundExileId: 'ren', foundCardId: 'renegade-tactics',
    restExileIds: [], restorePriorityTo: 'p1', amount: 1,
  };
  const { chosen } = decide(state);
  assert.equal(chosen?.type, 'resolve_discover_choice');
  assert.equal(chosen.castFree, false, `ma wziąć do ręki: ${JSON.stringify(chosen)}`);
  assert.ok(execute(state, chosen).ok);
  // Po przeniesieniu strefy obiekt ma nowe ID — szukamy po cardId+zone.
  assert.ok([...state.objects.values()].some((o) => o.cardId === 'renegade-tactics' && o.zone === 'hand'));
});

// ——— RT/12–14: pozytywne użcie (nie psuć Batch60) ———

test('RT/12: realny bloker 3/3 vs mój 3/3 w main1 — cast, cantBlock + cantrip', () => {
  const state = tacticsScene();
  creature(state, 'me', 'p1');
  creature(state, 'foe', 'p2');
  const before = handCount(state);
  const { chosen, options } = decide(state);
  assert.equal(chosen?.type, 'cast_spell');
  assert.deepEqual(chosen.targets, ['foe']);
  assert.ok(scoreOf(options, 'cast_spell(ren->foe)') > (scoreOf(options, 'pass_priority') ?? 0));
  assert.ok(execute(state, chosen).ok);
  assert.ok(resolveUntilDecision(state, (s) => s.zones.stack.length === 0, 40));
  assert.equal(state.objects.get('foe')?.cantBlock, true);
  assert.equal(handCount(state), before, 'cantrip: ręka wraca do rozmiaru');
  assert.ok([...state.objects.values()].some((o) => o.cardId === 'renegade-tactics' && o.zone === 'graveyard'));
});

test('RT/13: killer 5/5 wygrywa z chumpem 1/1', () => {
  const state = tacticsScene();
  creature(state, 'me', 'p1');
  creature(state, 'chump', 'p2', { power: 1, toughness: 1 });
  creature(state, 'killer', 'p2', { power: 5, toughness: 5 });
  const { chosen, options } = decide(state);
  assert.equal(chosen?.type, 'cast_spell');
  assert.deepEqual(chosen.targets, ['killer']);
  assert.ok(scoreOf(options, 'cast_spell(ren->killer)') > scoreOf(options, 'cast_spell(ren->chump)'));
});

test('RT/14: tapnięty 4/4 nie wygrywa z odkręconym blokerem 3/3', () => {
  const state = tacticsScene();
  creature(state, 'me', 'p1');
  creature(state, 'blocker', 'p2');
  creature(state, 'tapped', 'p2', { power: 4, toughness: 4, tapped: true });
  const { chosen } = decide(state);
  assert.equal(chosen?.type, 'cast_spell');
  assert.deepEqual(chosen.targets, ['blocker']);
});

// ——— RT/15–16: bliźniaki instant/ability w oknach combat ———

test('RT/15: syntetyk instant cant_block+draw — BoC i po deklaracji cast, main2 hold', () => {
  const boc = game({ step: 'beginning_of_combat' });
  syntheticSpell(boc);
  addMana(boc, 'p1', 1, { colors: ['R'] });
  creature(boc, 'me', 'p1');
  creature(boc, 'foe', 'p2');
  assert.equal(decide(boc).chosen?.type, 'cast_spell', 'BoC: instant ma zdjąć blokera');

  const atk = game();
  syntheticSpell(atk);
  addMana(atk, 'p1', 1, { colors: ['R'] });
  creature(atk, 'me', 'p1');
  creature(atk, 'foe', 'p2');
  declareAttack(atk, ['me']);
  addMana(atk, 'p1', 1, { colors: ['R'] });
  assert.equal(decide(atk).chosen?.type, 'cast_spell', 'po deklaracji: instant ma zdjąć blokera');

  const main2 = game({ step: 'main2' });
  syntheticSpell(main2);
  addMana(main2, 'p1', 1, { colors: ['R'] });
  creature(main2, 'me', 'p1');
  creature(main2, 'foe', 'p2');
  assertHold(main2, 'syn');
});

test('RT/16: syntetyk aktywowany cant_block+draw4 — hold bez ataku, aktywacja przy ataku', () => {
  const idle = game();
  abilitySource(idle);
  creature(idle, 'foe', 'p2');
  const { chosen, options } = decide(idle);
  assert.equal(chosen?.type, 'pass_priority', `bez ataku aktywacja jałowa: ${JSON.stringify(chosen)}`);
  const pass = scoreOf(options, 'pass_priority') ?? 0;
  for (const o of options.filter((x) => String(x.cmd).startsWith('activate_ability(src'))) {
    assert.ok(o.score < pass, `${o.cmd} (${o.score}) < pass (${pass})`);
  }

  const atk = game();
  abilitySource(atk);
  creature(atk, 'me', 'p1');
  creature(atk, 'foe', 'p2');
  declareAttack(atk, ['me']);
  const pick = decide(atk);
  assert.equal(pick.chosen?.type, 'activate_ability');
  assert.deepEqual(pick.chosen.targets, ['foe']);
  assert.ok(scoreOf(pick.options, 'activate_ability(src') > (scoreOf(pick.options, 'pass_priority') ?? 0));
});

// ——— RT/17–19: anty-over-fix ———

test('RT/17: damage+cant_block+draw dobija tapniętego 3/3 — dodatkowy payload nie jest karany', () => {
  const state = game();
  syntheticSpell(state, { effects: [{ type: 'damage', amount: 3 }, ...RIDER] });
  addMana(state, 'p1', 1, { colors: ['R'] });
  creature(state, 'me', 'p1');
  creature(state, 'foe', 'p2', { tapped: true });
  const { chosen } = decide(state);
  assert.equal(chosen?.type, 'cast_spell', 'damage usuwa ciało mimo jałowego ridera');
  assert.deepEqual(chosen.targets, ['foe']);
});

test('RT/18: Epic Experiment — odmowa traci kartę, więc cantrip nadal rzucany', () => {
  const state = tacticsScene();
  creature(state, 'me', 'p1');
  toExile(state, 'ren');
  state.pendingEpicExperiment = {
    playerId: 'p1', sourceCardId: 'epic-experiment', exileIds: ['ren'], maxMV: 1, restorePriorityTo: 'p1',
  };
  const { chosen } = decide(state);
  assert.equal(chosen?.type, 'resolve_epic_choice');
  assert.notEqual(chosen.done, true, 'dobór jest odzyskiem, nie przepaleniem potencjału');
  assert.deepEqual(chosen.targets, ['me']);
});

test('RT/19: czysty cantrip draw-only nadal rzucany przy pustym stole wroga', () => {
  const state = game();
  syntheticSpell(state, { id: 'draw', timing: 'sorcery', targets: [], effects: [{ type: 'draw_cards', amount: 1 }] });
  addMana(state, 'p1', 1, { colors: ['R'] });
  const { chosen } = decide(state);
  assert.equal(chosen?.type, 'cast_spell');
  assert.equal(chosen.objectId, 'draw');
});

// ——— RT/20: pokrętło strategii ———

test('RT/20: cantBlockCantripHoldPenalty default 120; ×0 przywraca dawny rzut', () => {
  assert.equal(DEFAULT_HEURISTIC_PARAMS.cantBlockCantripHoldPenalty, 120);
  assert.ok(HEURISTIC_PARAM_KEYS.includes('cantBlockCantripHoldPenalty'));
  assert.equal(normalizeHeuristicParams({ cantBlockCantripHoldPenalty: 0 }).cantBlockCantripHoldPenalty, 0);

  const build = () => {
    const state = tacticsScene();
    creature(state, 'me', 'p1');
    return state;
  };
  assert.equal(decide(build()).chosen?.type, 'pass_priority', 'default: hold');
  const zero = decide(build(), { cantBlockCantripHoldPenalty: 0 }).chosen;
  assert.equal(zero?.type, 'cast_spell', '×0 = zachowanie sprzed zgłoszenia');
  assert.deepEqual(zero.targets, ['me']);
});

// ——— RT/21: legalność silnika bez zmian ———

test('RT/21: cel we własnego stwora nadal legalny i rozstrzyga się z doborem', () => {
  const state = tacticsScene();
  creature(state, 'me', 'p1');
  const before = handCount(state);
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'ren' && c.targets?.[0] === 'me');
  assert.ok(cast, 'Oracle „target creature” obejmuje własnego stwora');
  assert.ok(execute(state, cast).ok);
  assert.ok(resolveUntilDecision(state, (s) => s.zones.stack.length === 0, 40));
  assert.equal(state.objects.get('me')?.cantBlock, true);
  assert.equal(handCount(state), before);
});
