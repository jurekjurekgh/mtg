// Batch 38 (2026-08-19, lista właściciela). Oracle ze Scryfalla
// (docs/cards/scryfall-*.json, ADR 0010 §2a), artId/plan ze słownika.
// Nowe generyczne mechaniki: creature_or_vehicle (target + aura), Warp,
// destroy_artifact_gain_life_mana_value, mana+gain_life, faerie_attacks,
// untap_enchanted_permanent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addMana } from '../src/engine/resources.js';
import { effectiveKeywords, effectivePower } from '../src/engine/permanents.js';
import { MANA_COSTS } from '../src/cards/mana-costs-data.js';

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
    equipment: data.equipment ?? def.equipment ?? null,
    aura: data.aura ?? def.aura ?? null,
    station: data.station ?? def.station ?? null,
    warp: data.warp ?? def.warp ?? null,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

const resolveStack = (state) => {
  for (let i = 0; i < 24 && state.zones.stack.length > 0; i += 1) {
    const view = playerView(state, state.turn.priorityPlayerId);
    const next = view.legalCommands.find((c) => c.type.startsWith('resolve_'))
      ?? view.legalCommands.find((c) => c.type === 'pass_priority');
    if (!next) return false;
    execute(state, next);
  }
  return state.zones.stack.length === 0;
};

// Rozwiązuje oczekujące decyzje celu triggerów (resolve_trigger_target) — np.
// ETB Weftblade'a („up to two target creatures”, optional). Bez tego wisi
// decyzja i rundy passów nie przesuwają tury.
function resolvePendingTriggerTargets(state) {
  for (let i = 0; i < 8; i += 1) {
    const view = playerView(state, state.turn.priorityPlayerId);
    const cmd = view.legalCommands.find((c) => c.type === 'resolve_trigger_target');
    if (!cmd) break;
    execute(state, cmd);
  }
}

function zoneOfCardId(state, cardId) {
  for (const o of state.objects.values()) if (o.cardId === cardId) return o.zone;
  return null;
}

// --- Oracle: wszystkie 10 kart ---
test('Batch 38: wszystkie 10 kart mają status supported, Oracle i MANA_COSTS', () => {
  const ids = ['divine-offering', 'weftblade-enhancer', 'colossodon-yearling', 'talions-messenger',
    'fortify', 'mysidian-elder', 'pristine-talisman', 'chatter-of-the-squirrel',
    'silken-strength', 'lotusguard-disciple'];
  for (const id of ids) {
    const def = REGISTRY.get(id);
    assert.ok(def, `karta ${id} istnieje`);
    assert.equal(def.support?.status, 'supported', `${id} wspierana`);
    // Colossodon Yearling jest vanilla (pusty oracleText) — reszta ma tekst.
    if (id !== 'colossodon-yearling') assert.ok((def.oracleText ?? '').length > 0, `${id} ma tekst Oracle`);
    assert.ok(MANA_COSTS[id], `${id} ma MANA_COSTS`);
  }
  // Karty z artId w słowniku kolekcji (8/10; Divine i Talion's poza arkuszem).
  const withArt = ['weftblade-enhancer', 'colossodon-yearling', 'fortify', 'mysidian-elder',
    'pristine-talisman', 'chatter-of-the-squirrel', 'silken-strength', 'lotusguard-disciple'];
  for (const id of withArt) assert.ok(REGISTRY.get(id).artId != null, `${id} ma artId`);
  assert.equal(REGISTRY.get('divine-offering').artId, null);
  assert.equal(REGISTRY.get('talions-messenger').artId, null);
});

// --- Divine Offering: zniszcz artefakt, zyskaj życie = MV ---
test('Divine Offering: niszczy artefakt i daje życie równe jego MV', () => {
  const state = newState();
  putCard(state, 'do', 'divine-offering', 'p1', 'hand');
  putCard(state, 'art', 'pristine-talisman', 'p2', 'battlefield', { manaCost: 3 });
  addMana(state, 'p1', 2, { colors: ['W', 'W'] });
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'do');
  assert.ok(cast, 'oferta Divine Offering');
  execute(state, cast);
  resolveStack(state);
  assert.equal(zoneOfCardId(state, 'pristine-talisman'), 'graveyard', 'artefakt zniszczony');
  assert.equal(state.players.find((p) => p.id === 'p1').life, 23, 'zysk życia = MV artefaktu (3)');
});

test('Divine Offering: nie daje życia, gdy artefakt ma indestructible', () => {
  const state = newState();
  putCard(state, 'do', 'divine-offering', 'p1', 'hand');
  putCard(state, 'art', 'pristine-talisman', 'p2', 'battlefield', { manaCost: 3, keywords: ['indestructible'] });
  addMana(state, 'p1', 2, { colors: ['W', 'W'] });
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'do');
  execute(state, cast); resolveStack(state);
  assert.equal(state.players.find((p) => p.id === 'p1').life, 20, 'bez zniszczenia bez zysku życia');
});

// --- Colossodon Yearling: vanilla 2/4 ---
test('Colossodon Yearling: vanilla 2/4 Beast', () => {
  const def = REGISTRY.get('colossodon-yearling');
  assert.equal(def.power, 2); assert.equal(def.toughness, 4);
  assert.equal(def.manaCost, 3);
  assert.deepEqual(def.types, ['Creature']); assert.deepEqual(def.subtypes, ['Beast']);
});

// --- Fortify: modal buff ---
test('Fortify: modal +2/+0 dla twoich stworów', () => {
  const state = newState();
  putCard(state, 'f', 'fortify', 'p1', 'hand');
  putCard(state, 'c', 'highland-game', 'p1', 'battlefield', { power: 1, toughness: 1 });
  addMana(state, 'p1', 3, { colors: ['W', 'W', 'W'] });
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'f' && c.modeIndex === 0);
  assert.ok(cast, 'oferta Fortify tryb 0 (+2/+0)');
  execute(state, cast);
  const ok = resolveStack(state);
  assert.ok(ok, 'Fortify rozstrzygnięty');
});

// --- Pristine Talisman: {T}: Add {C}, gain 1 life ---
test('Pristine Talisman: aktywacja {T} daje manę i 1 życie (mana ability bez stosu)', () => {
  const state = newState();
  putCard(state, 't', 'pristine-talisman', 'p1', 'battlefield');
  const act = playerView(state, 'p1').legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === 't');
  assert.ok(act, 'oferta aktywacji Pristine Talisman');
  execute(state, act);
  assert.equal(state.zones.stack.length, 0, 'mana ability rozstrzyga się od razu');
  assert.equal(state.players.find((p) => p.id === 'p1').life, 21, 'zysk 1 życia');
});

// --- Chatter of the Squirrel: token + flashback ---
test('Chatter of the Squirrel: tworzy Squirrela i ma flashback', () => {
  const state = newState();
  putCard(state, 'ch', 'chatter-of-the-squirrel', 'p1', 'hand');
  addMana(state, 'p1', 1, { colors: ['G'] });
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'ch');
  assert.ok(cast, 'oferta rzutu');
  execute(state, cast); resolveStack(state);
  const sq = [...state.objects.values()].find((o) => o.cardId === 'token_squirrel' && o.zone === 'battlefield');
  assert.ok(sq, 'token Squirrel');
  assert.deepEqual(REGISTRY.get('chatter-of-the-squirrel').spell.flashback, { cost: 2, colors: ['G'] });
});

// --- Silken Strength: aura creature_or_vehicle ---
test('Silken Strength: aura enchant creature or Vehicle, +1/+2 reach', () => {
  const def = REGISTRY.get('silken-strength');
  assert.equal(def.aura.enchantType, 'creature_or_vehicle');
  assert.deepEqual(def.aura.pump, { power: 1, toughness: 2 });
  assert.ok(def.aura.keywords.includes('reach'));
  assert.ok(def.keywords.includes('flash'));
  // Host Vehicle (artefakt z podtypem Vehicle) — legalny cel aury.
  const state = newState();
  putCard(state, 'host', 'irontread-crusher', 'p1', 'battlefield');
  putCard(state, 'aura', 'silken-strength', 'p1', 'hand');
  addMana(state, 'p1', 2, { colors: ['G', 'G'] });
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === 'aura' && c.targets?.[0] === 'host');
  assert.ok(cast, 'Silken Strength może zaczarować Vehicle');
});

// --- Lotusguard Disciple: ETB target creature/Vehicle lifelink+indestructible ---
test('Lotusguard Disciple: ETB daje lifelink+indestructible docelowemu stworowi', () => {
  const state = newState();
  putCard(state, 'ld', 'lotusguard-disciple', 'p1', 'battlefield');
  putCard(state, 'target', 'highland-game', 'p1', 'battlefield');
  state.pendingTriggerTargets.push({
    playerId: 'p1', sourceId: 'ld', cardId: 'lotusguard-disciple',
    ability: REGISTRY.get('lotusguard-disciple').abilities[0],
    candidates: ['target'], allowNone: false, fixedTargetIds: [], extra: {}, restorePriorityTo: 'p1',
  });
  const cmd = playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_trigger_target' && c.targetId === 'target');
  assert.ok(cmd, 'oferta celu ETB');
  execute(state, cmd);
  resolveStack(state);
  const t = state.objects.get('target');
  assert.ok(effectiveKeywords(t, state).includes('lifelink'), 'lifelink');
  assert.ok(effectiveKeywords(t, state).includes('indestructible'), 'indestructible');
});

// --- Mysidian Elder: token z triggerem w definicji ---
test('Mysidian Elder: ETB tworzy 0/1 Wizard token z triggerem you_cast_noncreature_spell', () => {
  const def = REGISTRY.get('mysidian-elder');
  const etb = def.abilities.find((a) => a.trigger?.event === 'enter_battlefield');
  assert.ok(etb, 'ETB trigger');
  const tok = etb.effect;
  assert.equal(tok.cardId, 'token_wizard');
  assert.equal(tok.power, 0); assert.equal(tok.toughness, 1);
  assert.deepEqual(tok.colors, ['B']);
  const triggerAb = (tok.abilities ?? []).find((a) => a.trigger?.event === 'you_cast_noncreature_spell');
  assert.ok(triggerAb, 'token ma trigger noncreature spell');
  assert.equal(triggerAb.effect.type, 'damage_each_opponent');
});

// --- Warp (Weftblade Enhancer) ---
test('Weftblade Enhancer: warp {2}{W} z ręki, wygnanie w end step, warpReady w exile', () => {
  const state = newState();
  putCard(state, 'w', 'weftblade-enhancer', 'p1', 'hand');
  addMana(state, 'p1', 3, { colors: ['W', 'W', 'W'] });
  const warp = playerView(state, 'p1').legalCommands.find((c) => c.type === 'warp_card' && c.objectId === 'w');
  assert.ok(warp, 'oferta warp rzutu z ręki');
  execute(state, warp);
  resolveStack(state);
  // ETB Weftblade'a wymaga decyzji celu (optional) — rozwiąż, żeby nie wisiała.
  resolvePendingTriggerTargets(state);
  let perm = [...state.objects.values()].find((o) => o.cardId === 'weftblade-enhancer' && o.zone === 'battlefield');
  assert.ok(perm, 'warp permanent na polu bitwy');
  assert.ok(perm.warped, 'oznaczony warped');
  // Przejdź do postcombat_main, potem pełna runda passów — wejście w end step
  // odpala step_advanced('end') i zbrojony wcześnie trigger wygnania.
  state.turn = { ...state.turn, phase: 'postcombat_main', step: 'main', stepIndex: 9, passes: 0, priorityPlayerId: 'p1' };
  state.turn.activePlayerId = 'p1';
  // Pełne rundy passów: najpierw rozstrzygają stos (ETB Weftblade'a), potem
  // przesuwają turę do end step (krok końcowy — CR 603.7b dla warp).
  for (let r = 0; r < 8 && state.turn.step !== 'end'; r += 1) {
    assert.ok(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok, `pass p1 (${r})`);
    assert.ok(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok, `pass p2 (${r})`);
  }
  assert.equal(state.turn.step, 'end', 'weszliśmy w end step');
  resolveStack(state);
  const exiled = [...state.objects.values()].find((o) => o.cardId === 'weftblade-enhancer' && o.zone === 'exile');
  assert.ok(exiled, 'wygnany po end step');
  assert.ok(exiled.warpReady, 'warpReady w exile');
});

// --- Talion's Messenger: faerie_attacks ---
test('Talion\'s Messenger: trigger faerie_attacks na docelowym Faerie', () => {
  const def = REGISTRY.get('talions-messenger');
  const ab = def.abilities.find((a) => a.trigger?.event === 'faerie_attacks');
  assert.ok(ab, 'trigger faerie_attacks');
  assert.equal(ab.trigger.requiresTarget.type, 'creature_you_control');
  assert.equal(ab.trigger.requiresTarget.subtype, 'Faerie');
  assert.ok((def.keywords ?? []).includes('flying'), 'flying');
});
