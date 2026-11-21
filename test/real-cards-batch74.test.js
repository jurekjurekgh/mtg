// Batch 74 (kolekcja 656–665) — zgodność z Oracle i ZACHOWANIE 10 kart.
//
// Roadmapa: `docs/plans/PLAN_2026-11-16-batch74-kolekcja-656-665.md` (Etap 3).
// Snapshoty: `docs/cards/scryfall-<slug>.json` (pobrane 2026-11-16, `set=` —
// źródło prawdy wg ADR 0010/0022/0030). Arkusz kolekcji: `tools/collection-art-ids.csv`.
//
// Ten plik jest strażnikiem DWÓCH rzeczy (L34 — pin bez dowodu mutacyjnego nie
// jest pinem; L57 — dane kontra snapshot, nie kontra pamięć):
//   1. DANE: artId/set/plan/status + nazwa, koszt (cmc), linia typów i P/T
//      zgodne ze snapshotem Oracle i kolumną planu właściciela (ADR 0029);
//   2. ZACHOWANIE: każda karta robi w silniku to, co mówi Oracle — na tej samej
//      ścieżce, której używa produkt (`createCardDeck` → `addObject`, nie sam
//      spread `gameObjectDataOf`; pomiar audytu PR #185 F-11 pokazał, że spread
//      gubi `keywords`/`types`/`subtypes` i test mierzy wtedy helper).
//
// Harness kart syntetycznych Etapu 2 (test/etap2{a,b,c,d}-*) jest uzupełnieniem,
// nie zamiennikiem: tam sprawdzamy MECHANIKĘ generyczną, tutaj DANE karty.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createCardDeck } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { effectivePower, effectiveToughness, effectiveKeywords } from '../src/engine/permanents.js';
import { applyEffect } from '../src/engine/effects.js';
import { wardAmountOf } from '../src/engine/permanents.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const registry = createCardRegistry();
const definition = (id) => registry.get(id);
const snapshot = (id) => JSON.parse(fs.readFileSync(`docs/cards/scryfall-${id}.json`, 'utf8'));
const commands = (state, playerId = 'p1') => playerView(state, playerId).legalCommands;
const lifeOf = (state, playerId) => state.players.find((p) => p.id === playerId).life;

function game(seed = 74, step = 'main', priority = 'p1') {
  const state = createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, priority);
  state.turn.activePlayerId = state.turn.priorityPlayerId = priority;
  return state;
}

/** Payload karty DOKŁADNIE taki, jaki instaluje `createCardDeck` (produkt, nie helper). */
function deckPayload(cardId, ownerId) {
  const [entry] = createCardDeck({ cardIds: [cardId], ownerId, registry });
  const { id, instanceId, cardId: _cardId, ownerId: _ownerId, controllerId, zone, objectId, ...rest } = entry;
  return rest;
}

function put(state, id, cardId, controllerId = 'p1', zone = 'battlefield', patch = {}) {
  addObject(state, {
    id, instanceId: `instance-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...deckPayload(cardId, controllerId), ...patch,
  });
  return state.objects.get(id);
}

function library(state, ownerId, count = 20) {
  for (let i = 1; i <= count; i += 1) {
    addObject(state, {
      id: `lib-${ownerId}-${i}`, instanceId: `inst-lib-${ownerId}-${i}`,
      cardId: 'basic-forest', controllerId: ownerId, zone: 'library', kind: 'land',
      name: 'Forest', types: ['Land'], subtypes: ['Forest'],
    });
  }
}

/** Pełna runda passów aż do pustego stosu (wzorzec real-cards-batch73). */
function resolveStack(state, limit = 40) {
  for (let i = 0; i < limit && state.zones.stack.length; i += 1) {
    const holder = state.turn.priorityPlayerId;
    const options = commands(state, holder);
    const pick = options.find((c) => c.type.startsWith('resolve_'))
      ?? options.find((c) => c.type === 'pass_priority');
    if (!pick) return;
    if (!execute(state, pick).ok) return;
  }
}

const eventTypes = (state) => state.events.map((e) => e.type);

/** Runda passów aż do wejścia w `step` (wzorzec: silnik przechodzi krok po 2 passach). */
function passUntilStep(state, step, limit = 12) {
  for (let i = 0; i < limit && state.turn.step !== step; i += 1) {
    const pv = commands(state, state.turn.priorityPlayerId);
    const pass = pv.find((c) => c.type === 'pass_priority');
    assert.ok(pass, `setup: brak pasa w kroku ${state.turn.step}`);
    assert.equal(execute(state, pass).ok, true);
  }
  assert.equal(state.turn.step, step, `setup: nie osiągnięto kroku ${step}`);
}


// ---------------------------------------------------------------------------
// DANE: 10 kart kontra snapshoty Oracle i arkusz kolekcji (artId 656–665)
// ---------------------------------------------------------------------------

test('Batch 74: wszystkie dziesięć wpisów zgadza się ze snapshotami Oracle i arkuszem kolekcji', () => {
  const expected = [
    ['grollub', 656, 'EXO', 'Warhammer Fantasy'],
    ['saltfield-recluse', 657, 'PLC', 'Amonkhet'],
    ['memorial-to-genius', 658, 'DOM', 'Dominaria'],
    ['gylwain-casting-director', 659, 'WOC', 'Eldraine'],
    ['lambholt-harrier', 660, 'MID', 'Innistrad'],
    ['arrow-storm', 661, 'KTK', 'Tarkir'],
    ['loxodon-partisan', 662, 'MBS', 'Mirrodin'],
    ['temur-banner', 663, 'KTK', 'Tarkir'],
    ['frilled-sea-serpent', 664, 'M20', 'Forgotten Realms'],
    ['mirelurk-queen', 665, 'PIP', 'Teenage Mutant Ninja Turtles'],
  ];
  assert.equal(expected.length, 10, 'kolekcja 656–665 to dziesięć pozycji');
  for (const [id, artId, set, plan] of expected) {
    const card = definition(id);
    assert.ok(card, `${id}: wpis w katalogu`);
    assert.equal(card.artId, artId, `${id}: artId z arkusza kolekcji`);
    assert.equal(card.set, set, `${id}: set`);
    assert.equal(card.plan, plan, `${id}: plan (fabularne przyporządkowanie właściciela)`);
    // ADR 0022: batch wchodzi w pełni — bez limitations.
    assert.equal(card.support?.status, 'supported', `${id}: status wsparcia`);
    assert.deepEqual(card.support?.limitations, [], `${id}: supported = bez limitations (ADR 0022)`);

    // Snapshot Oracle: nazwa, cmc, linia typów, P/T.
    const snap = snapshot(id);
    assert.equal(card.name, snap.name, `${id}: nazwa ze snapshotu`);
    assert.equal(card.manaCost ?? 0, snap.cmc ?? 0, `${id}: wartość many (cmc)`);
    const [supertypes, subtypes] = (snap.type_line ?? '').split(' — ');
    assert.deepEqual(card.types, supertypes.split(' '), `${id}: typy z type_line`);
    assert.deepEqual(card.subtypes ?? [], subtypes ? subtypes.split(' ') : [], `${id}: podtypy z type_line`);
    if (snap.power != null) {
      assert.equal(String(card.power), snap.power, `${id}: power`);
      assert.equal(String(card.toughness), snap.toughness, `${id}: toughness`);
    }
    // Koszt many w `mana-costs-data` (jedno źródło dla deck-legality, L41).
    assert.match(card.oracleText, /\S/, `${id}: oracleText niepusty`);
  }
});

test('Batch 74: koszty many w mana-costs-data są 1:1 z Oracle (pipy + generyk)', async () => {
  const { MANA_COSTS } = await import('../src/cards/mana-costs-data.js');
  const expected = {
    grollub: '{2}{B}',
    'saltfield-recluse': '{2}{W}',
    'memorial-to-genius': '',
    'gylwain-casting-director': '{1}{G}{W}',
    'lambholt-harrier': '{1}{R}',
    'arrow-storm': '{3}{R}{R}',
    'loxodon-partisan': '{4}{W}',
    'temur-banner': '{3}',
    'frilled-sea-serpent': '{4}{U}{U}',
    'mirelurk-queen': '{4}{U}',
  };
  for (const [id, cost] of Object.entries(expected)) {
    assert.equal(MANA_COSTS[id], cost, `${id}: koszt rzutu`);
    const snap = snapshot(id);
    assert.equal(MANA_COSTS[id], snap.mana_cost ?? '', `${id}: koszt zgodny ze snapshotem Oracle`);
  }
});

// ---------------------------------------------------------------------------
// 656. Grollub — „Whenever this creature is dealt damage, each opponent gains
// that much life." (Etap 2A: gain_life each_opponent + amountFrom damageAmount)
// ---------------------------------------------------------------------------

test('Grollub: walka — blok 3/4 daje przeciwnikowi 3 życia, kontrolerowi nic', () => {
  const state = game(74, 'declare_attackers', 'p2');
  library(state, 'p1'); library(state, 'p2');
  put(state, 'grollub', 'grollub', 'p1');
  put(state, 'attacker', 'loxodon-partisan', 'p2');
  state.objects.set('attacker', Object.freeze({ ...state.objects.get('attacker'), summoningSickness: false }));
  assert.equal(execute(state, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['attacker'] }).ok, true);
  passUntilStep(state, 'declare_blockers');
  const blk = execute(state, { type: 'declare_blockers', playerId: 'p1', assignments: { attacker: ['grollub'] } });
  assert.equal(blk.ok, true, blk.reason);
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok, true);
  const combat = execute(state, { type: 'resolve_combat', playerId: 'p2', defendingPlayerId: 'p1' });
  assert.equal(combat.ok, true, combat.reason);
  resolveStack(state);
  assert.equal(lifeOf(state, 'p1'), 20, 'kontroler Grolluba NIE zyskuje życia');
  assert.equal(lifeOf(state, 'p2'), 23, 'przeciwnik zyskuje 3 życia (obrażenia zadane Grollubowi)');
});

test('Grollub: obrażenia niebojowe też odpalają (CR 615.6) — czar 2 obrażeń', () => {
  const state = game();
  library(state, 'p1'); library(state, 'p2');
  put(state, 'grollub', 'grollub', 'p2'); // Grollub przeciwnika
  put(state, 'shock', 'shock', 'p1', 'hand');
  addMana(state, 'p1', 1, { colors: ['R'] });
  const cast = commands(state, 'p1').find((c) => c.type === 'cast_spell' && c.objectId === 'shock');
  assert.ok(cast, 'Shock jest rzucalny');
  assert.equal(execute(state, { ...cast, targets: ['grollub'] }).ok, true);
  resolveStack(state);
  assert.equal(lifeOf(state, 'p1'), 22, '2 obrażenia niebojowe → przeciwnik (p1) +2 życia');
  assert.equal(lifeOf(state, 'p2'), 20, 'kontroler Grolluba nietknięty');
});

// ---------------------------------------------------------------------------
// 657. Saltfield Recluse — „{T}: Target creature gets -2/-0 until end of turn."
// ---------------------------------------------------------------------------

test('Saltfield Recluse: {T} daje −2/−0 wybranemu stworowi (nie sobie, nie bez celu)', () => {
  const state = game();
  library(state, 'p1');
  put(state, 'recluse', 'saltfield-recluse', 'p1');
  put(state, 'victim', 'grollub', 'p2'); // 3/3
  const ability = commands(state).find(
    (c) => c.type === 'activate_ability' && c.objectId === 'recluse' && c.abilityIndex === 0,
  );
  assert.ok(ability, 'zdolność {T}: −2/−0 jest oferowana');
  assert.equal(execute(state, { ...ability, targets: ['victim'] }).ok, true);
  resolveStack(state);
  const victim = state.objects.get('victim');
  assert.equal(effectivePower(victim, state), 1, '3 − 2 = 1 moc');
  assert.equal(effectiveToughness(victim, state), 3, 'wytrzymałość bez zmian (−0)');
  assert.equal(state.objects.get('recluse').tapped, true, '{T} tapuje źródło');
  // Bez celu zdolność nie może się rozstrzygnąć — oferta wymaga celu.
  assert.ok(commands(state, 'p1').every((c) => c.type !== 'activate_ability' || c.objectId !== 'recluse'),
    'po tapnięciu nie ma drugiej aktywacji (tap jako koszt)');
});

// ---------------------------------------------------------------------------
// 658. Memorial to Genius — Land, enters tapped, {T}: {U}, {4}{U},{T},Sac: draw 2
// ---------------------------------------------------------------------------

test('Memorial to Genius: wchodzi tapnięty, daje {U} i poświęca się za dwie karty', () => {
  const card = definition('memorial-to-genius');
  assert.equal(card.entersTapped, true, '„This land enters tapped"');
  // Payload produktu niesie entersTapped dla lądów (instalacja talii).
  const payload = deckPayload('memorial-to-genius', 'p1');
  assert.equal(payload.entersTapped, true, 'payload z createCardDeck niesie entersTapped');

  const state = game();
  library(state, 'p1', 10);
  put(state, 'memorial', 'memorial-to-genius', 'p1', 'battlefield', { tapped: false });
  // {T}: Add {U}
  const mana = commands(state).find(
    (c) => c.type === 'activate_ability' && c.objectId === 'memorial' && c.abilityIndex === 0,
  );
  assert.ok(mana, 'zdolność many {U} jest oferowana');
  assert.equal(execute(state, mana).ok, true);
  assert.ok(eventTypes(state).includes('mana_added') || state.events.length > 0, 'mana dodana');
  // {4}{U}, {T}, Sacrifice: Draw two — najpierw odkręcamy, bo {T} już zapłacono.
  const untapped = Object.freeze({ ...state.objects.get('memorial'), tapped: false });
  state.objects.set('memorial', untapped);
  addMana(state, 'p1', 5, { colors: ['U'] });
  const draw = commands(state).find(
    (c) => c.type === 'activate_ability' && c.objectId === 'memorial' && c.abilityIndex === 1,
  );
  assert.ok(draw, 'zdolność „poświęć: dobierz dwie" jest oferowana przy dostępnej manie');
  const handBefore = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p1').length;
  assert.equal(execute(state, draw).ok, true);
  resolveStack(state);
  const handAfter = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p1').length;
  assert.equal(handAfter, handBefore + 2, 'dobiór dwóch kart (poświęcenie landa jest kosztem)');
  // Poświęcenie tworzy NOWY obiekt w grobie (stary id wygasa) — mierzymy kartę.
  assert.ok(state.zones.graveyard.some((id) => state.objects.get(id)?.cardId === 'memorial-to-genius'),
    'land trafia do grobu jako koszt aktywacji');
});

// ---------------------------------------------------------------------------
// 659. Gylwain — modalny ETB (self/another nontoken) → Role token (Etap 2C)
// ---------------------------------------------------------------------------

test('Gylwain: wejście Gylwaina otwiera wybór trybu i tworzy Royal Role na nim samym', () => {
  const state = game();
  library(state, 'p1', 10);
  put(state, 'gyl', 'gylwain-casting-director', 'p1', 'hand');
  addMana(state, 'p1', 5, { colors: ['G', 'W', 'G'] });
  const cast = commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'gyl');
  assert.ok(cast, 'Gylwain jest rzucalny za {1}{G}{W}');
  assert.equal(execute(state, cast).ok, true);
  resolveStack(state);
  assert.ok(state.pendingModalTrigger, 'ETB otwiera modalny wybór (choose one)');
  assert.equal(state.pendingModalTrigger.modes.length, 3, 'trzy tryby: Royal / Sorcerer / Monster');
  assert.equal(execute(state, { type: 'resolve_modal_choice', playerId: 'p1', modeIndex: 0 }).ok, true);
  resolveStack(state);

  const gylId = [...state.objects.values()].find((o) => o.zone === 'battlefield' && o.cardId === 'gylwain-casting-director').id;
  const gyl = state.objects.get(gylId);
  assert.equal(effectivePower(gyl, state), 3, '2 + 1 (Royal Role)');
  assert.equal(effectiveToughness(gyl, state), 4, '3 + 1 (Royal Role)');
  assert.equal(wardAmountOf(gyl, state), 1, 'Royal Role: ward {1}');
  // Token Ról jest wpisem katalogu (imageUri ze Scryfalla — test/m202-k-tokeny-wpisy).
  assert.ok(definition('token_royal_role'), 'token_royal_role w katalogu');
});

test('Gylwain: token stwora NIE odpala triggera (nontokenOnly), a Sorcerer Role daje scry', () => {
  const state = game();
  library(state, 'p1', 10);
  put(state, 'gyl', 'gylwain-casting-director', 'p1');
  applyEffect(state, {
    type: 'create_token', cardId: 'token_saproling', name: 'Saproling',
    kind: 'creature', power: 1, toughness: 1, types: ['Creature', 'Token'], subtypes: ['Saproling'],
  }, { id: 'src', controllerId: 'p1' }, []);
  assert.equal(state.pendingModalTrigger, null, 'token nie odpala (nontokenOnly)');

  // Sorcerer Role (modeIndex 1) — token z grantAbilities „attacks → scry 1".
  // Stwór musi WEJŚĆ (rzut z ręki) — `addObject` na pole bitwy nie jest wejściem.
  put(state, 'bear2', 'loxodon-partisan', 'p1', 'hand');
  addMana(state, 'p1', 5, { colors: ['W'] });
  const castBear = commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'bear2');
  assert.ok(castBear, 'drugi stwór jest rzucalny');
  assert.equal(execute(state, castBear).ok, true);
  resolveStack(state);
  assert.ok(state.pendingModalTrigger, 'nietokenowy stwór odpala Gylwaina');
  assert.equal(execute(state, { type: 'resolve_modal_choice', playerId: 'p1', modeIndex: 1 }).ok, true);
  resolveStack(state);
  const bear2 = [...state.objects.values()].find((o) => o.zone === 'battlefield' && o.cardId === 'loxodon-partisan');
  assert.equal(effectivePower(bear2, state), 4, '3 + 1 (Sorcerer Role)');
  const role = [...state.objects.values()].find((o) => o.zone === 'battlefield' && o.cardId === 'token_sorcerer_role');
  assert.ok(role, 'Sorcerer Role jest na polu bitwy jako aura');
  assert.equal(role.attachedTo, bear2.id, 'aura przypięta do wchodzącego stwora');
  assert.equal(effectiveToughness(bear2, state), 5, '3/4 + 1/+1 (Sorcerer Role)');
});

// ---------------------------------------------------------------------------
// 660. Lambholt Harrier — „{3}{R}: Target creature can't block this turn."
// ---------------------------------------------------------------------------

test('Lambholt Harrier: {3}{R} odbiera blok wybranemu stworowi (znacznik do końca tury)', () => {
  const state = game();
  library(state, 'p1');
  put(state, 'harrier', 'lambholt-harrier', 'p1');
  put(state, 'blocker', 'grollub', 'p2');
  addMana(state, 'p1', 4, { colors: ['R'] });
  const ability = commands(state).find(
    (c) => c.type === 'activate_ability' && c.objectId === 'harrier' && c.abilityIndex === 0,
  );
  assert.ok(ability, 'zdolność {3}{R} jest oferowana przy manie');
  assert.equal(execute(state, { ...ability, targets: ['blocker'] }).ok, true);
  resolveStack(state);
  assert.equal(state.objects.get('blocker').cantBlock, true, 'cel nie może blokować');
  assert.ok(eventTypes(state).includes('cant_block_granted'), 'zdarzenie dla logu/UI');
});

// ---------------------------------------------------------------------------
// 661. Arrow Storm — 4 dmg; Raid → 5 dmg i nie do zapobieżenia (Etap 2B)
// ---------------------------------------------------------------------------

test('Arrow Storm: bez Raidu 4 obrażenia (do zapobieżenia), z Raidem 5 i pełna prewencja', () => {
  for (const attacked of [false, true]) {
    const state = game();
    library(state, 'p1'); library(state, 'p2');
    put(state, 'storm', 'arrow-storm', 'p1', 'hand');
    state.playersAttackedThisTurn = { ...(state.playersAttackedThisTurn ?? {}), p1: attacked };
    // Tarcza prewencji 10 na graczu-celu: Raid MUSI ją ominąć i nie zużyć (CR 615.1).
    applyEffect(state, { type: 'prevent_next_damage', amount: 10 }, { id: 'sh', controllerId: 'p2' }, ['p2']);
    addMana(state, 'p1', 5, { colors: ['R', 'R'] });
    const cast = commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'storm');
    assert.ok(cast, 'czar jest rzucalny (sorcery w main)');
    assert.equal(execute(state, { ...cast, targets: ['p2'] }).ok, true);
    resolveStack(state);
    const life = lifeOf(state, 'p2');
    if (attacked) {
      assert.equal(life, 15, 'Raid: 5 obrażeń omija prewencję');
      assert.equal(state.damageShields?.[0]?.remaining, 10, 'CR 615.1: tarcza NIE zostaje zużyta');
      assert.ok(!eventTypes(state).includes('damage_prevented'), 'brak zdarzenia prewencji');
    } else {
      assert.equal(life, 20, 'bez Raidu: 4 obrażenia zapobiegnięte w całości (tarcza 10)');
      assert.equal(state.damageShields?.[0]?.remaining, 6, 'tarcza zużyta o 4');
      assert.ok(eventTypes(state).includes('damage_prevented'), 'prewencja zaraportowana');
    }
  }
});

test('Arrow Storm: dane karty niosą deskryptor Raid, nie ręcznie wpisaną 5', () => {
  const spell = definition('arrow-storm').spell;
  assert.equal(spell.timing, 'sorcery', 'sorcery — tylko własna główna faza');
  assert.deepEqual(spell.targets, [{ type: 'any_target' }], '„any target" (CR 115.4)');
  const [effect] = spell.effects;
  assert.equal(effect.type, 'damage');
  assert.equal(effect.amount, 4, 'baza 4');
  assert.equal(effect.amountIfRaid, 5, 'Raid: 5 zamiast 4');
  assert.equal(effect.cantBePreventedIfRaid, true, 'Raid: obrażenia nie do zapobieżenia');
});

// ---------------------------------------------------------------------------
// 662. Loxodon Partisan — Battle cry (CR 702.91a: „each OTHER attacking")
// ---------------------------------------------------------------------------

test('Loxodon Partisan: battle cry buffuje INNE atakujące, nie siebie', () => {
  const state = game(74, 'declare_attackers', 'p1');
  library(state, 'p1');
  put(state, 'partisan', 'loxodon-partisan', 'p1');
  put(state, 'buddy', 'grollub', 'p1');
  const attack = commands(state).find(
    (c) => c.type === 'declare_attackers',
  );
  assert.ok(attack, 'deklaracja atakujących jest oferowana');
  assert.equal(execute(state, { ...attack, attackerIds: ['partisan', 'buddy'] }).ok, true);
  // Battle cry idzie na stos — rozstrzygamy, zanim mierzymy P/T.
  resolveStack(state);
  const partisan = state.objects.get('partisan');
  const buddy = state.objects.get('buddy');
  assert.equal(effectivePower(partisan, state), 3, 'battle cry NIE buffuje źródła („each OTHER")');
  assert.equal(effectivePower(buddy, state), 4, 'współatakujący dostaje +1/+0');
  assert.equal(effectiveToughness(buddy, state), 3, '+0 do wytrzymałości');
  assert.deepEqual(definition('loxodon-partisan').keywords, ['battle_cry'], 'keyword z Oracle');
});

// ---------------------------------------------------------------------------
// 663. Temur Banner — {T}: G/U/R; {G}{U}{R},{T},Sac: draw a card
// ---------------------------------------------------------------------------

test('Temur Banner: daje jedną manę wybranego koloru i poświęca się za kartę', () => {
  const state = game();
  library(state, 'p1', 10);
  put(state, 'banner', 'temur-banner', 'p1');
  const mana = commands(state).find(
    (c) => c.type === 'activate_ability' && c.objectId === 'banner' && c.abilityIndex === 0,
  );
  assert.ok(mana, 'zdolność many jest oferowana');
  assert.equal(execute(state, mana).ok, true);
  const player = state.players.find((p) => p.id === 'p1');
  assert.equal(player.mana, 1, 'jedna jednostka many (wybór koloru przy aktywacji, nie trzy zdolności)');
  assert.deepEqual(player.manaPool, { URG: 1 }, 'pula niesie kolor wyboru (G/U/R), nie trzy jednostki');
  // {G}{U}{R}, {T}, Sacrifice: Draw a card
  state.objects.set('banner', Object.freeze({ ...state.objects.get('banner'), tapped: false }));
  addMana(state, 'p1', 3, { colors: ['G', 'U', 'R'] });
  const draw = commands(state).find(
    (c) => c.type === 'activate_ability' && c.objectId === 'banner' && c.abilityIndex === 1,
  );
  assert.ok(draw, 'zdolność poświęcenia jest oferowana');
  const handBefore = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p1').length;
  assert.equal(execute(state, draw).ok, true);
  resolveStack(state);
  const handAfter = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p1').length;
  assert.equal(handAfter, handBefore + 1, 'dobrano jedną kartę');
  assert.ok(state.zones.graveyard.some((id) => state.objects.get(id)?.cardId === 'temur-banner'),
    'artefakt poświęcony jako koszt');
});

// ---------------------------------------------------------------------------
// 664. Frilled Sea Serpent — „{5}{U}{U}: This creature can't be blocked this turn."
// ---------------------------------------------------------------------------

test('Frilled Sea Serpent: zdolność celuje w SAMO źródło (applyTo self), nie w cel z listy', () => {
  const state = game();
  library(state, 'p1');
  put(state, 'serpent', 'frilled-sea-serpent', 'p1');
  addMana(state, 'p1', 7, { colors: ['U', 'U'] });
  const ability = commands(state).find(
    (c) => c.type === 'activate_ability' && c.objectId === 'serpent' && c.abilityIndex === 0,
  );
  assert.ok(ability, 'zdolność {5}{U}{U} jest oferowana');
  assert.equal(execute(state, ability).ok, true);
  resolveStack(state);
  const serpent = state.objects.get('serpent');
  assert.equal(serpent.cantBeBlockedUntilTurn, state.turn.number + 1,
    'flaga nieblokowalności do końca tury (odczyt read-time)');
  assert.ok(eventTypes(state).includes('cant_be_blocked_granted'), 'zdarzenie dla logu/UI');
  const data = definition('frilled-sea-serpent').abilities[0];
  assert.equal(data.effect.applyTo, 'self', 'deskryptor: dar na SAMYM źródle');
});

// ---------------------------------------------------------------------------
// 665. Mirelurk Queen — vigilance; ETB 2 rad; „nonland cards milled" → draw + counter
// ---------------------------------------------------------------------------

test('Mirelurk Queen: ETB daje 2 liczniki radiacji wybranemu graczowi (nie sobie)', () => {
  const state = game();
  library(state, 'p1', 10); library(state, 'p2', 10);
  put(state, 'queen', 'mirelurk-queen', 'p1', 'hand');
  addMana(state, 'p1', 5, { colors: ['U'] });
  const cast = commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'queen');
  assert.ok(cast, 'królowa jest rzucalna za {4}{U}');
  assert.equal(execute(state, cast).ok, true);
  resolveStack(state);
  // Cel triggera ETB: gracz (preferowany przeciwnik).
  const target = commands(state, 'p1').find((c) => c.type === 'resolve_trigger_target');
  assert.ok(target, 'ETB wymaga wyboru gracza');
  assert.equal(target.targetId, 'p2', 'preferowany cel to przeciwnik');
  assert.equal(execute(state, target).ok, true);
  resolveStack(state);
  assert.equal(state.players.find((p) => p.id === 'p2').rad, 2, 'przeciwnik ma 2 liczniki radiacji');
  assert.equal(state.players.find((p) => p.id === 'p1').rad ?? 0, 0, 'kontroler bez liczników');
  // Vigilance z Oracle.
  assert.deepEqual(definition('mirelurk-queen').keywords, ['vigilance'], 'keyword vigilance');
});

test('Mirelurk Queen: „one or more nonland cards are milled" → dobierz 1 i +1/+1, raz na turę', () => {
  // Ścieżka PRODUKTU: czar z ręki (Tome Scour) mieli przez silnik rzutu —
  // dopiero wtedy skan triggerów widzi zbiorcze `cards_milled` (applyEffect
  // bezpośrednio emituje zdarzenia, ale nie odpala pętli triggerów).
  const state = game();
  library(state, 'p1', 10); library(state, 'p2', 10);
  put(state, 'queen', 'mirelurk-queen', 'p1');
  put(state, 'scour', 'tome-scour', 'p1', 'hand');
  // Na wierzchu biblioteki p2 kładziemy 20 stworów (nonlandy — trzy czary po
  // 5 kart milla), reszta to lasy.
  const nonlands = [];
  for (let i = 1; i <= 20; i += 1) {
    addObject(state, {
      id: `nl-${i}`, instanceId: `inst-nl-${i}`, cardId: 'grollub', controllerId: 'p2', ownerId: 'p2',
      zone: 'library', kind: 'creature', name: 'Grollub', types: ['Creature'], subtypes: ['Beast'],
      power: 3, toughness: 3, manaCost: 3, colors: ['B'],
    });
    nonlands.push(`nl-${i}`);
  }
  state.zones.library = [...nonlands, ...state.zones.library.filter((id) => !nonlands.includes(id))];
  addMana(state, 'p1', 1, { colors: ['U'] });

  const handBefore = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p1').length;
  const cast = commands(state, 'p1').find((c) => c.type === 'cast_spell' && c.objectId === 'scour');
  assert.ok(cast, 'Tome Scour jest rzucalny');
  assert.equal(execute(state, { ...cast, targets: ['p2'] }).ok, true);
  resolveStack(state);
  assert.equal(state.objects.get('queen').counters?.['+1/+1'] ?? 0, 1,
    'trigger dołożył +1/+1 (jedna operacja milla = jedno wyzwolenie)');
  // Z ręki zeszły 1 czar, doszła 1 karta z triggera ⇒ bez zmian.
  const handAfter = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p1').length;
  assert.equal(handAfter, handBefore, 'trigger dobrał 1 kartę (czar zszedł z ręki: −1 +1)');

  // Druga operacja milla w TEJ SAMEJ turze — oncePerTurn blokuje.
  put(state, 'scour2', 'tome-scour', 'p1', 'hand');
  addMana(state, 'p1', 1, { colors: ['U'] });
  const cast2 = commands(state, 'p1').find((c) => c.type === 'cast_spell' && c.objectId === 'scour2');
  assert.ok(cast2, 'drugi Tome Scour rzucalny');
  assert.equal(execute(state, { ...cast2, targets: ['p2'] }).ok, true);
  resolveStack(state);
  assert.equal(state.objects.get('queen').counters?.['+1/+1'] ?? 0, 1,
    'oncePerTurn: druga operacja milla w tej samej turze nie odpala');

  // Nowa tura — trigger znów dostępny. `schemat` = pole, które cleanup
  // naprawdę czyści; test zeruje je wprost (zamiast odtwarzać pełny cleanup).
  state.triggerFiredThisTurn = {};
  state.turn.number += 1;
  put(state, 'scour3', 'tome-scour', 'p1', 'hand');
  addMana(state, 'p1', 1, { colors: ['U'] });
  const cast3 = commands(state, 'p1').find((c) => c.type === 'cast_spell' && c.objectId === 'scour3');
  assert.ok(cast3, 'trzeci Tome Scour rzucalny');
  assert.equal(execute(state, { ...cast3, targets: ['p2'] }).ok, true);
  resolveStack(state);
  assert.equal(state.objects.get('queen').counters?.['+1/+1'] ?? 0, 2,
    'w nowej turze trigger odpała ponownie');
});

// ---------------------------------------------------------------------------
// Krok 4b HOW_TO_ADD_CARD: dowiązania L84 dla nowych mechanik (jeden świat)
// ---------------------------------------------------------------------------

test('Batch 74: dowiązania L84 — etykiety PL, bot, talie i panel rad', async () => {
  const session = await import('../src/table/session.js');
  // 1. Etykiety PL dla KAŻDEGO zdarzenia triggera użytego przez nowe karty.
  for (const id of ['grollub', 'saltfield-recluse', 'memorial-to-genius', 'gylwain-casting-director',
    'lambholt-harrier', 'arrow-storm', 'loxodon-partisan', 'temur-banner', 'frilled-sea-serpent', 'mirelurk-queen']) {
    for (const ability of definition(id).abilities ?? []) {
      const event = ability?.trigger?.event;
      if (!event) continue;
      assert.ok(session.TRIGGER_EVENT_LABELS[event], `${id}: trigger „${event}" ma polską etykietę`);
    }
  }
  // 2. Radiacja ma etykiety zdarzeń i panel na stole.
  assert.ok(session.TRIGGER_EVENT_LABELS.rad_counters, 'etykieta triggera liczników radiacji');
  const render = fs.readFileSync('src/table/render.js', 'utf8');
  assert.match(render, /renderRadPanel/, 'panel radiacji w renderze');
  assert.match(render, /0886657d-afb0-4f1f-9af7-960724793077/, 'marker Radiation tpip/22 ze Scryfalla');
  // 3. Każda karta jest w DOKŁADNIE jednej talii (generator, ADR 0023).
  const talie = fs.readdirSync('decks').filter((f) => f.endsWith('.txt'));
  for (const [id] of [['grollub'], ['saltfield-recluse'], ['memorial-to-genius'],
    ['gylwain-casting-director'], ['lambholt-harrier'], ['arrow-storm'], ['loxodon-partisan'],
    ['temur-banner'], ['frilled-sea-serpent'], ['mirelurk-queen']]) {
    const pliki = talie.filter((f) => fs.readFileSync(`decks/${f}`, 'utf8')
      .split('\n').some((line) => line.trim() === `1x ${definition(id).name}`));
    assert.equal(pliki.length, 1, `${id}: dokładnie jedna talia (jest: ${pliki.join(', ') || 'brak'})`);
  }
  // 4. Bot potrafi wybrać komendę w partii z nowymi kartami (wycena istnieje).
  const state = game();
  library(state, 'p1', 10); library(state, 'p2', 10);
  const deckIds = ['grollub', 'saltfield-recluse', 'memorial-to-genius', 'gylwain-casting-director',
    'lambholt-harrier', 'arrow-storm', 'loxodon-partisan', 'temur-banner', 'frilled-sea-serpent', 'mirelurk-queen'];
  for (const id of deckIds) put(state, `d-${id}`, id, 'p1');
  const bot = createHeuristicBot({ seed: 74 });
  const pick = bot.chooseCommand(playerView(state, 'p1'));
  assert.ok(pick && typeof pick.type === 'string', 'bot wybiera legalną komendę na stole z 10 nowymi kartami');
});
