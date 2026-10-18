// Batch 68 (2026-10-17) — kolekcja artId 400–411, 10 kart, wszystkie `supported` (100%).
// Plan: docs/plans/PLAN_2026-10-17c-batch68-kart.md. Dane Oracle i rulingi:
// docs/cards/scryfall-<slug>.json (pobrane 2026-10-17 przez `set=`).
// Mechaniki nowe (generyczne, ADR 0002) testowane na syntetykach w
// test/batch68-mechaniki.test.js (B68/M1–M6). Tu: sanity danych + scenariusze
// legalne i nielegalne na prawdziwych kartach.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createGameState, addObject, execute, playerView,
} from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { MANA_COSTS } from '../src/cards/mana-costs-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { effectiveKeywords, effectivePower } from '../src/engine/permanents.js';
import { effectiveAbilities } from '../src/engine/permanents.js';

const registry = createCardRegistry();

function game(players = ['p1', 'p2']) {
  const state = createGameState({ seed: 68, players: players.map((id) => ({ id })) });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  for (const playerId of players) {
    for (let i = 0; i < 8; i++) put(state, `lib-${playerId}-${i}`, 'basic-swamp', playerId, 'library');
  }
  return state;
}

function put(state, id, cardId, playerId = 'p1', zone = 'hand', patch = {}) {
  const def = registry.get(cardId);
  assert.ok(def, `${cardId} w prawdziwym rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId,
    zone, ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes,
    keywords: def.keywords,
  });
  if (Object.keys(patch).length > 0) {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  }
  return state.objects.get(id);
}

const commands = (state, playerId = state.turn.priorityPlayerId) => playerView(state, playerId).legalCommands;
const find = (state, cardId, zone = 'battlefield') => [...state.objects.values()]
  .find((object) => object.cardId === cardId && object.zone === zone);
const snapshotOf = (slug) => JSON.parse(fs.readFileSync(`docs/cards/scryfall-${slug}.json`, 'utf8'));

function run(state, command) {
  assert.ok(command, 'oferta komendy istnieje');
  const result = execute(state, command);
  assert.ok(result.ok, `${result.reason ?? 'odrzucono'}: ${JSON.stringify(result.events ?? [])}`);
  return result;
}

/** Rozstrzyga stos; ETB-cel wybiera [choose], decyzje „pay?” — [payChoice]. */
function settle(state, { choose = null, payChoice = null, max = 120 } = {}) {
  for (let i = 0; i < max; i += 1) {
    // Decyzja „zapłać {N}?" należy do RZUCAJĄCEGO kontrę-za-opłatę, nie do posiadacza priorytetu.
    if (state.pendingCounterPay && payChoice != null) {
      const payer = commands(state, state.pendingCounterPay.playerId);
      const decide = payer.find((c) => c.type === 'resolve_counter_pay_choice' && c.pay === payChoice);
      assert.ok(decide, 'decyzja zapłaty dostępna dla rzucającego');
      run(state, decide);
      continue;
    }
    const list = commands(state);
    const trig = list.find((c) => c.type === 'resolve_trigger_target');
    if (trig) {
      const pick = choose ? list.find((c) => c.type === 'resolve_trigger_target' && c.targetId === choose) : null;
      run(state, pick ?? trig);
      continue;
    }
    const payCmd = list.find((c) => c.type === 'resolve_counter_pay_choice' && c.pay === payChoice);
    if (payCmd) { run(state, payCmd); continue; }
    const resolving = list.find((c) => c.type.startsWith('resolve_'));
    if (resolving) { run(state, resolving); continue; }
    if (state.zones.stack.length === 0) return;
    const pass = list.find((c) => c.type === 'pass_priority');
    assert.ok(pass, 'stos ma legalny pass priority');
    run(state, pass);
  }
  assert.fail('przekroczono limit rozstrzygania stosu');
}

function sanity(id, { set, plan, artId, types, manaCost, power, toughness }) {
  const def = registry.get(id);
  const snap = snapshotOf(id);
  assert.ok(def, `${id} istnieje w rejestrze`);
  assert.equal(def.oracleText, snap.oracle_text, 'Oracle 1:1 ze snapshotem Scryfalla');
  assert.equal(def.set, set);
  assert.equal(def.plan, plan, 'plan z listy właściciela jest wiążący (1:1)');
  assert.equal(def.artId, artId);
  assert.equal(def.support.status, 'supported', '100%: karta wspierana');
  assert.deepEqual(def.support.limitations, [], 'bez ograniczeń');
  assert.equal(MANA_COSTS[id], snap.mana_cost, 'koszt w MANA_COSTS = dokładny druk');
  assert.equal(snap.print, set.toLowerCase());
  assert.ok(Array.isArray(snap.rulings), 'rulingi zapisane, także pusta lista');
  assert.deepEqual(def.types, types);
  assert.equal(def.manaCost, manaCost);
  if (power != null) { assert.equal(def.power, power); assert.equal(def.toughness, toughness); }
  return def;
}

// ---------- sanity danych: 10 kart z listy właściciela (1:1 Plan) ----------

test('B68 sanity: Kulrath Zealot (ECL 400, plan Lorwyn)', () => {
  const def = sanity('kulrath-zealot', { set: 'ECL', plan: 'Lorwyn', artId: 400, types: ['Creature'], manaCost: 6, power: 6, toughness: 5 });
  assert.deepEqual(def.subtypes, ['Elemental', 'Warrior']);
  assert.ok(def.abilities.some((a) => a.keyword === 'cycling' && JSON.stringify(a.cycling) === JSON.stringify({ allTypes: ['Basic', 'Land'] })), 'basic landcycling');
});
test('B68 sanity: Bloodfire Expert (KTK 402, plan Tarkir)', () => {
  const def = sanity('bloodfire-expert', { set: 'KTK', plan: 'Tarkir', artId: 402, types: ['Creature'], manaCost: 3, power: 3, toughness: 1 });
  assert.ok(def.abilities.some((a) => a.trigger?.event === 'you_cast_noncreature_spell'), 'prowess');
});
test('B68 sanity: Meteorite (DMU 404, plan Dominaria)', () => {
  const def = sanity('meteorite', { set: 'DMU', plan: 'Dominaria', artId: 404, types: ['Artifact'], manaCost: 5 });
  assert.ok(def.abilities.some((a) => a.trigger?.event === 'enter_battlefield' && a.trigger.requiresTarget?.type === 'any_target'), 'ETB any target');
  assert.ok(def.abilities.some((a) => a.cost?.tap && a.effect?.colors?.length === 5), 'mana any color');
});
test('B68 sanity: Raze to the Ground (BRO 405, plan Dominaria)', () => {
  const def = sanity('raze-to-the-ground', { set: 'BRO', plan: 'Dominaria', artId: 405, types: ['Sorcery'], manaCost: 3 });
  assert.equal(def.spell.cantBeCountered, true);
  assert.deepEqual(def.spell.targets, [{ type: 'artifact' }]);
  assert.deepEqual(def.spell.effects, [{ type: 'destroy_permanent', drawIfManaValueAtMost: 1 }]);
});
test('B68 sanity: Stymied Hopes (THS 406, plan Kaldheim)', () => {
  const def = sanity('stymied-hopes', { set: 'THS', plan: 'Kaldheim', artId: 406, types: ['Instant'], manaCost: 2 });
  assert.deepEqual(def.spell.effects, [{ type: 'counter_spell_unless_pays', amount: 1 }, { type: 'scry', amount: 1 }]);
});
test('B68 sanity: Secure the Scene (M21 407, plan Ravnica)', () => {
  const def = sanity('secure-the-scene', { set: 'M21', plan: 'Ravnica', artId: 407, types: ['Sorcery'], manaCost: 5 });
  assert.deepEqual(def.spell.targets, [{ type: 'nonland_permanent' }]);
  assert.equal(def.spell.effects[0].captureControllerAs, 'targetController');
  assert.equal(def.spell.effects[1].controllerFromCapture, 'targetController');
});
test('B68 sanity: Halo Scarab (SNC 408, plan New Capenna)', () => {
  const def = sanity('halo-scarab', { set: 'SNC', plan: 'New Capenna', artId: 408, types: ['Artifact', 'Creature'], manaCost: 2, power: 2, toughness: 1 });
  assert.deepEqual(def.subtypes, ['Insect']);
  assert.ok(def.abilities.some((a) => a.fromGraveyard && a.cost?.exileFromGraveyard && a.effect?.cardId === 'token_treasure'), 'z cmentarza: Treasure');
});
test('B68 sanity: Child of Night (M19 409, plan Warhammer Fantasy)', () => {
  const def = sanity('child-of-night', { set: 'M19', plan: 'Warhammer Fantasy', artId: 409, types: ['Creature'], manaCost: 2, power: 2, toughness: 1 });
  assert.deepEqual(def.keywords, ['lifelink']);
});
test('B68 sanity: Austere Command (CLB 410, plan Kaldheim) — choose two = 6 par', () => {
  const def = sanity('austere-command', { set: 'CLB', plan: 'Kaldheim', artId: 410, types: ['Sorcery'], manaCost: 6 });
  assert.equal(def.spell.modes.length, 6, 'C(4,2) par różnych trybów');
  assert.ok(def.spell.modes.every((m) => !m.targets || m.targets.length === 0), 'tryby bez celów');
});
test('B68 sanity: Neurok Invisimancer (SOM 411, plan Mirrodin)', () => {
  const def = sanity('neurok-invisimancer', { set: 'SOM', plan: 'Mirrodin', artId: 411, types: ['Creature'], manaCost: 3, power: 2, toughness: 1 });
  assert.ok(def.abilities.some((a) => a.type === 'static' && a.cantBeBlocked === true), 'stałe can\'t be blocked');
  assert.ok(def.abilities.some((a) => a.trigger?.event === 'enter_battlefield' && a.effect?.type === 'cant_be_blocked'), 'ETB');
});

// ---------- scenariusze legalne i nielegalne (prawdziwe karty, prawdziwy silnik) ----------

const castCmd = (state, objectId, extra = {}) => commands(state).find((c) => (c.type === 'cast_spell' || c.type === 'cast_permanent')
  && c.objectId === objectId && Object.entries(extra).every(([k, v]) => JSON.stringify(c[k]) === JSON.stringify(v)));

test('B68/400: Kulrath Zealot — ETB eksiluje wierzchnią kartę do zagrania do końca następnej tury', () => {
  const state = game();
  put(state, 'kz', 'kulrath-zealot');
  addMana(state, 'p1', 6, { colors: ['R'] });
  const libBefore = state.zones.library.filter((id) => state.objects.get(id)?.controllerId === 'p1').length;
  run(state, castCmd(state, 'kz'));
  settle(state);
  assert.ok(find(state, 'kulrath-zealot'), 'stwór na polu');
  const wygnane = [...state.objects.values()].filter((o) => o.zone === 'exile' && o.controllerId === 'p1');
  assert.equal(wygnane.length, 1, 'jedna karta wygnana z góry biblioteki');
  // Tura rzucającego: „koniec następnej tury” = numer bieżącej + 2 (silnik, ten sam wzorzec co Gila Courser).
  assert.equal(wygnane[0].playableUntilTurn, state.turn.number + 2, 'zagrywalna do końca następnej tury (stempel)');
  const libAfter = state.zones.library.filter((id) => state.objects.get(id)?.controllerId === 'p1').length;
  assert.equal(libBefore - libAfter, 1);
});

test('B68/400: basic landcycling {1}{R} z ręki dobiera podstawowy land; bez {R} — brak oferty', () => {
  const state = game();
  put(state, 'kz', 'kulrath-zealot');
  addMana(state, 'p1', 2, { colors: ['U'] });
  assert.ok(!commands(state).some((c) => c.type === 'activate_ability' && c.objectId === 'kz'), 'bez {R} nie ma cyklingu');
  const state2 = game();
  put(state2, 'kz', 'kulrath-zealot');
  addMana(state2, 'p1', 2, { colors: ['R'] });
  run(state2, commands(state2).find((c) => c.type === 'activate_ability' && c.objectId === 'kz'));
  settle(state2);
  assert.ok([...state2.objects.values()].some((o) => o.zone === 'hand' && o.controllerId === 'p1' && o.cardId === 'basic-swamp'), 'land w ręce');
  assert.ok(find(state2, 'kulrath-zealot', 'graveyard'), 'kartą cyklingu idzie na cmentarz');
});

test('B68/402: Bloodfire Expert — prowess: rzut czaru niebędącego stworem daje +1/+1', () => {
  const state = game();
  const bf = put(state, 'bf', 'bloodfire-expert', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'met', 'meteorite', 'p2', 'battlefield');
  put(state, 'raze', 'raze-to-the-ground');
  addMana(state, 'p1', 3, { colors: ['R'] });
  assert.equal(effectivePower(bf, state), 3);
  run(state, castCmd(state, 'raze', { targets: [state.objects.get('met').id] }));
  settle(state);
  assert.equal(effectivePower(state.objects.get('bf'), state), 4, 'prowess +1 do końca tury');
});

test('B68/404: Meteorite — ETB 2 obrażeń w wybrany cel; {T}: jedna mana (dowolny kolor)', () => {
  const state = game();
  put(state, 'met', 'meteorite');
  addMana(state, 'p1', 5);
  const lifeBefore = state.players.find((p) => p.id === 'p2').life;
  run(state, castCmd(state, 'met'));
  settle(state, { choose: 'p2' });
  assert.equal(state.players.find((p) => p.id === 'p2').life, lifeBefore - 2, 'ETB: 2 obrażenia celowi');
  const p1 = () => state.players.find((p) => p.id === 'p1');
  const manaBefore = p1().mana;
  const poolBefore = p1().manaPool?.WUBRG ?? 0;
  run(state, commands(state).find((c) => c.type === 'activate_ability' && c.objectId === find(state, 'meteorite').id));
  assert.equal(p1().mana, manaBefore + 1, 'tap: jedna mana');
  // „dowolny kolor”: jednostka trafia do puli z pełnym profilem WUBRG (nie do jednego koloru)
  assert.equal((p1().manaPool?.WUBRG ?? 0) - poolBefore, 1, 'tap: jednostka dowolnego koloru (WUBRG)');
});

test('B68/405: Raze to the Ground — nie da się skontrować (także Stymied Hopes z opcją zapłaty)', () => {
  const state = game();
  put(state, 'met', 'meteorite', 'p2', 'battlefield');
  put(state, 'raze', 'raze-to-the-ground');
  put(state, 'stym', 'stymied-hopes', 'p2');
  addMana(state, 'p1', 3, { colors: ['R'] });
  addMana(state, 'p2', 2, { colors: ['U'] });
  run(state, castCmd(state, 'raze', { targets: [state.objects.get('met').id] }));
  run(state, commands(state).find((c) => c.type === 'pass_priority'));
  const razeOnStack = [...state.objects.values()].find((o) => o.zone === 'stack' && o.cardId === 'raze-to-the-ground');
  run(state, commands(state, 'p2').find((c) => c.type === 'cast_spell' && c.objectId === 'stym' && c.targets?.[0] === razeOnStack.id));
  settle(state, { payChoice: false });
  assert.equal(find(state, 'meteorite'), undefined, 'artefakt zniszczony mimo kontry');
  assert.ok(find(state, 'raze-to-the-ground', 'graveyard'), 'Raze w grobie (rozstrzygnięty)');
});

test('B68/405: Raze — cel nie-artefakt jest nielegalny; MV≤1 dobiera kartę, MV>1 nie', () => {
  const state = game();
  const child = put(state, 'child', 'child-of-night', 'p2', 'battlefield');
  put(state, 'raze', 'raze-to-the-ground');
  addMana(state, 'p1', 3, { colors: ['R'] });
  assert.ok(!commands(state).some((c) => c.type === 'cast_spell' && c.objectId === 'raze' && c.targets?.[0] === child.id),
    'kreatura nie jest celem Raze');
  // MV 0 (Treasure) → dobranie
  put(state, 'tre', 'token_treasure', 'p2', 'battlefield');
  run(state, castCmd(state, 'raze', { targets: ['tre'] }));
  settle(state);
  assert.ok([...state.objects.values()].some((o) => o.zone === 'hand' && o.controllerId === 'p1' && o.cardId === 'basic-swamp'), 'MV ≤1: karta dobrana');
});

test('B68/405: Raze — artefakt MV 5 (Meteorite) nie dobiera', () => {
  const state = game();
  put(state, 'met', 'meteorite', 'p2', 'battlefield');
  put(state, 'raze', 'raze-to-the-ground');
  addMana(state, 'p1', 3, { colors: ['R'] });
  run(state, castCmd(state, 'raze', { targets: [state.objects.get('met').id] }));
  settle(state);
  assert.equal(find(state, 'meteorite'), undefined);
  assert.ok(!([...state.objects.values()].some((o) => o.zone === 'hand' && o.controllerId === 'p1' && o.cardId === 'basic-swamp')), 'MV 5: brak dobrania');
});

test('B68/406: Stymied Hopes — bez zapłaty {1} czar jest kontrowany; scry 1 wykonany', () => {
  const state = game();
  put(state, 'child', 'child-of-night');
  put(state, 'stym', 'stymied-hopes', 'p2');
  addMana(state, 'p1', 2, { colors: ['B'] });
  addMana(state, 'p2', 2, { colors: ['U'] });
  run(state, castCmd(state, 'child'));
  run(state, commands(state).find((c) => c.type === 'pass_priority'));
  const childOnStack = [...state.objects.values()].find((o) => o.zone === 'stack' && o.cardId === 'child-of-night');
  run(state, commands(state, 'p2').find((c) => c.type === 'cast_spell' && c.objectId === 'stym' && c.targets?.[0] === childOnStack.id));
  settle(state, { payChoice: false });
  assert.equal(find(state, 'child-of-night'), undefined, 'skontrowana');
  assert.ok(find(state, 'child-of-night', 'graveyard'), 'w grobie');
  assert.ok(state.events.some((e) => e.type === 'scry_started'), 'scry 1 wykonany (ruling: także przy braku zapłaty)');
});

test('B68/406: Stymied Hopes — zapłata {1} przez rzucającego utrzymuje czar', () => {
  const state = game();
  put(state, 'child', 'child-of-night');
  put(state, 'stym', 'stymied-hopes', 'p2');
  addMana(state, 'p1', 3, { colors: ['B'] });
  addMana(state, 'p2', 2, { colors: ['U'] });
  run(state, castCmd(state, 'child'));
  run(state, commands(state).find((c) => c.type === 'pass_priority'));
  const childOnStack = [...state.objects.values()].find((o) => o.zone === 'stack' && o.cardId === 'child-of-night');
  run(state, commands(state, 'p2').find((c) => c.type === 'cast_spell' && c.objectId === 'stym' && c.targets?.[0] === childOnStack.id));
  settle(state, { payChoice: true });
  assert.ok(find(state, 'child-of-night'), 'czar rozstrzygnięty: stwór na polu');
});

test('B68/407: Secure the Scene — wygnany stwór; ITS CONTROLLER (p2) dostaje token 1/1 Soldier', () => {
  const state = game();
  put(state, 'child', 'child-of-night', 'p2', 'battlefield');
  put(state, 'sec', 'secure-the-scene');
  addMana(state, 'p1', 5, { colors: ['W'] });
  run(state, castCmd(state, 'sec', { targets: ['child'] }));
  settle(state);
  assert.equal(find(state, 'child-of-night'), undefined, 'cel wygnany');
  assert.ok([...state.objects.values()].some((o) => o.zone === 'exile' && o.cardId === 'child-of-night'), 'w exile');
  const soldiers = [...state.objects.values()].filter((o) => o.zone === 'battlefield' && o.cardId === 'token_soldier');
  assert.equal(soldiers.length, 1);
  assert.equal(soldiers[0].controllerId, 'p2', 'token dla KONTROLERA celu (p2), nie dla rzucającego');
  assert.equal(effectivePower(soldiers[0], state), 1);
});

test('B68/408: Halo Scarab — z cmentarza {2}, wygnij: Treasure dla kontrolera', () => {
  const state = game();
  const halo = put(state, 'halo', 'halo-scarab', 'p1', 'graveyard');
  addMana(state, 'p1', 2);
  run(state, commands(state).find((c) => c.type === 'activate_ability' && c.objectId === halo.id));
  settle(state);
  assert.equal(find(state, 'halo-scarab', 'graveyard'), undefined, 'wygnana z cmentarza');
  const skarby = [...state.objects.values()].filter((o) => o.zone === 'battlefield' && o.cardId === 'token_treasure' && o.controllerId === 'p1');
  assert.equal(skarby.length, 1, 'Treasure dla p1');
  // Skarb daje jedną manę dowolnego koloru jako manę skarbową (kształt tokena, nie tylko jego istnienie)
  const treasure = skarby[0];
  run(state, commands(state).find((c) => c.type === 'activate_ability' && c.objectId === treasure.id));
  settle(state);
  const player = state.players.find((p) => p.id === 'p1');
  assert.equal(player.treasureMana, 1, 'Skarb: mana oznaczona jako skarbowa');
  assert.equal(player.manaPool?.WUBRG ?? 0, 1, 'Skarb: jednostka dowolnego koloru (WUBRG)');
});

test('B68/409: Child of Night — lifelink (efektywna zdolność na polu)', () => {
  const state = game();
  const child = put(state, 'child', 'child-of-night', 'p1', 'battlefield');
  assert.ok(effectiveKeywords(child, state).includes('lifelink'));
});

test('B68/410: Austere Command — sześć ofert; wybrane dwa tryby rozstrzygają się w kolejności drukowanej', () => {
  const state = game();
  put(state, 'aus', 'austere-command');
  put(state, 'met', 'meteorite', 'p1', 'battlefield');
  put(state, 'big', 'kulrath-zealot', 'p2', 'battlefield');
  put(state, 'small', 'child-of-night', 'p2', 'battlefield');
  addMana(state, 'p1', 6, { colors: ['W'] });
  const oferty = commands(state).filter((c) => c.type === 'cast_spell' && c.objectId === 'aus');
  assert.equal(new Set(oferty.map((c) => c.modeIndex)).size, 6, 'sześć par różnych trybów');
  // para (artefakty, stwory MV ≥4) = indeks 2
  run(state, oferty.find((c) => c.modeIndex === 2));
  settle(state);
  assert.equal(find(state, 'meteorite', 'graveyard') ? 'gy' : 'bf', 'gy', 'artefakt zniszczony');
  assert.equal(find(state, 'kulrath-zealot', 'graveyard') ? 'gy' : 'bf', 'gy', 'stwór MV 6 zniszczony');
  assert.ok(find(state, 'child-of-night'), 'stwór MV 2 poza wybranymi trybami — zostaje');
});

test('B68/411: Neurok Invisimancer — stały can\'t be blocked (statyczny) + ETB: cel can\'t be blocked tę turę', () => {
  const state = game();
  const target = put(state, 'child', 'child-of-night', 'p2', 'battlefield');
  put(state, 'neu', 'neurok-invisimancer');
  addMana(state, 'p1', 3, { colors: ['U'] });
  run(state, castCmd(state, 'neu'));
  settle(state, { choose: target.id });
  const neu = find(state, 'neurok-invisimancer');
  assert.ok(neu, 'na polu');
  assert.ok(effectiveAbilities(neu).some((a) => a.type === 'static' && a.cantBeBlocked === true), 'stała zdolność');
  assert.equal(state.objects.get(target.id).cantBeBlockedUntilTurn, state.turn.number + 1, 'ETB: cel nie może być blokowany');
});
