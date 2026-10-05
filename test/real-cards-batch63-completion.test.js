// B63 / dokończenie: źródła exact-set i rulingi z 2026-10-04 w docs/cards.
// Piny przechodzą przez ofertę → execute → stos → SBA, a nie applyEffect.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry, BLOOD_TOKEN_EFFECT, SPAWN_TOKEN_EFFECT } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { MANA_COSTS } from '../src/cards/mana-costs-data.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { addCounter } from '../src/engine/counters.js';
import { createAbility } from '../src/engine/abilities.js';
import { effectivePower, effectiveToughness } from '../src/engine/permanents.js';
import { createBattlefieldToken } from '../src/engine/tokens.js';
import { createHeuristicBot, isNegativePump, temporaryPumpOf } from '../src/controllers/heuristic-bot.js';
import { describeSpellEffects, cardInfo, rulesText } from '../src/table/render.js';
import { describeGameEvent } from '../src/table/session.js';

const registry = createCardRegistry();
const offers = s => playerView(s, s.turn.priorityPlayerId).legalCommands;
const find = (s, cardId, zone = 'battlefield') => [...s.objects.values()].find(o => o.cardId === cardId && o.zone === zone);
const tokens = (s, id) => [...s.objects.values()].filter(o => o.zone === 'battlefield' && o.cardId === id);
const life = (s, id) => s.players.find(p => p.id === id).life;
function run(s, cmd) {
  assert.ok(cmd, 'oczekiwana oferta istnieje');
  const result = execute(s, cmd);
  assert.equal(result.ok, true, JSON.stringify(result.events));
  return result;
}
function pass(s) { return run(s, offers(s).find(c => c.type === 'pass_priority')); }
function settle(s) {
  for (let i = 0; i < 60; i++) {
    const decision = offers(s).find(c => c.type.startsWith('resolve_') && c.type !== 'resolve_combat');
    if (!s.zones.stack.length && !decision) return;
    if (decision) run(s, decision); else pass(s);
  }
  assert.fail('stos/decyzja nie rozstrzygnięte w limicie');
}
function put(s, id, cardId, owner = 'p1', zone = 'hand') {
  const def = registry.get(cardId);
  assert.ok(def);
  return addObject(s, { id, instanceId: `i-${id}`, cardId, controllerId: owner, ownerId: owner,
    zone, ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes, keywords: def.keywords });
}
function blank(s, id, controllerId = 'p2', extra = {}) {
  return addObject(s, { id, instanceId: `i-${id}`, cardId: `fixture-${id}`, controllerId,
    zone: 'battlefield', kind: 'creature', types: ['Creature'], power: 5, toughness: 5, ...extra });
}
function game(players = ['p1', 'p2']) {
  const s = createGameState({ seed: 6304, players: players.map(id => ({ id })) });
  s.turn = jumpToStep(s.turn, 'main', 'p1');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  for (const p of players) for (let i = 0; i < 7; i++) put(s, `lib-${p}-${i}`, 'basic-swamp', p, 'library');
  return s;
}
function cast(s, cardId, id = 'cast') {
  put(s, id, cardId);
  const def = registry.get(cardId);
  addMana(s, 'p1', def.manaCost, { colors: def.colors });
  run(s, offers(s).find(c => c.type === 'cast_permanent' && c.objectId === id));
}
function harvester() {
  const s = game(); cast(s, 'bloodtithe-harvester'); settle(s);
  const h = find(s, 'bloodtithe-harvester');
  s.objects.set(h.id, Object.freeze({ ...h, summoningSickness: false }));
  return s;
}
function activateHarvester(s, targetId) {
  const h = find(s, 'bloodtithe-harvester');
  return run(s, offers(s).find(c => c.type === 'activate_ability' && c.objectId === h.id && c.targets?.[0] === targetId));
}
function doomDecision(s = game()) {
  cast(s, 'etched-host-doombringer');
  for (let i = 0; i < 10 && !s.pendingModalTrigger; i++) pass(s);
  assert.ok(s.pendingModalTrigger, 'tryb wybierany przy ETB, przed rozstrzygnięciem triggera');
  return s;
}
function battle(s, controllerId, protectorId, defense = 5) {
  // Syntetyczna pozycja regułowa, nie nowa karta właściciela. CR 310.9a/e:
  // Siege może być chronione przez przeciwnika kontrolera; role różne.
  const object = blank(s, 'battle', controllerId, { kind: 'battle', types: ['Battle'],
    subtypes: controllerId !== protectorId ? ['Siege'] : [], power: null, toughness: null,
    protectorId });
  addCounter(s, object.id, 'defense', defense);
  return s.objects.get(object.id);
}

for (const [id, set, artId, plan] of [
  ['bloodtithe-harvester', 'VOW', 212, 'Innistrad'], ['snarespinner', 'DMU', 254, 'Dominaria'],
  ['kozileks-predator', '2XM', 259, 'Zendikar'], ['etched-host-doombringer', 'MOM', 260, 'Kaldheim'],
]) test(`B63: ${id} — Oracle, druk, artId i Plan 1:1`, () => {
  const def = registry.get(id);
  const snap = JSON.parse(fs.readFileSync(`docs/cards/scryfall-${id}.json`, 'utf8'));
  assert.equal(def.oracleText, snap.oracle_text);
  assert.equal(def.imageUri, snap.image_uris.large);
  assert.equal(def.set, set); assert.equal(snap.print, set.toLowerCase());
  assert.equal(def.artId, artId); assert.equal(def.plan, plan);
  assert.equal(def.power, Number(snap.power)); assert.equal(def.toughness, Number(snap.toughness));
  assert.equal(MANA_COSTS[id], snap.mana_cost);
  assert.deepEqual(def.support, { status: 'supported', limitations: [] });
  assert.ok(Array.isArray(snap.rulings));
});

test('B63/Blood: kanoniczny token ma koszt {1}, {T}, discard i sacrifice; ETB daje jeden', () => {
  const s = harvester();
  const [b] = tokens(s, 'token_blood');
  assert.equal(tokens(s, 'token_blood').length, 1);
  assert.equal(b.isToken, true); assert.equal(b.kind, 'artifact');
  assert.deepEqual(b.types, ['Artifact']); assert.deepEqual(b.subtypes, ['Blood']);
  assert.deepEqual(b.abilities, registry.get('token_blood').abilities);
  assert.deepEqual(b.abilities, BLOOD_TOKEN_EFFECT.abilities);
  assert.deepEqual(b.abilities[0].cost, { mana: 1, tap: true, discardCard: true, sacrificeSelf: true });
  assert.match(registry.get('token_blood').imageUri, /^https:\/\/cards.scryfall.io\//);
});

test('B63/Blood: brak karty do odrzucenia nie płaci kosztów; jedna karta płaci je tylko raz', () => {
  const s = harvester(); const [b] = tokens(s, 'token_blood');
  addMana(s, 'p1', 1);
  const cmd = { type: 'activate_ability', playerId: 'p1', objectId: b.id, abilityIndex: 0, targets: [] };
  assert.ok(!offers(s).some(c => c.type === cmd.type && c.objectId === b.id));
  assert.equal(execute(s, cmd).ok, false);
  assert.equal(s.objects.get(b.id).tapped, false);
  put(s, 'discard-me', 'basic-forest');
  run(s, offers(s).find(c => c.type === cmd.type && c.objectId === b.id));
  assert.ok(!tokens(s, 'token_blood').length, 'poświęcony jako KOSZT, przed odpowiedzią');
  assert.ok(find(s, 'basic-forest', 'graveyard'), 'odrzucona karta nie jest efektem');
  assert.equal(s.zones.stack.length, 1, 'dobranie używa stosu');
  assert.equal(s.zones.hand.filter(id => s.objects.get(id)?.controllerId === 'p1').length, 0);
  assert.equal(execute(s, cmd).ok, false, 'nie wolno dwukrotnie poświęcić tego samego tokenu');
  settle(s);
  assert.equal(s.zones.hand.filter(id => s.objects.get(id)?.controllerId === 'p1').length, 1);
});

test('B63/Harvester: X = dwa razy własne tokeny Artifact Blood, także z dodatkowymi podtypami', () => {
  const s = harvester(); blank(s, 'enemy', 'p2', { power: 8, toughness: 8 });
  createBattlefieldToken(s, 'p1', { ...BLOOD_TOKEN_EFFECT, subtypes: ['Blood', 'Clue'] });
  createBattlefieldToken(s, 'p2', BLOOD_TOKEN_EFFECT);
  blank(s, 'not-token', 'p1', { kind: 'artifact', types: ['Artifact'], subtypes: ['Blood'], power: null, toughness: null });
  createBattlefieldToken(s, 'p1', { ...BLOOD_TOKEN_EFFECT, kind: 'creature', types: ['Creature'], power: 1, toughness: 1 });
  activateHarvester(s, 'enemy');
  assert.ok(!find(s, 'bloodtithe-harvester'), 'źródło poświęcone jako koszt');
  settle(s);
  assert.equal(effectivePower(s.objects.get('enemy'), s), 4);
  assert.equal(effectiveToughness(s.objects.get('enemy'), s), 4);
});

test('B63/Harvester: liczba Blood liczona dopiero na resolution, potem premia jest stała (CR 608.2h)', () => {
  const s = harvester(); blank(s, 'enemy');
  createBattlefieldToken(s, 'p1', BLOOD_TOKEN_EFFECT);
  put(s, 'discard', 'basic-forest'); addMana(s, 'p1', 1);
  activateHarvester(s, 'enemy');
  const b = tokens(s, 'token_blood')[0];
  run(s, offers(s).find(c => c.type === 'activate_ability' && c.objectId === b.id));
  settle(s);
  assert.equal(effectiveToughness(s.objects.get('enemy'), s), 3, 'został 1 Blood, nie 2 z chwili aktywacji');
  createBattlefieldToken(s, 'p1', BLOOD_TOKEN_EFFECT);
  assert.equal(effectiveToughness(s.objects.get('enemy'), s), 3, 'po resolution nie jest to CDA/anthem');
});

test('B63/Harvester: zero Blood daje -0/-0; timing sorcery i choroba blokują aktywację', () => {
  const s = game(); put(s, 'h', 'bloodtithe-harvester', 'p1', 'battlefield'); blank(s, 'enemy');
  s.objects.set('h', Object.freeze({ ...s.objects.get('h'), summoningSickness: true }));
  assert.ok(!offers(s).some(c => c.type === 'activate_ability' && c.objectId === 'h'));
  s.objects.set('h', Object.freeze({ ...s.objects.get('h'), summoningSickness: false }));
  s.turn = jumpToStep(s.turn, 'beginning_of_combat', 'p1');
  assert.ok(!offers(s).some(c => c.type === 'activate_ability' && c.objectId === 'h'));
  assert.equal(execute(s, { type: 'activate_ability', playerId: 'p1', objectId: 'h', abilityIndex: 1, targets: ['enemy'] }).ok, false);
  s.turn = jumpToStep(s.turn, 'main', 'p1'); s.turn.priorityPlayerId = 'p1';
  activateHarvester(s, 'enemy'); settle(s);
  assert.equal(effectivePower(s.objects.get('enemy'), s), 5);
});

test('B63/Harvester: deskryptor dochodzi do widoku, bota i tekstu bez [object Object]/NaN', () => {
  const s = harvester(); blank(s, 'enemy', 'p2', { power: 5, toughness: 2 });
  const view = playerView(s, 'p1');
  const h = view.zones.battlefield.find(o => o.cardId === 'bloodtithe-harvester');
  const effect = h.activatableAbilities[1].effect;
  assert.equal(isNegativePump(effect), true);
  assert.deepEqual(temporaryPumpOf(effect, view, h), { power: -2, toughness: -2 });
  const label = describeSpellEffects({ effects: [effect] });
  assert.match(label, /-X\/-X/); assert.match(label, /Blood/); assert.match(label, /2/);
  assert.doesNotMatch(label, /\[object Object\]|NaN/);
  const bot = createHeuristicBot({ seed: 63 });
  const chosen = bot.chooseCommand(view);
  assert.equal(chosen.type, 'activate_ability'); assert.equal(chosen.targets?.[0], 'enemy');
  run(s, chosen); settle(s);
  assert.ok(!s.objects.has('enemy'), 'bot wykonał zaakceptowany lethal -2/-2');
});

test('B63/Predator: dokładnie dwa Spawn 0/1; sacrifice dodaje {C} bez stosu i bez {T}', () => {
  const s = game(); cast(s, 'kozileks-predator'); settle(s);
  const spawn = tokens(s, 'token_eldrazi_spawn');
  assert.equal(spawn.length, 2);
  for (const token of spawn) {
    assert.deepEqual(token.abilities, SPAWN_TOKEN_EFFECT.abilities);
    assert.deepEqual(token.abilities, registry.get('token_eldrazi_spawn').abilities);
    assert.equal(token.power, 0); assert.equal(token.toughness, 1);
    assert.deepEqual(token.colors, []); assert.deepEqual(token.subtypes, ['Eldrazi', 'Spawn']);
    assert.equal(token.summoningSickness, true);
    run(s, offers(s).find(c => c.type === 'activate_ability' && c.objectId === token.id));
    assert.equal(s.zones.stack.length, 0, 'mana ability nie używa stosu');
  }
  assert.equal(tokens(s, 'token_eldrazi_spawn').length, 0);
  assert.equal(s.players.find(p => p.id === 'p1').mana, 2);
  assert.deepEqual(s.players.find(p => p.id === 'p1').manaPool, { '': 2 }, 'bezbarwna, nie any-color');
});

for (const flying of [true, false]) test(`B63/Snarespinner: legalny blok ${flying ? 'lotnika daje +2/+0' : 'nielotnika nie daje premii'}`, () => {
  const s = game(); put(s, 'spider', 'snarespinner', 'p1', 'battlefield');
  blank(s, 'attacker', 'p2', { power: 2, toughness: 2, keywords: flying ? ['flying'] : [] });
  s.objects.set('attacker', Object.freeze({ ...s.objects.get('attacker'), summoningSickness: false }));
  s.turn = jumpToStep(s.turn, 'declare_attackers', 'p2'); s.turn.activePlayerId = s.turn.priorityPlayerId = 'p2';
  run(s, offers(s).find(c => c.type === 'declare_attackers' && c.attackerIds?.includes('attacker')));
  for (let i = 0; i < 8 && !offers(s).some(c => c.type === 'declare_blockers'); i++) pass(s);
  const block = offers(s).find(c => c.type === 'declare_blockers' && c.assignments?.attacker?.includes('spider'));
  run(s, block);
  assert.equal(effectivePower(s.objects.get('spider'), s), 1, 'premia nie wyprzedza stosu');
  assert.equal(s.zones.stack.length, flying ? 1 : 0);
  settle(s);
  assert.equal(effectivePower(s.objects.get('spider'), s), flying ? 3 : 1);
  assert.equal(effectiveToughness(s.objects.get('spider'), s), 3);
});

test('B63/Doombringer: tylko legalne tryby; odrzucony wybór nie usuwa decyzji; wybór nie wykonuje efektu', () => {
  const s = doomDecision();
  assert.ok(offers(s).filter(c => c.type === 'resolve_modal_choice').every(c => c.modeIndex === 0 && c.targetId === 'p2'));
  const pending = s.pendingModalTrigger; const before = s.events.length;
  assert.equal(execute(s, { type: 'resolve_modal_choice', playerId: 'p1', modeIndex: 1, targetId: find(s, 'etched-host-doombringer').id }).ok, false);
  assert.equal(s.pendingModalTrigger, pending, 'błędny cel nie konsumuje decyzji');
  assert.equal(s.events.length, before, 'brak fałszywego modal_trigger_resolved');
  run(s, offers(s).find(c => c.type === 'resolve_modal_choice' && c.modeIndex === 0));
  assert.equal(life(s, 'p2'), 20, 'CR 603.3c: wybór trybu = położenie na stos, nie resolution');
  assert.equal(s.zones.stack.length, 1);
  settle(s); assert.equal(life(s, 'p2'), 18); assert.equal(life(s, 'p1'), 22);
});

for (const [controllerId, protectorId, expected] of [['p1', 'p2', 2], ['p2', 'p1', 8]]) {
  test(`B63/Doombringer: kontroler ${controllerId}, protector ${protectorId} → obrona ${expected}`, () => {
    const s = game(); battle(s, controllerId, protectorId); doomDecision(s);
    assert.equal(playerView(s, 'p1').zones.battlefield.find(o => o.id === 'battle').protectorId, protectorId);
    run(s, offers(s).find(c => c.type === 'resolve_modal_choice' && c.modeIndex === 1 && c.targetId === 'battle'));
    assert.equal(s.objects.get('battle').counters.defense, 5, 'okno odpowiedzi po wyborze celu');
    settle(s); assert.equal(s.objects.get('battle').counters.defense, expected);
    assert.equal(life(s, 'p1'), 20); assert.equal(life(s, 'p2'), 20);
  });
}

test('B63/Doombringer: zdejmowanie do zera nie rzuca wyjątku; non-Siege Battle z 0 obrony idzie do grobu', () => {
  const s = game(); battle(s, 'p2', 'p2', 1); doomDecision(s);
  run(s, offers(s).find(c => c.type === 'resolve_modal_choice' && c.modeIndex === 1)); settle(s);
  assert.ok(!s.objects.has('battle'));
  assert.ok(find(s, 'fixture-battle', 'graveyard'));
  const removed = s.events.filter(e => e.type === 'counter_removed' && e.counter === 'defense');
  assert.equal(removed.at(-1).amount, 1, 'wykonaj tyle, ile możliwe, nie żądaj kosztu 3');
});

test('B63/Doombringer: zniknięcie wybranej bitwy w odpowiedzi daje fizzle, nie zmianę trybu', () => {
  const s = game(); battle(s, 'p2', 'p2'); put(s, 'bounce', 'consign-to-dream', 'p2');
  addMana(s, 'p2', 3, { colors: ['U'] }); doomDecision(s);
  run(s, offers(s).find(c => c.type === 'resolve_modal_choice' && c.modeIndex === 1)); pass(s);
  run(s, offers(s).find(c => c.type === 'cast_spell' && c.objectId === 'bounce' && c.targets?.[0] === 'battle'));
  settle(s);
  assert.ok(find(s, 'fixture-battle', 'hand')); assert.equal(life(s, 'p1'), 20); assert.equal(life(s, 'p2'), 20);
  assert.ok(s.events.some(e => e.type === 'trigger_resolved' && e.cardId === 'etched-host-doombringer' && e.noEffect));
});

test('B63/Doombringer: wyjście źródła ze stołu nie usuwa triggera wybranego wcześniej', () => {
  const s = game(); put(s, 'bounce', 'consign-to-dream', 'p2'); addMana(s, 'p2', 3, { colors: ['U'] }); doomDecision(s);
  const doom = find(s, 'etched-host-doombringer');
  run(s, offers(s).find(c => c.type === 'resolve_modal_choice' && c.modeIndex === 0)); pass(s);
  run(s, offers(s).find(c => c.type === 'cast_spell' && c.objectId === 'bounce' && c.targets?.[0] === doom.id));
  settle(s); assert.ok(find(s, 'etched-host-doombringer', 'hand'));
  assert.equal(life(s, 'p2'), 18); assert.equal(life(s, 'p1'), 22);
});

test('B63/Doombringer: utrata życia dotyczy wybranego przeciwnika, nie wszystkich', () => {
  const s = doomDecision(game(['p1', 'p2', 'p3']));
  run(s, offers(s).find(c => c.type === 'resolve_modal_choice' && c.targetId === 'p3'));
  settle(s); assert.equal(life(s, 'p2'), 20); assert.equal(life(s, 'p3'), 18); assert.equal(life(s, 'p1'), 22);
});


test('B63/Blood: przy dwóch kartach kontroler wybiera odrzucaną; wszystkie koszty dopiero po wyborze', () => {
  const s = harvester(); const b = tokens(s, 'token_blood')[0];
  put(s, 'keep', 'snarespinner'); put(s, 'discard', 'basic-forest'); addMana(s, 'p1', 1);
  run(s, offers(s).find(c => c.type === 'activate_ability' && c.objectId === b.id));
  assert.ok(s.pendingDiscardChoice); assert.ok(s.objects.has(b.id));
  assert.equal(s.players[0].mana, 1, 'nie zapłacono częściowo przed wyborem discard');
  run(s, offers(s).find(c => c.type === 'resolve_discard_choice' && c.cardId === 'discard'));
  assert.ok(find(s, 'basic-forest', 'graveyard')); assert.ok(s.objects.has('keep'));
  assert.equal(s.players[0].mana, 0); assert.ok(!tokens(s, 'token_blood').length);
  settle(s); assert.equal(s.zones.hand.filter(id => s.objects.get(id)?.controllerId === 'p1').length, 2);
});

for (const flying of [true, false]) test(`B63/Snarespinner bot: ${flying ? 'opłacalna wymiana z lotnikiem' : 'nie ginie za nic blokując nielotnika'}`, () => {
  const s = game(); put(s, 'spider', 'snarespinner', 'p1', 'battlefield');
  const enemy = blank(s, 'attacker', 'p2', { power: 3, toughness: 2, keywords: flying ? ['flying'] : [] });
  s.objects.set(enemy.id, Object.freeze({ ...enemy, summoningSickness: false }));
  s.turn = jumpToStep(s.turn, 'declare_attackers', 'p2'); s.turn.activePlayerId = s.turn.priorityPlayerId = 'p2';
  run(s, offers(s).find(c => c.type === 'declare_attackers' && c.attackerIds?.includes(enemy.id)));
  for (let i = 0; i < 8 && !offers(s).some(c => c.type === 'declare_blockers'); i++) pass(s);
  const view = playerView(s, 'p1');
  const bot = createHeuristicBot({ seed: 63 }); const chosen = bot.chooseCommand(view);
  const noTrigger = structuredClone(view);
  noTrigger.zones.battlefield.find(o => o.id === 'spider').activatableAbilities = [];
  const control = createHeuristicBot({ seed: 63 }); control.chooseCommand(noTrigger);
  const value = b => b.trace().at(-1).options.find(o => o.cmd === 'block[attacker<spider]')?.score;
  assert.ok(Number.isFinite(value(bot)) && Number.isFinite(value(control)));
  if (flying) assert.ok(value(bot) > value(control), 'trigger musi podnieść wycenę, nie tylko dać ten sam wybór z premii reach');
  else assert.equal(value(bot), value(control), 'nie wolno przewidywać pompy przeciw nielotnikowi');
  assert.equal(chosen.type, 'declare_blockers');
  assert.equal(Boolean(chosen.assignments?.attacker?.includes('spider')), flying);
  run(s, chosen); settle(s);
  assert.equal(effectivePower(s.objects.get('spider'), s), flying ? 3 : 1);
});

function tokenMaker(s, cardId, amount = 1) {
  const def = registry.get(cardId);
  return blank(s, 'maker', 'p1', { kind: 'artifact', types: ['Artifact'], power: null, toughness: null,
    abilities: [createAbility({ type: 'activated', cost: { sacrificeSelf: true }, effect: {
      type: 'create_token', cardId, name: def.name, amount, kind: 'creature',
      power: def.power, toughness: def.toughness, types: def.types, subtypes: def.subtypes,
      colors: def.colors, abilities: def.abilities,
    } })] });
}

test('B63/modal: dwa ETB w jednej komendzie nie nadpisują pierwszego wyboru', () => {
  const s = game(); tokenMaker(s, 'etched-host-doombringer', 2);
  run(s, offers(s).find(c => c.type === 'activate_ability' && c.objectId === 'maker'));
  for (let i = 0; i < 10 && !s.pendingModalTrigger; i++) pass(s);
  assert.ok(s.pendingModalTrigger?.next, 'obie decyzje zachowane');
  for (let i = 0; i < 2; i++) {
    run(s, offers(s).find(c => c.type === 'resolve_modal_choice' && c.modeIndex === 0));
    assert.equal(life(s, 'p2'), 20, 'brak skutku w czasie ogłaszania trybów');
  }
  assert.equal(s.zones.stack.length, 2); settle(s);
  assert.equal(life(s, 'p1'), 24); assert.equal(life(s, 'p2'), 16);
});

test('B63/Doombringer: ward kieruje się kontrolerem bitwy, nie jej protektorem; odmowa kontruje tryb', () => {
  const s = game(); const b = battle(s, 'p2', 'p1');
  s.objects.set(b.id, Object.freeze({ ...b, keywords: ['ward'], ward: 2 })); doomDecision(s);
  addMana(s, 'p1', 2); // prawdziwy wybór płatności, nie automatyczny kontr przy braku many
  run(s, offers(s).find(c => c.type === 'resolve_modal_choice' && c.modeIndex === 1));
  assert.equal(s.zones.stack.length, 2, 'dokładnie jeden ward nad wybraną zdolnością');
  assert.equal(s.objects.get(s.zones.stack.at(-1)).triggerEntry.ability.trigger.event, 'ward');
  for (let i = 0; i < 8 && !s.pendingWardPay; i++) pass(s);
  run(s, offers(s).find(c => c.type === 'resolve_ward_pay_choice' && c.pay === false)); settle(s);
  assert.equal(s.objects.get('battle').counters.defense, 5);
});

for (const active of ['p1', 'p2']) test(`B63/ward: jedyny auto-cel odpala ward NAD rodzicem, aktywny ${active}`, () => {
  const s = game(); put(s, 'anthem', 'anthem-of-champions', 'p1', 'battlefield');
  blank(s, 'target', 'p2', { power: 1, toughness: 1, keywords: ['ward'], ward: 2 });
  tokenMaker(s, 'subterranean-scout');
  s.turn = jumpToStep(s.turn, 'main', active); s.turn.activePlayerId = active; s.turn.priorityPlayerId = 'p1';
  run(s, offers(s).find(c => c.type === 'activate_ability' && c.objectId === 'maker'));
  for (let i = 0; i < 8 && !s.zones.stack.some(id => s.objects.get(id)?.triggerEntry); i++) pass(s);
  assert.equal(s.zones.stack.length, 2);
  assert.equal(s.objects.get(s.zones.stack[0]).cardId, 'subterranean-scout');
  assert.equal(s.objects.get(s.zones.stack[1]).triggerEntry.ability.trigger.event, 'ward', 'inna partia APNAP niż rodzic');
  settle(s); assert.ok(!s.objects.get('target').cantBeBlockedUntilTurn);
});

for (const controller of ['p1', 'p2']) test(`B63/Doombringer: hexproof bitwy kontrolera ${controller} filtruje ofertę i walidację`, () => {
  const s = game(); const b = battle(s, controller, controller === 'p1' ? 'p2' : 'p1');
  s.objects.set(b.id, Object.freeze({ ...b, keywords: ['hexproof'] })); doomDecision(s);
  const legal = offers(s).find(c => c.type === 'resolve_modal_choice' && c.modeIndex === 1);
  assert.equal(Boolean(legal), controller === 'p1');
  const cmd = { type: 'resolve_modal_choice', playerId: 'p1', modeIndex: 1, targetId: b.id };
  assert.equal(execute(s, cmd).ok, controller === 'p1');
});

test('B63/UI: pełna ścieżka widok → kafel nazywa warunek flying, -X/-X i protektora; log obrony po polsku', () => {
  const s = harvester(); put(s, 'spider', 'snarespinner', 'p1', 'battlefield'); battle(s, 'p1', 'p2');
  const view = playerView(s, 'p1');
  const session = { cardDetails: id => registry.get(id), colorsOf: id => registry.get(id)?.colors ?? [],
    nameOf: id => registry.get(id)?.name ?? id, nameOfObject: id => id, view: () => view };
  const info = id => cardInfo(session, view.zones.battlefield.find(o => o.id === id));
  assert.match(rulesText(info('spider')), /blokuje.*Latanie/);
  assert.match(rulesText(info(find(s, 'bloodtithe-harvester').id)), /-X\/-X/);
  assert.equal(info('battle').battleProtector, 'Chroni: Nieprzyjaciel');
  const line = describeGameEvent({ type: 'counter_removed', objectId: 'battle', cardId: 'fixture-battle', counter: 'defense', amount: 3, total: 2 }, session);
  assert.match(line, /obrony/); assert.doesNotMatch(line, /defense/);
});

test('B63/modal LKI: ETB i śmierć źródła w jednym resolution nadal pozwalają wybrać tryb', () => {
  const s = game(); const maker = tokenMaker(s, 'etched-host-doombringer');
  const ability = maker.abilities[0];
  s.objects.set(maker.id, Object.freeze({ ...maker, abilities: [createAbility({
    // Syntetyczny token 3/0 z rzeczywistą zdolnością ETB Doombringer.
    ...ability, effect: { ...ability.effect, toughness: 0 },
  })] }));
  run(s, offers(s).find(c => c.type === 'activate_ability' && c.objectId === 'maker'));
  for (let i = 0; i < 8 && !s.pendingModalTrigger; i++) pass(s);
  assert.ok(s.pendingModalTrigger, 'ETB widziało przybysza, choć źródło już nie żyje');
  assert.ok(!find(s, 'etched-host-doombringer'));
  run(s, offers(s).find(c => c.type === 'resolve_modal_choice' && c.modeIndex === 0));
  settle(s); assert.equal(life(s, 'p1'), 22); assert.equal(life(s, 'p2'), 18);
});

test('B63/Snarespinner bot: atakujący również widzi premię obrońcy, bez strojenia wag', () => {
  const s = game(); put(s, 'spider', 'snarespinner', 'p1', 'battlefield');
  blank(s, 'attacker', 'p2', { power: 3, toughness: 2, keywords: ['flying'] });
  s.objects.set('attacker', Object.freeze({ ...s.objects.get('attacker'), summoningSickness: false }));
  s.turn = jumpToStep(s.turn, 'declare_attackers', 'p2'); s.turn.activePlayerId = s.turn.priorityPlayerId = 'p2';
  const view = playerView(s, 'p2');
  const measure = v => {
    const bot = createHeuristicBot({ seed: 63 }); const cmd = bot.chooseCommand(v);
    return { cmd, score: bot.trace().at(-1).options.find(o => o.cmd === 'attack[attacker]')?.score };
  };
  const actual = measure(view);
  // Jawna kontrfaktyczna projekcja: identyczna plansza i oferty, tylko brak
  // publicznego triggera blokera. Nie zmieniamy stanu silnika ani parametrów.
  const noTrigger = structuredClone(view);
  noTrigger.zones.battlefield.find(o => o.id === 'spider').activatableAbilities = [];
  const control = measure(noTrigger);
  assert.ok(Number.isFinite(actual.score) && actual.score < control.score, `${actual.score} < ${control.score}`);
  run(s, actual.cmd);
});
