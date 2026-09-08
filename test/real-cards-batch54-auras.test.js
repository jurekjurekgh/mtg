import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { MANA_COSTS } from '../src/cards/mana-costs-data.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { effectivePower, effectiveKeywords } from '../src/engine/permanents.js';
import { moveObjectDirectly } from '../src/engine/objects.js';

const registry = createCardRegistry();
function game(players = ['p1', 'p2']) {
  const state = createGameState({ seed: 54, players: players.map(id => ({ id })) });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  // Prawdziwe przejścia tur, bez przegranej od pustej biblioteki.
  for (const playerId of players) for (let i = 0; i < 3; i++) put(state, `lib-${playerId}-${i}`, 'basic-swamp', playerId, 'library');
  return state;
}
function put(state, id, cardId, playerId = 'p1', zone = 'hand') {
  const def = registry.get(cardId);
  assert.ok(def, `${cardId} w prawdziwym rejestrze`);
  addObject(state, { id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId,
    zone, ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes, keywords: def.keywords });
  return state.objects.get(id);
}
const commands = (s, p = s.turn.priorityPlayerId) => playerView(s, p).legalCommands;
function run(s, cmd) {
  assert.ok(cmd, 'oferta komendy istnieje');
  const r = execute(s, cmd);
  assert.ok(r.ok, JSON.stringify(r.events));
}
function resolve(s) {
  for (let i = 0; s.zones.stack.length && i < 40; i++) {
    const choices = commands(s);
    run(s, choices.find(c => c.type.startsWith('resolve_')) ?? choices.find(c => c.type === 'pass_priority'));
  }
  assert.equal(s.zones.stack.length, 0, 'cały stos rozstrzygnięty');
}
const find = (s, cardId, zone = 'battlefield') => [...s.objects.values()].find(o => o.cardId === cardId && o.zone === zone);
const life = (s, p) => s.players.find(o => o.id === p).life;


// CR702.117a (mtg.wiki/Surge, CR2026-08-07, fetched2026-09-08):
// “You may pay [cost] rather than pay this spell's mana cost as you cast this
// spell if you or one of your teammates has cast another spell this turn.”
// WotC2016-01-22 (snapshot607): “The enchanted creature can still be untapped
// by other spells and abilities.” CR502.3: “Third, the active player determines
// which permanents they control will untap. Then they untap them all
// simultaneously.” (mtg.wiki/Beginning_phase, fetched2026-09-08).
function membraneBoard() {
  const s = game(); put(s, 'membrane', 'containment-membrane');
  put(s, 'host', 'rotting-legion', 'p2', 'battlefield'); return s;
}
async function priorCast(s, { countered = false, owner = 'p1' } = {}) {
  put(s, 'prior', 'vampires-bite', owner); addMana(s, owner, 1, { colors: ['B'] });
  s.turn.priorityPlayerId = owner;
  run(s, commands(s, owner).find(c => c.type === 'cast_spell' && c.objectId === 'prior' && c.targets?.[0] === 'host'));
  if (countered) {
    const { counterStackObject } = await import('../src/engine/effects.js');
    counterStackObject(s, s.zones.stack.at(-1));
  } else resolve(s);
  s.turn.priorityPlayerId = 'p1';
}
test('B54 aura607: druk, Oracle, normalny koszt i brak tapnięcia/ETB triggera', () => {
  const d = registry.get('containment-membrane'); assert.ok(d);
  const src = JSON.parse(fs.readFileSync(new URL('../docs/cards/scryfall-containment-membrane.json', import.meta.url)));
  assert.equal(d.oracleText, src.oracle_text); assert.equal(d.imageUri, src.image_uris.large);
  assert.equal(d.artId, 607); assert.equal(d.set, 'OGW'); assert.equal(d.plan, 'Wiedźmin');
  assert.equal(MANA_COSTS[d.id], '{2}{U}'); assert.equal(d.support.status, 'supported');
  assert.deepEqual(d.support.limitations, []);
  const s = membraneBoard(); addMana(s, 'p1', 3, { colors: ['U'] });
  assert.equal(s.objects.get('host').tapped, false);
  run(s, commands(s).find(c => c.type === 'cast_permanent' && c.objectId === 'membrane' && !c.surgeCast));
  assert.equal(s.players[0].mana, 0); resolve(s);
  assert.equal(find(s, d.id).attachedTo, 'host'); assert.equal(s.objects.get('host').tapped, false);
  assert.equal(s.events.some(e => e.type === 'trigger_queued' && e.cardId === d.id), false);
});
for (const countered of [false, true]) test(`B54 aura607: surge po ${countered ? 'skontrowanym' : 'rozstrzygniętym'} własnym czarze`, async () => {
  const s = membraneBoard(); await priorCast(s, { countered });
  addMana(s, 'p1', 1, { colors: ['U'] });
  const casts = commands(s).filter(c => c.type === 'cast_permanent' && c.objectId === 'membrane');
  assert.ok(casts.length); assert.ok(casts.every(c => c.surgeCast)); run(s, casts[0]);
  assert.equal(s.players[0].mana, 0);
  const stacked = find(s, 'containment-membrane', 'stack');
  assert.equal(stacked.manaCost, 3); assert.equal(stacked.surgeCast, true);
  resolve(s); assert.equal(find(s, 'containment-membrane').attachedTo, 'host');
});
test('B54 aura607: surge nie liczy czaru przeciwnika ani siebie; odrzucenie jest atomowe', async () => {
  for (const foeCast of [false, true]) {
    const s = membraneBoard(); if (foeCast) await priorCast(s, { owner: 'p2' });
    addMana(s, 'p1', 3, { colors: ['U'] });
    assert.equal(commands(s).some(c => c.surgeCast), false);
    assert.equal(execute(s, { type: 'cast_permanent', playerId: 'p1', objectId: 'membrane', targets: ['host'], surgeCast: true }).ok, false);
    assert.equal(s.players[0].mana, 3); assert.equal(s.objects.get('membrane').zone, 'hand');
  }
});
test('B54 aura607: zły kolor/nielegalny cel/surge+bestow odrzucone bez opłat', async () => {
  for (const [colors, target, extra] of [[['B'],'host',{}], [['U'],'p2',{}], [['U'],'host',{ bestow: true }]]) {
    const s = membraneBoard(); await priorCast(s); addMana(s, 'p1', 1, { colors });
    assert.equal(execute(s, { type: 'cast_permanent', playerId: 'p1', objectId: 'membrane', targets: [target], surgeCast: true, ...extra }).ok, false);
    assert.equal(s.players[0].mana, 1); assert.equal(s.objects.get('membrane').zone, 'hand');
  }
});
test('B54 aura607: blokuje untap step obecnego kontrolera, nie efekt; odejście aury usuwa blokadę', async () => {
  const { replaceObject, untapControlled, untapByEffect } = await import('../src/engine/permanents.js');
  const s = membraneBoard(); addMana(s, 'p1', 3, { colors: ['U'] });
  run(s, commands(s).find(c => c.type === 'cast_permanent')); resolve(s);
  const aura = find(s, 'containment-membrane');
  replaceObject(s, s.objects.get('host'), { tapped: true });
  untapControlled(s, 'p2'); assert.equal(s.objects.get('host').tapped, true);
  assert.equal(untapByEffect(s, 'host'), true); assert.equal(s.objects.get('host').tapped, false);
  replaceObject(s, s.objects.get('host'), { tapped: true, controllerId: 'p1' });
  untapControlled(s, 'p1'); assert.equal(s.objects.get('host').tapped, true);
  moveObjectDirectly(s, aura.id, 'graveyard', 'gone-aura');
  untapControlled(s, 'p1'); assert.equal(s.objects.get('host').tapped, false);
});
test('B54 aura607: surge nie daje flash, lecz wcześniejszy cast na stosie działa po nadaniu flash', async () => {
  const { replaceObject } = await import('../src/engine/permanents.js');
  const s = membraneBoard(); put(s, 'prior', 'vampires-bite'); addMana(s, 'p1', 2, { colors: ['B','U'] });
  run(s, commands(s).find(c => c.type === 'cast_spell' && c.objectId === 'prior' && c.targets?.[0] === 'host'));
  assert.equal(commands(s).some(c => c.objectId === 'membrane' && c.type === 'cast_permanent'), false);
  replaceObject(s, s.objects.get('membrane'), { keywords: ['flash'] });
  const offer = commands(s).find(c => c.objectId === 'membrane' && c.surgeCast);
  run(s, offer); resolve(s); assert.ok(find(s, 'containment-membrane'));
});
test('B54 aura607: UI oddziela surge od pełnej płatności i wizard żąda tylko U', async () => {
  const { choiceRequestGroupKey, commandLabel, rulesText } = await import('../src/table/render.js');
  const { commandOptionKey } = await import('../src/table/session.js');
  const { paymentDescriptorOf } = await import('../src/table/mana-wizard.js');
  const s = membraneBoard(); await priorCast(s); addMana(s, 'p1', 3, { colors: ['U'] });
  const view = playerView(s, 'p1');
  const casts = view.legalCommands.filter(c => c.objectId === 'membrane' && c.type === 'cast_permanent');
  const normal = casts.find(c => !c.surgeCast), surge = casts.find(c => c.surgeCast);
  assert.ok(normal); assert.ok(surge);
  assert.notEqual(choiceRequestGroupKey(normal), choiceRequestGroupKey(surge));
  assert.notEqual(commandOptionKey(normal), commandOptionKey(surge));
  assert.equal(paymentDescriptorOf(surge, view).totalNeeded, 1);
  assert.equal(paymentDescriptorOf(normal, view).totalNeeded, 3);
  const text = rulesText({ ...registry.get('containment-membrane'), controllerId: 'p1' });
  assert.match(text, /[Ss]urge.*U/); assert.match(text, /krok.*odkręcania/);
});

// Ten sam Oracle „during its controller's untap step”, nie zakaz untap
// w ogóle. M272 błędnie rozszerzał go na efekty; stun nadal działa zawsze.
test('B54 untap: lock_untap Liry nie blokuje odkręcenia efektem', async () => {
  const { applyEffect } = await import('../src/engine/effects.js');
  const { replaceObject, untapControlled, untapByEffect } = await import('../src/engine/permanents.js');
  const s = game(); put(s, 'host', 'rotting-legion', 'p2', 'battlefield');
  const lyre = put(s, 'lyre', 'entrancing-lyre', 'p1', 'battlefield');
  replaceObject(s, lyre, { tapped: true });
  replaceObject(s, s.objects.get('host'), { tapped: true });
  applyEffect(s, { type: 'lock_untap' }, s.objects.get('lyre'), ['host']);
  untapControlled(s, 'p2'); assert.equal(s.objects.get('host').tapped, true);
  assert.equal(untapByEffect(s, 'host'), true);
});
test('B54 untap: Spectral Prison ma stałą blokadę, bez dodatkowego ETB triggera', async () => {
  const { replaceObject, untapControlled, untapByEffect } = await import('../src/engine/permanents.js');
  const s = game(); put(s, 'host', 'rotting-legion', 'p2', 'battlefield'); put(s, 'aura', 'spectral-prison');
  addMana(s, 'p1', 2, { colors: ['U'] }); run(s, commands(s).find(c => c.objectId === 'aura' && c.type === 'cast_permanent'));
  run(s, commands(s).find(c => c.type === 'pass_priority'));
  run(s, commands(s).find(c => c.type === 'pass_priority'));
  assert.equal(s.zones.stack.length, 0, 'statyczna blokada nie korzysta ze stosu');
  replaceObject(s, s.objects.get('host'), { tapped: true }); untapControlled(s, 'p2');
  assert.equal(s.objects.get('host').tapped, true); assert.equal(untapByEffect(s, 'host'), true);
});
// Frost Lynx ruling 2020-04-17, api.scryfall.com/cards/m15/55/rulings:
// “That creature won’t untap during its controller’s next untap step.”
test('B54 untap: Frost Lynx blokuje jeden step niezależnie od stanu źródła', async () => {
  const { untapControlled } = await import('../src/engine/permanents.js');
  const s = game(); put(s, 'host', 'rotting-legion', 'p2', 'battlefield'); put(s, 'lynx', 'frost-lynx');
  addMana(s, 'p1', 3, { colors: ['U'] }); run(s, commands(s).find(c => c.objectId === 'lynx' && c.type === 'cast_permanent'));
  resolve(s); const lynx = find(s, 'frost-lynx'); assert.ok(lynx);
  assert.equal(s.objects.get('host').tapped, true);
  moveObjectDirectly(s, lynx.id, 'graveyard', 'gone-lynx');
  untapControlled(s, 'p2'); assert.equal(s.objects.get('host').tapped, true);
  untapControlled(s, 'p2'); assert.equal(s.objects.get('host').tapped, false);
});

test('B54 aura607: bot wybiera surge na wroga, nie droższy wariant ani własnego stwora', async () => {
  const { createHeuristicBot } = await import('../src/controllers/heuristic-bot.js');
  const s = membraneBoard(); put(s, 'own', 'rotting-legion', 'p1', 'battlefield');
  await priorCast(s); addMana(s, 'p1', 3, { colors: ['U'] });
  const bot = createHeuristicBot({ seed: 54, registry }); const c = bot.chooseCommand(playerView(s, 'p1'));
  assert.equal(c.type, 'cast_permanent'); assert.equal(c.surgeCast, true); assert.deepEqual(c.targets, ['host']);
});
test('B54 aura607: zniknięcie celu fizzluje, aura nie trafia na pole bitwy', async () => {
  const s = membraneBoard(); await priorCast(s); addMana(s, 'p1', 1, { colors: ['U'] });
  run(s, commands(s).find(c => c.objectId === 'membrane' && c.surgeCast));
  moveObjectDirectly(s, 'host', 'graveyard', 'gone-host'); resolve(s);
  assert.equal(find(s, 'containment-membrane'), undefined); assert.ok(find(s, 'containment-membrane', 'graveyard'));
});

test('B54 aura607: nowa tura kasuje warunek surge poprzedniego rzucającego', async () => {
  const s = membraneBoard(); await priorCast(s);
  const oldTurn = s.turn.number;
  for (let i = 0; s.turn.number === oldTurn && i < 80; i++) run(s, commands(s).find(c => c.type === 'pass_priority'));
  assert.notEqual(s.turn.number, oldTurn);
  assert.equal(s.spellsCastThisTurnByPlayer?.p1 ?? 0, 0);
  const { replaceObject } = await import('../src/engine/permanents.js');
  replaceObject(s, s.objects.get('membrane'), { keywords: ['flash'] });
  addMana(s, 'p1', 3, { colors: ['U'] });
  s.turn.priorityPlayerId = 'p1';
  assert.ok(commands(s).some(c => c.objectId === 'membrane'));
  assert.equal(commands(s).some(c => c.objectId === 'membrane' && c.surgeCast), false);
});

for (const priorOwner of ['p1', 'p2']) test(`B54 aura607: okno Vaana — surge zależy od rzucającego, wcześniejszy ${priorOwner}`, async () => {
  const { replaceObject } = await import('../src/engine/permanents.js');
  const s = membraneBoard(); await priorCast(s, { owner: priorOwner });
  moveObjectDirectly(s, 'membrane', 'exile', 'stolen');
  replaceObject(s, s.objects.get('stolen'), { ownerId: 'p2', controllerId: 'p2' });
  s.turn = jumpToStep(s.turn, 'declare_attackers', 'p1');
  s.turn.priorityPlayerId = 'p1';
  addMana(s, 'p1', 1, { colors: ['U'] });
  s.pendingExileCast = { playerId: 'p1', objectId: 'stolen', cardId: 'containment-membrane', sourceId: 'vaan', restorePriorityTo: 'p1' };
  const offers = commands(s).filter(c => c.type === 'resolve_exile_cast' && c.cast);
  assert.equal(offers.length > 0, priorOwner === 'p1');
  if (priorOwner !== 'p1') return;
  assert.ok(offers.every(c => c.surgeCast));
  run(s, offers.find(c => c.targets?.[0] === 'host'));
  const stacked = find(s, 'containment-membrane', 'stack');
  assert.equal(stacked.surgeCast, true); assert.equal(stacked.manaCost, 3);
  assert.equal(stacked.controllerId, 'p1'); assert.equal(stacked.ownerId, 'p2');
  assert.equal(s.players[0].mana, 0); resolve(s);
  assert.equal(find(s, 'containment-membrane').attachedTo, 'host');
});

test('B54 aura: obniżki alternatywnego kosztu w ofercie, płatności i wizardzie; kolor zostaje', async () => {
  const { replaceObject } = await import('../src/engine/permanents.js');
  const { reduceAlternativeCost } = await import('../src/engine/mana-cost.js');
  const { paymentDescriptorOf } = await import('../src/table/mana-wizard.js');
  for (const mode of ['surge', 'bestow']) for (const reducers of [1, 4]) {
    const s = membraneBoard(); await priorCast(s);
    let id = 'membrane';
    if (mode === 'bestow') { id = 'dryad'; put(s, id, 'leafcrown-dryad'); }
    const object = s.objects.get(id);
    // Kontrolowany wariant artifact: używa prawdziwego Etherium Sculptor.
    const alt = { ...object[mode], cost: 3, colors: ['U'] };
    replaceObject(s, object, { types: [...object.types, 'Artifact'], [mode]: alt });
    for (let i = 0; i < reducers; i++) put(s, `sculptor-${i}`, 'etherium-sculptor', 'p1', 'battlefield');
    const cost = Math.max(1, 3 - reducers); addMana(s, 'p1', cost, { colors: ['U'] });
    const view = playerView(s, 'p1');
    const cmd = view.legalCommands.find(c => c.objectId === id && c.targets?.[0] === 'host' && (mode === 'surge' ? c.surgeCast : c.bestow));
    assert.ok(cmd, 'opłacalny koszt po obniżce jest oferowany');
    const alternativeCost = reduceAlternativeCost(s, s.objects.get(id), alt.cost, alt.colors);
    assert.equal(alternativeCost, cost);
    const desc = paymentDescriptorOf(cmd, view, { alternativeCost });
    assert.equal(desc.totalNeeded, cost); assert.deepEqual(desc.requirements, [['U']]);
    run(s, cmd); assert.equal(s.players[0].mana, 0);
  }
});

// CR611.2b (mtg.wiki/Continuous_effect, CR2026-08-07, fetched2026-09-08):
// “If the ‘for as long as’ duration never starts, the effect does nothing.”
// Ruling Lyre2020-01-24: “This is true even if Entrancing Lyre becomes
// tapped again before the activated ability resolves.” (snapshot THB233).
for (const timing of ['before', 'after', 'leave', 'reactivate', 'stun']) test(`B54 Lyre: nieprzerwany czas trwania — ${timing}`, async () => {
  const { untapByEffect, tapObject, untapControlled, replaceObject } = await import('../src/engine/permanents.js');
  const s = game(); put(s, 'host', 'rotting-legion', 'p2', 'battlefield');
  put(s, 'host2', 'rotting-legion', 'p2', 'battlefield');
  put(s, 'lyre', 'entrancing-lyre', 'p1', 'battlefield');
  addMana(s, 'p1', 10);
  const activate = target => run(s, commands(s).find(c => c.type === 'activate_ability' && c.objectId === 'lyre' && c.xValue === 5 && c.targets?.[0] === target));
  activate('host');
  if (timing === 'after') resolve(s);
  if (timing === 'leave') moveObjectDirectly(s, 'lyre', 'graveyard', 'gone-lyre');
  else {
    if (timing === 'stun') replaceObject(s, s.objects.get('lyre'), { counters: { stun: 1 } });
    assert.equal(untapByEffect(s, 'lyre'), timing !== 'stun');
    if (timing === 'reactivate') activate('host2');
    else if (timing !== 'stun') tapObject(s, 'lyre', 'p1');
  }
  resolve(s); assert.equal(s.objects.get('host').tapped, true, 'tap niezależny od rozpoczęcia blokady');
  untapControlled(s, 'p2');
  assert.equal(s.objects.get('host').tapped, timing === 'stun', 'stara blokada nie odżywa po untap/retap');
  if (timing === 'reactivate') assert.equal(s.objects.get('host2').tapped, true, 'nowa aktywacja tworzy nową blokadę');
});
