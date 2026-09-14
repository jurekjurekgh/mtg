import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { MANA_COSTS } from '../src/cards/mana-costs-data.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { effectivePower, effectiveToughness } from '../src/engine/permanents.js';
import { moveObjectDirectly } from '../src/engine/objects.js';
import { addCounter } from '../src/engine/counters.js';

/**
 * Batch 55 (2026-09-14) — karty właściciela: 23, 609–617.
 *
 * Dane Oracle i rulingi: `docs/cards/scryfall-*.json` (pobrane 2026-09-14,
 * ADR 0030). Katalog: `src/cards/card-data.js`; artId/plan:
 * `tools/collection-art-ids.csv`.
 *
 * Podział na sekcje = etapy batcha (B1: 616/617/610, B2: 611/614,
 * B3: 609/615, B4: 23, B5: 612, B6: 613). Każda sekcja ma scenariusz
 * legalny, nielegalny i interakcje z istniejącym katalogiem (ADR 0010).
 */
const registry = createCardRegistry();

function game(players = ['p1', 'p2']) {
  const state = createGameState({ seed: 55, players: players.map((id) => ({ id })) });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  for (const playerId of players) for (let i = 0; i < 3; i++) put(state, `lib-${playerId}-${i}`, 'basic-swamp', playerId, 'library');
  return state;
}

function put(state, id, cardId, playerId = 'p1', zone = 'hand') {
  const def = registry.get(cardId);
  assert.ok(def, `${cardId} w prawdziwym rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId,
    zone, ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes, keywords: def.keywords,
  });
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
const life = (s, p) => s.players.find((o) => o.id === p).life;

/** Sprite do końca tury: przechodzi same passy, aż zmieni się numer tury. */
function passTurnToEnd(state, targetTurn) {
  for (let i = 0; i < 200 && state.turn.number < targetTurn; i += 1) {
    const holder = state.turn.priorityPlayerId;
    const view = playerView(state, holder);
    const cmd = view.legalCommands.find((c) => c.type === 'pass_priority')
      ?? view.legalCommands.find((c) => c.type.startsWith('declare_'))
      ?? view.legalCommands[0];
    if (!cmd) break;
    if (!execute(state, cmd).ok) break;
  }
  assert.ok(state.turn.number >= targetTurn, 'tura przeszła do końca (cleanup się wykonał)');
}

/** Sanity danych karty: snapshot ↔ katalog ↔ arkusz (jedna reguła dla sekcji). */
function sanity(id, artId, set, plan) {
  test(`B55: ${id} — druk, Oracle, artId, plan, pełne wsparcie`, () => {
    const def = registry.get(id);
    const src = JSON.parse(fs.readFileSync(new URL(`../docs/cards/scryfall-${id}.json`, import.meta.url)));
    assert.ok(def);
    assert.equal(def.artId, artId); assert.equal(def.set, set); assert.equal(def.plan, plan);
    assert.equal(def.oracleText, src.oracle_text);
    assert.equal(def.imageUri, src.image_uris.large);
    assert.equal(def.manaCost, src.cmc); assert.equal(MANA_COSTS[id], src.mana_cost);
    assert.deepEqual(def.colors, src.colors);
    assert.equal(def.support.status, 'supported'); assert.deepEqual(def.support.limitations, []);
    assert.ok(Array.isArray(src.rulings));
    assert.equal(src.rulingsPobrano, '2026-09-14');
  });
}

function tooLittleMana(id, castType, setup = () => {}, wrongColor = 'U', targets = ['tgt']) {
  test(`B55: ${id} — za mało many / zły kolor, brak oferty i odrzucona komenda`, () => {
    for (const [mana, colors] of [[0, []], [9, Array(9).fill(wrongColor)]]) {
      const s = game(); put(s, 'card', id); setup(s);
      if (mana) addMana(s, 'p1', mana, { colors });
      assert.equal(commands(s).some((c) => c.objectId === 'card' && c.type.startsWith('cast_')), false);
      const r = execute(s, { type: castType, playerId: 'p1', objectId: 'card', targets });
      assert.equal(r.ok, false); assert.ok(r.events.some((e) => typeof e.reason === 'string'));
      assert.equal(s.objects.get('card').zone, 'hand');
    }
  });
}

// ---------------------------------------------------------------------------
// B1 (M351) — 616 Act of Treason, 617 Douse in Gloom, 610 Gearsmith Prodigy
// ---------------------------------------------------------------------------

sanity('act-of-treason', 616, 'KTK', 'Tarkir');
tooLittleMana('act-of-treason', 'cast_spell', (s) => put(s, 'tgt', 'rotting-legion', 'p2', 'battlefield'), 'U');

test('B55/B1: 616 Act of Treason — przejęcie: untap, haste i powrót do właściciela po turze', () => {
  const s = game();
  put(s, 'treason', 'act-of-treason');
  put(s, 'prey', 'rotting-legion', 'p2', 'battlefield');
  s.objects.set('prey', Object.freeze({ ...s.objects.get('prey'), tapped: true, summoningSickness: true }));
  addMana(s, 'p1', 3, { colors: ['R'] });

  run(s, commands(s).find((c) => c.type === 'cast_spell' && c.objectId === 'treason' && c.targets?.[0] === 'prey'));
  resolve(s);

  const prey = s.objects.get('prey');
  assert.equal(prey.controllerId, 'p1', 'kontrola przejęta (CR 800.4a)');
  assert.equal(prey.tapped, false, '„Untap that creature"');
  assert.ok((prey.keywordGrants ?? []).includes('haste'), '„It gains haste until end of turn"');
  assert.equal(prey.summoningSickness, false, 'przejęty stwór może atakować od razu');
  assert.ok(s.events.some((e) => e.type === 'control_changed' && e.objectId === 'prey'), 'zdarzenie zmiany kontroli (L24)');

  // Ruling 2019-07-12 (docs/cards/scryfall-act-of-treason.json): kontrola wraca
  // na końcu tury (cleanup rewersuje kontrolera) — sprawdzamy realnym przejściem tur.
  passTurnToEnd(s, s.turn.number + 1);
  const after = s.objects.get('prey');
  assert.equal(after.controllerId, 'p2', 'stwór wrócił do właściciela po turze');
  assert.equal(after.tempControlUntilTurn, null, 'flaga czasowej kontroli wyczyszczona');
});

test('B55/B1: 616 Act of Treason — wolno wskazać własnego stwora (ruling), bez zdarzenia zmiany kontroli', () => {
  const s = game();
  put(s, 'treason', 'act-of-treason');
  put(s, 'own', 'rotting-legion', 'p1', 'battlefield');
  s.objects.set('own', Object.freeze({ ...s.objects.get('own'), tapped: true }));
  addMana(s, 'p1', 3, { colors: ['R'] });

  // Ruling 2019-07-12: „Act of Treason can target any creature, even one that's
  // untapped or one you already control." — oferta musi zawierać własnego stwora.
  const offer = commands(s).find((c) => c.type === 'cast_spell' && c.objectId === 'treason');
  assert.ok(offer?.targets?.includes('own'), `własny stwór w ofercie celów: ${JSON.stringify(offer?.targets)}`);
  run(s, offer);
  resolve(s);

  const own = s.objects.get('own');
  assert.equal(own.controllerId, 'p1', 'właściciel nadal kontroluje');
  assert.equal(own.tapped, false, 'untap wykonany mimo braku zmiany kontrolera (CR 506.4: bez ruchu w walce)');
  assert.ok((own.keywordGrants ?? []).includes('haste'));
  assert.equal(s.events.filter((e) => e.type === 'control_changed' && e.objectId === 'own').length, 0,
    'brak zdarzenia zmiany kontroli, bo kontroler się nie zmienił');
});

sanity('douse-in-gloom', 617, 'FRF', 'Tarkir');
tooLittleMana('douse-in-gloom', 'cast_spell', (s) => put(s, 'tgt', 'rotting-legion', 'p2', 'battlefield'), 'U');

test('B55/B1: 617 Douse in Gloom — 2 obrażenia dla celu i 2 życia dla kontrolera', () => {
  const s = game();
  put(s, 'douse', 'douse-in-gloom');
  put(s, 'prey', 'rotting-legion', 'p2', 'battlefield'); // 4/5 — przeżywa 2 obrażenia
  addMana(s, 'p1', 3, { colors: ['B'] });
  const lifeBefore = life(s, 'p1');

  run(s, commands(s).find((c) => c.type === 'cast_spell' && c.objectId === 'douse'));
  resolve(s);

  assert.equal(s.objects.get('prey').damage, 2, 'dokładnie 2 obrażenia (nie więcej: brak deathtouch)');
  assert.equal(life(s, 'p1'), lifeBefore + 2, 'kontroler czaru zyskuje 2 życia');
  assert.equal(life(s, 'p2'), 20, 'przeciwnik nie traci życia');
});

test('B55/B1: 617 Douse in Gloom — cel nielegalny przy rozstrzygnięciu = brak efektu (CR 608.2b)', () => {
  const s = game();
  put(s, 'douse', 'douse-in-gloom');
  put(s, 'prey', 'rotting-legion', 'p2', 'battlefield');
  addMana(s, 'p1', 3, { colors: ['B'] });
  const lifeBefore = life(s, 'p1');
  run(s, commands(s).find((c) => c.type === 'cast_spell' && c.objectId === 'douse'));

  // Cel znika z pola bitwy w oknie odpowiedzi (właściwy mover stref — mutacja
  // `state.objects.set` zostawiłaby id w tablicy strefy i złamała inwarianty).
  moveObjectDirectly(s, 'prey', 'graveyard', 'prey-grave');
  resolve(s);

  assert.equal(life(s, 'p1'), lifeBefore, 'brak zysku życia przy nielegalnym jedynym celu');
  assert.equal(s.events.filter((e) => e.type === 'life_gained' && e.playerId === 'p1').length, 0);
});

test('B55/B1: 617 Douse in Gloom — instant: rzucalny w turze przeciwnika', () => {
  const s = game();
  put(s, 'douse', 'douse-in-gloom');
  put(s, 'prey', 'rotting-legion', 'p2', 'battlefield');
  addMana(s, 'p1', 3, { colors: ['B'] });
  s.turn = jumpToStep(s.turn, 'main', 'p2');
  s.turn.activePlayerId = 'p2';
  s.turn.priorityPlayerId = 'p1';

  const offer = commands(s, 'p1').find((c) => c.type === 'cast_spell' && c.objectId === 'douse');
  assert.ok(offer, 'instant ma ofertę rzutu w cudzej turze');
  run(s, offer);
  resolve(s);
  assert.equal(s.objects.get('prey').damage, 2);
});

sanity('gearsmith-prodigy', 610, 'M19', 'Kaladesh');
tooLittleMana('gearsmith-prodigy', 'cast_permanent', () => {}, 'R');

test('B55/B1: 610 Gearsmith Prodigy — +1/+0, dopóki kontrolujesz artefakt (warunek statyczny)', () => {
  const s = game();
  put(s, 'prodigy', 'gearsmith-prodigy', 'p1', 'battlefield');
  assert.equal(effectivePower(s.objects.get('prodigy'), s), 1, 'bez artefaktu baza 1/2');
  assert.equal(effectiveToughness(s.objects.get('prodigy'), s), 2);

  put(s, 'rock', 'skymarch-bloodletter', 'p2', 'battlefield'); // cudzy NIE-artefakt — kontrola negatywna
  assert.equal(effectivePower(s.objects.get('prodigy'), s), 1, 'cudzy stwór to nie artefakt');

  put(s, 'art', 'token_food', 'p1', 'battlefield');
  assert.equal(effectivePower(s.objects.get('prodigy'), s), 2, 'własny artefakt włącza warunek');
  assert.equal(effectiveToughness(s.objects.get('prodigy'), s), 2, '+1/+0, nie +1/+1');

  // Artefakt znika z pola bitwy → warunek gaśnie natychmiast (liczony przy odczycie).
  moveObjectDirectly(s, 'art', 'graveyard', 'art-grave');
  assert.equal(effectivePower(s.objects.get('prodigy'), s), 1, 'bez artefaktu bonus gaśnie');

  // Artefaktowy STWÓR też jest artefaktem (typ, nie rodzaj karty).
  put(s, 'artcreature', 'token_thopter', 'p1', 'battlefield');
  assert.equal(effectivePower(s.objects.get('prodigy'), s), 2, 'artefakt-stwór włącza warunek');
});

test('B55/B1: 610 Gearsmith Prodigy — sam nie jest artefaktem, więc nie włącza własnego bonusu', () => {
  const s = game();
  const prodigy = put(s, 'prodigy', 'gearsmith-prodigy', 'p1', 'battlefield');
  assert.ok(!(prodigy.types ?? []).includes('Artifact'), 'Oracle: Creature — Human Artificer');
  assert.equal(effectivePower(prodigy, s), 1, 'własny typ nie może włączyć warunku „kontrolujesz artefakt"');
});

// ---------------------------------------------------------------------------
// B2 (M352) — 611 Lifecrafter's Gift, 614 Hunt the Weak
// ---------------------------------------------------------------------------

const countersOf = (s, id) => ({ ...(s.objects.get(id).counters ?? {}) });

sanity('lifecrafters-gift', 611, 'CMR', 'Kaladesh');
tooLittleMana('lifecrafters-gift', 'cast_spell', (s) => put(s, 'tgt', 'rotting-legion', 'p1', 'battlefield'), 'R');

test("B55/B2: 611 Lifecrafter's Gift — „then\": cel łapie licznik PRZED policzeniem grupy", () => {
  const s = game();
  put(s, 'gift', 'lifecrafters-gift');
  put(s, 'own', 'kin-tree-nurturer', 'p1', 'battlefield'); // 2/1, bez liczników
  addMana(s, 'p1', 4, { colors: ['G'] });

  run(s, commands(s).find((c) => c.type === 'cast_spell' && c.objectId === 'gift'));
  resolve(s);

  // Ruling 2020-11-10: to są DWA osobne zdarzenia — cel dostaje licznik
  // z pierwszej klauzuli, a potem drugi z grupy (bo JUŻ ma licznik +1/+1).
  assert.deepEqual(countersOf(s, 'own'), { '+1/+1': 2 },
    'dwa liczniki: z klauzuli celu i z klauzuli grupowej (kolejność „then")');
  assert.equal(effectivePower(s.objects.get('own'), s), 4, '2/1 + dwa liczniki = 4/3');
  assert.equal(effectiveToughness(s.objects.get('own'), s), 3);
});

test("B55/B2: 611 Lifecrafter's Gift — grupa: tylko MOJE STWORY z licznikiem +1/+1", () => {
  const s = game();
  put(s, 'gift', 'lifecrafters-gift');
  put(s, 'target', 'rotting-legion', 'p1', 'battlefield');       // 4/5 bez liczników
  put(s, 'withCounter', 'skymarch-bloodletter', 'p1', 'battlefield');
  put(s, 'plain', 'typhoid-rats', 'p1', 'battlefield');          // bez licznika → pominięty
  put(s, 'enemy', 'colossodon-yearling', 'p2', 'battlefield');   // cudzy z licznikiem → pominięty
  put(s, 'art', 'bomat-bazaar-barge', 'p1', 'battlefield');      // nie-stwór (ruling 2020-11-10)
  addCounter(s, 'withCounter', '+1/+1', 1);
  addCounter(s, 'enemy', '+1/+1', 1);
  addCounter(s, 'art', '+1/+1', 1);
  addMana(s, 'p1', 4, { colors: ['G'] });

  run(s, commands(s).find((c) => c.type === 'cast_spell' && c.objectId === 'gift' && c.targets?.[0] === 'target'));
  resolve(s);

  assert.deepEqual(countersOf(s, 'target'), { '+1/+1': 2 },
    'cel (mój stwór) łapie licznik z klauzuli celu I z grupy — ma już licznik');
  assert.deepEqual(countersOf(s, 'withCounter'), { '+1/+1': 2 }, 'mój stwór z licznikiem wchodzi do grupy');
  assert.deepEqual(countersOf(s, 'plain'), {}, 'mój stwór BEZ licznika nie łapie niczego');
  assert.deepEqual(countersOf(s, 'enemy'), { '+1/+1': 1 }, 'cudzy stwór poza grupą');
  assert.deepEqual(countersOf(s, 'art'), { '+1/+1': 1 },
    'nie-stwór z licznikiem +1/+1 nie dostaje kolejnego (ruling 2020-11-10)');
});

test("B55/B2: 611 Lifecrafter's Gift — anihilacja +1/+1 z -1/-1 dopiero PO rozstrzygnięciu (CR 704.3)", () => {
  const s = game();
  put(s, 'gift', 'lifecrafters-gift');
  put(s, 'own', 'rotting-legion', 'p1', 'battlefield'); // 4/5 z licznikiem -1/-1
  addCounter(s, 'own', '-1/-1', 1);
  addMana(s, 'p1', 4, { colors: ['G'] });

  run(s, commands(s).find((c) => c.type === 'cast_spell' && c.objectId === 'gift'));
  resolve(s);

  // Ruling 2020-11-10: „The state-based action that removes matching +1/+1 and
  // -1/-1 counters won't check until after Lifecrafter's Gift finishes
  // resolving." — stwór dostaje DWA liczniki +1/+1 (drugi dlatego, że po
  // pierwszym już ma licznik), a dopiero po rozstrzygnięciu znika jedna para.
  assert.deepEqual(countersOf(s, 'own'), { '+1/+1': 1 },
    'dwa +1/+1 dodane w jednym rozstrzyganiu, potem zniknęła jedna para z -1/-1');
  const added = s.events.filter((e) => e.type === 'counter_added' && e.objectId === 'own' && e.counter === '+1/+1');
  assert.equal(added.length, 2, 'licznik z klauzuli celu + licznik z grupy');
  const annihilated = s.events.filter((e) => e.type === 'counter_removed' && e.objectId === 'own' && e.annihilated);
  assert.equal(annihilated.length, 1, 'jedna para anihilowana przez SBA');
  assert.equal(annihilated[0].amount, 1);
  assert.equal(s.objects.get('own').zone, 'battlefield', 'stwór przeżył (nie 0/0 — SBA nie działa w trakcie rozstrzygania)');
});

test("B55/B2: 611 Lifecrafter's Gift — nielegalny cel przy rozstrzygnięciu = czar nie rozstrzyga się wcale", () => {
  const s = game();
  put(s, 'gift', 'lifecrafters-gift');
  put(s, 'target', 'kin-tree-nurturer', 'p1', 'battlefield');
  put(s, 'withCounter', 'skymarch-bloodletter', 'p1', 'battlefield');
  addCounter(s, 'withCounter', '+1/+1', 1);
  addMana(s, 'p1', 4, { colors: ['G'] });
  const eventsBefore = s.events.length;

  run(s, commands(s).find((c) => c.type === 'cast_spell' && c.objectId === 'gift' && c.targets?.[0] === 'target'));
  moveObjectDirectly(s, 'target', 'graveyard', 'target-grave');
  resolve(s);

  // Ruling 2020-11-10: jedyny cel nielegalny → czar nie rozstrzyga się, więc
  // klauzula grupowa też nie działa (CR 608.2b).
  assert.deepEqual(countersOf(s, 'withCounter'), { '+1/+1': 1 }, 'grupa bez zmian');
  assert.equal(
    s.events.slice(eventsBefore).filter((e) => e.type === 'counter_added').length,
    0,
    'żadnego nowego licznika po rzuceniu czaru',
  );
});

test("B55/B2: 611 Lifecrafter's Gift — wolno celować w CUDZEGO stwora; grupa liczy tylko moje", () => {
  const s = game();
  put(s, 'gift', 'lifecrafters-gift');
  put(s, 'enemy', 'colossodon-yearling', 'p2', 'battlefield'); // 2/4
  put(s, 'mine', 'typhoid-rats', 'p1', 'battlefield');
  addCounter(s, 'mine', '+1/+1', 1);
  addMana(s, 'p1', 4, { colors: ['G'] });

  const offers = commands(s).filter((c) => c.type === 'cast_spell' && c.objectId === 'gift');
  const offer = offers.find((c) => c.targets?.includes('enemy'));
  assert.ok(offer, `cudzy stwór w ofercie celów: ${JSON.stringify(offers.map((c) => c.targets))}`);
  run(s, offer);
  resolve(s);

  assert.deepEqual(countersOf(s, 'enemy'), { '+1/+1': 1 }, 'Oracle: „target creature" bez ograniczenia kontroli');
  assert.deepEqual(countersOf(s, 'mine'), { '+1/+1': 2 }, 'grupa: „each creature YOU control with a +1/+1 counter"');
});

sanity('hunt-the-weak', 614, 'IMA', 'Wiedźmin');
tooLittleMana('hunt-the-weak', 'cast_spell', (s) => {
  put(s, 'tgt', 'typhoid-rats', 'p1', 'battlefield');
  put(s, 'tgt2', 'colossodon-yearling', 'p2', 'battlefield');
}, 'U', ['tgt', 'tgt2']);

test('B55/B2: 614 Hunt the Weak — licznik, potem walka TYM wzmocnionym stworom („then")', () => {
  const s = game();
  put(s, 'hunt', 'hunt-the-weak');
  put(s, 'mine', 'rotting-legion', 'p1', 'battlefield');  // 4/5 → 5/6
  put(s, 'theirs', 'krotiq-nestguard', 'p2', 'battlefield'); // 4/4
  addMana(s, 'p1', 4, { colors: ['G'] });

  run(s, commands(s).find((c) => c.type === 'cast_spell' && c.objectId === 'hunt'));
  resolve(s);

  // CR 701.12b: moce liczone PRZED zadaniem obrażeń, ale PO liczniku — stwór
  // bije już jako 5/6 (inaczej zadałby 4, nie 5). Obrażenia czytamy ze zdarzeń,
  // bo zabity stwór zmienia strefę (nowy obiekt w grobie).
  assert.deepEqual(countersOf(s, 'mine'), { '+1/+1': 1 });
  assert.equal(effectivePower(s.objects.get('mine'), s), 5);
  const hit = s.events.find((e) => e.type === 'damage_dealt' && e.source === 'mine' && e.target === 'theirs');
  assert.equal(hit?.amount, 5, 'obrażenia równe mocy PO liczniku');
  assert.equal(find(s, 'krotiq-nestguard', 'graveyard') != null, true, '4/4 ginie od 5 obrażeń');
  assert.equal(s.objects.get('mine').damage, 4, 'odwzajemnione obrażenia równe mocy przeciwnika');
  assert.equal(s.objects.get('mine').zone, 'battlefield', '5/6 przeżywa 4 obrażenia');
  assert.ok(s.events.some((e) => e.type === 'damage_dealt' && e.source === 'mine' && e.target === 'theirs'));
});

test('B55/B2: 614 Hunt the Weak — bez obu celów nie ma oferty rzutu (ruling 2017-11-17)', () => {
  const s = game();
  put(s, 'hunt', 'hunt-the-weak');
  put(s, 'mine', 'kin-tree-nurturer', 'p1', 'battlefield');
  addMana(s, 'p1', 4, { colors: ['G'] });

  // Ruling: „You can't cast Hunt the Weak unless you choose both a creature you
  // control and a creature you don't control as targets."
  assert.equal(commands(s).some((c) => c.type === 'cast_spell' && c.objectId === 'hunt'), false,
    'brak stworów przeciwnika → brak oferty rzutu');
});

test('B55/B2: 614 Hunt the Weak — drugi cel nielegalny: licznik zostaje, walki nie ma', () => {
  const s = game();
  put(s, 'hunt', 'hunt-the-weak');
  put(s, 'mine', 'kin-tree-nurturer', 'p1', 'battlefield');
  put(s, 'theirs', 'colossodon-yearling', 'p2', 'battlefield');
  addMana(s, 'p1', 4, { colors: ['G'] });

  run(s, commands(s).find((c) => c.type === 'cast_spell' && c.objectId === 'hunt'));
  moveObjectDirectly(s, 'theirs', 'graveyard', 'theirs-grave');
  resolve(s);

  // Ruling 2017-11-17: „If that creature is a legal target but the other
  // creature isn't, you'll still put the counter on the creature you control."
  assert.deepEqual(countersOf(s, 'mine'), { '+1/+1': 1 }, 'licznik zostaje mimo nieudanej walki');
  assert.equal(s.objects.get('mine').damage ?? 0, 0, 'zniknięty cel nie zadaje obrażeń');
  assert.equal(s.events.filter((e) => e.type === 'damage_dealt').length, 0);
});

test('B55/B2: 614 Hunt the Weak — własny cel nielegalny: ani licznika, ani walki', () => {
  const s = game();
  put(s, 'hunt', 'hunt-the-weak');
  put(s, 'mine', 'kin-tree-nurturer', 'p1', 'battlefield');
  put(s, 'theirs', 'colossodon-yearling', 'p2', 'battlefield');
  addMana(s, 'p1', 4, { colors: ['G'] });

  run(s, commands(s).find((c) => c.type === 'cast_spell' && c.objectId === 'hunt'));
  moveObjectDirectly(s, 'mine', 'graveyard', 'mine-grave');
  resolve(s);

  // Ruling 2017-11-17: oba warunki — brak licznika na nielegalnym celu
  // i brak obrażeń po którejkolwiek stronie (CR 701.12c).
  assert.equal(s.objects.get('theirs').damage ?? 0, 0);
  assert.equal(s.events.filter((e) => e.type === 'damage_dealt').length, 0);
  assert.equal(s.events.filter((e) => e.type === 'counter_added' && e.objectId === 'mine').length, 0);
});

// ---------------------------------------------------------------------------
// B3 (M353) — 609 Jungleborn Pioneer, 615 Tah-Crop Skirmisher (Embalm)
// ---------------------------------------------------------------------------

sanity('jungleborn-pioneer', 609, 'RIX', 'Forgotten Realms');
tooLittleMana('jungleborn-pioneer', 'cast_permanent', () => {}, 'R');

const tokenOnBoard = (s, cardId) => [...s.objects.values()]
  .find((o) => o.cardId === cardId && o.zone === 'battlefield' && o.isToken);
const inZone = (s, cardId, zone) => [...s.objects.values()]
  .find((o) => o.cardId === cardId && o.zone === zone);

test('B55/B3: 609 Jungleborn Pioneer — ETB tworzy 1/1 niebieskiego Merfolka z hexproof', () => {
  const s = game();
  put(s, 'pioneer', 'jungleborn-pioneer');
  addMana(s, 'p1', 3, { colors: ['G'] });

  run(s, commands(s).find((c) => c.type === 'cast_permanent' && c.objectId === 'pioneer'));
  resolve(s);

  const token = tokenOnBoard(s, 'token_merfolk');
  assert.ok(token, 'token Merfolk wjechał razem ze stworami (ETB)');
  assert.equal(token.power, 1);
  assert.equal(token.toughness, 1);
  assert.deepEqual(token.colors, ['U'], '„1/1 blue Merfolk"');
  assert.deepEqual(token.subtypes, ['Merfolk']);
  assert.ok((token.keywords ?? []).includes('hexproof'), '„with hexproof"');
  assert.equal(token.isToken, true);
  assert.ok(s.events.some((e) => e.type === 'token_created' && e.cardId === 'token_merfolk'));
});

test('B55/B3: 609 Jungleborn Pioneer — hexproof: przeciwnik nie wyceluje tokenu, właściciel tak', () => {
  const s = game();
  put(s, 'pioneer', 'jungleborn-pioneer');
  put(s, 'mine', 'douse-in-gloom', 'p1');
  put(s, 'theirs', 'douse-in-gloom', 'p2');
  addMana(s, 'p1', 3, { colors: ['G'] });
  run(s, commands(s).find((c) => c.type === 'cast_permanent' && c.objectId === 'pioneer'));
  resolve(s);
  const token = tokenOnBoard(s, 'token_merfolk');
  assert.ok(token);

  addMana(s, 'p1', 3, { colors: ['B'] });
  const mine = commands(s, 'p1').filter((c) => c.type === 'cast_spell' && c.objectId === 'mine');
  assert.ok(mine.some((c) => c.targets?.includes(token.id)),
    `właściciel może celować własny token: ${JSON.stringify(mine.map((c) => c.targets))}`);

  // Cudza tura: przeciwnik ma ten sam czar i manę, ale hexproof blokuje cel.
  s.turn = jumpToStep(s.turn, 'main', 'p2');
  s.turn.activePlayerId = 'p2';
  s.turn.priorityPlayerId = 'p2';
  addMana(s, 'p2', 3, { colors: ['B'] });
  const theirs = commands(s, 'p2').filter((c) => c.type === 'cast_spell' && c.objectId === 'theirs');
  assert.ok(theirs.length > 0, 'przeciwnik ma ofertę rzutu (czar nie jest zablokowany)');
  assert.equal(theirs.some((c) => c.targets?.includes(token.id)), false,
    'żadna oferta przeciwnika nie wskazuje tokenu z hexproofem');
});

sanity('tah-crop-skirmisher', 615, 'AKH', 'Amonkhet');

test('B55/B3: 615 Tah-Crop Skirmisher — Embalm istnieje TYLKO w grobie', () => {
  const s = game();
  put(s, 'hand', 'tah-crop-skirmisher', 'p1');
  put(s, 'field', 'tah-crop-skirmisher', 'p1', 'battlefield');
  put(s, 'grave', 'tah-crop-skirmisher', 'p1', 'graveyard');
  addMana(s, 'p1', 4, { colors: ['U'] });

  const offers = commands(s).filter((c) => c.type === 'activate_ability');
  assert.deepEqual(offers.map((c) => c.objectId), ['grave'],
    'zdolność z grobu (CR 113.6) istnieje wyłącznie dla karty w grobie');
});

test('B55/B3: 615 Tah-Crop Skirmisher — Embalm tylko w tempie sorcery', () => {
  const s = game();
  put(s, 'grave', 'tah-crop-skirmisher', 'p1', 'graveyard');
  addMana(s, 'p1', 4, { colors: ['U'] });

  s.turn = jumpToStep(s.turn, 'declare_attackers', 'p1');
  s.turn.activePlayerId = 'p1';
  s.turn.priorityPlayerId = 'p1';
  assert.equal(commands(s).some((c) => c.type === 'activate_ability' && c.objectId === 'grave'), false,
    'walka to nie tempo sorcery');

  s.turn = jumpToStep(s.turn, 'main', 'p2');
  s.turn.activePlayerId = 'p2';
  s.turn.priorityPlayerId = 'p1';
  assert.equal(commands(s, 'p1').some((c) => c.type === 'activate_ability' && c.objectId === 'grave'), false,
    'cudza tura to nie tempo sorcery');
});

test('B55/B3: 615 Tah-Crop Skirmisher — Embalm: wygnanie karty i biały token-kopia Zombie bez kosztu many', () => {
  const s = game();
  put(s, 'grave', 'tah-crop-skirmisher', 'p1', 'graveyard');
  addMana(s, 'p1', 4, { colors: ['U'] });

  const offer = commands(s).find((c) => c.type === 'activate_ability' && c.objectId === 'grave');
  assert.ok(offer, 'oferta Embalm w mojej głównej fazie');
  run(s, offer);
  resolve(s);

  // Ruling 2017-04-18: karta wygnana NATYCHMIAST (jeszcze przed rozstrzygnięciem
  // zdolności), więc nie da się jej drugi raz aktywować.
  assert.equal(s.zones.graveyard.includes('grave'), false, 'karta opuściła grób');
  assert.ok(inZone(s, 'tah-crop-skirmisher', 'exile'), 'karta jest w exile (koszt „Exile this card")');
  assert.equal(commands(s).some((c) => c.type === 'activate_ability'), false,
    'druga aktywacja niemożliwa — karta nie leży w grobie');

  const token = tokenOnBoard(s, 'tah-crop-skirmisher');
  assert.ok(token, 'token-kopia na polu bitwy');
  assert.equal(token.power, 2, 'kopia kopiuje wydrukowane P/T');
  assert.equal(token.toughness, 1);
  assert.deepEqual(token.colors, ['W'], '„except it is white" — biały ZAMIast innych kolorów');
  assert.deepEqual([...token.subtypes].sort(), ['Snake', 'Warrior', 'Zombie'],
    'Zombie DODATKOWO do pozostałych typów (CR 702.128a)');
  assert.equal(token.manaCost, 0, '„with no mana cost" — mana value 0 (CR 202.3b)');
  assert.equal(token.isToken, true);
});

test('B55/B3: 615 Tah-Crop Skirmisher — bez {3}{U} brak oferty, odrzucona komenda nie rusza grobu', () => {
  const s = game();
  put(s, 'grave', 'tah-crop-skirmisher', 'p1', 'graveyard');
  const offer = () => commands(s).find((c) => c.type === 'activate_ability' && c.objectId === 'grave');
  assert.equal(offer(), undefined, 'brak many = brak oferty');

  addMana(s, 'p1', 4, { colors: ['R'] });
  assert.equal(offer(), undefined, 'cztery many złego koloru nie pokrywają {U} (CR 118.2)');

  const r = execute(s, { type: 'activate_ability', playerId: 'p1', objectId: 'grave', abilityIndex: 0 });
  assert.equal(r.ok, false);
  assert.equal(s.objects.get('grave').zone, 'graveyard', 'odrzucona aktywacja nie wygania karty');
  assert.equal(s.events.filter((e) => e.type === 'object_exiled').length, 0);

  addMana(s, 'p1', 4, { colors: ['U'] });
  assert.ok(offer(), 'właściwy koszt kolorowy odblokowuje ofertę');
});
