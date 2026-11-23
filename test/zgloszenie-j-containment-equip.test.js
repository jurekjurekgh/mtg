// J (zgłoszenie właściciela 2026-11-21, „uwagi z testów"): Containment
// Membrane — wroga aura „enchanted creature doesn't untap" na MOIM stworze.
//
// > Rzuciłem ją na kreaturę przeciwnika. Sprawiłem, że ta kreatura się nie
// > odkręca, jest bezużyteczna. Mimo to bot nakłada na tą kreaturę wartościowe
// > aury i equipmenty. To bez sensu. Nakładając aurę albo equipment powinien
// > sprawdzać czy cel jest "pełnosprawny", a jeśli ma wrogą aurę to nie
// > powinien go wyposażać bo to marnowanie tych aur/equipmentów.
//
// Kontrakt: przy WYBORZE gospodarza dla buff-aury (cast_permanent) i dla
// equipu (activate_ability) cel z wrogą aurą wrogą (`auraIsHostile` — m.in.
// `doesntUntap` Containment Membrane) jest NIEPEŁNOSPRAWNY: kara
// `disabledAttachTargetPenalty` → bot bierze zdrowy cel albo nie rzuca /
// nie wyposaża. Rozpoznanie po deskryptorach załączonej aury w widoku
// (ADR 0002), bez nazw kart. Pokrętło ×0 (anti-over-fix M429) = dawne
// zachowanie.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function scene({ withHealthy = false } = {}) {
  const state = createGameState({ seed: 41, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  state.pendingMulligans = [];

  const put = (id, cardId, zone, playerId) => {
    const def = REGISTRY.get(cardId);
    assert.ok(def, `${cardId} w rejestrze`);
    addObject(state, {
      ...gameObjectDataOf(def),
      id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId, zone,
      types: def.types ?? [], subtypes: def.subtypes ?? [], keywords: def.keywords ?? [],
      spell: def.spell,
    });
  };

  // MOJ stwór — duży (5/5), żeby wariant na NIEGO był najlepszy wg dawnej
  // wyceny gospodarza (aura: auraBuffWorthWeight × (P+T); equip: 10+2×P).
  addObject(state, {
    id: 'locked', instanceId: 'i-locked', cardId: 'test-locked', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'creature', power: 5, toughness: 5, manaCost: 5,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [],
  });
  // Wroga Containment Membrane (doesntUntap) — załączona ręcznie, jak
  // po rozstrzygnięciu czaru (kind aura + attachedTo poza kontraktem L21).
  put('mem', 'containment-membrane', 'battlefield', 'p2');
  state.objects.set('mem', Object.freeze({
    ...state.objects.get('mem'), kind: 'aura', attachedTo: 'locked',
  }));

  if (withHealthy) {
    addObject(state, {
      id: 'healthy', instanceId: 'i-healthy', cardId: 'test-healthy', controllerId: 'p1', ownerId: 'p1',
      zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, manaCost: 2,
      abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [],
    });
  }
  return state;
}

function pick(state, params = undefined) {
  const bot = createHeuristicBot({ seed: 7, ...(params ? { params } : {}) });
  const cmd = bot.chooseCommand(playerView(state, 'p1'));
  return { cmd, entry: bot.trace().at(-1) };
}

test('J/1: bot NIE wyposaża stwora unieruchomionego wrogą aurą (Containment Membrane)', () => {
  const state = scene();
  const def = REGISTRY.get('brawlers-plate');
  addObject(state, {
    ...gameObjectDataOf(def),
    id: 'plate', instanceId: 'i-plate', cardId: 'brawlers-plate',
    controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
    types: def.types ?? [], subtypes: def.subtypes ?? [], keywords: def.keywords ?? [],
    spell: def.spell,
  });
  const player = state.players.find((p) => p.id === 'p1');
  player.mana = 4;
  player.manaPool = { W: 4 };

  // Precondycja: equip na zablokowanym stworze jest LEGALNY (bez tego RED
  // mógłby minąć się z tezą — bot nie dostaje w ogóle takiej komendy).
  const legal = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'activate_ability' && c.objectId === 'plate');
  assert.ok(legal.some((c) => (c.targets ?? []).includes('locked')),
    'silnik oferuje equip na zablokowanym stworze');

  const { cmd } = pick(state);
  const equippedLocked = cmd.type === 'activate_ability'
    && (cmd.targets ?? []).includes('locked');
  assert.ok(!equippedLocked,
    `stwór ma wrogą aurę doesntUntap — wyposażanie to marnowanie sprzętu; bot wybrał: ${cmd.type} → ${JSON.stringify(cmd.targets ?? [])}`);
});

test('J/2: bot czaruje buff-aurę na ZDROWY cel, nie na unieruchomionego przez wrogą aurę', () => {
  const state = scene({ withHealthy: true });
  const def = REGISTRY.get('serras-embrace');
  addObject(state, {
    ...gameObjectDataOf(def),
    id: 'embr', instanceId: 'i-embr', cardId: 'serras-embrace',
    controllerId: 'p1', ownerId: 'p1', zone: 'hand',
    types: def.types ?? [], subtypes: def.subtypes ?? [], keywords: def.keywords ?? [],
    spell: def.spell,
  });
  const player = state.players.find((p) => p.id === 'p1');
  player.mana = 4;
  player.manaPool = { W: 4 };

  const { cmd } = pick(state);
  assert.equal(cmd.type, 'cast_permanent');
  const target = (cmd.targets ?? [])[0];
  assert.ok(target, `aura ma cel: ${JSON.stringify(cmd)}`);
  assert.notEqual(target, 'locked',
    `cel unieruchomiony wrogą aurą = marnowanie aury; bot wybrał: ${target}`);
  assert.equal(target, 'healthy', 'zdrowy gospodarz jest jedynym sensownym celem');
});

test('J/3: anti-over-fix — disabledAttachTargetPenalty ×0 przywraca dawne zachowanie', () => {
  const state = scene({ withHealthy: true });
  const def = REGISTRY.get('serras-embrace');
  addObject(state, {
    ...gameObjectDataOf(def),
    id: 'embr', instanceId: 'i-embr', cardId: 'serras-embrace',
    controllerId: 'p1', ownerId: 'p1', zone: 'hand',
    types: def.types ?? [], subtypes: def.subtypes ?? [], keywords: def.keywords ?? [],
    spell: def.spell,
  });
  const player = state.players.find((p) => p.id === 'p1');
  player.mana = 4;
  player.manaPool = { W: 4 };
  const { cmd } = pick(state, { disabledAttachTargetPenalty: 0 });
  assert.equal(cmd.type, 'cast_permanent');
  assert.equal(cmd.targets?.[0], 'locked',
    'pokrętło ×0 = stare zachowanie (gospodarz wg wyceny P+T, czyli większy, zablokowany)');
});

// ---------------------------------------------------------------------------
// Countery +1/+1 (rozszerzenie zgłoszenia: „wartościowe aury, countery +1/+1
// i equipmenty"). Trzy ścieżki umieszczania licznika na celu:
// trigger (resolve_trigger_target), rzut czaru (Courage in Crisis) i
// aktywacja (Mutagen token) — wszystkie miały RED na locked (85>67 / 37>19 /
// 45>37), gate: counterEffectValue (cast+activate) i gałąź friendly
// (resolve_trigger_target, obejmuje resolve_optional_trigger_choice delegacją).
// ---------------------------------------------------------------------------

function counterScene() {
  const state = scene({ withHealthy: true });
  const moogle = REGISTRY.get('cloudbound-moogle');
  addObject(state, {
    ...gameObjectDataOf(moogle),
    id: 'moogle', instanceId: 'i-moogle', cardId: 'cloudbound-moogle',
    controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
    types: moogle.types ?? [], subtypes: moogle.subtypes ?? [], keywords: moogle.keywords ?? [],
    spell: moogle.spell,
  });
  return state;
}

test('J/4: trigger „put a +1/+1 counter on target" omija cel unieruchomiony wrogą aurą', () => {
  const state = counterScene();
  // Kolejka triggera dokładnie jak processTriggers (wzorzec pmssb1-bounce).
  state.pendingTriggerTargets.push({
    playerId: 'p1', sourceId: 'moogle', cardId: 'cloudbound-moogle',
    ability: Object.freeze(JSON.parse(JSON.stringify(REGISTRY.get('cloudbound-moogle').abilities[0]))),
    candidates: [], allowNone: false, fixedTargetIds: [], extra: {},
  });
  const view = playerView(state, 'p1');
  const offers = view.legalCommands.filter((c) => c.type === 'resolve_trigger_target');
  assert.ok(offers.some((c) => c.targetId === 'locked'), 'silnik oferuje cel zablokowany');
  const bot = createHeuristicBot({ seed: 7 });
  const cmd = bot.chooseCommand(view);
  assert.equal(cmd.type, 'resolve_trigger_target');
  assert.notEqual(cmd.targetId, 'locked',
    `licznik na niepełnosprawnym gospodarzu = marnowanie; bot wybrał: ${cmd.targetId}`);
});

test('J/5: rzut „put a +1/+1 counter on target creature" (Courage in Crisis) nie idzie na zablokowanego', () => {
  const state = counterScene();
  const def = REGISTRY.get('courage-in-crisis');
  addObject(state, {
    ...gameObjectDataOf(def),
    id: 'cic', instanceId: 'i-cic', cardId: 'courage-in-crisis',
    controllerId: 'p1', ownerId: 'p1', zone: 'hand',
    types: def.types ?? [], subtypes: def.subtypes ?? [], keywords: def.keywords ?? [],
    spell: def.spell,
  });
  const player = state.players.find((p) => p.id === 'p1');
  player.mana = 3;
  player.manaPool = { G: 3 };
  const { cmd } = pick(state);
  assert.equal(cmd.type, 'cast_spell');
  assert.notEqual(cmd.targets?.[0], 'locked',
    `counter na niepełnosprawnym gospodarzu = marnowanie; bot wybrał: ${JSON.stringify(cmd.targets)}`);
});

test('J/6: aktywacja „put a +1/+1 counter on target" (Mutagen) nie idzie na zablokowanego', () => {
  const state = counterScene();
  const def = REGISTRY.get('token_mutagen');
  addObject(state, {
    ...gameObjectDataOf(def),
    id: 'mut', instanceId: 'i-mut', cardId: 'token_mutagen',
    controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
    types: def.types ?? [], subtypes: def.subtypes ?? [], keywords: def.keywords ?? [],
    spell: def.spell,
  });
  const player = state.players.find((p) => p.id === 'p1');
  player.mana = 1;
  player.manaPool = { C: 1 };
  const { cmd } = pick(state);
  assert.ok(!(cmd.type === 'activate_ability' && (cmd.targets ?? []).includes('locked')),
    `aktywacja na niepełnosprawnym gospodarzu = marnowanie; bot wybrał: ${cmd.type} → ${JSON.stringify(cmd.targets ?? [])}`);
});

test('J/7: anti-over-fix — disabledAttachTargetPenalty ×0 przywraca licznik na większym (zablokowanym)', () => {
  const state = counterScene();
  state.pendingTriggerTargets.push({
    playerId: 'p1', sourceId: 'moogle', cardId: 'cloudbound-moogle',
    ability: Object.freeze(JSON.parse(JSON.stringify(REGISTRY.get('cloudbound-moogle').abilities[0]))),
    candidates: [], allowNone: false, fixedTargetIds: [], extra: {},
  });
  const view = playerView(state, 'p1');
  const bot = createHeuristicBot({ seed: 7, params: { disabledAttachTargetPenalty: 0 } });
  const cmd = bot.chooseCommand(view);
  assert.equal(cmd.type, 'resolve_trigger_target');
  assert.equal(cmd.targetId, 'locked',
    'pokrętło ×0 = stare zachowanie (friendly licznik szuka największego ciała)');
});
