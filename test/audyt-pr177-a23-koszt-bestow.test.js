// CR 702.103b: "As a spell cast bestowed is put onto the stack, it becomes an
// Aura enchantment and gains enchant creature." CR 702.16b: "A permanent or
// player with protection can't be targeted by spells with the stated quality".
// CR 601.2f: "The total cost is the mana cost or alternative cost ... plus all
// additional costs and cost increases, and minus all cost reductions."
// https://mtg.fandom.com/wiki/Bestow ; https://mtg.fandom.com/wiki/Casting_spells
// Powerstone: "This mana can't be spent to cast a nonartifact spell."
// https://scryfall.com/card/tbro/7/powerstone
// UWAGA: syntetyczny artefakt-bestow, nie karta z katalogu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

const registry = createCardRegistry();
function put(s, id, cardId, zone = 'battlefield') {
  const def = registry.get(cardId);
  assert.ok(def);
  addObject(s, { id, instanceId: `i-${id}`, cardId, zone, controllerId: 'p1', ownerId: 'p1',
    ...gameObjectDataOf(def), types: def.types ?? [], subtypes: def.subtypes ?? [], keywords: def.keywords ?? [] });
}
function scene() {
  const s = createGameState({ seed: 17722, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main1', 'p1'); s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  put(s, 'host', 'highland-game'); put(s, 'dryad', 'leafcrown-dryad', 'hand');
  const d = s.objects.get('dryad');
  s.objects.set('dryad', Object.freeze({ ...d, types: ['Artifact', 'Enchantment', 'Creature'] }));
  addMana(s, 'p1', 1, { colors: ['G'] });
  addMana(s, 'p1', 3, { colors: [], spendOnly: 'artifact' });
  return s;
}
function drain(s) {
  for (let i = 0; i < 16 && s.zones.stack.length; i++) {
    const cmd = playerView(s, s.turn.priorityPlayerId).legalCommands.find(c => c.type === 'pass_priority');
    assert.ok(cmd); assert.ok(execute(s, cmd).ok);
  }
  assert.equal(s.zones.stack.length, 0);
}
function offer(s) {
  return playerView(s, 'p1').legalCommands.find(c => c.objectId === 'dryad' && c.type === 'cast_permanent'
    && c.bestow === true && c.targets?.[0] === 'host');
}
function castAndCheckAura(s) {
  const c = offer(s);
  assert.ok(c, 'oferta bestow na gospodarza');
  assert.ok(execute(s, c).ok, 'walidacja zgadza się z ofertą');
  drain(s);
  const dryad = [...s.objects.values()].find(o => o.cardId === 'leafcrown-dryad' && o.zone === 'battlefield');
  assert.equal(dryad?.kind, 'aura');
  assert.equal(dryad.attachedTo, 'host');
}

test('A23: mana powerstone nie finansuje nieartefaktowego czaru bestow', () => {
  const s = scene();
  assert.equal(offer(s), undefined, 'bestow to zaklęcie aura a nie artefakt');
  const result = execute(s, { type: 'cast_permanent', playerId: 'p1', objectId: 'dryad', bestow: true, targets: ['host'] });
  assert.equal(result.ok, false);
});


test('A23: zwykły rzut syntetycznego artefaktu wciąż dopuszcza Powerstone', () => {
  const s = scene();
  const cmd = playerView(s, 'p1').legalCommands.find(c => c.objectId === 'dryad' && c.type === 'cast_permanent' && !c.bestow);
  assert.ok(cmd); assert.ok(execute(s, cmd).ok);
});

test('A23: Etherium Sculptor nie obniża kosztu czaru bestow niebędącego artefaktem', () => {
  const s = scene(); put(s, 'sculptor', 'etherium-sculptor');
  const p = s.players.find(p => p.id === 'p1');
  p.mana = 0; p.manaPool = {}; p.restrictedPool = {}; p.artifactOnlyMana = 0;
  addMana(s, 'p1', 3, { colors: ['G'] });
  assert.equal(offer(s), undefined, 'trzy many nie wystarczają na bestow za cztery');
  assert.equal(execute(s, { type: 'cast_permanent', playerId: 'p1', objectId: 'dryad', bestow: true, targets: ['host'] }).ok, false);
  addMana(s, 'p1', 1, { colors: [] });
  castAndCheckAura(s);
  assert.equal(s.players.find(p => p.id === 'p1').mana, 0);
});

test('A23: Etherium Sculptor nadal obniża koszt zwykłego artefaktu', () => {
  const s = scene(); put(s, 'sculptor', 'etherium-sculptor');
  const p = s.players.find(p => p.id === 'p1'); p.mana = 0; p.manaPool = {}; p.restrictedPool = {}; p.artifactOnlyMana = 0;
  addMana(s, 'p1', 1, { colors: ['G'] });
  const cmd = playerView(s, 'p1').legalCommands.find(c => c.objectId === 'dryad' && c.type === 'cast_permanent' && !c.bestow);
  assert.ok(cmd); assert.ok(execute(s, cmd).ok);
  assert.equal(s.players.find(p => p.id === 'p1').mana, 0);
});

test('A23: realny bestow nadal można opłacić nieskrępowaną maną', () => {
  const s = scene();
  const d = s.objects.get('dryad'); s.objects.set('dryad', Object.freeze({ ...d, types: ['Enchantment', 'Creature'] }));
  addMana(s, 'p1', 3, { colors: [] });
  castAndCheckAura(s);
});

test('A23: kreator kosztu bestow nie pokazuje Powerstone i nie stosuje rabatu artefaktu', async () => {
  const { readFileSync } = await import('node:fs');
  const { createContext, runInContext } = await import('node:vm');
  const { bestowedSpellCharacteristics } = await import('../src/engine/attachments.js');
  const { reduceAlternativeCost } = await import('../src/engine/mana-cost.js');
  const { expandManaPool } = await import('../src/engine/resources.js');
  const source = readFileSync(new URL('../src/table/main.js', import.meta.url), 'utf8');
  function localFunction(name) {
    const from = source.indexOf(`  function ${name}(`); assert.notEqual(from, -1);
    const end = source.indexOf('\n  }', from); assert.ok(end > from);
    return source.slice(from, end + '\n  }'.length);
  }
  const state = scene(); put(state, 'sculptor', 'etherium-sculptor');
  const capture = {};
  const context = createContext({
    session: { state, view: () => ({ legalCommands: [] }) }, HUMAN_ID: 'p1',
    registry: { get: () => ({ types: ['Artifact', 'Creature'] }) },
    MANA_COSTS: {}, parseManaCost: () => null, reduceAlternativeCost, bestowedSpellCharacteristics,
    paymentDescriptorOf: (_c, _v, opts) => { capture.cost = opts.alternativeCost; return { cardId: 'dryad', totalNeeded: opts.alternativeCost, requirements: [['G']] }; },
    producibleMana: (_s, _p, _e, purpose) => { capture.purpose = purpose; return 1; },
    expandManaPool, manaSourcesForPlayer: () => [{ id: 'pw', spendOnly: 'artifact' }, { id: 'forest' }],
    selfTapExclusionFor: () => null,
    shouldOpenManaWizard: (args) => { capture.args = args; return true; },
  });
  const fn = runInContext(`${localFunction('restrictedSpellBlockedFor')}\n${localFunction('manaWizardFor')}\nmanaWizardFor;`, context);
  const result = fn({ type: 'cast_permanent', playerId: 'p1', objectId: 'dryad', bestow: true, targets: ['host'] });
  assert.equal(result.totalNeeded, 4); assert.equal(capture.cost, 4);
  assert.equal(result._restrictedBlocked, true);
  assert.equal(capture.args.sources.some(src => src.id === 'pw'), false);
  assert.equal(capture.args.poolUnits.length, 1);
  assert.equal(capture.purpose.castingSpell, true); assert.equal(capture.purpose.artifactSpell, false);
});
