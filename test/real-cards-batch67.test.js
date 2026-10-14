// Batch 67 (2026-10-14) — fala A: 371 WAR, 380 DTK, 394 ALA, 397 SOS, 398 EOE;
// fala B: 369 ELD Improbable Alliance (token 1/1 U Faerie z lataniem + loot,
// mechaniki istniejące: trigger `you_draw_second_card_each_turn` i
// `draw_then_discard`; nowy jest wyłącznie wpis tokena `token_faerie`);
// fala C: 391 ELD Wolf's Quarry (trzy tokeny 1/1 G Boar, każdy z triggerem
// śmierci tworzącym Food — token z ZDOLNOŚCIĄ, zdublowaną w deskryptorze
// i wpisie katalogu, M121).
// Plan: docs/plans/PLAN_2026-10-14-batch67-kolekcja-369-398.md.
// Dane Oracle i rulingi: docs/cards/scryfall-*.json (dokładny druk `set=`,
// pobrane 2026-10-14). Każda karta ma sanity + scenariusz legalny i nielegalny.
//
// Karty tej fali stoją na istniejących mechanikach (counter_spell, pump+rebound,
// reveal_hand_choose_discard, add_counter, zdolność aktywowana). Jedyna zmiana
// w silniku to generyczny cel „instant or sorcery card from your graveyard”
// dla czaru/zdolności (predykat `graveyard-types.isInstantOrSorceryCardInGraveyard`,
// ten sam co dotąd w triggerach) — pinuje go Spellkeeper Weird.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createGameState, addObject, execute, playerView, moveObjectDirectly,
} from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { MANA_COSTS } from '../src/cards/mana-costs-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { drawPlayerCards } from '../src/engine/effects.js';
import { processTriggers } from '../src/engine/triggers.js';
import { destroyPermanents } from '../src/engine/destruction.js';
import { effectivePower, effectiveToughness } from '../src/engine/permanents.js';

const registry = createCardRegistry();

function game(players = ['p1', 'p2']) {
  const state = createGameState({ seed: 67, players: players.map((id) => ({ id })) });
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

/** Rozstrzyga stos oraz proste, niekontrowersyjne decyzje (pierwsza oferta). */
function settle(state, max = 80) {
  for (let i = 0; i < max; i += 1) {
    const choices = commands(state);
    const resolving = choices.find((command) => command.type.startsWith('resolve_'));
    if (resolving) {
      run(state, resolving);
      continue;
    }
    if (state.zones.stack.length === 0) return;
    const pass = choices.find((command) => command.type === 'pass_priority');
    assert.ok(pass, 'stos ma legalny pass priority');
    run(state, pass);
  }
  assert.fail('przekroczono limit rozstrzygania stosu');
}

function sanity(id, { set, plan, artId }) {
  const def = registry.get(id);
  const snap = snapshotOf(id);
  assert.ok(def, `${id} istnieje w rejestrze`);
  assert.equal(def.oracleText, snap.oracle_text, 'Oracle 1:1 ze snapshotem Scryfalla');
  assert.equal(def.set, set);
  assert.equal(def.plan, plan, 'plan właściciela jest wiążący');
  assert.equal(def.artId, artId);
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
  assert.equal(MANA_COSTS[id], snap.mana_cost, 'koszt w MANA_COSTS = dokładny druk');
  assert.equal(snap.print, set.toLowerCase());
  assert.ok(Array.isArray(snap.rulings), 'rulingi zapisane, także pusta lista');
  return def;
}

// ---- B67/371: Spellkeeper Weird -------------------------------------------

test('B67/371: Spellkeeper Weird — dane Oracle WAR i zdolność z kosztem {2},{T},Poświęć', () => {
  const def = sanity('spellkeeper-weird', { set: 'WAR', plan: 'Ravnica', artId: 371 });
  assert.deepEqual(def.types, ['Creature']);
  assert.deepEqual(def.subtypes, ['Weird']);
  assert.deepEqual(def.colors, ['U']);
  assert.equal(def.power, 1);
  assert.equal(def.toughness, 4);
  assert.equal(def.manaCost, 3);
  const zdolnosc = (def.abilities ?? []).find((a) => a.type === 'activated');
  assert.deepEqual(zdolnosc.cost, { mana: 2, tap: true, sacrificeSelf: true });
  assert.equal(zdolnosc.targets[0].type, 'instant_or_sorcery_card_in_graveyard');
});

test('B67/371: zwraca instant z WŁASNEGO grobu do ręki (instant, nie stwór)', () => {
  const state = game();
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  const weird = put(state, 'weird', 'spellkeeper-weird', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'instant', 'cancel', 'p1', 'graveyard');
  put(state, 'creature', 'sporecap-spider', 'p1', 'graveyard');
  addMana(state, 'p1', 2, { colors: [] });
  const oferta = commands(state).find((c) => c.type === 'activate_ability' && c.objectId === weird.id);
  assert.ok(oferta, 'oferta aktywacji przy instantcie w grobie');
  assert.equal(oferta.targets[0], 'instant', 'jedynym legalnym celem jest karta Instant — nie stwór');
  run(state, oferta);
  settle(state); // aktywowana zdolność idzie na stos (CR 602.2)
  assert.ok(find(state, 'cancel', 'hand'), 'karta wróciła do ręki');
  assert.ok(find(state, 'sporecap-spider', 'graveyard'), 'stwór w grobie został nietknięty');
  assert.ok(find(state, 'spellkeeper-weird', 'graveyard'), 'koszt poświęcenia zapłacony');
});

test('B67/371 nielegalny: brak instant/sorcery w grobie → zdolność nie jest oferowana', () => {
  const state = game();
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  const weird = put(state, 'weird', 'spellkeeper-weird', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'creature', 'sporecap-spider', 'p1', 'graveyard');
  addMana(state, 'p1', 10, { colors: [] });
  assert.ok(!commands(state).some((c) => c.type === 'activate_ability' && c.objectId === weird.id),
    'sam stwór w grobie nie daje legalnego celu');
  const wymuszone = execute(state, {
    type: 'activate_ability', playerId: 'p1', objectId: weird.id, abilityIndex: 0, targets: ['creature'],
  });
  assert.equal(wymuszone.ok, false, 'walidacja odrzuca cel-kartę stwora');
  assert.ok(find(state, 'spellkeeper-weird', 'battlefield'), 'odrzucona aktywacja nie płaci kosztu');
});

// ---- B67/380: Artful Maneuver ---------------------------------------------

test('B67/380: Artful Maneuver — dane Oracle DTK, +2/+2 z reboundem', () => {
  const def = sanity('artful-maneuver', { set: 'DTK', plan: 'Tarkir', artId: 380 });
  assert.deepEqual(def.types, ['Instant']);
  assert.deepEqual(def.colors, ['W']);
  assert.equal(def.manaCost, 2);
  assert.equal(def.spell.rebound, true);
  assert.deepEqual(def.spell.effects, [{ type: 'pump', power: 2, toughness: 2 }]);
});

test('B67/380: rzut daje +2/+2 do końca tury, a karta idzie do exile z gotowym reboundem', () => {
  const state = game();
  const cel = put(state, 'cel', 'sporecap-spider', 'p1', 'battlefield', { summoningSickness: false });
  addMana(state, 'p1', 2, { colors: ['W'] });
  const rzut = commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'manewr');
  put(state, 'manewr', 'artful-maneuver', 'p1', 'hand');
  const oferta = commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'manewr');
  assert.ok(oferta, 'oferta rzutu (cel = stwór)');
  assert.equal(oferta.targets[0], cel.id, 'cel wskazuje stwora');
  run(state, oferta);
  settle(state);
  const poPompie = state.objects.get(cel.id); // pump podmienia obiekt na nowy (zamrożony)
  assert.equal(effectivePower(poPompie, state), 1 + 2, 'moc 1/5 + 2');
  assert.equal(effectiveToughness(poPompie, state), 5 + 2, 'wytrzymałość 1/5 + 2');
  const wygnany = find(state, 'artful-maneuver', 'exile');
  assert.ok(wygnany, 'rebound: karta na stosie poszła do exile, nie do grobu');
  assert.equal(wygnany.reboundReady, true, 'gotowa do darmowego rzutu w następnym upkeepie');
  assert.equal(rzut?.ok, undefined, 'brak wcześniejszej oferty przed dodaniem karty do ręki');
});

test('B67/380 nielegalny: brak stwora na stole → nie ma oferty rzutu', () => {
  const state = game();
  put(state, 'manewr', 'artful-maneuver', 'p1', 'hand');
  addMana(state, 'p1', 2, { colors: ['W'] });
  assert.ok(!commands(state).some((c) => c.type === 'cast_spell' && c.objectId === 'manewr'),
    'instant z celem wymaga stwora na stole');
});

// ---- B67/394: Cancel ------------------------------------------------------

test('B67/394: Cancel — dane Oracle ALA i kontra na stosie', () => {
  const def = sanity('cancel', { set: 'ALA', plan: 'Amonkhet', artId: 394 });
  assert.deepEqual(def.types, ['Instant']);
  assert.deepEqual(def.colors, ['U']);
  assert.equal(def.manaCost, 3);
  assert.deepEqual(def.spell.targets, [{ type: 'spell_on_stack' }]);
  assert.deepEqual(def.spell.effects, [{ type: 'counter_spell' }]);
});

test('B67/394: kontruje czar przeciwnika — czar ląduje w grobie, efekt nie zachodzi', () => {
  const state = game();
  put(state, 'artifact', 'universal-solvent', 'p1', 'battlefield');
  put(state, 'naturalize', 'naturalize', 'p2', 'hand');
  put(state, 'cancel', 'cancel', 'p1', 'hand');
  addMana(state, 'p2', 2, { colors: ['G'] });
  addMana(state, 'p1', 3, { colors: ['U', 'U'] });
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p2';
  run(state, commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'naturalize'));
  state.turn.priorityPlayerId = 'p1';
  const kontra = commands(state, 'p1').find((c) => c.type === 'cast_spell' && c.objectId === 'cancel');
  assert.ok(kontra, 'Cancel jest oferowany, gdy na stosie leży czar wroga');
  run(state, kontra);
  settle(state);
  assert.ok(find(state, 'naturalize', 'graveyard'), 'skontrowany czar poszedł do grobu');
  assert.ok(find(state, 'universal-solvent', 'battlefield'), 'efekt skontrowanego czaru nie zaszedł');
  assert.ok(find(state, 'cancel', 'graveyard'), 'Cancel sam rozstrzygnął się do grobu');
});

test('B67/394 nielegalny: Cancel nie celuje w permanenty ani własne czary', () => {
  const state = game();
  put(state, 'artifact', 'universal-solvent', 'p2', 'battlefield');
  put(state, 'cancel', 'cancel', 'p1', 'hand');
  addMana(state, 'p1', 3, { colors: ['U', 'U'] });
  assert.ok(!commands(state).some((c) => c.type === 'cast_spell' && c.objectId === 'cancel'),
    'pusty stos = brak rzucalnego celu');
  const wymuszone = execute(state, {
    type: 'cast_spell', playerId: 'p1', objectId: 'cancel', targets: ['artifact'],
  });
  assert.equal(wymuszone.ok, false, 'permanent nie jest czarem na stosie');
});

// ---- B67/397: Render Speechless -------------------------------------------

test('B67/397: Render Speechless — dane Oracle SOS, wybór OBOWIĄZKOWY + dwa liczniki', () => {
  const def = sanity('render-speechless', { set: 'SOS', plan: 'Arcavios', artId: 397 });
  assert.deepEqual(def.types, ['Sorcery']);
  assert.deepEqual(def.colors, ['B', 'W']);
  assert.equal(def.manaCost, 4);
  assert.deepEqual(def.spell.targets, [{ type: 'opponent' }, { type: 'creature', optional: true }]);
  assert.equal(def.spell.effects[0].mandatory, true,
    'Oracle bez „you may" — inaczej niż Nightsnare (ruling brak, tekst druku)');
});

test('B67/397: odrzucenie wybrane przez rzucającego + dwa +1/+1 na własnym stworze', () => {
  const state = game();
  const moj = put(state, 'moj', 'sporecap-spider', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'ofiary', 'intrepid-tenderfoot', 'p2', 'hand');
  put(state, 'ofiary2', 'cancel', 'p2', 'hand');
  put(state, 'grunt', 'basic-forest', 'p2', 'hand');
  put(state, 'czar', 'render-speechless', 'p1', 'hand');
  addMana(state, 'p1', 4, { colors: ['W', 'B'] });
  const rzut = commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'czar'
    && c.targets?.[1] === moj.id);
  assert.ok(rzut, 'oferta rzutu z celem-wrogiem i opcjonalnym własnym stworzeniem');
  run(state, rzut);
  // Uwaga: `settle` NIE może tu być użyte — rozstrzygnęłoby także decyzję
  // o odrzuceniu (komenda `resolve_discard_choice` też zaczyna się od
  // „resolve_"). Rozstrzygamy tylko stos, aż otworzy się decyzja.
  for (let i = 0; i < 12 && !state.pendingDiscardChoice; i += 1) {
    const ch = commands(state);
    const stosowy = ch.find((c) => c.type.startsWith('resolve_') && c.type !== 'resolve_discard_choice');
    if (stosowy) { run(state, stosowy); continue; }
    if (state.zones.stack.length === 0) break;
    run(state, ch.find((c) => c.type === 'pass_priority'));
  }
  // Decyzja o odrzuceniu należy do RZUCAJĄCEGO (p1), nie do właściciela ręki.
  assert.ok(state.pendingDiscardChoice, 'otwarta decyzja o odrzuceniu');
  assert.equal(state.pendingDiscardChoice.chooserId, 'p1', 'wybiera rzucający');
  assert.deepEqual([...state.pendingDiscardChoice.handIds].sort(), ['ofiary', 'ofiary2'],
    'kandydatami są wyłącznie karty nielandowe (ląd zostaje w ręce)');
  run(state, commands(state, 'p1').find((c) => c.type === 'resolve_discard_choice'));
  settle(state); // domknięcie czaru: drugi efekt (liczniki) po decyzji
  const wGrobowcu = [...state.objects.values()]
    .filter((o) => o.controllerId === 'p2' && o.zone === 'graveyard').length;
  assert.equal(wGrobowcu, 1, 'odrzucona dokładnie jedna karta');
  assert.equal([...state.objects.values()]
    .filter((o) => o.controllerId === 'p2' && o.zone === 'hand').length, 2,
  'w ręce zostają dwie karty (ląd i druga nielandowa)');
  const liczniki = find(state, 'sporecap-spider', 'battlefield').counters?.['+1/+1'] ?? 0;
  assert.equal(liczniki, 2, 'dwa +1/+1 na wskazanym stworze');
});

test('B67/397 nielegalny: wróg z samymi lądami → nikt nie odrzuca, bez kary „if you don\'t"', () => {
  const state = game();
  const moj = put(state, 'moj', 'sporecap-spider', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'grunt1', 'basic-forest', 'p2', 'hand');
  put(state, 'grunt2', 'basic-island', 'p2', 'hand');
  put(state, 'czar', 'render-speechless', 'p1', 'hand');
  addMana(state, 'p1', 4, { colors: ['W', 'B'] });
  run(state, commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'czar'
    && c.targets?.[1] === moj.id));
  settle(state);
  assert.ok(!state.pendingDiscardChoice, 'brak nie-lądów = brak decyzji (mandatory bez celu)');
  assert.equal([...state.objects.values()]
    .filter((o) => o.controllerId === 'p2' && o.zone === 'hand').length, 2,
  'oba lądy zostają w ręce — bez kary „if you don\'t"');
  assert.equal(find(state, 'sporecap-spider', 'battlefield').counters?.['+1/+1'] ?? 0, 2,
    'liczniki i tak wchodzą');
});

// ---- B67/398: Intrepid Tenderfoot -----------------------------------------

test('B67/398: Intrepid Tenderfoot — dane Oracle EOE i licznik tylko w swojej fazie głównej', () => {
  const def = sanity('intrepid-tenderfoot', { set: 'EOE', plan: 'The Edge', artId: 398 });
  assert.deepEqual(def.types, ['Creature']);
  assert.deepEqual(def.subtypes, ['Insect', 'Citizen']);
  assert.deepEqual(def.colors, ['G']);
  assert.equal(def.power, 2);
  assert.equal(def.toughness, 2);
  const zdolnosc = (def.abilities ?? []).find((a) => a.type === 'activated');
  assert.equal(zdolnosc.timing, 'sorcery', '„Activate only as a sorcery"');
  assert.deepEqual(zdolnosc.cost, { mana: 3 });

  const state = game();
  const stwor = put(state, 'tender', 'intrepid-tenderfoot', 'p1', 'battlefield', { summoningSickness: false });
  addMana(state, 'p1', 3, { colors: [] });
  const oferta = commands(state).find((c) => c.type === 'activate_ability' && c.objectId === stwor.id);
  assert.ok(oferta, 'oferta w main phase');
  run(state, oferta);
  settle(state); // zdolność aktywowana rozstrzyga się ze stosu
  assert.equal(find(state, 'intrepid-tenderfoot', 'battlefield').counters?.['+1/+1'], 1);
});

test('B67/398 nielegalny: poza własną fazą główną zdolność nie jest oferowana', () => {
  const state = game();
  const stwor = put(state, 'tender', 'intrepid-tenderfoot', 'p1', 'battlefield', { summoningSickness: false });
  addMana(state, 'p1', 3, { colors: [] });
  state.turn = jumpToStep(state.turn, 'upkeep', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  assert.ok(!commands(state, 'p1').some((c) => c.type === 'activate_ability' && c.objectId === stwor.id),
    'upkeep to nie faza główna');
  const wymuszone = execute(state, {
    type: 'activate_ability', playerId: 'p1', objectId: stwor.id, abilityIndex: 0,
  });
  assert.equal(wymuszone.ok, false, 'walidacja odrzuca aktywację poza fazą główną');
});

test('B67/371+380: ruch kart między strefami nie tworzy drugiego celu (spójność obiektów)', () => {
  const state = game();
  const weird = put(state, 'weird', 'spellkeeper-weird', 'p1', 'battlefield', { summoningSickness: false });
  const manewr = put(state, 'manewr', 'artful-maneuver', 'p1', 'hand');
  moveObjectDirectly(state, manewr.id, 'graveyard', 'grave-manewr');
  addMana(state, 'p1', 5, { colors: ['W'] });
  const oferta = commands(state).find((c) => c.type === 'activate_ability' && c.objectId === weird.id);
  assert.ok(oferta, 'instant w grobie jest celem zdolności');
  assert.equal(oferta.targets[0], state.objects.get('grave-manewr').id,
    'cel wskazuje DOKŁADNIE obiekt w grobie (po przeniesieniu ma nowe id)');
});

// ---- B67/369: Improbable Alliance -----------------------------------------

test('B67/369: Improbable Alliance — dane Oracle ELD, trigger drugiej karty i loot', () => {
  const def = sanity('improbable-alliance', { set: 'ELD', plan: 'Eldraine', artId: 369 });
  assert.deepEqual(def.types, ['Enchantment']);
  assert.deepEqual(def.colors, ['U', 'R']);
  assert.equal(def.manaCost, 2);
  const trigger = def.abilities.find((a) => a.trigger?.event === 'you_draw_second_card_each_turn');
  assert.ok(trigger, 'trigger „drugiej karty w turze”');
  assert.deepEqual(trigger.effect[0].keywords, ['flying'], 'token 1/1 U Faerie z lataniem');
  assert.deepEqual(trigger.effect[0].colors, ['U']);
  assert.equal(trigger.effect[0].cardId, 'token_faerie');
  const activated = def.abilities.find((a) => a.type === 'activated');
  assert.deepEqual(activated.cost, { mana: 6, colors: ['U', 'R'] });
  assert.deepEqual(activated.effect, { type: 'draw_then_discard', amount: 1 });
  // Token z deskryptora ma wpis w katalogu z grafiką Scryfalla (M369).
  const token = registry.get('token_faerie');
  assert.equal(token.support.status, 'token');
  assert.match(token.imageUri ?? '', /^https:\/\/cards\.scryfall\.io\/large\//);
  assert.deepEqual(token.keywords, ['flying']);
});

const faerieCount = (state, playerId = 'p1') => [...state.objects.values()]
  .filter((o) => o.cardId === 'token_faerie' && o.zone === 'battlefield' && o.controllerId === playerId)
  .length;

test('B67/369: druga karta w turze tworzy JEDNEGO 1/1 U Faerie z lataniem', () => {
  const state = game();
  put(state, 'alliance', 'improbable-alliance', 'p1', 'battlefield');
  for (const id of ['l1', 'l2', 'l3']) put(state, id, 'basic-island', 'p1', 'library');
  // Pierwsza karta w turze — trigger jeszcze nie odpala (CR 121.6).
  let before = state.events.length;
  drawPlayerCards(state, 'p1', 1, 'effect');
  processTriggers(state, state.events.slice(before));
  settle(state);
  assert.equal(faerieCount(state), 0, 'pierwsza karta nie tworzy tokena');
  // Druga karta — dokładnie jeden token.
  before = state.events.length;
  drawPlayerCards(state, 'p1', 1, 'effect');
  processTriggers(state, state.events.slice(before));
  settle(state);
  assert.equal(faerieCount(state), 1, 'druga karta tworzy jednego Faerie');
  const token = [...state.objects.values()].find((o) => o.cardId === 'token_faerie');
  assert.deepEqual(token.colors, ['U']);
  assert.deepEqual(token.keywords, ['flying']);
  assert.equal(token.power, 1);
  assert.equal(token.toughness, 1);
  assert.equal(effectivePower(token, state), 1, 'token 1/1 (bazowa moc z definicji tokena)');
  // Trzecia karta nie tworzy kolejnego (ruling 2019-10-04).
  before = state.events.length;
  drawPlayerCards(state, 'p1', 1, 'effect');
  processTriggers(state, state.events.slice(before));
  settle(state);
  assert.equal(faerieCount(state), 1, 'trzecia karta w turze nie tworzy drugiego tokena');
});

test('B67/369: {4}{U}{R} — dobranie, potem odrzucenie (wybór rzucającego)', () => {
  const state = game();
  put(state, 'alliance', 'improbable-alliance', 'p1', 'battlefield');
  put(state, 'c1', 'cancel', 'p1', 'hand');
  put(state, 'c2', 'cancel', 'p1', 'hand');
  addMana(state, 'p1', 6, { colors: ['U', 'R'] });
  const activation = commands(state).find((c) => c.type === 'activate_ability' && c.objectId === 'alliance');
  run(state, activation);
  assert.equal(state.cardsDrawnThisTurn.p1 ?? 0, 0,
    'zdolność aktywowana czeka na rozstrzygnięcie ze stosu — dobranie jeszcze nie zaszło');
  // Rozstrzygamy stos, ale NIE decyzji o odrzuceniu (patrz test B67/397).
  for (let i = 0; i < 12 && !state.pendingDiscardChoice; i += 1) {
    const ch = commands(state);
    const stosowy = ch.find((c) => c.type.startsWith('resolve_') && c.type !== 'resolve_discard_choice');
    if (stosowy) { run(state, stosowy); continue; }
    if (state.zones.stack.length === 0) break;
    run(state, ch.find((c) => c.type === 'pass_priority'));
  }
  assert.ok(state.pendingDiscardChoice, 'loot otwiera decyzję o odrzuceniu po dobraniu');
  // Ścieżka `draw_then_discard` trzyma odrzucającego w `playerId` (kontroler
  // źródła); `chooserId` należy do `reveal_hand_choose_discard` (B67/397).
  assert.equal(state.pendingDiscardChoice.playerId, 'p1', 'odrzuca kontroler źródła (loot)');
  assert.equal(state.cardsDrawnThisTurn.p1, 1, 'zdolność dobrała dokładnie jedną kartę');
  const wRece = [...state.objects.values()].filter((o) => o.zone === 'hand').map((o) => o.id).sort();
  assert.deepEqual([...state.pendingDiscardChoice.handIds].sort(), wRece,
    '„then discard a card”: kandydatem jest DOWOLNA karta z ręki po dobraniu (loot, nie wybór nie-lądu)');
  run(state, commands(state, 'p1').find((c) => c.type === 'resolve_discard_choice'));
  settle(state);
  const grob = [...state.objects.values()].filter((o) => o.zone === 'graveyard');
  assert.equal(grob.length, 1, 'odrzucona dokładnie jedna karta');
  assert.equal(grob[0].controllerId, 'p1', 'karta odrzucona przez rzucającego idzie do JEGO grobu');
  // Ręka: 2 karty wyjściowe + 1 dobrana − 1 odrzucona. Która karta poleciała do
  // grobu zależy od wyboru gracza (loot pozwala odrzucić także ląd) — test
  // pilnuje LICZB, nie tożsamości karty (tożsamość wybiera człowiek/bot).
  assert.equal([...state.objects.values()].filter((o) => o.zone === 'hand').length, 2,
    'w ręce zostały dwie karty');
});

test('B67/369 nielegalny: bez many {4}{U}{R} zdolność nie jest oferowana', () => {
  const state = game();
  put(state, 'alliance', 'improbable-alliance', 'p1', 'battlefield');
  for (const id of ['l1', 'l2']) put(state, id, 'basic-island', 'p1', 'library');
  addMana(state, 'p1', 5, { colors: ['U', 'R'] });
  assert.equal(commands(state).filter((c) => c.type === 'activate_ability' && c.objectId === 'alliance').length, 0,
    'o jedno mana za mało — brak oferty (koszt liczony z pipami {U}{R})');
  addMana(state, 'p1', 1, { colors: [] });
  assert.equal(commands(state).filter((c) => c.type === 'activate_ability' && c.objectId === 'alliance').length, 1,
    'dokładnie szósta mana odblokowuje ofertę');
});

test('B67/369 nielegalny: wejście PO dobraniu drugiej karty nie łapie triggera tej tury', () => {
  const state = game();
  // Enchantment leży poza polem bitwy (w ręce) — ruling 2019-10-04: brak
  // permanentu w chwili dobrania drugiej karty = zdolność nie odpala wcale.
  put(state, 'alliance', 'improbable-alliance', 'p1', 'hand');
  for (const id of ['l1', 'l2', 'l3']) put(state, id, 'basic-island', 'p1', 'library');
  let before = state.events.length;
  drawPlayerCards(state, 'p1', 2, 'effect');
  processTriggers(state, state.events.slice(before));
  settle(state);
  assert.equal(state.cardsDrawnThisTurn.p1, 2, 'dwie karty dobrane');
  // Wejście na stół PO drugim dobraniu nie nadrabia triggera…
  const wRece = state.objects.get('alliance');
  moveObjectDirectly(state, wRece.id, 'battlefield', 'alliance-na-stole');
  before = state.events.length;
  drawPlayerCards(state, 'p1', 1, 'effect');
  processTriggers(state, state.events.slice(before));
  settle(state);
  assert.equal(faerieCount(state), 0, 'trzecia karta to nie „druga” — brak tokena');
});

// ---- B67/391: Wolf's Quarry ------------------------------------------------

const boarCount = (state, playerId = 'p1') => [...state.objects.values()]
  .filter((o) => o.cardId === 'token_boar' && o.zone === 'battlefield' && o.controllerId === playerId)
  .length;

test('B67/391: Wolf\'s Quarry — dane Oracle ELD i trzy Boary z triggerem śmierci', () => {
  const def = sanity('wolfs-quarry', { set: 'ELD', plan: 'Eldraine', artId: 391 });
  assert.deepEqual(def.types, ['Sorcery']);
  assert.deepEqual(def.colors, ['G']);
  assert.equal(def.manaCost, 6);
  assert.deepEqual(def.spell.effects[0].amount, 3, 'trzy tokeny');
  assert.equal(def.spell.effects[0].cardId, 'token_boar');
  const dies = def.spell.effects[0].abilities[0];
  assert.equal(dies.trigger.event, 'dies');
  assert.equal(dies.effect.cardId, 'token_food');
  assert.deepEqual(dies.effect.subtypes, ['Food']);
  // Token Boar ma wpis w katalogu z grafiką i tą SAMĄ zdolnością (M121).
  const boar = registry.get('token_boar');
  assert.equal(boar.support.status, 'token');
  assert.match(boar.imageUri ?? '', /^https:\/\/cards\.scryfall\.io\/large\//);
  assert.deepEqual(boar.abilities[0].trigger, dies.trigger);
  assert.deepEqual(boar.abilities[0].effect.cardId, dies.effect.cardId);
  assert.deepEqual(boar.colors, ['G']);
  assert.equal(boar.power, 1);
  assert.equal(boar.toughness, 1);
});

test('B67/391: rzut tworzy trzy Boary, a śmierć jednego daje Food', () => {
  const state = game();
  put(state, 'quarry', 'wolfs-quarry', 'p1', 'hand');
  addMana(state, 'p1', 7, { colors: ['G', 'G'] });
  const rzut = commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'quarry');
  assert.ok(rzut, 'oferta rzutu za {4}{G}{G}');
  run(state, rzut);
  settle(state);
  assert.equal(boarCount(state), 3, 'trzy tokeny Boar');
  for (const boar of [...state.objects.values()].filter((o) => o.cardId === 'token_boar')) {
    assert.equal(effectivePower(boar, state), 1);
    assert.equal(effectiveToughness(boar, state), 1);
    assert.deepEqual(boar.colors, ['G']);
  }
  // Śmierć JEDNEGO Boara → jeden Food (trigger tokenu, nie czaru).
  const jeden = [...state.objects.values()].find((o) => o.cardId === 'token_boar');
  const przed = state.events.length;
  destroyPermanents(state, [jeden.id]); // „dies” idzie przez pipeline zniszczenia
  processTriggers(state, state.events.slice(przed));
  settle(state);
  const food = [...state.objects.values()].filter((o) => o.cardId === 'token_food' && o.zone === 'battlefield');
  assert.equal(food.length, 1, 'martwy Boar tworzy Food');
  assert.equal(boarCount(state), 2, 'dwa Boary zostały na stole');
  assert.deepEqual(food[0].types.includes('Creature'), false, 'Food to artefakt, nie stworzenie (ruling 1)');
  assert.deepEqual(food[0].subtypes, ['Food']);
  // Food ma własną zdolność z katalogu (M121: etykieta panelu czyta rejestr).
  const foodAbility = registry.get('token_food').abilities[0];
  assert.deepEqual(foodAbility.cost, { mana: 2, tap: true, sacrificeSelf: true });
  assert.deepEqual(foodAbility.effect, { type: 'gain_life', amount: 3 });
});

test('B67/391 nielegalny: bez siedmiu many nie ma oferty rzutu', () => {
  const state = game();
  put(state, 'quarry', 'wolfs-quarry', 'p1', 'hand');
  addMana(state, 'p1', 5, { colors: ['G'] });
  assert.equal(commands(state).filter((c) => c.type === 'cast_spell' && c.objectId === 'quarry').length, 0,
    'za mało many na {4}{G}{G} (6 many, są 5) — brak oferty');
  addMana(state, 'p1', 1, { colors: ['G'] });
  assert.equal(commands(state).filter((c) => c.type === 'cast_spell' && c.objectId === 'quarry').length, 1,
    'szósta mana odblokowuje rzut');
});

test('B67/391 nielegalny: sorcery nie rzucisz w turze przeciwnika', () => {
  const state = game();
  put(state, 'quarry', 'wolfs-quarry', 'p1', 'hand');
  addMana(state, 'p1', 7, { colors: ['G', 'G'] });
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  drawPlayerCards(state, 'p2', 1, 'effect');
  const ofertaP2 = commands(state, 'p2').filter((c) => c.type === 'cast_spell' && c.objectId === 'quarry');
  assert.equal(ofertaP2.length, 0, 'sorcery tylko w swojej fazie głównej');
});
