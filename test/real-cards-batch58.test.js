// Batch 58 (2026-09-23) — karty właściciela: 219 (FIN), 265 (OGW), 318 (CLB),
// 377 (AVR), 447 (DSK), 464 (AVR), 530 (ZEN).
//
// Dane Oracle i rulingi: `docs/cards/scryfall-*.json` (pobrane 2026-09-23,
// ADR 0030). Katalog: `src/cards/card-data.js`; artId/plan:
// `tools/collection-art-ids.csv`. Plan batcha:
// `docs/plans/PLAN_2026-09-23b-batch58-kolekcja-219-530.md`.
//
// Podział na sekcje = etapy batcha (B1: 265, B2: 530, B3: 464, B4: 377,
// B5: 447, B6: 219, B7: 318). Każda sekcja ma scenariusz legalny, nielegalny
// i interakcje z istniejącym katalogiem (ADR 0010).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { MANA_COSTS } from '../src/cards/mana-costs-data.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { paymentDescriptorOf } from '../src/table/mana-wizard.js';
import { commandLabel } from '../src/table/render.js';

const registry = createCardRegistry();
const SESSION = {
  nameOf: (id) => registry.get(id)?.name ?? String(id),
  nameOfObject: (id) => String(id),
  cardDetails: (id) => registry.get(id) ?? null,
};

function game(players = ['p1', 'p2']) {
  const state = createGameState({ seed: 58, players: players.map((id) => ({ id })) });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  for (const playerId of players) for (let i = 0; i < 4; i++) put(state, `lib-${playerId}-${i}`, 'basic-swamp', playerId, 'library');
  return state;
}

function put(state, id, cardId, playerId = 'p1', zone = 'hand', patch = {}) {
  const def = registry.get(cardId);
  assert.ok(def, `${cardId} w prawdziwym rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId,
    zone, ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes, keywords: def.keywords,
  });
  if (Object.keys(patch).length) state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  return state.objects.get(id);
}

const commands = (s, p = s.turn.priorityPlayerId) => playerView(s, p).legalCommands;

function run(s, cmd) {
  assert.ok(cmd, 'oferta komendy istnieje');
  const r = execute(s, cmd);
  assert.ok(r.ok, JSON.stringify(r.events));
  return r;
}

function resolve(s) {
  for (let i = 0; s.zones.stack.length && i < 40; i++) {
    const choices = commands(s);
    run(s, choices.find((c) => c.type.startsWith('resolve_')) ?? choices.find((c) => c.type === 'pass_priority'));
  }
  assert.equal(s.zones.stack.length, 0, 'cały stos rozstrzygnięty');
}

const find = (s, cardId, zone = 'battlefield') => [...s.objects.values()].find((o) => o.cardId === cardId && o.zone === zone);
const player = (s, id) => s.players.find((p) => p.id === id);
const plain = (html) => String(html).replace(/<[^>]+>/g, '');

// ---- B1: Boulder Salvo (265 OGW, plan Zendikar) -----------------------------

test('B58/B1: Boulder Salvo — dane Oracle + deskryptor surge', () => {
  const def = registry.get('boulder-salvo');
  assert.deepEqual(def.types, ['Sorcery']);
  assert.deepEqual(def.colors, ['R']);
  assert.equal(def.manaCost, 5);
  assert.deepEqual(def.surge, { cost: 3, colors: ['R'] });
  assert.equal(def.set, 'OGW');
  assert.equal(def.plan, 'Zendikar');
  assert.equal(def.artId, 265);
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
  assert.ok(def.imageUri.includes('4e269989'), 'imageUri z druku OGW (ogw/102)');
  assert.equal(MANA_COSTS['boulder-salvo'], '{4}{R}');
});

test('B58/B1: Boulder Salvo — surge oferowany dopiero po innym czarze w turze', () => {
  const without = game();
  addMana(without, 'p1', 10);
  put(without, 'salvo', 'boulder-salvo', 'p1');
  put(without, 'tgt', 'razorfoot-griffin', 'p2', 'battlefield');
  const v1 = playerView(without, 'p1');
  assert.ok(!v1.legalCommands.some((c) => c.type === 'cast_spell' && c.objectId === 'salvo' && c.surgeCast),
    'bez rzuconego wcześniej czaru surge NIE jest oferowany');
  assert.ok(v1.legalCommands.some((c) => c.type === 'cast_spell' && c.objectId === 'salvo' && !c.surgeCast),
    'zwykły rzut za {4}{R} jest dostępny przy 10 manie');

  const withSpell = game();
  addMana(withSpell, 'p1', 10);
  withSpell.spellsCastThisTurnByPlayer = { p1: 1 };
  put(withSpell, 'salvo', 'boulder-salvo', 'p1');
  put(withSpell, 'tgt', 'razorfoot-griffin', 'p2', 'battlefield');
  const v2 = playerView(withSpell, 'p1');
  assert.ok(v2.legalCommands.some((c) => c.type === 'cast_spell' && c.objectId === 'salvo' && c.surgeCast),
    'po rzucie innego czaru surge jest oferowany');
});

test('B58/B1: Boulder Salvo — surge płaci 3 many (nie 5), MV zostaje 5', () => {
  const state = game();
  addMana(state, 'p1', 3); // dokładnie koszt surge {1}{R}
  state.spellsCastThisTurnByPlayer = { p1: 1 };
  put(state, 'salvo', 'boulder-salvo', 'p1');
  put(state, 'tgt', 'razorfoot-griffin', 'p2', 'battlefield');
  const offer = commands(state);
  const surge = offer.find((c) => c.type === 'cast_spell' && c.objectId === 'salvo' && c.surgeCast);
  assert.ok(surge, 'surge oferowany przy 3 manie');
  assert.ok(!offer.some((c) => c.type === 'cast_spell' && c.objectId === 'salvo' && !c.surgeCast),
    'pełny koszt (5) NIE jest opłacalny przy 3 manie');
  run(state, surge);
  assert.equal(player(state, 'p1').mana, 0, 'surge kosztuje 3 many');
  const onStack = find(state, 'boulder-salvo', 'stack');
  assert.equal(onStack.manaCost, 5, 'surge nie zmienia kosztu many/MV (ruling OGW 2016-01-22)');
  assert.equal(onStack.surgeCast, true, 'fakt zapłaty surge jest jawny na obiekcie stosu');
  resolve(state);
  assert.ok(state.events.some((e) => e.type === 'damage_dealt' && e.amount === 4),
    'Boulder Salvo zadaje 4 obrażenia celowi');
});

test('B58/B1: Boulder Salvo — surge bez innego czaru i rzut bez celu odrzucone', () => {
  const state = game();
  addMana(state, 'p1', 10);
  put(state, 'salvo', 'boulder-salvo', 'p1');
  put(state, 'tgt', 'razorfoot-griffin', 'p2', 'battlefield');
  const withoutSpell = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'salvo', targets: ['tgt'], surgeCast: true });
  assert.equal(withoutSpell.ok, false, 'surge bez rzuconego innego czaru jest nielegalny');
  const withoutTarget = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'salvo', targets: [] });
  assert.equal(withoutTarget.ok, false, 'brak celu-stwora odrzuca rzut');
  assert.equal(state.objects.get('salvo').zone, 'hand', 'odrzucona komenda nie rusza karty');
  assert.equal(player(state, 'p1').mana, 10, 'odrzucona komenda nie pobiera many');
});

test('B58/B1: Boulder Salvo — etykieta surge i kreator płatności znają {1}{R}', () => {
  const state = game();
  addMana(state, 'p1', 3);
  state.spellsCastThisTurnByPlayer = { p1: 1 };
  put(state, 'salvo', 'boulder-salvo', 'p1');
  put(state, 'tgt', 'razorfoot-griffin', 'p2', 'battlefield');
  const view = playerView(state, 'p1');
  const surge = view.legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'salvo' && c.surgeCast);
  const normal = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'salvo', targets: ['tgt'] });
  assert.equal(normal.ok, false, 'przy 3 manie zwykły rzut odrzucony (oferta != walidacja)');
  const label = plain(commandLabel(surge, SESSION, view));
  assert.match(label, /surge/i, `etykieta nazywa koszt surge: ${label}`);
  assert.ok(!label.includes('?'), `koszt surge znany w etykiecie: ${label}`);
  const descriptor = paymentDescriptorOf(surge, view);
  assert.ok(descriptor, 'surge ma deskryptor płatności kreatora');
  assert.equal(descriptor.totalNeeded, 3, 'surge {1}{R} = 3 many');
  assert.deepEqual(descriptor.requirements, [['R']], 'pip surge to {R}');
});

// ---- B2: Grazing Gladehart (530 ZEN, plan Zendikar) -------------------------

test('B58/B2: Grazing Gladehart — dane Oracle + trigger landfall „you may"', () => {
  const def = registry.get('grazing-gladehart');
  assert.deepEqual(def.types, ['Creature']);
  assert.deepEqual(def.subtypes, ['Antelope']);
  assert.deepEqual(def.colors, ['G']);
  assert.equal(def.power, 2);
  assert.equal(def.toughness, 2);
  assert.equal(def.manaCost, 3);
  assert.equal(def.set, 'ZEN');
  assert.equal(def.plan, 'Zendikar');
  assert.equal(def.artId, 530);
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
  assert.ok(def.imageUri.includes('078b5290'), 'imageUri z druku zen/163');
  assert.equal(MANA_COSTS['grazing-gladehart'], '{2}{G}');
  const trigger = def.abilities.find((a) => a.trigger?.event === 'land_entered_under_your_control');
  assert.ok(trigger, 'trigger landfall obecny');
  assert.equal(trigger.trigger.mayFire, true, '„you may gain 2 life" = trigger opcjonalny');
  const effect = Array.isArray(trigger.effect) ? trigger.effect[0] : trigger.effect;
  assert.deepEqual({ type: effect.type, amount: effect.amount }, { type: 'gain_life', amount: 2 });
});

test('B58/B2: Grazing Gladehart — land z ręki daje decyzję, „tak" = 2 życia', () => {
  const state = game();
  put(state, 'hart', 'grazing-gladehart', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'drop', 'basic-forest', 'p1');
  const before = player(state, 'p1').life;
  run(state, commands(state).find((c) => c.type === 'play_land' && c.objectId === 'drop'));
  const fire = commands(state).find((c) => c.type === 'resolve_optional_trigger_choice' && c.fire === true);
  assert.ok(fire, 'landfall odpala decyzję „możesz" (ruling: dowolny powód wejścia)');
  run(state, fire);
  resolve(state);
  assert.equal(player(state, 'p1').life, before + 2, '„tak" daje 2 życia');
});

test('B58/B2: Grazing Gladehart — „nie" nic nie robi, a land przeciwnika nie odpala', () => {
  const state = game();
  put(state, 'hart', 'grazing-gladehart', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'drop', 'basic-forest', 'p1');
  const before = player(state, 'p1').life;
  run(state, commands(state).find((c) => c.type === 'play_land' && c.objectId === 'drop'));
  const skip = commands(state).find((c) => c.type === 'resolve_optional_trigger_choice' && c.fire === false);
  assert.ok(skip, 'odmowa też jest ofertą');
  run(state, skip);
  assert.equal(player(state, 'p1').life, before, '„nie" nie daje życia');

  // Tura przeciwnika: „land YOU control" — cudzy land nie odpala.
  const enemy = game();
  put(enemy, 'hart', 'grazing-gladehart', 'p1', 'battlefield', { summoningSickness: false });
  put(enemy, 'enemy-land', 'basic-swamp', 'p2');
  enemy.turn = jumpToStep(enemy.turn, 'main', 'p2');
  enemy.turn.activePlayerId = enemy.turn.priorityPlayerId = 'p2';
  const enemyBefore = player(enemy, 'p1').life;
  run(enemy, commands(enemy).find((c) => c.type === 'play_land' && c.objectId === 'enemy-land'));
  assert.ok(!commands(enemy).some((c) => c.type === 'resolve_optional_trigger_choice'),
    'land przeciwnika nie odpala landfallu („a land YOU control enters")');
  assert.equal(player(enemy, 'p1').life, enemyBefore, 'bez zmiany życia');
});

test('B58/B2: Grazing Gladehart — land z EFEKTU (nie zagrany) też odpala landfall', () => {
  // Ruling ZNR 2024-11-08: landfall „triggers whenever a spell or ability puts
  // a land onto the battlefield under your control" — nie tylko play_land.
  const state = game();
  put(state, 'hart', 'grazing-gladehart', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'elk', 'dawntreader-elk', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'lib-forest', 'basic-forest', 'p1', 'library');
  addMana(state, 'p1', 1, { colors: ['G'] });
  const before = player(state, 'p1').life;
  run(state, commands(state).find((c) => c.type === 'activate_ability' && c.objectId === 'elk'));
  // Zdolność wisi na stosie — passy aż do blokującej decyzji search.
  for (let i = 0; i < 12 && !state.pendingSearchChoice; i += 1) {
    const pass = commands(state).find((c) => c.type === 'pass_priority');
    assert.ok(pass, 'priorytet do oddania');
    run(state, pass);
  }
  const search = commands(state).find((c) => c.type === 'resolve_search_choice' && c.found === 'lib-forest');
  assert.ok(search, 'search podstawowego landa do pola bitwy');
  run(state, search);
  const fire = commands(state).find((c) => c.type === 'resolve_optional_trigger_choice' && c.fire === true);
  assert.ok(fire, 'land z efektu odpala landfall');
  run(state, fire);
  resolve(state);
  assert.equal(player(state, 'p1').life, before + 2, 'landfall z efektu daje 2 życia');
});

// ---- B3: Polluted Dead (464 AVR, plan Wiedźmin) -----------------------------

function passUntil(s, pred, limit = 30) {
  for (let i = 0; i < limit && !pred(s); i += 1) {
    const cmd = commands(s).find((c) => c.type === 'pass_priority');
    assert.ok(cmd, 'priorytet do oddania');
    run(s, cmd);
  }
  assert.ok(pred(s), 'warunek osiągnięty (passy)');
}

test('B58/B3: Polluted Dead — dane Oracle + trigger śmierci z celem-lądem', () => {
  const def = registry.get('polluted-dead');
  assert.deepEqual(def.types, ['Creature']);
  assert.deepEqual(def.subtypes, ['Zombie']);
  assert.deepEqual(def.colors, ['B']);
  assert.equal(def.power, 3);
  assert.equal(def.toughness, 3);
  assert.equal(def.manaCost, 5);
  assert.equal(def.set, 'AVR');
  assert.equal(def.plan, 'Wiedźmin');
  assert.equal(def.artId, 464);
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
  assert.ok(def.imageUri.includes('036c1954'), 'imageUri z druku avr/116');
  assert.equal(MANA_COSTS['polluted-dead'], '{4}{B}');
  const trigger = def.abilities.find((a) => a.trigger?.event === 'dies');
  assert.ok(trigger, 'trigger śmierci obecny');
  assert.deepEqual(trigger.trigger.requiresTarget, { type: 'land' });
  const effect = Array.isArray(trigger.effect) ? trigger.effect[0] : trigger.effect;
  assert.equal(effect.type, 'destroy_permanent');
});

test('B58/B3: Polluted Dead — śmierć niszczy wskazany ląd (cel dowolny)', () => {
  const state = game();
  put(state, 'dead', 'polluted-dead', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'mine', 'basic-forest', 'p1', 'battlefield');
  put(state, 'foe-land', 'basic-swamp', 'p2', 'battlefield');
  put(state, 'burn', 'fiery-fall', 'p1');
  addMana(state, 'p1', 6, { colors: ['R'] });
  run(state, commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'burn'));
  // Czar zabija 3/3 → trigger śmierci czeka na wybór celu (CR 603.3d).
  passUntil(state, (s) => commands(s).some((c) => c.type === 'resolve_trigger_target'));
  const choices = commands(state).filter((c) => c.type === 'resolve_trigger_target');
  const ids = choices.map((c) => c.targetId).filter(Boolean);
  assert.ok(ids.includes('foe-land'), `cudzy ląd jest legalnym celem: ${JSON.stringify(ids)}`);
  assert.ok(ids.includes('mine'), '„target land" nie ogranicza kontrolera — własny ląd też');
  run(state, choices.find((c) => c.targetId === 'foe-land'));
  resolve(state);
  assert.ok(find(state, 'basic-swamp', 'graveyard'), 'wskazany ląd zniszczony (grób)');
  assert.ok(find(state, 'basic-forest', 'battlefield'), 'niewybrany ląd zostaje na polu bitwy');
});

test('B58/B3: Polluted Dead — brak legalnego celu = trigger bez efektu (bez zawieszenia)', () => {
  const state = game(); // brak jakiegokolwiek lądu na polu bitwy
  put(state, 'dead', 'polluted-dead', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'burn', 'fiery-fall', 'p1');
  addMana(state, 'p1', 6, { colors: ['R'] });
  run(state, commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'burn'));
  resolve(state);
  assert.ok(!commands(state).some((c) => c.type === 'resolve_trigger_target'),
    'bez lądu nie ma decyzji celu (trigger schodzi bez efektu)');
  assert.ok(state.events.some((e) => e.type === 'trigger_resolved' && e.reason === 'no_targets'),
    'brak celu jest JAWNY w zdarzeniach (M106/Z2), nie cichy');
  assert.equal(state.zones.stack.length, 0, 'stos pusty — gra nie wisi');
});
