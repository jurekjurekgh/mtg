import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createCardDeck } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { commandLabel } from '../src/table/render.js';
import { describeGameEvent } from '../src/table/session.js';
import { detectBotUntapsMyPermanent } from '../tools/table-tester/detectors.mjs';
import { chooseOneOrBothPlanOf, castModePlanOf } from '../src/table/multi-target.js';

// F7 / ADR0030: Scryfall API karta 8ED111 + /rulings pobrane 2026-09-28:
// https://api.scryfall.com/cards/1b25858a-ab2d-441a-a3fe-6d5ecd7f05be/rulings
// Ruling WotC 2004-10-04: „The decision whether or not to tap or untap is
// made on resolution. This is not a modal spell.” Drugi ruling: „This is
// not a toggle effect ... Twiddle will not automatically untap the card.”
// CR 608.2d (pełny CR 2026-09-25 pobrany 2026-09-28): wybory efektu ogłasza
// się podczas stosowania efektu; nie można wybrać działania niemożliwego.
const registry = createCardRegistry();
function put(s, id, cardId, playerId = 'p1', zone = 'hand', patch = {}) {
  const [{ objectId, ...data }] = createCardDeck({ cardIds: [cardId], ownerId: playerId, registry });
  addObject(s, { ...data, id, instanceId: `i-${id}`, controllerId: playerId, zone });
  if (Object.keys(patch).length) s.objects.set(id, Object.freeze({ ...s.objects.get(id), ...patch }));
}
function game() {
  const s = createGameState({ seed: 142, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main', 'p1'); s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  for (const p of ['p1', 'p2']) for (let i = 0; i < 8; i++) put(s, `lib-${p}-${i}`, 'basic-swamp', p, 'library');
  return s;
}
const commands = (s, p = s.turn.priorityPlayerId) => playerView(s, p).legalCommands;
function run(s, cmd) {
  assert.ok(cmd, 'komenda istnieje'); const r = execute(s, cmd);
  assert.equal(r.ok, true, JSON.stringify(r)); return r;
}
function cast(s, id, target) {
  const cmd = commands(s).find((c) => c.type === 'cast_spell' && c.objectId === id && c.targets?.[0] === target);
  run(s, cmd); return cmd;
}
function passToMay(s) {
  for (let i = 0; s.zones.stack.length && !s.pendingOptionalSpellEffect && i < 40; i++) {
    run(s, commands(s).find((c) => c.type === 'pass_priority'));
  }
}
function may(s, apply, effectType) {
  return commands(s, 'p1').find((c) => c.type === 'resolve_optional_spell_effect'
    && c.apply === apply && (effectType == null || c.effectType === effectType));
}
function prepare({ owner = 'p2', tapped = false, cardId = 'highland-game' } = {}) {
  const s = game(); put(s, 'target', cardId, owner, 'battlefield', { tapped });
  put(s, 'tw', 'twiddle'); addMana(s, 'p1', 1, { colors: ['U'] }); return s;
}

test('PR140/F7: Twiddle jest niemodalny, jeden rzut na cel, bez gniazd trybów w UI', () => {
  const s = prepare(); put(s, 'land', 'basic-island', 'p1', 'battlefield');
  const spell = registry.get('twiddle').spell;
  assert.equal(spell.modes?.length ?? 0, 0);
  assert.equal(spell.targets[0].type, 'artifact_or_creature_or_land');
  assert.equal(spell.effects[0].may, true);
  const offers = commands(s).filter((c) => c.type === 'cast_spell' && c.objectId === 'tw');
  assert.equal(offers.length, 2, 'dwa cele, nie dwa tryby razy dwa cele');
  assert.ok(offers.every((c) => c.modeIndex == null));
  assert.equal(chooseOneOrBothPlanOf(offers), null);
  assert.equal(castModePlanOf(offers), null);
});

test('PR140/F7: odpowiedź maną zmienia dostępne działanie, nie wcześniej zadeklarowany tryb', () => {
  const s = prepare({ owner: 'p2', cardId: 'basic-island' });
  cast(s, 'tw', 'target');
  run(s, { type: 'pass_priority', playerId: 'p1' });
  run(s, { type: 'tap_for_mana', playerId: 'p2', objectId: 'target' });
  passToMay(s);
  assert.ok(s.pendingOptionalSpellEffect);
  assert.equal(s.pendingOptionalSpellEffect.modeIndex, null);
  const untap = may(s, true, 'untap_permanent');
  assert.ok(untap, 'odkręcenie można wybrać dopiero teraz');
  assert.equal(may(s, true, 'tap_permanent'), undefined, 'niemożliwe tapnięcie nie jest oferowane');
  assert.equal(s.objects.get('target').tapped, true, 'żadnego automatycznego toggle');
  run(s, untap);
  assert.equal(s.objects.get('target').tapped, false);
  assert.equal(s.zones.stack.length, 0);
  const resolution = s.events.find((e) => e.type === 'optional_spell_effect_resolved');
  assert.equal(resolution.effectType, 'untap_permanent');
  assert.equal(resolution.targetId, 'target');
  assert.notEqual(s.events.find((e) => e.type === 'spell_resolved').modal, true);
});

for (const tapped of [false, true]) {
  test(`PR140/F7: odmowa przy stanie tapped=${tapped} nic nie zmienia poza rozstrzygnięciem czaru`, () => {
    const s = prepare({ tapped }); cast(s, 'tw', 'target'); passToMay(s);
    run(s, may(s, false));
    assert.equal(s.objects.get('target').tapped, tapped);
    assert.equal(s.players[0].mana, 0, 'mana za rzut pozostaje zapłacona');
    assert.equal(s.zones.stack.length, 0);
    assert.ok(s.zones.graveyard.some((id) => s.objects.get(id).cardId === 'twiddle'));
  });
}

test('PR140/F7: nielegalny rodzaj działania / apply nie konsumuje pending ani stosu', () => {
  const s = prepare({ tapped: true }); cast(s, 'tw', 'target'); passToMay(s);
  const before = structuredClone(s);
  for (const payload of [
    { apply: true, effectType: 'tap_permanent' },
    { apply: true, effectType: 'destroy_permanent' },
    { apply: true }, { apply: 'true', effectType: 'untap_permanent' }, {},
  ]) {
    const r = execute(s, { type: 'resolve_optional_spell_effect', playerId: 'p1', ...payload });
    assert.equal(r.ok, false, JSON.stringify(payload));
    assert.deepEqual(s, before, 'odmowa bez mutacji');
  }
  run(s, may(s, true, 'untap_permanent'));
  assert.equal(s.objects.get('target').tapped, false);
});

test('PR140/F7: brak priorytetu między wyborem a efektem; cudza odpowiedź odrzucona', () => {
  const s = prepare(); cast(s, 'tw', 'target'); passToMay(s);
  const before = structuredClone(s);
  assert.equal(execute(s, { type: 'pass_priority', playerId: 'p1' }).ok, false);
  assert.equal(execute(s, { ...may(s, false), playerId: 'p2' }).ok, false);
  assert.deepEqual(s, before);
  run(s, may(s, true, 'tap_permanent'));
  assert.equal(s.objects.get('target').tapped, true);
});

test('PR140/F7: prawdziwe Force Away w odpowiedzi powoduje fizzle bez pytania', () => {
  const s = prepare(); cast(s, 'tw', 'target');
  put(s, 'bounce', 'force-away'); addMana(s, 'p1', 2, { colors: ['U'] });
  cast(s, 'bounce', 'target'); passToMay(s);
  assert.equal(s.pendingOptionalSpellEffect, null);
  assert.equal(s.zones.stack.length, 0);
  assert.equal(s.events.find((e) => e.type === 'spell_resolved' && e.cardId === 'twiddle').fizzled, true);
});

test('PR140/F7 UI: konkretne działanie i cel w etykiecie dopiero przy rozstrzygnięciu', () => {
  const s = prepare({ owner: 'p1', tapped: true }); cast(s, 'tw', 'target'); passToMay(s);
  const view = playerView(s, 'p1');
  const session = { nameOf: (id) => registry.get(id)?.name ?? id };
  const choice = may(s, true, 'untap_permanent'); assert.ok(choice);
  assert.match(commandLabel(choice, session, view), /odkręć.*Highland Game/);
  assert.match(commandLabel(may(s, false), session, view), /nie rób nic/);
});

test('PR140/F7 bot: niemodalny czar wycenia odkręcenie własnego, nie bazę 50 ani pomoc wrogowi', () => {
  const s = game();
  put(s, 'enemy', 'highland-game', 'p2', 'battlefield', { tapped: true });
  put(s, 'own', 'segmented-krotiq', 'p1', 'battlefield', { tapped: true });
  put(s, 'tw', 'twiddle'); addMana(s, 'p1', 1, { colors: ['U'] });
  const choice = createHeuristicBot({ seed: 9 }).chooseCommand(playerView(s, 'p1'));
  assert.equal(choice.type, 'cast_spell'); assert.equal(choice.objectId, 'tw');
  assert.deepEqual(choice.targets, ['own']); assert.equal(choice.modeIndex ?? null, null);
  run(s, choice); passToMay(s);
  const decision = createHeuristicBot({ seed: 9 }).chooseCommand(playerView(s, 'p1'));
  assert.equal(decision.apply, true); assert.equal(decision.effectType, 'untap_permanent');
  run(s, decision); assert.equal(s.objects.get('own').tapped, false);
});

for (const [owner, tapped, apply] of [['p1', false, false], ['p1', true, true], ['p2', false, true], ['p2', true, false]]) {
  test(`PR140/F7 bot: decyzja na aktualnym celu (${owner}, tapped=${tapped}) → ${apply}`, () => {
    const s = prepare({ owner, tapped }); cast(s, 'tw', 'target'); passToMay(s);
    const cmd = createHeuristicBot({ seed: 3 }).chooseCommand(playerView(s, 'p1'));
    assert.equal(cmd.type, 'resolve_optional_spell_effect'); assert.equal(cmd.apply, apply);
    if (apply) assert.equal(cmd.effectType, tapped ? 'untap_permanent' : 'tap_permanent');
    run(s, cmd); assert.equal(s.objects.get('target').tapped, apply ? !tapped : tapped);
  });
}

function synthetic(s, effects, { modal = false } = {}) {
  const spec = { targets: [{ type: 'creature' }], effects };
  addObject(s, { id: 'test-spell', instanceId: 'i-test-spell', cardId: 'test-optional-sequence', controllerId: 'p1',
    zone: 'hand', kind: 'spell', types: ['Instant'], manaCost: 0,
    spell: { timing: 'instant', ...(modal ? { modes: [{ name: 'Tryb testowy', ...spec }] } : spec) },
  });
  cast(s, 'test-spell', 'target');
}

for (const modal of [false, true]) for (const secondApply of [false, true]) {
  test(`PR140/F7: dwie decyzje may + draw, modal=${modal}, druga=${secondApply}`, () => {
    const s = game(); put(s, 'target', 'highland-game', 'p1', 'battlefield');
    synthetic(s, [{ type: 'tap_permanent', may: true }, { type: 'untap_permanent', may: true }, { type: 'draw_cards', amount: 1 }], { modal });
    passToMay(s); run(s, may(s, true, 'tap_permanent'));
    assert.equal(s.objects.get('target').tapped, true);
    assert.ok(s.pendingOptionalSpellEffect, 'wznowienie nie omija DRUGIEGO may');
    assert.equal(s.pendingOptionalSpellEffect.effectIndex, 1);
    assert.equal(s.zones.hand.length, 0, 'draw jeszcze nie wykonany');
    run(s, may(s, secondApply, secondApply ? 'untap_permanent' : undefined));
    assert.equal(s.objects.get('target').tapped, !secondApply);
    assert.equal(s.zones.hand.length, 1, 'draw po obu decyzjach');
    assert.equal(s.zones.stack.length, 0);
    assert.equal(s.events.filter((e) => e.type === 'spell_resolved').length, 1);
    assert.equal(s.events.filter((e) => e.type === 'optional_spell_effect_resolved').length, 2);
    if (modal) assert.equal(s.events.find((e) => e.type === 'spell_resolved').modeName, 'Tryb testowy');
  });
}

test('PR140/F7: may po innej blokującej decyzji (scry) też czeka na odpowiedź', () => {
  const s = game(); put(s, 'target', 'highland-game', 'p1', 'battlefield');
  synthetic(s, [{ type: 'scry', amount: 1 }, { type: 'tap_permanent', may: true }]);
  run(s, { type: 'pass_priority', playerId: 'p1' }); run(s, { type: 'pass_priority', playerId: 'p2' });
  assert.ok(s.pendingScry);
  run(s, commands(s).find((c) => c.type === 'resolve_scry'));
  assert.ok(s.pendingOptionalSpellEffect); assert.equal(s.pendingOptionalSpellEffect.effectIndex, 1);
  run(s, may(s, false)); assert.equal(s.objects.get('target').tapped, false);
  assert.equal(s.zones.stack.length, 0);
});

test('PR140/F7: kopia czaru po decyzji znika zamiast trafić do grobu (fixture kopii)', () => {
  const s = prepare({ tapped: true }); cast(s, 'tw', 'target');
  const id = s.zones.stack.at(-1);
  // Nośnik istniejącego kontraktu kopii, bez dodawania niezamówionej karty kopiującej.
  s.objects.set(id, Object.freeze({ ...s.objects.get(id), isSpellCopy: true }));
  passToMay(s); run(s, may(s, true, 'untap_permanent'));
  assert.equal(s.objects.get('target').tapped, false);
  assert.equal(s.objects.has(id), false);
  assert.equal(s.zones.graveyard.length, 0);
  assert.equal(s.events.find((e) => e.type === 'spell_resolved').copy, true);
  assert.equal(s.events.find((e) => e.type === 'spell_resolved').toId, null, 'kopia nie przechodzi przez grób');
});


function logHelpers(s) {
  return { nameOf: (id) => registry.get(id)?.name ?? id,
    nameOfObject: (id) => registry.get(s.objects.get(id)?.cardId)?.name ?? id };
}

test('PR140/F7 log: decyzja nazywa wykonane działanie i cel bez fikcyjnego trybu', () => {
  const s = prepare({ tapped: true }); cast(s, 'tw', 'target'); passToMay(s);
  run(s, may(s, true, 'untap_permanent'));
  const event = s.events.find((e) => e.type === 'optional_spell_effect_resolved');
  const line = describeGameEvent(event, logHelpers(s));
  assert.match(line, /odkręcenie celu.*→ cel: Highland Game/);
  assert.ok(!line.includes('tryb'));
});

test('PR140/F7 tester: wykrywa złe odkręcenie z nowego logu, nie flaguje tap/odmowy', () => {
  for (const [tapped, apply, expected] of [[true, true, 1], [true, false, 0], [false, true, 0]]) {
    const s = prepare({ tapped, owner: 'p2' }); cast(s, 'tw', 'target'); passToMay(s);
    run(s, may(s, apply, apply ? (tapped ? 'untap_permanent' : 'tap_permanent') : undefined));
    const event = s.events.find((e) => e.type === 'optional_spell_effect_resolved');
    // Perspektywa obserwatora: p1 = bot, p2 = gracz. Cel należy do p2.
    // Zła decyzja jest LEGALNA; wymuszamy ją zamiast liczyć na przypadek w meczu.
    const line = '[ROZGRYWKA] ' + describeGameEvent(event, logHelpers(s),
      { p1: 'Nieprzyjaciel', p2: 'Ty' }, { drugaOsoba: false });
    assert.equal(detectBotUntapsMyPermanent([line], new Set(['Highland Game']), new Set()).length, expected, line);
  }
});

for (const modal of [false, true]) {
  test(`PR140/F7: zagnieżdżone may wracają do aktywnego gracza, modal=${modal}`, () => {
    const s = game(); s.turn.activePlayerId = 'p2';
    put(s, 'target', 'highland-game', 'p1', 'battlefield');
    synthetic(s, [{ type: 'tap_permanent', may: true }, { type: 'untap_permanent', may: true }], { modal });
    passToMay(s);
    assert.equal(s.pendingOptionalSpellEffect.restorePriorityTo, 'p2');
    run(s, may(s, true, 'tap_permanent'));
    assert.equal(s.turn.priorityPlayerId, 'p1', 'decyzja nadal kontrolera czaru');
    assert.equal(s.pendingOptionalSpellEffect.restorePriorityTo, 'p2', 'kontynuacja nie zapamiętuje tymczasowego priorytetu wyboru');
    run(s, may(s, true, 'untap_permanent'));
    // CR 117.3b, pobrany 2026-09-28: „The active player receives priority
    // after a spell or ability (other than a mana ability) resolves.”
    assert.equal(s.turn.priorityPlayerId, 'p2');
  });

  test(`PR140/F7: przyjęty may otwiera scry i nie przeskakuje kontynuacji, modal=${modal}`, () => {
    const s = game(); s.turn.activePlayerId = 'p2';
    put(s, 'target', 'highland-game', 'p1', 'battlefield');
    synthetic(s, [{ type: 'scry', amount: 1, may: true }, { type: 'tap_permanent' }], { modal });
    passToMay(s); run(s, may(s, true, 'scry'));
    assert.ok(s.pendingScry); assert.equal(s.zones.stack.length, 1);
    assert.equal(s.pendingScry.restorePriorityTo, 'p2', 'dziecko zachowuje kontekst, nie priorytet wyboru rodzica');
    assert.equal(s.objects.get('target').tapped, false, 'następny efekt czeka na wybór scry');
    run(s, commands(s).find((c) => c.type === 'resolve_scry'));
    assert.equal(s.objects.get('target').tapped, true);
    assert.equal(s.zones.stack.length, 0); assert.equal(s.turn.priorityPlayerId, 'p2');
    if (modal) assert.equal(s.events.find((e) => e.type === 'spell_resolved').modeName, 'Tryb testowy');
  });
}

test('PR140/F7: inna blokada w trybie modalnym zachowuje kontekst przed may', () => {
  const s = game(); put(s, 'target', 'highland-game', 'p1', 'battlefield');
  synthetic(s, [{ type: 'scry', amount: 1 }, { type: 'tap_permanent', may: true }], { modal: true });
  run(s, { type: 'pass_priority', playerId: 'p1' }); run(s, { type: 'pass_priority', playerId: 'p2' });
  assert.ok(s.pendingScry); assert.equal(s.pendingOptionalSpellEffect, null, 'may jeszcze nie rozpoczęte');
  assert.equal(s.zones.stack.length, 1);
  run(s, commands(s).find((c) => c.type === 'resolve_scry'));
  assert.ok(s.pendingOptionalSpellEffect); assert.equal(s.pendingOptionalSpellEffect.modeIndex, 0);
  run(s, may(s, true, 'tap_permanent'));
  assert.equal(s.objects.get('target').tapped, true); assert.equal(s.zones.stack.length, 0);
  assert.equal(s.events.find((e) => e.type === 'spell_resolved').modeName, 'Tryb testowy');
});

test('PR140/F7: kopia prawdziwie modalnego nośnika też nie trafia do grobu po may', () => {
  const s = game(); put(s, 'target', 'highland-game', 'p1', 'battlefield');
  synthetic(s, [{ type: 'tap_permanent', may: true }], { modal: true });
  const id = s.zones.stack.at(-1); s.objects.set(id, Object.freeze({ ...s.objects.get(id), isSpellCopy: true }));
  passToMay(s); run(s, may(s, true, 'tap_permanent'));
  assert.equal(s.objects.get('target').tapped, true); assert.equal(s.zones.graveyard.length, 0);
  const event = s.events.find((e) => e.type === 'spell_resolved');
  assert.equal(event.copy, true); assert.equal(event.modeName, 'Tryb testowy');
  assert.equal(event.toId, null, 'bez przejściowego obiektu kopii w grobie');
});


for (const modal of [false, true]) {
  test(`PR140/F7: may → scry → may nie gubi kolejności, indeksu ani priorytetu, modal=${modal}`, () => {
    const s = game(); s.turn.activePlayerId = 'p2';
    put(s, 'target', 'highland-game', 'p1', 'battlefield');
    synthetic(s, [{ type: 'tap_permanent', may: true }, { type: 'scry', amount: 1 }, { type: 'untap_permanent', may: true }], { modal });
    passToMay(s); run(s, may(s, true, 'tap_permanent'));
    assert.ok(s.pendingScry); assert.equal(s.pendingOptionalSpellEffect, null);
    assert.equal(s.objects.get('target').tapped, true);
    run(s, commands(s).find((c) => c.type === 'resolve_scry'));
    assert.ok(s.pendingOptionalSpellEffect); assert.equal(s.pendingOptionalSpellEffect.effectIndex, 2);
    assert.equal(s.pendingOptionalSpellEffect.modeIndex, modal ? 0 : null);
    run(s, may(s, true, 'untap_permanent'));
    assert.equal(s.objects.get('target').tapped, false);
    assert.equal(s.turn.priorityPlayerId, 'p2'); assert.equal(s.zones.stack.length, 0);
  });
}

for (const modal of [false, true]) {
  test(`PR140/F7: wznowienie po discard nie dziedziczy tymczasowego priorytetu, modal=${modal}`, () => {
    const s = game(); s.turn.activePlayerId = 'p2';
    put(s, 'target', 'highland-game', 'p1', 'battlefield');
    put(s, 'hand-a', 'basic-forest'); put(s, 'hand-b', 'basic-swamp');
    synthetic(s, [{ type: 'tap_permanent', may: true }, { type: 'discard_cards', amount: 1 }, { type: 'untap_permanent', may: true }], { modal });
    passToMay(s); run(s, may(s, true, 'tap_permanent'));
    assert.ok(s.pendingDiscardChoice);
    run(s, commands(s).find((c) => c.type === 'resolve_discard_choice'));
    assert.ok(s.pendingOptionalSpellEffect);
    assert.equal(s.pendingOptionalSpellEffect.restorePriorityTo, 'p2');
    run(s, may(s, true, 'untap_permanent'));
    assert.equal(s.turn.priorityPlayerId, 'p2');
  });
}
