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

for (const [id, artId, set, plan] of [
  ['rotting-legion', 600, 'M11', 'Warhammer Fantasy'],
  ['vampires-bite', 604, 'ZEN', 'Wiedźmin'],
  ['skymarch-bloodletter', 608, 'M19', 'Ixalan'],
]) {
  test(`B54: ${id} — dokładny druk, Oracle, artId, plan, pełne wsparcie`, () => {
    const def = registry.get(id);
    const src = JSON.parse(fs.readFileSync(new URL(`../docs/cards/scryfall-${id}.json`, import.meta.url)));
    assert.ok(def);
    assert.equal(def.artId, artId); assert.equal(def.set, set); assert.equal(def.plan, plan);
    assert.equal(def.oracleText, src.oracle_text);
    assert.equal(def.imageUri, src.image_uris.large);
    assert.equal(def.manaCost, src.cmc); assert.equal(MANA_COSTS[id], src.mana_cost);
    assert.deepEqual(def.colors, src.colors);
    assert.equal(def.support.status, 'supported'); assert.deepEqual(def.support.limitations, []);
    assert.ok(Array.isArray(src.rulings)); assert.equal(src.rulingsPobrano, '2026-09-08');
  });
  test(`B54: ${id} — za mało many / zły kolor, brak oferty i odrzucona komenda`, () => {
    for (const [mana, colors] of [[0, []], [9, ['U','U','U','U','U','U','U','U','U']]]) {
      const s = game(); put(s, 'card', id); put(s, 'tgt', 'rotting-legion', 'p2', 'battlefield');
      if (mana) addMana(s, 'p1', mana, { colors });
      assert.equal(commands(s).some(c => c.objectId === 'card' && c.type.startsWith('cast_')), false);
      const cmd = { type: id === 'vampires-bite' ? 'cast_spell' : 'cast_permanent', playerId: 'p1', objectId: 'card', targets: ['tgt'] };
      const r = execute(s, cmd);
      assert.equal(r.ok, false); assert.ok(r.events.some(e => typeof e.reason === 'string'));
      assert.equal(s.objects.get('card').zone, 'hand');
    }
  });
}

// CR 603.6d (2026-08-07, pobrano 2026-09-08): “Such text is a static
// ability—not a triggered ability—whose effect occurs as part of the event
// that puts the permanent onto the battlefield.”
// https://mtg.wiki/page/Triggered_ability
// Oracle M11: “This creature enters tapped.”
test('B54: Rotting Legion — rzut i ponowne wejście tapped, bez triggera', () => {
  const s = game(); put(s, 'card', 'rotting-legion'); addMana(s, 'p1', 5, { colors: ['B'] });
  run(s, commands(s).find(c => c.type === 'cast_permanent' && c.objectId === 'card'));
  resolve(s);
  const creature = find(s, 'rotting-legion');
  assert.equal(creature.power, 4); assert.equal(creature.toughness, 5);
  assert.equal(creature.tapped, true);
  // Wspólna ścieżka ruchu, nie podmiana gotowego tapped w fixture.
  moveObjectDirectly(s, creature.id, 'graveyard', 'dead');
  moveObjectDirectly(s, 'dead', 'battlefield', 'returned');
  assert.equal(s.objects.get('returned').tapped, true);
});

// CR 702.33a: “You may pay an additional [cost] as you cast this spell.”
// CR 702.33d: “If a spell’s controller declares the intention to pay any of
// that spell’s kicker costs, that spell has been ‘kicked.’”
// https://mtg.wiki/page/Kicker, CR 2026-08-07, pobrano 2026-09-08.
for (const kicked of [false, true]) test(`B54: Vampire's Bite — pump +3/+0, lifelink tylko za kicker (${kicked})`, () => {
  const s = game(); put(s, 'bite', 'vampires-bite'); put(s, 'tgt', 'rotting-legion', 'p2', 'battlefield');
  addMana(s, 'p1', 4, { colors: ['B', 'B'] });
  const offered = commands(s).find(c => c.type === 'cast_spell' && c.objectId === 'bite' && c.targets?.[0] === 'tgt' && Boolean(c.kicked) === kicked);
  run(s, offered);
  assert.equal(s.players[0].mana, kicked ? 0 : 3);
  assert.equal(find(s, 'vampires-bite', 'stack').wasKicked, kicked);
  resolve(s);
  assert.equal(effectivePower(s.objects.get('tgt'), s), 7);
  assert.equal(effectiveKeywords(s.objects.get('tgt'), s).includes('lifelink'), kicked);
  for (let i = 0; s.turn.activePlayerId === 'p1' && i < 40; i++) {
    const cmds = commands(s);
    run(s, cmds.find(c => c.type === 'declare_attackers' && c.attackers.length === 0) ?? cmds.find(c => c.type === 'pass_priority'));
  }
  assert.equal(s.turn.activePlayerId, 'p2');
  assert.equal(effectivePower(s.objects.get('tgt'), s), 4);
  assert.equal(effectiveKeywords(s.objects.get('tgt'), s).includes('lifelink'), false);
});

test("B54: Vampire's Bite — kicker nieopłacalny / cel nie jest stworzeniem", () => {
  const s = game(); put(s, 'bite', 'vampires-bite'); put(s, 'tgt', 'rotting-legion', 'p2', 'battlefield');
  addMana(s, 'p1', 1, { colors: ['B'] });
  assert.equal(commands(s).some(c => c.objectId === 'bite' && c.kicked), false);
  assert.equal(execute(s, { type: 'cast_spell', playerId: 'p1', objectId: 'bite', targets: ['tgt'], kicked: true }).ok, false);
  assert.equal(execute(s, { type: 'cast_spell', playerId: 'p1', objectId: 'bite', targets: ['p2'] }).ok, false);
  assert.equal(s.players[0].mana, 1);
});

// CR 119.3: “If an effect causes a player to gain life or lose life, that
// player’s life total is adjusted accordingly.” https://mtg.wiki/page/Life
// CR 2026-08-07, pobrano 2026-09-08. Oracle: “target opponent”, NIE each.
test('B54: Skymarch Bloodletter — cel to jeden przeciwnik, źródło może zniknąć przed resolution', () => {
  const s = game(['p1', 'p2', 'p3']); put(s, 'blood', 'skymarch-bloodletter');
  addMana(s, 'p1', 3, { colors: ['B'] });
  run(s, commands(s).find(c => c.type === 'cast_permanent' && c.objectId === 'blood'));
  for (let i = 0; !find(s, 'skymarch-bloodletter') && i < 6; i++) run(s, commands(s).find(c => c.type === 'pass_priority'));
  const creature = find(s, 'skymarch-bloodletter');
  assert.ok(creature); assert.ok(effectiveKeywords(creature, s).includes('flying'));
  const choose = commands(s).find(c => c.type.startsWith('resolve_') && (c.targets?.includes('p3') || c.targetId === 'p3'));
  assert.equal(commands(s).some(c => c.type === 'resolve_trigger_target' && c.targetId === 'p1'), false);
  run(s, choose);
  moveObjectDirectly(s, creature.id, 'graveyard', 'blood-dead');
  resolve(s);
  assert.equal(life(s, 'p1'), 21); assert.equal(life(s, 'p2'), 20); assert.equal(life(s, 'p3'), 19);
  assert.equal(s.events.some(e => e.type === 'damage_dealt'), false, 'utrata życia nie jest obrażeniami');
});

test("B54: Vampire's Bite — jeden czarny pip nie opłaca bazy i kickera", () => {
  const s = game(); put(s, 'bite', 'vampires-bite'); put(s, 'tgt', 'rotting-legion', 'p1', 'battlefield');
  // colors to profil KAŻDEJ jednostki, nie lista jednostek: 1B + 3U osobno.
  addMana(s, 'p1', 1, { colors: ['B'] });
  addMana(s, 'p1', 3, { colors: ['U'] });
  assert.ok(commands(s).some(c => c.objectId === 'bite' && !c.kicked));
  assert.equal(commands(s).some(c => c.objectId === 'bite' && c.kicked), false);
  assert.equal(execute(s, { type: 'cast_spell', objectId: 'bite', playerId: 'p1', targets: ['tgt'], kicked: true }).ok, false);
  assert.equal(s.players[0].mana, 4);
});

test("B54: Vampire's Bite — stracony cel nie dostaje efektów; lifelink leczy kontrolera stwora, nie czaru", async () => {
  const { dealNonCombatDamage } = await import('../src/engine/effects.js');
  for (const removed of [false, true]) {
    const s = game(); put(s, 'bite', 'vampires-bite'); put(s, 'tgt', 'rotting-legion', 'p2', 'battlefield');
    addMana(s, 'p1', 4, { colors: ['B', 'B'] });
    run(s, commands(s).find(c => c.objectId === 'bite' && c.kicked && c.targets?.[0] === 'tgt'));
    if (removed) moveObjectDirectly(s, 'tgt', 'graveyard', 'dead');
    resolve(s);
    if (removed) {
      assert.equal(effectivePower(s.objects.get('dead'), s), 4);
      assert.equal(effectiveKeywords(s.objects.get('dead'), s).includes('lifelink'), false);
    } else {
      dealNonCombatDamage(s, s.objects.get('tgt'), 'p1', 3);
      assert.equal(life(s, 'p1'), 17); assert.equal(life(s, 'p2'), 23);
    }
  }
});

test('B54: opis PL i wycena bota rozróżniają efekt opłaconego kickera', async () => {
  const { describeSpellEffects } = await import('../src/table/render.js');
  const { createHeuristicBot } = await import('../src/controllers/heuristic-bot.js');
  const def = registry.get('vampires-bite');
  assert.match(describeSpellEffects(def.spell), /jeśli opłacono kicker:/);
  const s = game(); put(s, 'bite', 'vampires-bite'); put(s, 'tgt', 'rotting-legion', 'p1', 'battlefield');
  addMana(s, 'p1', 4, { colors: ['B', 'B'] });
  const view = playerView(s, 'p1');
  const withoutRider = { ...view, zones: { ...view.zones, hand: view.zones.hand.map(o => o.id !== 'bite' ? o
    : { ...o, spell: { ...o.spell, effects: o.spell.effects.filter(e => !e.condition?.wasKicked) } }) } };
  const score = (v, cmd) => {
    const bot = createHeuristicBot({ seed: 54, randomness: 0 });
    bot.chooseCommand({ ...v, legalCommands: [cmd] });
    return bot.trace()[0].score;
  };
  for (const kicked of [false, true]) {
    const cmd = view.legalCommands.find(c => c.objectId === 'bite' && c.targets?.[0] === 'tgt' && Boolean(c.kicked) === kicked);
    assert.ok(cmd);
    if (kicked) assert.notEqual(score(view, cmd), score(withoutRider, cmd), 'kicker włącza wycenę lifelinku');
    else assert.equal(score(view, cmd), score(withoutRider, cmd), 'bez kickera bot nie wycenia nieistniejącego lifelinku');
  }
});

// Żywy Tester s10603: „Cel czaru: Vampire's Bite (8 opcji)” otwierał
// tylko 4 cele. Kicker znikał w commandForSingleTargetSelection (pierwsza
// zgodna komenda). Klucz grupy musi oddzielać płatność PRZED wyborem celu.
test('B54: UI — osobne, nazwane grupy Bite; wybór celu zachowuje opłacony kicker', async () => {
  const { choiceRequestGroupKey, choiceGroupTitle } = await import('../src/table/render.js');
  const { singleTargetPlanOf, commandForSingleTargetSelection } = await import('../src/table/multi-target.js');
  const s = game(); put(s, 'bite', 'vampires-bite');
  put(s, 'own', 'rotting-legion', 'p1', 'battlefield'); put(s, 'foe', 'rotting-legion', 'p2', 'battlefield');
  addMana(s, 'p1', 4, { colors: ['B'] });
  const view = playerView(s, 'p1');
  const casts = view.legalCommands.filter(c => c.type === 'cast_spell' && c.objectId === 'bite');
  assert.equal(casts.length, 4);
  const groups = new Map();
  for (const cmd of casts) {
    const key = choiceRequestGroupKey(cmd);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(cmd);
  }
  assert.equal(groups.size, 2, 'dwa sposoby płatności, nie jeden zgubiony wymiar kreatora');
  const session = { nameOf: id => registry.get(id).name };
  for (const options of groups.values()) {
    assert.equal(options.length, 2);
    const kicked = Boolean(options[0].kicked);
    assert.ok(options.every(c => Boolean(c.kicked) === kicked));
    const title = choiceGroupTitle({ type: 'command', options }, session, view);
    assert.equal(/kicker/i.test(title), kicked, `tytuł rozróżnia płatności: ${title}`);
    const plan = singleTargetPlanOf(options);
    assert.ok(plan);
    const picked = commandForSingleTargetSelection(options, { targetId: 'own', field: plan.field });
    assert.ok(options.includes(picked)); assert.equal(Boolean(picked.kicked), kicked);
  }
});

test('B54: menu karty korzysta z tego samego klucza grupowania czarów co panel', () => {
  const main = fs.readFileSync(new URL('../src/table/main.js', import.meta.url), 'utf8');
  assert.match(main, /if \(cmd\.type === 'cast_spell'\) return choiceRequestGroupKey\(cmd\)/,
    'dowiązanie wspólnego helpera — bez kopii, która sprawdza cele przed kickerem');
});

// CR 608.2b (wydanie 2026-08-07, odczyt 2026-09-08): “If all its
// targets, for every instance of the word ‘target,’ are now illegal, the
// spell or ability doesn’t resolve.” 608.2c: “The controller of the spell
// or ability follows its instructions in the order written.”
// https://mtg.wiki/page/Resolving_spells_and_abilities
// WotC 2016-01-22 (snapshot): “You get the Eldrazi Scion even if the
// controller of the spell pays {1}.”
function counterScenario({ resources = 'land', cardId = 'abstruse-interference' } = {}) {
  const s = game(); s.turn.activePlayerId = s.turn.priorityPlayerId = 'p2';
  put(s, 'spell', 'fleeting-distraction', 'p2'); put(s, 'tgt', 'rotting-legion', 'p2', 'battlefield');
  put(s, 'extra', 'rotting-legion', 'p2'); put(s, 'counter', cardId);
  if (resources === 'land') put(s, 'payer-land', 'basic-island', 'p2', 'battlefield');
  if (resources === 'scion') put(s, 'payer-scion', 'token_eldrazi_scion', 'p2', 'battlefield');
  addMana(s, 'p2', 1, { colors: ['U'] }); addMana(s, 'p1', 3, { colors: ['U'] });
  run(s, commands(s).find(c => c.type === 'cast_spell' && c.objectId === 'spell'));
  const targetId = s.zones.stack.at(-1);
  run(s, commands(s).find(c => c.type === 'pass_priority'));
  run(s, commands(s).find(c => c.type === 'cast_spell' && c.objectId === 'counter'));
  return { s, targetId };
}
function resolveUntilCounterDecision(s) {
  for (let i = 0; i < 8 && !s.pendingCounterPay && !s.pendingDiscardChoice && find(s, 'abstruse-interference', 'stack'); i++) {
    run(s, commands(s).find(c => c.type === 'pass_priority'));
  }
}
for (const resources of ['land', 'none']) for (const pay of resources === 'none' ? [false] : [false, true]) {
  test(`B54: Abstruse — zasoby ${resources}, płaci ${pay}; jeden Scion, zero discard`, () => {
    const { s, targetId } = counterScenario({ resources });
    resolveUntilCounterDecision(s);
    if (resources === 'land') {
      assert.ok(s.pendingCounterPay); assert.equal(find(s, 'token_eldrazi_scion'), undefined);
      run(s, commands(s).find(c => c.type === 'resolve_counter_pay_choice' && c.pay === pay));
    }
    assert.equal(s.objects.get(targetId)?.zone === 'stack', pay);
    assert.equal(s.pendingDiscardChoice, null);
    assert.equal(s.objects.get('extra').zone, 'hand');
    const tokens = [...s.objects.values()].filter(o => o.cardId === 'token_eldrazi_scion' && o.zone === 'battlefield');
    assert.equal(tokens.length, 1); assert.equal(tokens[0].controllerId, 'p1');
    assert.equal(tokens[0].power, 1); assert.equal(tokens[0].toughness, 1); assert.deepEqual(tokens[0].colors, []);
    assert.equal(find(s, 'abstruse-interference', 'graveyard')?.colors.length, 0, 'devoid także poza stosem');
    resolve(s);
    const manaBefore = s.players[0].mana;
    // Mana ability bez {T}: choroba przywołania nie zabrania poświęcenia.
    s.turn.priorityPlayerId = 'p1';
    run(s, commands(s).find(c => c.type === 'activate_ability' && c.objectId === tokens[0].id));
    assert.equal(s.players[0].mana, manaBefore + 1); assert.equal(s.zones.stack.length, 0);
    assert.equal(s.players[0].manaPool[''] >= 1, true, 'rzeczywista mana bezbarwna');
  });
}
test('B54: Abstruse — nielegalny jedyny cel: nie tworzy Sciona', () => {
  const { s, targetId } = counterScenario();
  moveObjectDirectly(s, targetId, 'graveyard', 'gone');
  resolve(s);
  assert.equal(find(s, 'token_eldrazi_scion'), undefined); assert.equal(s.pendingCounterPay, null);
  assert.equal(s.objects.get('extra').zone, 'hand');
});
// CR 608.2g, to samo źródło: “If an effect gives a player the option to
// pay mana, they may activate mana abilities before taking that action.”
test('B54: Abstruse — dopłatę można uzyskać z ręcznie poświęconego Sciona podczas resolution', () => {
  const { s, targetId } = counterScenario({ resources: 'scion' });
  resolveUntilCounterDecision(s);
  assert.ok(s.pendingCounterPay, 'nie auto-kontruj tylko dlatego, że auto-tap nie poświęca tokenów');
  const pendingBefore = s.pendingCounterPay;
  assert.equal(execute(s, { type: 'resolve_counter_pay_choice', playerId: 'p2', pay: true }).ok, false);
  assert.deepEqual(s.pendingCounterPay, pendingBefore, 'odrzucona dopłata nie gubi decyzji');
  run(s, commands(s).find(c => c.type === 'activate_ability' && c.objectId === 'payer-scion'));
  assert.equal(s.objects.get(targetId).zone, 'stack'); assert.ok(s.pendingCounterPay);
  run(s, commands(s).find(c => c.type === 'resolve_counter_pay_choice' && c.pay));
  assert.equal(s.objects.get(targetId).zone, 'stack'); assert.equal(s.pendingCounterPay, null);
  assert.equal(find(s, 'token_eldrazi_scion')?.controllerId, 'p1');
  assert.equal(s.players[1].mana, 0);
});
test('B54: Abstruse — PL opis nie pożycza discard z Frightful Delusion, druk i mana są zgodne', async () => {
  const { describeSpellEffects } = await import('../src/table/render.js');
  const def = registry.get('abstruse-interference'); assert.ok(def);
  const src = JSON.parse(fs.readFileSync(new URL('../docs/cards/scryfall-abstruse-interference.json', import.meta.url)));
  assert.equal(def.oracleText, src.oracle_text); assert.equal(MANA_COSTS[def.id], src.mana_cost);
  assert.equal(def.artId, 602); assert.equal(def.plan, 'Zendikar'); assert.deepEqual(def.colors, []);
  assert.doesNotMatch(describeSpellEffects(def.spell), /odrzuc/);
  assert.match(describeSpellEffects(registry.get('frightful-delusion').spell), /odrzuc/);
});

// Zmiana talii Zendikar ujawniła dwa stare pominięcia wyceny (s4008).
// Nie podnosimy grzechotki remisów i nie stroimy wag: sprawdzamy DANE
// wejściowe istniejących funkcji. Zdolność lądu nie daje dodatkowej many
// ponad tę, którą manaAvailableNow JUŻ policzyło w tym samym lądzie.
test('B54: regresja bota — tap policzonego już lądu nie odblokowuje droższego czaru', async () => {
  const { createHeuristicBot } = await import('../src/controllers/heuristic-bot.js');
  const s = game(); put(s, 'settlement', 'holdout-settlement', 'p1', 'battlefield');
  put(s, 'spell', 'rotting-legion');
  addMana(s, 'p1', 3, { colors: ['B'] }); // razem z lądem 4, nigdy 5
  const bot = createHeuristicBot({ seed: 54, registry }); bot.chooseCommand(playerView(s, 'p1'));
  const option = bot.trace().at(-1).options.find(o => o.cmd === 'activate_ability(settlement#0)');
  assert.ok(option); assert.ok(option.score < 0, JSON.stringify(option));
});
test('B54: regresja bota — damage_each_opponent na aktywacji wycenia dobicie, nie samą bazę', async () => {
  const { createHeuristicBot } = await import('../src/controllers/heuristic-bot.js');
  const scores = [];
  for (const remaining of [20, 1]) {
    const s = game(); put(s, 'welder', 'welder-automaton', 'p1', 'battlefield');
    addMana(s, 'p1', 4, { colors: ['R'] }); s.players[1].life = remaining;
    const bot = createHeuristicBot({ seed: 54, registry }); bot.chooseCommand(playerView(s, 'p1'));
    const option = bot.trace().at(-1).options.find(o => o.cmd === 'activate_ability(welder#0)');
    assert.ok(option); scores.push(option.score);
  }
  assert.ok(scores[1] > scores[0], `dobicie > chip, nie ${scores}`);
});
