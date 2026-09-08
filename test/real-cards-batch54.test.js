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

// CR 602.1a (2026-08-07, odczyt 2026-09-08): “The activation cost is
// everything before the colon (:). An ability’s activation cost must be
// paid by the player who is activating it.” 602.2: “If, at any point
// during the activation of an ability, a player is unable to comply with
// any of those steps, the activation is illegal; the game returns to the
// moment before that ability started to be activated”.
// https://mtg.wiki/page/Activated_ability
// CR 608.2h: “if it’s no longer in that zone, or if the effect has moved
// it from a public zone to a hidden zone, the effect uses the object’s last
// known information.” https://mtg.wiki/page/Resolving_spells_and_abilities
// WotC 2014-09-20: “Use the toughness of the creature as it last existed
// on the battlefield to determine how much life you gain.” (snapshot Kheru)
for (const sourceChange of ['stays', 'leaves', 'stolen']) {
  test(`B54: Kheru — koszt teraz, LKI efektywnej wytrzymałości później; źródło ${sourceChange}`, async () => {
    const { modifyStats, replaceObject } = await import('../src/engine/permanents.js');
    const { addCounter } = await import('../src/engine/counters.js');
    const s = game(); put(s, 'kheru', 'kheru-dreadmaw', 'p1', 'battlefield');
    put(s, 'victim', 'rotting-legion', 'p1', 'battlefield');
    modifyStats(s, 'victim', { toughness: 2 }); addCounter(s, 'victim', '+1/+1', 1);
    replaceObject(s, s.objects.get('victim'), { damage: 3, tapped: true });
    addMana(s, 'p1', 2, { colors: ['G'] });
    const offer = commands(s).find(c => c.type === 'activate_ability' && c.objectId === 'kheru' && c.sacrificeCreatureId === 'victim');
    run(s, offer);
    assert.equal(find(s, 'rotting-legion'), undefined, 'poświęcenie zapłacone, nie wybór przy resolution');
    assert.equal(life(s, 'p1'), 20, 'zdolność jeszcze na stosie');
    assert.equal(s.zones.stack.length, 1); assert.equal(s.players[0].mana, 0);
    assert.equal(s.objects.get('kheru').tapped, false, 'Oracle nie ma {T}');
    if (sourceChange === 'leaves') moveObjectDirectly(s, 'kheru', 'graveyard', 'dead-kheru');
    if (sourceChange === 'stolen') replaceObject(s, s.objects.get('kheru'), { controllerId: 'p2' });
    // Karta wraca bez modyfikatorów: to nowy obiekt, nie nowe LKI kosztu.
    const graveVictim = find(s, 'rotting-legion', 'graveyard');
    moveObjectDirectly(s, graveVictim.id, 'battlefield', 'returned-victim');
    resolve(s);
    assert.equal(life(s, 'p1'), 28, '5 +2 +1, nie bazowe 5 ani wytrzymałość minus 3 obrażenia');
    assert.equal(life(s, 'p2'), 20);
  });
}
for (const badId of [null, 'kheru', 'foe', 'land', 'hand']) {
  test(`B54: Kheru — odrzuca nielegalny koszt ${badId}, bez wydania many i poświęcenia`, () => {
    const s = game(); put(s, 'kheru', 'kheru-dreadmaw', 'p1', 'battlefield');
    put(s, 'foe', 'rotting-legion', 'p2', 'battlefield');
    put(s, 'land', 'basic-forest', 'p1', 'battlefield'); put(s, 'hand', 'rotting-legion');
    addMana(s, 'p1', 2, { colors: ['G'] });
    assert.equal(commands(s).some(c => c.objectId === 'kheru' && c.type === 'activate_ability'), false);
    const r = execute(s, { type: 'activate_ability', playerId: 'p1', objectId: 'kheru', abilityIndex: 0, sacrificeCreatureId: badId });
    assert.equal(r.ok, false); assert.equal(s.players[0].mana, 2); assert.equal(s.objects.get('land').tapped, false);
    assert.equal(s.zones.stack.length, 0); assert.equal(s.objects.get('kheru').zone, 'battlefield');
  });
}
test('B54: Kheru — pip G, defender i wybór ofiary w kreatorze/PL', async () => {
  const { choiceRequestGroupKey, choiceGroupTitle, commandLabel } = await import('../src/table/render.js');
  const { singleTargetPlanOf, commandForSingleTargetSelection } = await import('../src/table/multi-target.js');
  const s = game(); put(s, 'kheru', 'kheru-dreadmaw', 'p1', 'battlefield');
  put(s, 'victim', 'rotting-legion', 'p1', 'battlefield'); put(s, 'small', 'skymarch-bloodletter', 'p1', 'battlefield');
  addMana(s, 'p1', 2, { colors: ['B'] });
  assert.equal(commands(s).some(c => c.objectId === 'kheru' && c.type === 'activate_ability'), false);
  assert.equal(execute(s, { type: 'activate_ability', playerId: 'p1', objectId: 'kheru', abilityIndex: 0, sacrificeCreatureId: 'victim' }).ok, false);
  assert.equal(s.objects.get('victim').zone, 'battlefield');
  addMana(s, 'p1', 1, { colors: ['G'] });
  const options = commands(s).filter(c => c.objectId === 'kheru' && c.type === 'activate_ability');
  assert.equal(options.length, 2);
  const session = { state: s, nameOf: id => registry.get(id)?.name ?? id, abilitiesOf: id => registry.get(id)?.abilities ?? [],
    nameOfObject: id => registry.get(s.objects.get(id)?.cardId)?.name ?? id };
  assert.ok(choiceRequestGroupKey(options[0])); assert.equal(choiceRequestGroupKey(options[0]), choiceRequestGroupKey(options[1]));
  assert.match(choiceGroupTitle({ type: 'command', options }, session, playerView(s, 'p1')), /Kheru/);
  const label = commandLabel(options.find(c => c.sacrificeCreatureId === 'victim'), session, playerView(s, 'p1'));
  assert.match(label, /Rotting Legion/); assert.match(label, /wytrzymało/); assert.match(label, /innego/);
  const plan = singleTargetPlanOf(options); assert.ok(plan); assert.match(plan.itemLabel, /poświęcenia/);
  const picked = commandForSingleTargetSelection(options, { targetId: 'small', field: plan.singleField });
  assert.equal(picked?.sacrificeCreatureId, 'small');
  s.turn = jumpToStep(s.turn, 'declare_attackers', 'p1');
  s.objects.set('kheru', Object.freeze({ ...s.objects.get('kheru'), summoningSickness: false }));
  assert.equal(commands(s).some(c => c.attackerIds?.includes('kheru')), false);
});
// CR 109.5 (2026-08-07): “For an activated ability, this is the player
// who activated the ability. For a triggered ability, this is the
// controller of the object when the ability triggered”.
// https://mtg.wiki/page/Control_and_ownership — odczyt 2026-09-08.
test('B54: Bloodletter — „you” na triggerze nie zmienia się wraz z kontrolą źródła', async () => {
  const { replaceObject } = await import('../src/engine/permanents.js');
  const s = game(); put(s, 'blood', 'skymarch-bloodletter'); addMana(s, 'p1', 3, { colors: ['B'] });
  run(s, commands(s).find(c => c.type === 'cast_permanent' && c.objectId === 'blood'));
  for (let i = 0; !find(s, 'skymarch-bloodletter') && i < 6; i++) run(s, commands(s).find(c => c.type === 'pass_priority'));
  const source = find(s, 'skymarch-bloodletter'); assert.ok(source);
  const target = commands(s).find(c => c.type === 'resolve_trigger_target'); if (target) run(s, target);
  replaceObject(s, s.objects.get(source.id), { controllerId: 'p2' });
  resolve(s); assert.equal(life(s, 'p1'), 21); assert.equal(life(s, 'p2'), 19);
});
test('B54: Kheru — druk i wycena ofiary: nie oddaje zdrowego dużego stwora za bufor życia', async () => {
  const { createHeuristicBot } = await import('../src/controllers/heuristic-bot.js');
  const def = registry.get('kheru-dreadmaw');
  const src = JSON.parse(fs.readFileSync(new URL('../docs/cards/scryfall-kheru-dreadmaw.json', import.meta.url)));
  assert.equal(def.oracleText, src.oracle_text); assert.equal(def.imageUri, src.image_uris.large);
  assert.equal(MANA_COSTS[def.id], src.mana_cost); assert.equal(def.artId, 603); assert.equal(def.set, 'KTK');
  assert.equal(def.plan, 'Tarkir'); assert.deepEqual(def.support.limitations, []);
  const s = game(); put(s, 'kheru', def.id, 'p1', 'battlefield');
  put(s, 'victim', 'rotting-legion', 'p1', 'battlefield'); addMana(s, 'p1', 2, { colors: ['G'] });
  const bot = createHeuristicBot({ seed: 54, registry }); bot.chooseCommand(playerView(s, 'p1'));
  const option = bot.trace().at(-1).options.find(o => o.cmd.startsWith('activate_ability(kheru#0'));
  assert.ok(option); assert.ok(option.score < 0, JSON.stringify(option));
});
test('B54: Kheru — dwie aktywacje tego samego źródła mają niezależne LKI kosztu', () => {
  const s = game(); put(s, 'kheru', 'kheru-dreadmaw', 'p1', 'battlefield');
  put(s, 'big', 'rotting-legion', 'p1', 'battlefield'); put(s, 'small', 'skymarch-bloodletter', 'p1', 'battlefield');
  addMana(s, 'p1', 4, { colors: ['G'] });
  for (const id of ['big', 'small']) run(s, commands(s).find(c => c.type === 'activate_ability' && c.objectId === 'kheru' && c.sacrificeCreatureId === id));
  assert.equal(s.zones.stack.length, 2); assert.equal(life(s, 'p1'), 20);
  resolve(s); assert.equal(life(s, 'p1'), 27, '5 i 2, nie dwukrotnie ostatnie 2');
});

// B3 — MID release notes (https://mtg.wiki/page/Coven, fetched 2026-09-08):
// “You must control three or more creatures with different powers at the time
// the ability triggers and at the time the ability tries to resolve. They do
// not, however, need to be the same set of creatures in both cases.”
// CR 603.4 (https://mtg.wiki/page/Triggered_ability, 2026-08-07):
// “If the ability triggers, it checks the stated condition again as it resolves.
// If the condition isn't true at that time, the ability is removed from the
// stack and does nothing.”
for (const [id, artId, set, plan] of [
  ['candlegrove-witch', 599, 'MID', 'Wiedźmin'],
  ['consign-to-dream', 605, 'SHM', 'Lorwyn'],
]) test(`B54 B3: ${id} — druk i pełny Oracle`, () => {
  const def = registry.get(id);
  const src = JSON.parse(fs.readFileSync(new URL(`../docs/cards/scryfall-${id}.json`, import.meta.url)));
  assert.ok(def); assert.equal(def.artId, artId); assert.equal(def.set, set); assert.equal(def.plan, plan);
  assert.equal(def.oracleText, src.oracle_text); assert.equal(def.imageUri, src.image_uris.large);
  assert.equal(MANA_COSTS[id], src.mana_cost); assert.equal(def.manaCost, src.cmc);
  assert.deepEqual(def.colors, src.colors); assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
});

async function covenBoard(powers, active = 'p1') {
  const { processTriggers } = await import('../src/engine/triggers.js');
  const { replaceObject } = await import('../src/engine/permanents.js');
  const s = game(); put(s, 'witch', 'candlegrove-witch', 'p1', 'battlefield');
  for (let i = 0; i < powers.length; i++) {
    const o = put(s, `friend-${i}`, 'rotting-legion', 'p1', 'battlefield');
    replaceObject(s, o, { power: powers[i] });
  }
  s.turn = jumpToStep(s.turn, 'beginning_of_combat', active);
  s.turn.activePlayerId = s.turn.priorityPlayerId = active;
  processTriggers(s, [{ type: 'step_advanced', step: 'beginning_of_combat' }]);
  return s;
}
for (const [powers, active, expected] of [
  [[2, 2], 'p1', 0], [[1, 2], 'p1', 0], [[1, 3], 'p1', 1], [[1, 3], 'p2', 0],
]) test(`B54 coven: moce [2,${powers}], tura ${active} → ${expected} trigger`, async () => {
  const s = await covenBoard(powers, active);
  assert.equal(s.zones.stack.length, expected);
  if (expected) {
    resolve(s); assert.ok(effectiveKeywords(s.objects.get('witch'), s).includes('flying'));
    const { clearStatModifiers } = await import('../src/engine/permanents.js');
    clearStatModifiers(s);
    assert.equal(effectiveKeywords(s.objects.get('witch'), s).includes('flying'), false);
  }
});
test('B54 coven: aktualne efektywne moce w obu sprawdzeniach, nie zamrożona grupa', async () => {
  const { modifyStats, replaceObject } = await import('../src/engine/permanents.js');
  const { processTriggers } = await import('../src/engine/triggers.js');
  const s = await covenBoard([2, 3]); assert.equal(s.zones.stack.length, 0);
  modifyStats(s, 'friend-0', { power: -1 }); // bazowe 2, efektywne 1
  processTriggers(s, [{ type: 'step_advanced', step: 'beginning_of_combat' }]);
  assert.equal(s.zones.stack.length, 1);
  moveObjectDirectly(s, 'friend-0', 'graveyard', 'gone');
  const replacement = put(s, 'replacement', 'rotting-legion', 'p1', 'battlefield');
  replaceObject(s, replacement, { power: -1 }); // ujemna moc też jest odrębną wartością
  resolve(s); assert.ok(effectiveKeywords(s.objects.get('witch'), s).includes('flying'));
});
test('B54 coven: utrata trzeciej mocy w odpowiedzi blokuje efekt', async () => {
  const { modifyStats } = await import('../src/engine/permanents.js');
  const s = await covenBoard([1, 3]); assert.equal(s.zones.stack.length, 1);
  modifyStats(s, 'friend-1', { power: -1 });
  resolve(s); assert.equal(effectiveKeywords(s.objects.get('witch'), s).includes('flying'), false);
});
test('B54 coven: cudze stwory się nie liczą, odejście źródła nie daje flying nowemu ID', async () => {
  const { processTriggers } = await import('../src/engine/triggers.js');
  const s = await covenBoard([1]);
  put(s, 'enemy', 'rotting-legion', 'p2', 'battlefield');
  processTriggers(s, [{ type: 'step_advanced', step: 'beginning_of_combat' }]);
  assert.equal(s.zones.stack.length, 0);
  put(s, 'third', 'rotting-legion', 'p1', 'battlefield');
  processTriggers(s, [{ type: 'step_advanced', step: 'beginning_of_combat' }]);
  assert.equal(s.zones.stack.length, 1);
  moveObjectDirectly(s, 'witch', 'hand', 'returned-witch');
  resolve(s); assert.equal(effectiveKeywords(s.objects.get('returned-witch'), s).includes('flying'), false);
});

// Consign Oracle (snapshot): “Return target permanent to its owner's hand.
// If that permanent is green or red, put it on top of its owner's library instead.”
// CR 608.2h (https://mtg.wiki/page/Resolving_spells_and_abilities, fetched 2026-09-08):
// “If an effect requires information from the game ... the answer is determined
// only once, when the effect is applied.”
for (const [colors, destination] of [[[], 'hand'], [['U'], 'hand'], [['R'], 'library'], [['G'], 'library'], [['W','G'], 'library']]) {
  test(`B54 Consign: kolory ${colors} → ${destination} właściciela, bez pośredniej ręki`, async () => {
    const { replaceObject } = await import('../src/engine/permanents.js');
    const s = game(); put(s, 'spell', 'consign-to-dream');
    const target = put(s, 'target', 'basic-forest', 'p2', 'battlefield');
    replaceObject(s, target, { colors, controllerId: 'p1' });
    addMana(s, 'p1', 3, { colors: ['U'] });
    run(s, commands(s).find(c => c.type === 'cast_spell' && c.objectId === 'spell' && c.targets?.[0] === 'target'));
    resolve(s);
    assert.equal(s.objects.has('target'), false);
    const moved = find(s, 'basic-forest', destination);
    assert.ok(moved); assert.equal(moved.ownerId, 'p2'); assert.equal(moved.controllerId, 'p2');
    if (destination === 'library') {
      assert.equal(s.zones.library.filter(id => s.objects.get(id).ownerId === 'p2')[0], moved.id);
      assert.equal(s.events.some(e => e.fromId === 'target' && e.toZone === 'hand'), false);
    }
  });
}
test('B54 Consign: kolor zmieniony w odpowiedzi i zakryty permanent (efektywne kolory)', async () => {
  const { replaceObject } = await import('../src/engine/permanents.js');
  for (const faceDown of [false, true]) {
    const s = game(); put(s, 'spell', 'consign-to-dream');
    put(s, 'target', 'rotting-legion', 'p2', 'battlefield');
    addMana(s, 'p1', 3, { colors: ['U'] });
    run(s, commands(s).find(c => c.type === 'cast_spell' && c.targets?.[0] === 'target'));
    replaceObject(s, s.objects.get('target'), { colors: ['G'], faceDown });
    resolve(s); assert.ok(find(s, 'rotting-legion', faceDown ? 'hand' : 'library'));
  }
});
test('B54 Consign: cel opuścił pole bitwy → fizzle, nie przenieś ponownie', () => {
  const s = game(); put(s, 'spell', 'consign-to-dream'); put(s, 'target', 'basic-forest', 'p2', 'battlefield');
  addMana(s, 'p1', 3, { colors: ['U'] });
  run(s, commands(s).find(c => c.type === 'cast_spell' && c.targets?.[0] === 'target'));
  moveObjectDirectly(s, 'target', 'graveyard', 'gone'); resolve(s);
  assert.equal(s.objects.get('gone').zone, 'graveyard'); assert.ok(find(s, 'consign-to-dream', 'graveyard'));
});
test('B54 B3: opisy PL zawierają coven oraz obie strefy Consign', async () => {
  const { describeSpellEffects, rulesText } = await import('../src/table/render.js');
  assert.match(describeSpellEffects(registry.get('consign-to-dream').spell), /czerwony|zielony/);
  const text = rulesText({ ...registry.get('candlegrove-witch'), controllerId: 'p1' });
  assert.match(text, /3 różnych wartościach siły/); assert.match(text, /coven/);
  assert.match(text, /w turze twojej/); assert.match(text, /[Ll]atanie/);
});

test('B54 B3: pipy kosztów, negatywne cele Consign i ochrona', async () => {
  const { replaceObject } = await import('../src/engine/permanents.js');
  for (const id of ['candlegrove-witch', 'consign-to-dream']) {
    for (const [mana, colors] of [[0, []], [5, ['B']]]) {
      const s = game(); put(s, 'card', id); put(s, 'target', 'rotting-legion', 'p2', 'battlefield');
      if (mana) addMana(s, 'p1', mana, { colors });
      assert.equal(commands(s).some(c => c.objectId === 'card' && c.type.startsWith('cast_')), false);
      assert.equal(execute(s, { type: id === 'consign-to-dream' ? 'cast_spell' : 'cast_permanent',
        playerId: 'p1', objectId: 'card', targets: ['target'] }).ok, false);
      assert.equal(s.players[0].mana, mana); assert.equal(s.objects.get('card').zone, 'hand');
    }
  }
  for (const protection of [{}, { keywords: ['hexproof'] }, { protectionFromColors: ['U'] }]) {
    const s = game(); put(s, 'card', 'consign-to-dream');
    const target = put(s, 'target', 'rotting-legion', 'p2', Object.keys(protection).length ? 'battlefield' : 'hand');
    replaceObject(s, target, protection); addMana(s, 'p1', 3, { colors: ['U'] });
    assert.equal(commands(s).some(c => c.type === 'cast_spell' && c.targets?.[0] === 'target'), false);
    assert.equal(execute(s, { type: 'cast_spell', playerId: 'p1', objectId: 'card', targets: ['target'] }).ok, false);
    assert.equal(s.players[0].mana, 3);
    assert.equal(execute(s, { type: 'cast_spell', playerId: 'p1', objectId: 'card', targets: ['p2'] }).ok, false);
  }
});
test('B54 Consign: bot wycenia usunięcie wroga, odrzuca własny cel', async () => {
  const { createHeuristicBot } = await import('../src/controllers/heuristic-bot.js');
  const s = game(); put(s, 'spell', 'consign-to-dream');
  put(s, 'own', 'rotting-legion', 'p1', 'battlefield'); put(s, 'enemy', 'rotting-legion', 'p2', 'battlefield');
  addMana(s, 'p1', 3, { colors: ['U'] });
  const bot = createHeuristicBot({ seed: 54, registry });
  const chosen = bot.chooseCommand(playerView(s, 'p1'));
  assert.equal(chosen.type, 'cast_spell'); assert.deepEqual(chosen.targets, ['enemy']);
  const options = bot.trace().at(-1).options;
  assert.ok(options.some(o => o.cmd.includes('own') && o.score < 0), JSON.stringify(options));
});

// B3b — Exploding Borders (Oracle+rulings w zapisanym snapshotcie).
// WotC 2009-02-01: “You do what the spell says in order, so you'll put a new
// basic land card onto the battlefield before you determine the value of X.”
// “Exploding Borders will still deal damage even if you don't put a land card
// onto the battlefield.” CR 608.2b: “If all its targets ... are now illegal,
// the spell or ability doesn't resolve.” (mtg.wiki/Resolving_spells_and_abilities).
function bordersBoard() {
  const s = game(); put(s, 'borders', 'exploding-borders');
  put(s, 'forest', 'basic-forest', 'p1', 'battlefield');
  put(s, 'mountain', 'basic-mountain', 'p1', 'battlefield');
  put(s, 'search-plains', 'basic-plains', 'p1', 'library');
  addMana(s, 'p1', 4, { colors: ['R','G'] }); return s;
}
function bordersToSearch(s, target = 'p2') {
  run(s, commands(s).find(c => c.type === 'cast_spell' && c.objectId === 'borders' && c.targets?.[0] === target));
  for (let i = 0; !s.pendingSearchChoice && s.zones.stack.length && i < 10; i++) {
    run(s, commands(s).find(c => c.type === 'pass_priority'));
  }
  assert.ok(s.pendingSearchChoice); assert.ok(s.pendingSpell);
}
test('B54 Borders: druk, Oracle i domain dopiero po search (wstrzymanie, tapped, shuffle, raz)', () => {
  const def = registry.get('exploding-borders'); assert.ok(def);
  const src = JSON.parse(fs.readFileSync(new URL('../docs/cards/scryfall-exploding-borders.json', import.meta.url)));
  assert.equal(def.oracleText, src.oracle_text); assert.equal(def.imageUri, src.image_uris.large);
  assert.equal(MANA_COSTS[def.id], src.mana_cost); assert.equal(def.artId, 601); assert.equal(def.plan, 'Alara');
  assert.deepEqual(def.colors, ['G','R']); assert.equal(def.support.status, 'supported');
  const s = bordersBoard(); bordersToSearch(s);
  assert.equal(life(s, 'p2'), 20); assert.ok(find(s, def.id, 'stack'));
  run(s, commands(s, 'p1').find(c => c.type === 'resolve_search_choice' && c.found === 'search-plains'));
  assert.equal(life(s, 'p2'), 17); assert.equal(find(s, 'basic-plains').tapped, true);
  assert.equal(s.pendingSpell, null); assert.equal(s.pendingSearchChoice, null);
  assert.ok(find(s, def.id, 'graveyard'));
  const damage = s.events.filter(e => e.type === 'damage_dealt' && e.sourceCardId === def.id);
  assert.equal(damage.length, 1); assert.equal(damage[0].amount, 3);
  assert.ok(s.events.some(e => e.type === 'library_searched' && e.shuffled));
});
test('B54 Borders: fail-to-find nadal zadaje obrażenia, search nie bierze nonbasic', async () => {
  const { replaceObject } = await import('../src/engine/permanents.js');
  const s = bordersBoard();
  const nonbasic = put(s, 'nonbasic', 'basic-island', 'p1', 'library');
  replaceObject(s, nonbasic, { types: ['Land'] });
  bordersToSearch(s);
  assert.equal(commands(s, 'p1').some(c => c.found === 'nonbasic'), false);
  assert.equal(execute(s, { type: 'resolve_search_choice', playerId: 'p1', found: 'nonbasic' }).ok, false);
  assert.ok(s.pendingSearchChoice); assert.equal(life(s, 'p2'), 20);
  run(s, commands(s, 'p1').find(c => c.type === 'resolve_search_choice' && c.found === null));
  assert.equal(life(s, 'p2'), 18); assert.ok(find(s, 'exploding-borders', 'graveyard'));
});
// DMU release notes (mtg.wiki/Domain, fetched2026-09-08): “The basic land
// types are Plains, Island, Swamp, Mountain, and Forest. Land types other
// than basic land types (such as Desert) don't contribute to domain abilities.”
test('B54 Borders: domain = odrębne aktualne typy własnych landów, także nonbasic', async () => {
  const { replaceObject, grantBasicLandTypeUntilEndOfTurn } = await import('../src/engine/permanents.js');
  const s = bordersBoard(); put(s, 'forest2', 'basic-forest', 'p1', 'battlefield');
  const dual = put(s, 'dual', 'basic-swamp', 'p1', 'battlefield');
  replaceObject(s, dual, { types: ['Land'], subtypes: ['Island','Swamp','Desert'] });
  put(s, 'opponent-plains', 'basic-plains', 'p2', 'battlefield');
  const nonland = put(s, 'nonland', 'rotting-legion', 'p1', 'battlefield');
  replaceObject(s, nonland, { subtypes: ['Plains'] });
  bordersToSearch(s);
  run(s, commands(s, 'p1').find(c => c.type === 'resolve_search_choice' && c.found === null));
  assert.equal(life(s, 'p2'), 16, 'Forest, Mountain, Island, Swamp (nie cudzy/niestworzony Plains)');
  const s2 = bordersBoard();
  grantBasicLandTypeUntilEndOfTurn(s2, 'forest', 'Island');
  put(s2, 'island', 'basic-island', 'p1', 'battlefield');
  bordersToSearch(s2);
  run(s2, commands(s2, 'p1').find(c => c.type === 'resolve_search_choice' && c.found === null));
  assert.equal(life(s2, 'p2'), 18, 'Island+Mountain; bazowy Forest zastąpiony');
});
test('B54 Borders: zero domain to 0 obrażeń, maksymalnie pięć typów', async () => {
  for (const all of [false, true]) {
    const s = bordersBoard();
    for (const id of ['forest','mountain']) moveObjectDirectly(s, id, 'graveyard', `gone-${id}`);
    if (all) for (const slug of ['plains','island','swamp','mountain','forest']) put(s, `land-${slug}`, `basic-${slug}`, 'p1', 'battlefield');
    bordersToSearch(s); run(s, commands(s, 'p1').find(c => c.type === 'resolve_search_choice' && c.found === null));
    assert.equal(life(s, 'p2'), all ? 15 : 20);
  }
});

// CR120.3c (mtg.wiki/Damage chunk1, CR2026-08-07, fetched2026-09-08):
// “Damage dealt to a planeswalker causes that many loyalty counters to be
// removed from that planeswalker.” CR306.9 (mtg.wiki/Planeswalker chunk2):
// “If a planeswalker’s loyalty is 0, it’s put into its owner’s graveyard.”
// Stan testowy typu PW — nie nowa karta w katalogu/kolekcji (ADR0029).
async function pwFixture(s, loyalty, patch = {}) {
  const { replaceObject } = await import('../src/engine/permanents.js');
  const o = put(s, 'walker', 'rotting-legion', 'p2', 'battlefield');
  return replaceObject(s, o, { kind: 'planeswalker', types: ['Planeswalker'], power: null, toughness: null,
    counters: { loyalty }, ...patch });
}
for (const loyalty of [2, 5]) test(`B54 Borders: cel PW loyalty${loyalty} → usuń 3 liczniki; zero to SBA, nie obrażenia na stwora`, async () => {
  const s = bordersBoard(); await pwFixture(s, loyalty, { keywords: ['indestructible'], ownerId: 'p1' });
  bordersToSearch(s, 'walker');
  run(s, commands(s, 'p1').find(c => c.type === 'resolve_search_choice' && c.found === 'search-plains'));
  assert.equal(life(s, 'p2'), 20);
  if (loyalty === 5) {
    assert.equal(s.objects.get('walker').counters.loyalty, 2); assert.equal(s.objects.get('walker').damage, 0);
  } else {
    assert.equal(s.objects.has('walker'), false);
    assert.equal(find(s, 'rotting-legion', 'graveyard')?.ownerId, 'p1');
    assert.equal(s.events.some(e => e.type === 'creature_destroyed' && e.fromId === 'walker'), false);
  }
});
test('B54 Borders: PW znika przed resolution → brak całego search; stwór/land nie są celami', async () => {
  const s = bordersBoard(); await pwFixture(s, 5);
  put(s, 'creature', 'rotting-legion', 'p2', 'battlefield');
  const casts = commands(s).filter(c => c.type === 'cast_spell' && c.objectId === 'borders');
  assert.ok(casts.some(c => c.targets?.[0] === 'p1')); assert.ok(casts.some(c => c.targets?.[0] === 'p2'));
  for (const target of ['forest','creature','search-plains']) {
    assert.equal(casts.some(c => c.targets?.[0] === target), false);
    assert.equal(execute(s, { type: 'cast_spell', playerId: 'p1', objectId: 'borders', targets: [target] }).ok, false);
  }
  run(s, casts.find(c => c.targets?.[0] === 'walker'));
  moveObjectDirectly(s, 'walker', 'graveyard', 'gone-walker'); resolve(s);
  assert.equal(s.pendingSearchChoice, null); assert.equal(s.objects.get('search-plains').zone, 'library');
  assert.equal(life(s, 'p2'), 20); assert.equal(s.events.some(e => e.type === 'library_searched' && e.shuffled), false);
});
test('B54 Borders: PW otrzymuje ochronę od czerwonego w odpowiedzi → brak search', async () => {
  const { replaceObject } = await import('../src/engine/permanents.js');
  const s = bordersBoard(); await pwFixture(s, 5);
  run(s, commands(s).find(c => c.type === 'cast_spell' && c.targets?.[0] === 'walker'));
  replaceObject(s, s.objects.get('walker'), { protectionFromColors: ['R'] }); resolve(s);
  assert.equal(s.pendingSearchChoice, null); assert.equal(s.objects.get('search-plains').zone, 'library');
  assert.equal(s.objects.get('walker').counters.loyalty, 5);
});
test('B54 Borders: czar sorcery, dwa wymagane kolory', () => {
  for (const colors of [['R'], ['G'], ['U']]) {
    const s = game(); put(s, 'borders', 'exploding-borders'); addMana(s, 'p1', 9, { colors });
    assert.equal(commands(s).some(c => c.objectId === 'borders' && c.type === 'cast_spell'), false);
    assert.equal(execute(s, { type: 'cast_spell', playerId: 'p1', objectId: 'borders', targets: ['p2'] }).ok, false);
    assert.equal(s.players[0].mana, 9);
  }
  const s = bordersBoard(); s.turn = jumpToStep(s.turn, 'beginning_of_combat', 'p1');
  assert.equal(commands(s).some(c => c.objectId === 'borders' && c.type === 'cast_spell'), false);
});
test('B54 Borders: PL domain i bot rozpoznaje obrażenia (bez czytania biblioteki)', async () => {
  const { describeSpellEffects } = await import('../src/table/render.js');
  const { createHeuristicBot } = await import('../src/controllers/heuristic-bot.js');
  assert.match(describeSpellEffects(registry.get('exploding-borders').spell), /typów.*ląd/);
  const s = bordersBoard(); s.players[1].life = 2;
  const bot = createHeuristicBot({ seed: 54, registry });
  const chosen = bot.chooseCommand(playerView(s, 'p1'));
  assert.equal(chosen.type, 'cast_spell'); assert.equal(chosen.targets?.[0], 'p2');
  assert.ok(bot.trace().at(-1).options.some(o => o.cmd.includes('p2') && o.score >= 1000));
});

test('B54 PW: prewencja, lifelink i infect; hybryda creature/PW ma oba skutki obrażeń', async () => {
  const { dealNonCombatDamage } = await import('../src/engine/effects.js');
  const { replaceObject } = await import('../src/engine/permanents.js');
  for (const creature of [false, true]) for (const infect of [false, true]) {
    const s = game();
    await pwFixture(s, 5, creature ? { kind: 'creature', types: ['Creature','Planeswalker'], power: 4, toughness: 4 } : {});
    const src = put(s, 'src', 'rotting-legion', 'p1', 'battlefield');
    const source = replaceObject(s, src, { keywords: ['lifelink', ...(infect ? ['infect'] : [])] });
    s.damageShields = [{ targetId: 'walker', remaining: 1 }];
    assert.equal(dealNonCombatDamage(s, source, 'walker', 3), 2);
    const o = s.objects.get('walker');
    assert.equal(o.counters.loyalty, 3); assert.equal(life(s, 'p1'), 22);
    assert.equal(o.counters['-1/-1'] ?? 0, creature && infect ? 2 : 0);
    assert.equal(o.damage, creature && !infect ? 2 : 0);
  }
});
test('B54 PW: damage any_target zachowuje zwykłe cele i dopuszcza planeswalkera', async () => {
  const s = game(); await pwFixture(s, 3); put(s, 'shock', 'shock');
  addMana(s, 'p1', 1, { colors: ['R'] });
  const offers = commands(s).filter(c => c.type === 'cast_spell' && c.objectId === 'shock');
  assert.ok(offers.some(c => c.targets?.[0] === 'p2'));
  run(s, offers.find(c => c.targets?.[0] === 'walker')); resolve(s);
  assert.equal(s.objects.get('walker').counters.loyalty, 1);
});
test('B54 Borders: wycena search preferuje nowy typ; widok przeciwnika nie ujawnia kandydatów', async () => {
  const { createHeuristicBot } = await import('../src/controllers/heuristic-bot.js');
  const s = bordersBoard(); put(s, 'duplicate-forest', 'basic-forest', 'p1', 'library');
  bordersToSearch(s);
  assert.equal(playerView(s, 'p2').pendingSearchChoice.cards, null);
  const view = playerView(s, 'p1');
  const score = (cmd) => {
    const b = createHeuristicBot({ seed: 54, registry }); b.chooseCommand({ ...view, legalCommands: [cmd] });
    return b.trace()[0].score;
  };
  const duplicate = view.legalCommands.find(c => c.found === 'duplicate-forest');
  const fresh = view.legalCommands.find(c => c.found === 'search-plains');
  assert.ok(duplicate); assert.ok(fresh); assert.ok(score(fresh) > score(duplicate));
});
test('B54 UI: bounce top/bottom nie kłamie o ręce, SBA0 lojalności jest widoczne', async () => {
  const { describeGameEvent, isBotMoveNoise } = await import('../src/table/session.js');
  assert.equal(isBotMoveNoise({ type: 'object_moved', bounced: true }), false);
  assert.equal(isBotMoveNoise({ type: 'object_moved', sba: 'zero_loyalty' }), false);
  assert.equal(isBotMoveNoise({ type: 'object_moved' }), true);
  const helpers = { nameOf: id => registry.get(id)?.name ?? id, nameOfObject: id => id };
  for (const [zone, extra, pattern] of [['hand', {}, /ręki/], ['library', { toTop: true }, /wierzch.*biblioteki/], ['library', { toBottom: true }, /spód.*biblioteki/]]) {
    const text = describeGameEvent({ type: 'object_moved', bounced: true, toZone: zone, ...extra,
      object: { cardId: 'rotting-legion', controllerId: 'p2' } }, helpers);
    assert.match(text, pattern);
    if (zone === 'library') assert.doesNotMatch(text, /ręki/);
  }
  const text = describeGameEvent({ type: 'object_moved', fromId: 'walker', toZone: 'graveyard', sba: 'zero_loyalty',
    cardId: 'rotting-legion', object: { cardId: 'rotting-legion' } }, helpers);
  assert.match(text, /lojalno/); assert.match(text, /gr[oó]b|grobu/);
});
// CR120.4b: “Second, damage is dealt, as modified by replacement and
// prevention effects that interact with damage.” (mtg.wiki/Damage chunk1).
// CR122.1c (mtg.wiki/Shield_counter, fetched2026-09-08):
// “If damage would be dealt to this permanent, prevent that damage and remove
// a shield counter from it.”
// Efekt tarczy ma być widoczny PRZED damage_dealt i lifelink, nie tylko
// przy zaznaczaniu obrażeń. Ten sam kontrakt dla PW oraz zwykłego stwora.
test('B54 damage: licznik tarczy zapobiega rzeczywistym obrażeniom i lifelinkowi', async () => {
  const { dealNonCombatDamage } = await import('../src/engine/effects.js');
  const { replaceObject } = await import('../src/engine/permanents.js');
  const { addCounter } = await import('../src/engine/counters.js');
  for (const pw of [true, false]) {
    const s = game();
    if (pw) await pwFixture(s, 5); else put(s, 'walker', 'rotting-legion', 'p2', 'battlefield');
    addCounter(s, 'walker', 'shield', 1);
    const source = replaceObject(s, put(s, 'src', 'rotting-legion', 'p1', 'battlefield'), { keywords: ['lifelink'] });
    assert.equal(dealNonCombatDamage(s, source, 'walker', 3), 0);
    assert.equal(life(s, 'p1'), 20); assert.equal(s.objects.get('walker').damage, 0);
    assert.equal(s.objects.get('walker').counters.shield ?? 0, 0);
    if (pw) assert.equal(s.objects.get('walker').counters.loyalty, 5);
    assert.equal(s.events.filter(e => e.type === 'damage_dealt').at(-1).amount, 0);
  }
});

test('B54 shield CR122.1c: oba kierunki walki, infect/lifelink, tylko jeden licznik na zdarzenie', async () => {
  const { replaceObject } = await import('../src/engine/permanents.js');
  const { addCounter } = await import('../src/engine/counters.js');
  for (const victim of ['attacker', 'blocker']) for (const infect of [false, true]) {
    const s = game();
    for (const [id, owner] of [['attacker','p1'],['blocker','p2']]) {
      const o = put(s, id, 'rotting-legion', owner, 'battlefield');
      replaceObject(s, o, { power: 3, toughness: 10, summoningSickness: false, tapped: false,
        keywords: id === victim ? [] : ['lifelink', ...(infect ? ['infect'] : [])] });
    }
    addCounter(s, victim, 'shield', 2);
    s.turn = jumpToStep(s.turn, 'declare_attackers', 'p1');
    run(s, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['attacker'] });
    s.turn.priorityPlayerId = 'p2';
    run(s, { type: 'declare_blockers', playerId: 'p2', assignments: { attacker: ['blocker'] } });
    s.turn.priorityPlayerId = 'p1';
    const result = execute(s, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' });
    assert.ok(result.ok, JSON.stringify(result.events));
    assert.equal(s.objects.get(victim).counters.shield, 1);
    assert.equal(s.objects.get(victim).counters['-1/-1'] ?? 0, 0);
    assert.equal(s.objects.get(victim).damage, 0);
    assert.equal(life(s, 'p1'), 20); assert.equal(life(s, 'p2'), 20);
    assert.equal(result.events.find(e => e.type === 'damage_dealt' && e.target === victim)?.amount, 0);
    assert.ok(result.events.some(e => e.type === 'shield_consumed' && e.objectId === victim));
  }
});
