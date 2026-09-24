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
import { getSourceForObject } from '../src/engine/mana-sources.js';
import { paymentDescriptorOf } from '../src/table/mana-wizard.js';
import { resolveUntilDecision, optionalTriggerOpen } from './helpers/deferred-trigger.js';
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
  // M428: Surge {1}{R} to DWIE many (`cost` = suma symboli, nie część generyczna).
  assert.deepEqual(def.surge, { cost: 2, colors: ['R'] });
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

test('B58/B1: Boulder Salvo — surge płaci 2 many (nie 5), MV zostaje 5', () => {
  const state = game();
  addMana(state, 'p1', 2); // dokładnie koszt surge {1}{R} = 2 many (M428)
  state.spellsCastThisTurnByPlayer = { p1: 1 };
  put(state, 'salvo', 'boulder-salvo', 'p1');
  put(state, 'tgt', 'razorfoot-griffin', 'p2', 'battlefield');
  const offer = commands(state);
  const surge = offer.find((c) => c.type === 'cast_spell' && c.objectId === 'salvo' && c.surgeCast);
  assert.ok(surge, 'surge oferowany przy 2 manie');
  assert.ok(!offer.some((c) => c.type === 'cast_spell' && c.objectId === 'salvo' && !c.surgeCast),
    'pełny koszt (5) NIE jest opłacalny przy 2 manie');
  run(state, surge);
  assert.equal(player(state, 'p1').mana, 0, 'surge kosztuje 2 many');
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
  addMana(state, 'p1', 2);
  state.spellsCastThisTurnByPlayer = { p1: 1 };
  put(state, 'salvo', 'boulder-salvo', 'p1');
  put(state, 'tgt', 'razorfoot-griffin', 'p2', 'battlefield');
  const view = playerView(state, 'p1');
  const surge = view.legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'salvo' && c.surgeCast);
  const normal = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'salvo', targets: ['tgt'] });
  assert.equal(normal.ok, false, 'przy 2 manie zwykły rzut odrzucony (oferta != walidacja)');
  const label = plain(commandLabel(surge, SESSION, view));
  assert.match(label, /surge/i, `etykieta nazywa koszt surge: ${label}`);
  assert.ok(!label.includes('?'), `koszt surge znany w etykiecie: ${label}`);
  const descriptor = paymentDescriptorOf(surge, view);
  assert.ok(descriptor, 'surge ma deskryptor płatności kreatora');
  assert.equal(descriptor.totalNeeded, 2, 'surge {1}{R} = 2 many (M428)');
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
  // Etap F (CR 603.5): landfall idzie na stos; „you may" przy rozstrzyganiu.
  assert.equal(state.pendingOptionalTrigger, null, 'brak pytania w chwili odpalenia');
  assert.ok(resolveUntilDecision(state, optionalTriggerOpen));
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
  assert.ok(resolveUntilDecision(state, optionalTriggerOpen), 'Etap F (CR 603.5): decyzja przy rozstrzyganiu');
  // F1 (uwaga z gry 2026-09-23c): odmowa decyzji „you may" to zwykły pass
  // (przycisk „Dalej (Pass)"), a nie osobny wariant resolve_optional_trigger_choice.
  const skip = commands(state).find((c) => c.type === 'pass_priority');
  assert.ok(skip, 'odmowa też jest ofertą (pass)');
  run(state, skip);
  assert.equal(state.pendingOptionalTrigger, null, 'pass rozstrzygnął decyzję');
  assert.equal(state.zones.stack.length, 0, 'zdolność opuściła stos bez skutku');
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
  assert.ok(!enemy.zones.stack.some((id) => enemy.objects.get(id)?.kind === 'trigger'),
    'Etap F: brak zdolności na stosie (trigger nie odpalił)');
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
  assert.ok(resolveUntilDecision(state, optionalTriggerOpen), 'Etap F (CR 603.5): decyzja przy rozstrzyganiu');
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

// ---- B4: Scroll of Avacyn (377 AVR, plan Innistrad) -------------------------

test('B58/B4: Scroll of Avacyn — dane Oracle + warunek „if you control an Angel"', () => {
  const def = registry.get('scroll-of-avacyn');
  assert.deepEqual(def.types, ['Artifact']);
  assert.deepEqual(def.colors, []);
  assert.equal(def.manaCost, 1);
  assert.equal(def.set, 'AVR');
  assert.equal(def.plan, 'Innistrad');
  assert.equal(def.artId, 377);
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
  assert.ok(def.imageUri.includes('871e6e2a'), 'imageUri z druku avr/220');
  assert.equal(MANA_COSTS['scroll-of-avacyn'], '{1}');
  const ability = def.abilities[0];
  assert.deepEqual(ability.cost, { mana: 1, sacrificeSelf: true });
  const effects = Array.isArray(ability.effect) ? ability.effect : [ability.effect];
  assert.equal(effects[0].type, 'draw_cards');
  const conditional = effects.find((e) => e.type === 'conditional');
  assert.ok(conditional, 'warunek efektu obecny');
  assert.equal(conditional.condition, 'controlsCreatureSubtype');
  assert.equal(conditional.subtype, 'Angel');
  assert.equal(conditional.then.type, 'gain_life');
  assert.equal(conditional.then.amount, 5);
});

test('B58/B4: Scroll of Avacyn — z Aniołem dobiera kartę i daje 5 życia', () => {
  const state = game();
  put(state, 'scroll', 'scroll-of-avacyn', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'angel', 'angel-of-the-dawn', 'p1', 'battlefield', { summoningSickness: false });
  addMana(state, 'p1', 1, { colors: [] });
  const beforeHand = state.zones.hand.length;
  const beforeLife = player(state, 'p1').life;
  run(state, commands(state).find((c) => c.type === 'activate_ability' && c.objectId === 'scroll'));
  resolve(state);
  assert.equal(state.zones.hand.length, beforeHand + 1, 'dobranie karty');
  assert.equal(player(state, 'p1').life, beforeLife + 5, 'kontrola Anioła → +5 życia');
  assert.ok(find(state, 'scroll-of-avacyn', 'graveyard'), 'artefakt poświęcony (koszt)');
});

test('B58/B4: Scroll of Avacyn — bez Anioła tylko dobranie (bez życia)', () => {
  const state = game();
  put(state, 'scroll', 'scroll-of-avacyn', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'bear', 'razorfoot-griffin', 'p1', 'battlefield', { summoningSickness: false });
  addMana(state, 'p1', 1, { colors: [] });
  const beforeHand = state.zones.hand.length;
  const beforeLife = player(state, 'p1').life;
  run(state, commands(state).find((c) => c.type === 'activate_ability' && c.objectId === 'scroll'));
  resolve(state);
  assert.equal(state.zones.hand.length, beforeHand + 1, 'dobranie karty');
  assert.equal(player(state, 'p1').life, beforeLife, 'bez Anioła brak 5 życia');
});

test('B58/B4: Scroll of Avacyn — warunek czytany przy ROZSTRZYGNIĘCIU (ruling 2012-05-01)', () => {
  const state = game();
  put(state, 'scroll', 'scroll-of-avacyn', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'angel', 'angel-of-the-dawn', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'expunge', 'expunge', 'p1');
  addMana(state, 'p1', 10, { colors: ['B', 'U', 'W'] });
  const beforeLife = player(state, 'p1').life;
  const beforeHand = state.zones.hand.length;
  run(state, commands(state).find((c) => c.type === 'activate_ability' && c.objectId === 'scroll'));
  // W odpowiedzi zabijamy Anioła — warunek sprawdzany PRZY ROZSTRZYGNIĘCIU,
  // więc 5 życia nie może wejść, a dobranie (efekt bezwarunkowy) tak.
  const kill = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'expunge', targets: ['angel'] });
  assert.ok(kill.ok, `Expunge w odpowiedzi: ${JSON.stringify(kill.events?.[0]?.reason)}`);
  resolve(state);
  assert.ok(find(state, 'angel-of-the-dawn', 'graveyard'), 'Anioł zabity w odpowiedzi');
  // Bilans ręki: −1 (Expunge rzucony) +1 (dobranie) = bez zmian.
  assert.equal(state.zones.hand.length, beforeHand, 'bilans ręki: rzucony Expunge i dobrana karta');
  assert.equal(player(state, 'p1').life, beforeLife, 'brak Anioła przy rozstrzygnięciu → bez 5 życia');
});

test('B58/B4: Scroll of Avacyn — bez many zdolność niedostępna', () => {
  const state = game();
  put(state, 'scroll', 'scroll-of-avacyn', 'p1', 'battlefield', { summoningSickness: false });
  assert.ok(!commands(state).some((c) => c.type === 'activate_ability' && c.objectId === 'scroll'),
    'brak many {1} → brak oferty aktywacji');
  assert.equal(execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'scroll', abilityIndex: 0 }).ok, false,
    'ręczna komenda też odrzucona');
  assert.ok(find(state, 'scroll-of-avacyn', 'battlefield'), 'odrzucona aktywacja nie poświęca artefaktu');
});

// ---- B5: Resurrected Cultist (447 DSK, plan Warhammer Fantasy) --------------

// Grób pod delirium: sam Kultysta jest kartą-stworem, więc Instant + Sorcery +
// Land dają razem z nim CZTERY typy kart (CR 207.2c). Bez lądu są trzy typy —
// próg niespełniony.
function deliriumGrave(state, { land = true } = {}) {
  put(state, 'cultist', 'resurrected-cultist', 'p1', 'graveyard');
  put(state, 'grave-instant', 'fiery-fall', 'p1', 'graveyard');
  put(state, 'grave-sorcery', 'boulder-salvo', 'p1', 'graveyard');
  if (land) put(state, 'grave-land', 'basic-swamp', 'p1', 'graveyard');
}

const cultistOffer = (s) => commands(s).find((c) => c.type === 'activate_ability' && c.objectId === 'cultist');

test('B58/B5: Resurrected Cultist — dane Oracle + zdolność z grobu z bramką delirium', () => {
  const def = registry.get('resurrected-cultist');
  assert.deepEqual(def.types, ['Creature']);
  assert.deepEqual(def.subtypes, ['Human', 'Cleric']);
  assert.deepEqual(def.colors, ['B']);
  assert.equal(def.power, 4);
  assert.equal(def.toughness, 1);
  assert.equal(def.manaCost, 3);
  assert.equal(def.set, 'DSK');
  assert.equal(def.plan, 'Warhammer Fantasy');
  assert.equal(def.artId, 447);
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
  assert.ok(def.imageUri.includes('e41bd259'), 'imageUri z druku dsk/115');
  // MANA_COSTS niesie koszt DRUKU karty ({2}{B} = mv 3); koszt zdolności
  // Delirium ({2}{B}{B}) żyje w deskryptorze zdolności.
  assert.equal(MANA_COSTS['resurrected-cultist'], '{2}{B}');
  const ability = def.abilities[0];
  assert.equal(ability.type, 'activated');
  assert.equal(ability.fromGraveyard, true);
  assert.equal(ability.timing, 'sorcery');
  assert.deepEqual(ability.condition, { delirium: true });
  assert.deepEqual(ability.cost, { mana: 4, colors: ['B', 'B'] });
  const effect = Array.isArray(ability.effect) ? ability.effect[0] : ability.effect;
  assert.equal(effect.type, 'return_source_from_graveyard');
  assert.equal(effect.finalityCounter, true);
});

test('B58/B5: Resurrected Cultist — 4 typy kart w grobie: powrót 4/1 z licznikiem finality', () => {
  const state = game();
  deliriumGrave(state);
  addMana(state, 'p1', 4, { colors: ['B'] });
  const offer = cultistOffer(state);
  assert.ok(offer, 'delirium spełnione → oferta aktywacji z grobu');
  run(state, offer);
  resolve(state);
  const back = find(state, 'resurrected-cultist', 'battlefield');
  assert.ok(back, 'karta wróciła na pole bitwy');
  assert.equal(back.counters.finality, 1, 'licznik finality na wracającym permanencie');
  assert.equal(back.summoningSickness, true, 'choroba przywołania (CR 302.6)');
  assert.equal(back.controllerId, 'p1', 'permanent wraca pod kontrolę właściciela');
  assert.equal(player(state, 'p1').mana, 0, 'koszt {2}{B}{B} zapłacony');
  assert.ok(!find(state, 'resurrected-cultist', 'graveyard'), 'karta opuściła grób');
});

test('B58/B5: Resurrected Cultist — 3 typy kart w grobie: zdolność niedostępna', () => {
  const state = game();
  deliriumGrave(state, { land: false }); // Creature + Instant + Sorcery = 3 typy
  addMana(state, 'p1', 4, { colors: ['B'] });
  assert.ok(!cultistOffer(state), 'delirium niespełnione → brak oferty');
  const forced = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'cultist', abilityIndex: 0 });
  assert.equal(forced.ok, false, 'ręczna komenda też odrzucona');
  assert.equal(player(state, 'p1').mana, 4, 'odrzucona aktywacja nie pobiera many');
  assert.ok(find(state, 'resurrected-cultist', 'graveyard'), 'karta zostaje w grobie');
});

test('B58/B5: Resurrected Cultist — aktywacja tylko jak sorcery (nie w walce)', () => {
  const state = game();
  deliriumGrave(state);
  addMana(state, 'p1', 4, { colors: ['B'] });
  state.turn = jumpToStep(state.turn, 'combat_damage', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  assert.ok(!cultistOffer(state), 'poza fazą główną brak oferty (activate only as a sorcery)');
  const forced = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'cultist', abilityIndex: 0 });
  assert.equal(forced.ok, false, 'poza fazą główną aktywacja odrzucona');
  assert.ok(find(state, 'resurrected-cultist', 'graveyard'), 'karta zostaje w grobie');
});

test('B58/B5: Resurrected Cultist — śmierć z licznikiem finality wygania (CR 122.1h)', () => {
  const state = game();
  deliriumGrave(state);
  addMana(state, 'p1', 4, { colors: ['B'] });
  run(state, cultistOffer(state));
  resolve(state);
  const back = find(state, 'resurrected-cultist', 'battlefield');
  assert.ok(back, 'Kultysta na polu bitwy przed zabiciem');
  put(state, 'burn', 'fiery-fall', 'p1');
  addMana(state, 'p1', 6, { colors: ['R'] });
  const cast = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'burn', targets: [back.id] });
  assert.ok(cast.ok, JSON.stringify(cast.events?.[0]?.reason));
  resolve(state);
  assert.ok(!find(state, 'resurrected-cultist', 'graveyard'), 'finality NIE wraca do grobu');
  assert.ok(find(state, 'resurrected-cultist', 'exile'), 'śmierć z finality → wygnanie');
});

test('B58/B5: Resurrected Cultist — na polu bitwy zdolność z grobu nie działa', () => {
  const state = game();
  deliriumGrave(state);
  put(state, 'on-bf', 'resurrected-cultist', 'p1', 'battlefield', { summoningSickness: false });
  addMana(state, 'p1', 4, { colors: ['B'] });
  assert.ok(!commands(state).some((c) => c.type === 'activate_ability' && c.objectId === 'on-bf'),
    'zdolność „z grobu" wymaga źródła w grobie (CR 113.6)');
  const forced = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'on-bf', abilityIndex: 0 });
  assert.equal(forced.ok, false, 'aktywacja z pola bitwy odrzucona');
});

// ---- B6: Prishe's Wanderings (219 FIN, plan Final Fantasy) ------------------

function castPrishe(state) {
  const cmd = commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'prishes');
  assert.ok(cmd, 'rzut Prishe\u2019s Wanderings oferowany');
  run(state, cmd);
  // Czar rozstrzyga się po rundzie passów — dopiero wtedy czeka decyzja
  // szukania (blokująca, więc passy się kończą).
  for (let i = 0; i < 10 && !commands(state).some((c) => c.type === 'resolve_search_choice'); i += 1) {
    const pass = commands(state).find((c) => c.type === 'pass_priority');
    assert.ok(pass, 'priorytet do oddania');
    run(state, pass);
  }
  assert.ok(commands(state).some((c) => c.type === 'resolve_search_choice'), 'decyzja szukania czeka po czarze');
}

test('B58/B6: Prishe\u2019s Wanderings — dane Oracle + anyOf i zdolność refleksyjna', () => {
  const def = registry.get('prishes-wanderings');
  assert.deepEqual(def.types, ['Instant']);
  assert.deepEqual(def.colors, ['G']);
  assert.equal(def.manaCost, 3);
  assert.equal(def.set, 'FIN');
  assert.equal(def.plan, 'Final Fantasy');
  assert.equal(def.artId, 219);
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
  assert.ok(def.imageUri.includes('d6e1dee0'), 'imageUri z druku fin/193');
  assert.equal(MANA_COSTS['prishes-wanderings'], '{2}{G}');
  const effect = def.spell.effects[0];
  assert.equal(effect.type, 'search_library_to_battlefield');
  assert.equal(effect.entersTapped, true, 'znaleziony ląd wchodzi TAPNIĘTY');
  assert.equal(effect.reflexiveEvent, 'reflexive_search');
  assert.deepEqual(effect.qualifier.anyOf, [
    { types: ['Basic', 'Land'] },
    { subtypes: ['Town'] },
  ], '„a basic land card or Town card" = alternatywy kwalifikatora');
  const reflexive = def.abilities.find((a) => a.trigger?.event === 'reflexive_search');
  assert.ok(reflexive, 'zdolność refleksyjna na karcie (ruling FIN 2025-06-06)');
  assert.deepEqual(reflexive.trigger.requiresTarget, { type: 'creature_you_control' });
  assert.equal(reflexive.effect.type, 'add_counter');
  assert.equal(reflexive.effect.counter, '+1/+1');
  assert.equal(reflexive.effect.amount, 1);
});

test('B58/B6: Prishe\u2019s Wanderings — basic land enters tapped, refleks daje +1/+1', () => {
  const state = game();
  put(state, 'prishes', 'prishes-wanderings', 'p1');
  put(state, 'mine', 'razorfoot-griffin', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'mine2', 'razorfoot-griffin', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'foe', 'razorfoot-griffin', 'p2', 'battlefield');
  addMana(state, 'p1', 3, { colors: ['G'] });
  castPrishe(state);
  const choice = commands(state).find((c) => c.type === 'resolve_search_choice' && c.found === 'lib-p1-0');
  assert.ok(choice, 'podstawowy ląd z biblioteki jest oferowany w wyborze');
  run(state, choice);
  const land = find(state, 'basic-swamp', 'battlefield');
  assert.ok(land, 'znaleziony ląd na polu bitwy');
  assert.equal(land.tapped, true, 'wchodzi tapnięty');
  assert.equal(land.controllerId, 'p1');
  // M242: przy DOKŁADNIE jednym legalnym kandydacie wybór jest automatyczny —
  // decyzja pojawia się przy realnym wyborze (dwa własne stwory).
  const targets = commands(state).filter((c) => c.type === 'resolve_trigger_target');
  const ids = targets.map((c) => c.targetId);
  assert.ok(ids.includes('mine') && ids.includes('mine2'),
    `twoje stwory są legalnymi celami refleksu: ${JSON.stringify(ids)}`);
  assert.ok(!ids.includes('foe'), 'stwór przeciwnika NIE jest legalnym celem („creature you control")');
  run(state, targets.find((c) => c.targetId === 'mine'));
  resolve(state);
  assert.equal(state.objects.get('mine').counters['+1/+1'], 1, '+1/+1 na wybranym stworze');
  assert.equal(state.objects.get('mine2').counters['+1/+1'], undefined, 'nie na drugim stworze');
});

test('B58/B6: Prishe\u2019s Wanderings — Town card też jest znajdowany (anyOf)', () => {
  const state = game();
  put(state, 'prishes', 'prishes-wanderings', 'p1');
  put(state, 'town', 'balamb-garden-seed-academy', 'p1', 'library');
  put(state, 'mine', 'razorfoot-griffin', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'mine2', 'razorfoot-griffin', 'p1', 'battlefield', { summoningSickness: false });
  addMana(state, 'p1', 3, { colors: ['G'] });
  const beforeNonland = [...state.objects.values()].filter((o) => o.zone === 'battlefield' && o.kind !== 'land').length;
  castPrishe(state);
  const choice = commands(state).find((c) => c.type === 'resolve_search_choice' && c.found === 'town');
  assert.ok(choice, 'Town jest kandydatem kwalifikatora anyOf');
  run(state, choice);
  const town = find(state, 'balamb-garden-seed-academy', 'battlefield');
  assert.ok(town, 'Town wchodzi na pole bitwy');
  assert.equal(town.tapped, true, 'wchodzi tapnięty');
  assert.equal(town.counters['+1/+1'], undefined, 'licznik idzie na stwora, nie na ląd');
  const targets = commands(state).filter((c) => c.type === 'resolve_trigger_target');
  run(state, targets.find((c) => c.targetId === 'mine'));
  resolve(state);
  assert.equal(state.objects.get('mine').counters['+1/+1'], 1, 'refleks działał też przy Town');
  assert.equal([...state.objects.values()].filter((o) => o.zone === 'battlefield' && o.kind !== 'land').length,
    beforeNonland, 'liczba permanentów nielandowych bez zmian');
});

test('B58/B6: Prishe\u2019s Wanderings — fail to find nadal odpala refleks', () => {
  const state = game();
  put(state, 'prishes', 'prishes-wanderings', 'p1');
  put(state, 'mine', 'razorfoot-griffin', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'mine2', 'razorfoot-griffin', 'p1', 'battlefield', { summoningSickness: false });
  addMana(state, 'p1', 3, { colors: ['G'] });
  castPrishe(state);
  const decline = commands(state).find((c) => c.type === 'resolve_search_choice' && c.found === null);
  assert.ok(decline, 'rezygnacja („fail to find") jest oferowana przy kryterium jakości');
  run(state, decline);
  assert.ok(!find(state, 'basic-swamp', 'battlefield'), 'nic nie weszło na pole bitwy');
  const targets = commands(state).filter((c) => c.type === 'resolve_trigger_target');
  assert.ok(targets.length > 0, 'przeszukanie biblioteki odpala refleks także bez trafienia');
  run(state, targets.find((c) => c.targetId === 'mine'));
  resolve(state);
  assert.equal(state.objects.get('mine').counters['+1/+1'], 1, '+1/+1 mimo fail to find');
  assert.ok(state.events.some((e) => e.type === 'library_searched'), 'biblioteka przeszukana i przetasowana');
});

test('B58/B6: Prishe\u2019s Wanderings — brak stwora: refleks bez celu, gra nie wisi', () => {
  const state = game();
  put(state, 'prishes', 'prishes-wanderings', 'p1');
  put(state, 'foe', 'razorfoot-griffin', 'p2', 'battlefield');
  addMana(state, 'p1', 3, { colors: ['G'] });
  castPrishe(state);
  run(state, commands(state).find((c) => c.type === 'resolve_search_choice' && c.found === null));
  assert.ok(!commands(state).some((c) => c.type === 'resolve_trigger_target'),
    'bez własnego stwora trigger nie kolejkuje decyzji celu');
  resolve(state);
  assert.equal(state.zones.stack.length, 0, 'stos pusty — gra nie wisi');
  assert.equal(state.objects.get('foe').counters['+1/+1'], undefined, 'cudzy stwór bez licznika');
});

test('B58/B6: Prishe\u2019s Wanderings — rzut bez many i nielegalny wybór odrzucone', () => {
  const state = game();
  put(state, 'prishes', 'prishes-wanderings', 'p1');
  put(state, 'griffin', 'razorfoot-griffin', 'p1', 'library');
  assert.ok(!commands(state).some((c) => c.type === 'cast_spell' && c.objectId === 'prishes'),
    'bez many {2}{G} rzut nie jest oferowany');
  assert.equal(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'prishes' }).ok, false,
    'ręczna komenda rzutu odrzucona');
  addMana(state, 'p1', 3, { colors: ['G'] });
  castPrishe(state);
  const illegal = execute(state, { type: 'resolve_search_choice', playerId: 'p1', found: 'griffin', destination: 'battlefield' });
  assert.equal(illegal.ok, false, 'stwór spoza kwalifikatora odrzucony (anyOf nie przepuszcza dowolnej karty)');
  const legal = execute(state, { type: 'resolve_search_choice', playerId: 'p1', found: null });
  assert.ok(legal.ok, 'po odrzuceniu decyzja nadal czeka i da się ją rozstrzygnąć');
});

// ---- B7: Gond Gate (318 CLB, plan Forgotten Realms) ------------------------

/** Kolory ostatniego zdarzenia `mana_changed` (produkcja many) albo null. */
const lastManaColors = (s) => [...s.events].reverse().find((e) => e.type === 'mana_changed')?.colors ?? null;

test('B58/B7: Gond Gate — dane Oracle: statyk bram + dwie zdolności many', () => {
  const def = registry.get('gond-gate');
  assert.deepEqual(def.types, ['Land']);
  assert.deepEqual(def.subtypes, ['Gate']);
  assert.deepEqual(def.colors, []);
  assert.equal(def.set, 'CLB');
  assert.equal(def.plan, 'Forgotten Realms');
  assert.equal(def.artId, 318);
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
  assert.ok(def.imageUri.includes('746672d9'), 'imageUri z druku clb/353');
  const statyk = def.abilities.find((a) => a.type === 'static');
  assert.ok(statyk, 'statyk „Gates you control enter untapped"');
  assert.deepEqual(statyk.entersUntapped, { subtype: 'Gate' }, 'statyk w DANYCH karty (ADR 0002)');
  const mana = def.abilities.filter((a) => a.type === 'activated');
  assert.equal(mana.length, 2, 'dwie zdolności many: {C} oraz „any color … could produce"');
  assert.deepEqual(mana[0].cost, { tap: true });
  assert.equal(mana[0].effect.type, 'add_mana');
  assert.equal(mana[0].effect.colors, undefined, 'brak kolorów = {C} (bezbarwna)');
  assert.deepEqual(mana[1].cost, { tap: true });
  assert.equal(mana[1].effect.type, 'add_mana');
  assert.deepEqual(mana[1].effect.colorsFrom, { controlledSubtype: 'Gate' },
    'kolory produkcji czytane z kontrolowanych Bram („could produce")');
  // Jedno źródło prawdy: oferta i walidacja czytają TEN SAM deskryptor efektu
  // (`abilityConditionFailure` w abilities.js) — bez kopii w `condition`.
  assert.equal(mana[1].condition ?? null, null, 'warunek liczony z `effect.colorsFrom`');
});

test('B58/B7: Gond Gate — Brama z ręki wchodzi ODKRĘCONA, bez Gond Gate tapnięta', () => {
  const state = game();
  put(state, 'gond', 'gond-gate', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'drop', 'dimir-guildgate', 'p1');
  run(state, commands(state).find((c) => c.type === 'play_land' && c.objectId === 'drop'));
  const gate = find(state, 'dimir-guildgate', 'battlefield');
  assert.ok(gate, 'Brama weszła na pole bitwy');
  assert.equal(gate.tapped, false, 'statyk „Gates you control enter untapped" (Guildgate ma enters tapped)');

  const control = game();
  put(control, 'drop', 'dimir-guildgate', 'p1');
  run(control, commands(control).find((c) => c.type === 'play_land' && c.objectId === 'drop'));
  assert.equal(find(control, 'dimir-guildgate', 'battlefield').tapped, true,
    'bez Gond Gate ta sama Brama wchodzi tapnięta (kontrola negatywna)');
});

test('B58/B7: Gond Gate — statyk działa tylko na TWOJE Bramy', () => {
  const enemy = game();
  put(enemy, 'gond', 'gond-gate', 'p1', 'battlefield', { summoningSickness: false });
  put(enemy, 'drop', 'dimir-guildgate', 'p2');
  enemy.turn = jumpToStep(enemy.turn, 'main', 'p2');
  enemy.turn.activePlayerId = enemy.turn.priorityPlayerId = 'p2';
  run(enemy, commands(enemy).find((c) => c.type === 'play_land' && c.objectId === 'drop'));
  assert.equal(find(enemy, 'dimir-guildgate', 'battlefield').tapped, true,
    'Brama przeciwnika wchodzi tapnięta (statyk dotyczy Bram KONTROLUJĄCEGO)');
});

test('B58/B7: Gond Gate — {T}: Add {C} to mana bezbarwna', () => {
  const state = game();
  put(state, 'gond', 'gond-gate', 'p1', 'battlefield', { summoningSickness: false });
  // Indeksy zdolności liczą CAŁĄ listę karty (0 = statyk, 1 = {C}, 2 = kolory Bram).
  const offer = commands(state).find((c) => c.type === 'activate_ability' && c.objectId === 'gond' && c.abilityIndex === 1);
  assert.ok(offer, 'oferta {T}: Add {C}');
  run(state, offer);
  assert.deepEqual(lastManaColors(state), [], '„Add {C}" = mana bezbarwna');
  assert.deepEqual(player(state, 'p1').manaPool, { '': 1 }, 'jedna jednostka bezbarwna w puli');
});

test('B58/B7: Gond Gate — druga zdolność daje kolor Bramy-sąsiada', () => {
  const state = game();
  put(state, 'gond', 'gond-gate', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'guild', 'dimir-guildgate', 'p1', 'battlefield', { summoningSickness: false, tapped: true });
  const offer = commands(state).find((c) => c.type === 'activate_ability' && c.objectId === 'gond' && c.abilityIndex === 2);
  assert.ok(offer, 'oferta „one mana of any color that a Gate you control could produce"');
  run(state, offer);
  assert.deepEqual(lastManaColors(state), ['U', 'B'], 'kolory z Dimir Guildgate ({U} albo {B})');
  assert.deepEqual(player(state, 'p1').manaPool, { UB: 1 }, 'jednostka niebiesko-czarna w puli');
  // Ta sama unia w ścieżce auto-tapu (getSourceForObject czyta deskryptor):
  const src = getSourceForObject(state.objects.get('gond'), state);
  assert.deepEqual(src.colors, ['U', 'B'], 'auto-tap widzi kolory Bram-sąsiadów');
});

test('B58/B7: Gond Gate — Brama „any color" (Heap Gate) daje dowolny kolor', () => {
  const state = game();
  put(state, 'gond', 'gond-gate', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'heap', 'heap-gate', 'p1', 'battlefield', { summoningSickness: false, tapped: true });
  const offer = commands(state).find((c) => c.type === 'activate_ability' && c.objectId === 'gond' && c.abilityIndex === 2);
  assert.ok(offer, 'Heap Gate może dać dowolny kolor — zdolność dostępna');
  run(state, offer);
  assert.deepEqual(player(state, 'p1').manaPool, { WUBRG: 1 }, 'dowolny kolor = jednostka WUBRG');
});

test('B58/B7: Gond Gate — bez kolorowej Bramy druga zdolność niedostępna', () => {
  const state = game();
  put(state, 'gond', 'gond-gate', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'basilisk', 'basilisk-gate', 'p1', 'battlefield', { summoningSickness: false });
  assert.ok(!commands(state).some((c) => c.type === 'activate_ability' && c.objectId === 'gond' && c.abilityIndex === 2),
    'Basilisk Gate produkuje tylko {C} — nie ma koloru do wyprodukowania');
  assert.ok(commands(state).some((c) => c.type === 'activate_ability' && c.objectId === 'gond' && c.abilityIndex === 1),
    '„{T}: Add {C}" pozostaje dostępne');
  const forced = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'gond', abilityIndex: 2 });
  assert.equal(forced.ok, false, 'ręczna aktywacja odrzucona (walidacja tą samą bramką co oferta)');
  assert.equal(state.objects.get('gond').tapped, false, 'odrzucona aktywacja nie tapnęła źródła');

  // Cudza Brama nie liczy się („a Gate YOU control").
  const enemy = game();
  put(enemy, 'gond', 'gond-gate', 'p1', 'battlefield', { summoningSickness: false });
  put(enemy, 'guild', 'dimir-guildgate', 'p2', 'battlefield', { summoningSickness: false, tapped: true });
  assert.ok(!commands(enemy).some((c) => c.type === 'activate_ability' && c.objectId === 'gond' && c.abilityIndex === 2),
    'Brama przeciwnika nie daje kolorów');
});
