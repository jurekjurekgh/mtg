// M166 — Batch 40 (lista właściciela 2026-08-20). Transza A: karty reuse.
// Dane wg docs/cards/scryfall-*.json (ADR 0010 §2a); pełne Oracle (ADR 0022).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { legalAttackerOptions } from '../src/engine/combat.js';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1') {
  const state = createGameState({ seed: 40, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function putCard(state, id, cardId, controllerId, zone = 'battlefield') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  return state.objects.get(id);
}

// ---- Transza A --------------------------------------------------------------

test('A1: Blade-Blizzard Kitsune — dane + ninjutsu {3}{W} + double strike', () => {
  const def = REGISTRY.get('blade-blizzard-kitsune');
  assert.equal(def.manaCost, 3);
  assert.equal(def.power, 2);
  assert.equal(def.toughness, 2);
  assert.deepEqual(def.keywords, ['double_strike']);
  const ninjutsu = def.abilities.find((a) => a.keyword === 'ninjutsu');
  assert.deepEqual(ninjutsu?.cost, { mana: 4, colors: ['W'] });

  // Przepływ ninjutsu (wzorzec B7.2): nieblokowany atakujący → oferta → wejście
  // zatapione i atakujące.
  const state = game('p1');
  state.turn = jumpToStep(state.turn, 'combat_damage', 'p1');
  state.combat = { attackingPlayerId: 'p1', defendingPlayerId: 'p2', attackers: ['rat'], blockers: new Map(), declared: true };
  putCard(state, 'rat', 'highland-game', 'p1', 'battlefield');
  putCard(state, 'kitsune', 'blade-blizzard-kitsune', 'p1', 'hand');
  addMana(state, 'p1', 4, { colors: ['W'] });
  const cmd = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'kitsune');
  assert.ok(cmd, 'ninjutsu {3}{W} oferowane w oknie combat');
  assert.ok(execute(state, cmd).ok);
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  const fox = [...state.objects.values()].find((o) => o.cardId === 'blade-blizzard-kitsune' && o.zone === 'battlefield');
  assert.ok(fox, 'Kitsune na polu bitwy po ninjutsu');
  assert.equal(fox.tapped, true, 'weszła zatapiona');
  assert.ok(state.combat.attackers.includes(fox.id), 'atakująca');
});

test('A2: Knockout Maneuver — licznik NAJPIERW, obrażenia = moc Z licznikiem', () => {
  const state = game('p1');
  putCard(state, 'guy', 'highland-game', 'p1', 'battlefield'); // 2/1
  putCard(state, 'foe', 'segmented-krotiq', 'p2', 'battlefield'); // 6/5
  putCard(state, 'km', 'knockout-maneuver', 'p1', 'hand');
  addMana(state, 'p1', 3, { colors: ['G'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'km');
  assert.ok(cast, 'oferta rzutu Knockout Maneuver');
  assert.ok(execute(state, cast).ok);
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  const guy = state.objects.get('guy');
  assert.equal((guy.counters ?? {})['+1/+1'], 1, 'licznik +1/+1 na swoim stworze');
  assert.equal(guy.damage, 0, 'własny stwór nieobrażony');
  const foe = state.objects.get('foe');
  assert.equal(foe.damage, 3, 'przeciwnik otrzymał 3 (= moc 2/1 + licznik), nie 2');
  assert.equal(foe.zone, 'battlefield', '6/5 przeżywa 3 obrażenia');
});

test('A3: Krotiq Nestguard — defender blokuje atak; po {2}{G} atakuje; cleanup przywraca', () => {
  const state = game('p1');
  putCard(state, 'nest', 'krotiq-nestguard', 'p1', 'battlefield');
  state.objects.set('nest', Object.freeze({ ...state.objects.get('nest'), summoningSickness: false }));
  const attackStep = () => {
    state.turn = { ...state.turn, phase: 'combat', step: 'declare_attackers', activePlayerId: 'p1', priorityPlayerId: 'p1' };
  };
  // legalAttackerOptions zwraca podzbiory (tablice id atakujących).
  const nestAttacks = () => legalAttackerOptions(state, 'p1').some((opt) => opt.includes('nest'));
  attackStep();
  assert.ok(!nestAttacks(), 'z defenderem nie może atakować');

  // Aktywacja {2}{G} — traci defendera do końca tury.
  addMana(state, 'p1', 3, { colors: ['G'] });
  const activate = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'nest');
  assert.ok(activate, 'oferta aktywacji {2}{G}');
  assert.ok(execute(state, activate).ok);
  // Zdolność przechodzi przez stos (okno odpowiedzi) — rozstrzyga się po passach.
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.ok(nestAttacks(), 'po aktywacji atak legalny (jakby bez defendera)');
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['nest'] }).ok,
    'deklaracja ataku Nestguarda przechodzi');

  // Cleanup końca tury przywraca defendera (wzorzec Wishful Merfolk).
  state.turn = jumpToStep(state.turn, 'end', 'p1');
  state.turn.step = 'cleanup';
  state.turn.phase = 'ending';
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  const nest = [...state.objects.values()].find((o) => o.cardId === 'krotiq-nestguard' && o.zone === 'battlefield');
  assert.ok(nest, 'Nestguard żyje');
  attackStep();
  assert.ok(!legalAttackerOptions(state, 'p1').some((opt) => opt.includes(nest.id)),
    'w następnej turze znowu nie atakuje (defender przywrócony)');
});

// ---- Transza B: nowe slowa kluczowe proste -----------------------------------

test('B1: Cacophodon - Enrage: obrazenia odpalaja trigger, odkreca cel permanentu', () => {
  // Tura p2 (instant zagrany z własnym priorytetem — oferta cast_spell wymaga priorytetu).
  const state = game('p2');
  putCard(state, 'caco', 'cacophodon', 'p1', 'battlefield');
  putCard(state, 'guy', 'highland-game', 'p1', 'battlefield');
  state.objects.set('guy', Object.freeze({ ...state.objects.get('guy'), tapped: true }));
  putCard(state, 'ants', 'release-the-ants', 'p2', 'hand');
  addMana(state, 'p2', 2, { colors: ['R'] });
  const cast = playerView(state, 'p2').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'ants' && c.targets?.[0] === 'caco');
  assert.ok(cast, 'oferta 1 obrazenia w Cacophodona');
  assert.ok(execute(state, cast).ok);
  for (let i = 0; i < 12; i += 1) {
    const pending = state.pendingTriggerTargets?.[0];
    if (pending) {
      assert.ok(execute(state, { type: 'resolve_trigger_target', playerId: pending.playerId, targetId: 'guy' }).ok);
      continue;
    }
    if (state.zones.stack.length > 0) {
      assert.ok(execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId }).ok);
      continue;
    }
    break;
  }
  const caco = [...state.objects.values()].find((o) => o.cardId === 'cacophodon' && o.zone === 'battlefield');
  assert.ok(caco, 'Cacophodon (2/5) przezyl 1 obrazenie');
  assert.equal(caco.damage, 1, 'obrazenia odnotowane');
  assert.equal(state.objects.get('guy').tapped, false, 'Enrage odkrecil wybrany permanent');
});

test('B2: Feed the Infection - draw 3 + lose 3 + Corrupted (poison >= 3)', () => {
  const state = game('p1');
  for (let i = 0; i < 8; i += 1) putCard(state, 'lib' + i, 'highland-game', 'p1', 'library');
  const p2 = state.players.find((pl) => pl.id === 'p2');
  p2.poison = 3;
  const p1LifeBefore = 20;
  const p2LifeBefore = p2.life;
  putCard(state, 'fti', 'feed-the-infection', 'p1', 'hand');
  addMana(state, 'p1', 4, { colors: ['B'] });
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'fti');
  assert.ok(cast, 'oferta rzutu');
  assert.ok(execute(state, cast).ok);
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  const hand = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p1').length;
  assert.equal(hand, 3, 'dobre 3 karty (draw 3)');
  assert.equal(state.players.find((pl) => pl.id === 'p1').life, p1LifeBefore - 3, 'gracz traci 3 zycia');
  assert.equal(p2.life, p2LifeBefore - 3, 'Corrupted: przeciwnik z 3 poison traci 3 zycia');

  const s2 = game('p1');
  for (let i = 0; i < 8; i += 1) putCard(s2, 'lib' + i, 'highland-game', 'p1', 'library');
  const foe2 = s2.players.find((pl) => pl.id === 'p2');
  foe2.poison = 2;
  const foeLife = foe2.life;
  putCard(s2, 'fti', 'feed-the-infection', 'p1', 'hand');
  addMana(s2, 'p1', 4, { colors: ['B'] });
  execute(s2, playerView(s2, 'p1').legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'fti'));
  execute(s2, { type: 'pass_priority', playerId: s2.turn.priorityPlayerId });
  execute(s2, { type: 'pass_priority', playerId: s2.turn.priorityPlayerId });
  assert.equal(foe2.life, foeLife, 'ponizej progu 3 poison - bez utraty zycia');
});

test('B3: Mosquito Guard - Reinforce 1 z reki: discard jako koszt + licznik na celu', () => {
  const state = game('p1');
  putCard(state, 'guy', 'highland-game', 'p1', 'battlefield');
  putCard(state, 'guard', 'mosquito-guard', 'p1', 'hand');
  addMana(state, 'p1', 2, { colors: ['W'] });
  const activate = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'guard' && c.targets?.[0] === 'guy');
  assert.ok(activate, 'oferta reinforce z celem (zdolnosc karty w rece)');
  assert.ok(execute(state, activate).ok);
  assert.ok(!state.objects.get('guard') || state.objects.get('guard')?.zone !== 'hand', 'karta odrzucona (koszt)');
  const grave = [...state.objects.values()].find((o) => o.cardId === 'mosquito-guard' && o.zone === 'graveyard');
  assert.ok(grave, 'Mosquito Guard w grobie (discard)');
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  assert.equal((state.objects.get('guy').counters ?? {})['+1/+1'], 1, 'licznik +1/+1 na celu');
  assert.equal(state.players.find((pl) => pl.id === 'p1').mana, 0, 'mana wydana');
});

test('B4: Enrage odpala TEZ gdy obrazenia zabija stwora (CR 603.10 looks-back)', () => {
  const state = game('p2');
  putCard(state, 'caco', 'cacophodon', 'p1', 'battlefield'); // 2/5
  state.objects.set('caco', Object.freeze({ ...state.objects.get('caco'), damage: 4 })); // 1 obrażenie zabije
  putCard(state, 'guy', 'highland-game', 'p1', 'battlefield');
  state.objects.set('guy', Object.freeze({ ...state.objects.get('guy'), tapped: true }));
  putCard(state, 'ants', 'release-the-ants', 'p2', 'hand');
  addMana(state, 'p2', 2, { colors: ['R'] });
  const cast = playerView(state, 'p2').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'ants' && c.targets?.[0] === 'caco');
  assert.ok(cast, 'oferta dośmiertelnego obrażenia');
  assert.ok(execute(state, cast).ok);
  // M242/H: jedyny legalny kandydat ('guy') → Enrage wybiera cel AUTO-
  // MATYCZNIE (testujemy kluczową treść: odpalenie mimo śmierci źródła, LKI).
  let untapSeen = false;
  for (let i = 0; i < 12; i += 1) {
    const pending = state.pendingTriggerTargets?.[0];
    if (pending) {
      untapSeen = true;
      assert.ok(execute(state, { type: 'resolve_trigger_target', playerId: pending.playerId, targetId: 'guy' }).ok);
      continue;
    }
    if (state.zones.stack.length > 0) {
      assert.ok(execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId }).ok);
      continue;
    }
    break;
  }
  if (!untapSeen) {
    const autoEvt = state.events.filter((e) => e.type === 'trigger_target_resolved' && e.cardId === 'cacophodon').at(-1);
    untapSeen = Boolean(autoEvt && autoEvt.auto === true && autoEvt.targetId === 'guy');
  }
  assert.ok(untapSeen, 'trigger Enrage odpalił mimo śmierci źródła (LKI) — wybór ręczny albo auto');
  assert.equal(state.objects.get('guy').tapped, false, 'odkręcenie celu działa po śmierci Cacophodona');
  const dead = [...state.objects.values()].find((o) => o.cardId === 'cacophodon' && o.zone === 'graveyard');
  assert.ok(dead, 'Cacophodon zginął od obrażeń');
});

// ---- Transza C: platnosc/warunki ----------------------------------------------

test('C1: Locthwain Paladin — Adamant: 3 czarnej many = +1/+1 przy wejsciu', () => {
  // Scenariusz 1: 3 czarne jednostki (koszt {3}{B} caly czarny) -> licznik.
  const state = game('p1');
  putCard(state, 'pal', 'locthwain-paladin', 'p1', 'hand');
  addMana(state, 'p1', 4, { colors: ['B'] });
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === 'pal');
  assert.ok(cast, 'oferta rzutu Paladyna');
  assert.ok(execute(state, cast).ok);
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  const onBf = [...state.objects.values()].find((o) => o.cardId === 'locthwain-paladin' && o.zone === 'battlefield');
  assert.ok(onBf, 'Paladyn na polu bitwy');
  assert.equal((onBf.counters ?? {})['+1/+1'], 1, 'Adamant spelniony (3 czarnej many) = licznik');

  // Scenariusz 2: tylko 1 czarna jednostka (reszta bezbarwna z puli) -> bez licznika.
  const s2 = game('p1');
  putCard(s2, 'pal', 'locthwain-paladin', 'p1', 'hand');
  addMana(s2, 'p1', 1, { colors: ['B'] });
  addMana(s2, 'p1', 3, { colors: [] });
  execute(s2, playerView(s2, 'p1').legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === 'pal'));
  execute(s2, { type: 'pass_priority', playerId: s2.turn.priorityPlayerId });
  execute(s2, { type: 'pass_priority', playerId: s2.turn.priorityPlayerId });
  const onBf2 = [...s2.objects.values()].find((o) => o.cardId === 'locthwain-paladin' && o.zone === 'battlefield');
  assert.ok(onBf2, 'Paladyn na polu bitwy (bez Ademanta)');
  assert.equal((onBf2.counters ?? {})['+1/+1'], undefined, 'Adamant NIEspelniony (1 czarna) = bez licznika');
});

test("C2: Sarkhan's Rage — 5 w cel; bez Smoka +2 w siebie, ze Smokiem nic", () => {
  // Bez Smoka: p2 (rzucajacy) dostaje 5 w siebie + 2 odbicia = 7.
  const state = game('p2');
  putCard(state, 'rage', 'sarkhans-rage', 'p2', 'hand');
  addMana(state, 'p2', 5, { colors: ['R'] });
  const lifeBefore = state.players.find((pl) => pl.id === 'p2').life;
  const cast = playerView(state, 'p2').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'rage' && c.targets?.[0] === 'p2');
  assert.ok(cast, 'oferta 5 obrazen w siebie');
  assert.ok(execute(state, cast).ok);
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  assert.equal(state.players.find((pl) => pl.id === 'p2').life, lifeBefore - 7,
    '5 obrazen w cel + 2 w siebie (brak Smoka)');

  // Ze Smokiem pod kontrola: bez odbicia.
  const s2 = game('p2');
  const dragon = putCard(s2, 'drake', 'kappa-tech-wrecker', 'p2', 'battlefield');
  s2.objects.set('drake', Object.freeze({ ...dragon, subtypes: [...dragon.subtypes, 'Dragon'] }));
  putCard(s2, 'rage', 'sarkhans-rage', 'p2', 'hand');
  addMana(s2, 'p2', 5, { colors: ['R'] });
  const life2 = s2.players.find((pl) => pl.id === 'p2').life;
  execute(s2, playerView(s2, 'p2').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'rage' && c.targets?.[0] === 'p2'));
  execute(s2, { type: 'pass_priority', playerId: s2.turn.priorityPlayerId });
  execute(s2, { type: 'pass_priority', playerId: s2.turn.priorityPlayerId });
  assert.equal(s2.players.find((pl) => pl.id === 'p2').life, life2 - 5,
    'kontrola Smoka = tylko 5 obrazen w cel (bez odbicia)');
});

// ---- Transza D: Inferno Titan — podział obrażeń -------------------------------

/** Rzuca Inferno Titana (ETB otwiera multi-target + ewentualny podział kwot). */
function castTitan(state) {
  putCard(state, 'titan', 'inferno-titan', 'p1', 'hand');
  addMana(state, 'p1', 6, { colors: ['R'] });
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === 'titan');
  assert.ok(cast, 'oferta rzutu Titana');
  assert.ok(execute(state, cast).ok);
}

test('D1: ETB z DWOMA celami — decyzja kwot (2+1), obrażenia według wyboru', () => {
  const state = game('p1');
  putCard(state, 'foe1', 'highland-game', 'p2', 'battlefield'); // 2/1
  putCard(state, 'foe2', 'segmented-krotiq', 'p2', 'battlefield'); // 6/5
  castTitan(state);
  // 1) Multi-target (M157/F4a): wybieramy dwa cele w JEDNEJ komendzie.
  let multi = null;
  for (let i = 0; i < 12; i += 1) {
    const pending = state.pendingTriggerTargets?.[0];
    if (pending) { multi = pending; break; }
    if (state.zones.stack.length > 0) {
      assert.ok(execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId }).ok);
      continue;
    }
    break;
  }
  assert.ok(multi, 'decyzja multi-target otwarta');
  assert.ok(execute(state, { type: 'resolve_trigger_target', playerId: 'p1', targetIds: ['foe1', 'foe2'] }).ok);
  // 2) M171/Z6 (CR 603.3d): decyzja KWOT otwiera się OD RAZU po wyborze
  //    celów (deklaracja przy umieszczaniu na stosie), nie po rozstrzygnięciu.
  assert.ok(state.pendingDamageDivision, 'decyzja podziału kwot otwarta (2 cele)');
  assert.ok(state.zones.stack.length > 0, 'trigger wciąż na stosie (Z6)');
  const view = playerView(state, 'p1');
  const offers = view.legalCommands.filter((c) => c.type === 'resolve_damage_division');
  assert.equal(offers.length, 2, 'kompozycje [1,2] i [2,1] — dokładnie dwie oferty');
  const chosen = offers.find((c) => JSON.stringify(c.amounts) === JSON.stringify([2, 1]));
  assert.ok(chosen, 'oferta 2+1 dostępna');
  const done = execute(state, chosen);
  assert.ok(done.ok, `podział zaakceptowany: ${done.events?.[0]?.reason}`);
  // M171/Z6 (CR 603.3d): kwoty są DEKLARACJĄ przy umieszczaniu na stosie —
  // obrażenia zadaje dopiero rozstrzygnięcie triggera (passy).
  for (let i = 0; i < 12 && state.zones.stack.length > 0; i += 1) {
    assert.ok(execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId }).ok);
  }
  // 2 obrażenia zabijają 2/1; 1 obrażenie na 6/5 zostaje.
  assert.ok([...state.objects.values()].some((o) => o.cardId === 'highland-game' && o.zone === 'graveyard'), '2/1 zabite (2 obrażenia)');
  const big = state.objects.get('foe2');
  assert.equal(big.damage, 1, '6/5 otrzymało dokładnie 1');
});

test('D2: ETB z JEDNYM celem — całe 3 bez decyzji kwot', () => {
  const state = game('p1');
  putCard(state, 'foe1', 'segmented-krotiq', 'p2', 'battlefield'); // 6/5
  castTitan(state);
  for (let i = 0; i < 12; i += 1) {
    const pending = state.pendingTriggerTargets?.[0];
    if (pending) {
      assert.ok(execute(state, { type: 'resolve_trigger_target', playerId: 'p1', targetIds: ['foe1'] }).ok);
      continue;
    }
    if (state.pendingDamageDivision) break;
    if (state.zones.stack.length > 0) {
      assert.ok(execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId }).ok);
      continue;
    }
    break;
  }
  assert.ok(!state.pendingDamageDivision, 'jeden cel = bez decyzji kwot (całe 3)');
  assert.equal(state.objects.get('foe1').damage, 3, '3 obrażenia na jedyny cel');
});

test('D3: {R}: +1/+0 do końca tury (aktywowana, bez oncePerTurn)', () => {
  const state = game('p1');
  putCard(state, 'titan', 'inferno-titan', 'p1', 'battlefield');
  addMana(state, 'p1', 2, { colors: ['R'] });
  const activate = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'titan');
  assert.ok(activate, 'oferta {R}: +1/+0');
  assert.ok(execute(state, activate).ok);
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  const titan = [...state.objects.values()].find((o) => o.cardId === 'inferno-titan' && o.zone === 'battlefield');
  assert.equal(titan.powerModifier, 1, '+1/+0 do końca tury');
});

test('D4: trigger przy ATAKU — dzieli obrażenia (scenariusz walki)', () => {
  const state = game('p1');
  const titan = putCard(state, 'titan', 'inferno-titan', 'p1', 'battlefield');
  state.objects.set('titan', Object.freeze({ ...titan, summoningSickness: false }));
  putCard(state, 'foe1', 'highland-game', 'p2', 'battlefield');
  putCard(state, 'foe2', 'highland-game', 'p2', 'battlefield');
  state.turn = { ...state.turn, phase: 'combat', step: 'declare_attackers', activePlayerId: 'p1', priorityPlayerId: 'p1' };
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['titan'] }).ok);
  assert.ok(execute(state, { type: 'resolve_trigger_target', playerId: 'p1', targetIds: ['foe1', 'foe2'] }).ok);
  // M171/Z6 (CR 603.3d): deklaracja kwot przy umieszczaniu na stosie.
  assert.ok(state.pendingDamageDivision, 'decyzja kwot po ataku');
  const done = execute(state, { type: 'resolve_damage_division', playerId: 'p1', amounts: [2, 1] });
  assert.ok(done.ok, 'podział po ataku zaakceptowany');
  for (let i = 0; i < 12 && state.zones.stack.length > 0; i += 1) {
    assert.ok(execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId }).ok);
  }
  const dead = [...state.objects.values()].filter((o) => o.cardId === 'highland-game' && o.zone === 'graveyard');
  assert.ok(dead.length >= 1, 'jeden 2/1 zabity (2 obrażenia z podziału)');
});

// ---- Transza E: Cenn's Tactician — blok dodatkowy ------------------------------

function blockersStep(state, defenderId = 'p1') {
  state.turn = { ...state.turn, phase: 'combat', step: 'declare_blockers', activePlayerId: 'p2', priorityPlayerId: defenderId };
}

test("E1: {W},{T}: licznik +1/+1 na celu Soldierze", () => {
  const state = game('p1');
  putCard(state, 'tact', 'cenns-tactician', 'p1', 'battlefield');
  putCard(state, 'guard', 'mosquito-guard', 'p1', 'battlefield'); // Kithkin Soldier
  putCard(state, 'elk', 'highland-game', 'p1', 'battlefield'); // Elk — NIE Soldier
  addMana(state, 'p1', 1, { colors: ['W'] });
  const commands = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'activate_ability' && c.objectId === 'tact');
  assert.ok(commands.length > 0, 'oferta aktywacji');
  assert.ok(commands.every((c) => c.targets?.[0] !== 'elk'), 'cel tylko Soldier (Elk odfiltrowany)');
  const chosen = commands.find((c) => c.targets?.[0] === 'guard');
  assert.ok(chosen, 'cel = Mosquito Guard (Kithkin Soldier)');
  assert.ok(execute(state, chosen).ok);
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  assert.equal((state.objects.get('guard').counters ?? {})['+1/+1'], 1, 'licznik na Soldierzie');
  assert.equal(state.objects.get('tact').tapped, true, 'Tactician zatapowany (koszt {T})');
});

test("E2: stwór z +1/+1 blokuje DODATKOWEGO stwora (statyka Tacticiana)", () => {
  const state = game('p1');
  putCard(state, 'tact', 'cenns-tactician', 'p1', 'battlefield');
  const guard = putCard(state, 'guard', 'mosquito-guard', 'p1', 'battlefield');
  state.objects.set('guard', Object.freeze({ ...guard, counters: { '+1/+1': 1 }, summoningSickness: false }));
  putCard(state, 'a1', 'highland-game', 'p2', 'battlefield');
  putCard(state, 'a2', 'highland-game', 'p2', 'battlefield');
  state.turn = { ...state.turn, phase: 'combat', step: 'declare_attackers', activePlayerId: 'p2', priorityPlayerId: 'p2' };
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['a1', 'a2'] }).ok);
  blockersStep(state);
  // Podwójny blok: guard blokuje OBU atakujących — legalny ze statyką.
  const done = execute(state, { type: 'declare_blockers', playerId: 'p1', assignments: { a1: ['guard'], a2: ['guard'] } });
  assert.ok(done.ok, `guard z +1/+1 blokuje dwóch (statyka), a było: ${done.events?.[0]?.reason}`);
  const combat = state.combat;
  assert.deepEqual([...combat.blockers.get('a1')], ['guard'], 'przypisany do a1');
  assert.deepEqual([...combat.blockers.get('a2')], ['guard'], 'przypisany do a2');

  // Bez statyki (bez Tacticiana na stole): ten sam podwójny blok ODRZUCONY.
  const s2 = game('p1');
  const guard2 = putCard(s2, 'guard', 'mosquito-guard', 'p2', 'battlefield');
  s2.objects.set('guard', Object.freeze({ ...guard2, counters: { '+1/+1': 1 }, summoningSickness: false }));
  putCard(s2, 'a1', 'highland-game', 'p1', 'battlefield');
  putCard(s2, 'a2', 'highland-game', 'p1', 'battlefield');
  s2.turn = { ...s2.turn, phase: 'combat', step: 'declare_attackers', activePlayerId: 'p1', priorityPlayerId: 'p1' };
  execute(s2, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['a1', 'a2'] });
  s2.turn = { ...s2.turn, phase: 'combat', step: 'declare_blockers', activePlayerId: 'p1', priorityPlayerId: 'p2' };
  const rejected = execute(s2, { type: 'declare_blockers', playerId: 'p2', assignments: { a1: ['guard'], a2: ['guard'] } });
  assert.ok(!rejected.ok, 'bez statyki podwójny blok nielegalny (użyty więcej niż raz)');
});

test('E3: stwór BEZ licznika +1/+1 blokuje nadal tylko raz; enumeracja oferuje podwójny blok', () => {
  const state = game('p1');
  putCard(state, 'tact', 'cenns-tactician', 'p1', 'battlefield');
  const guard = putCard(state, 'guard', 'mosquito-guard', 'p1', 'battlefield');
  state.objects.set('guard', Object.freeze({ ...guard, counters: { '+1/+1': 1 }, summoningSickness: false }));
  putCard(state, 'plain', 'segmented-krotiq', 'p1', 'battlefield'); // bez licznika
  state.objects.set('plain', Object.freeze({ ...state.objects.get('plain'), summoningSickness: false }));
  putCard(state, 'a1', 'highland-game', 'p2', 'battlefield');
  putCard(state, 'a2', 'highland-game', 'p2', 'battlefield');
  state.turn = { ...state.turn, phase: 'combat', step: 'declare_attackers', activePlayerId: 'p2', priorityPlayerId: 'p2' };
  execute(state, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['a1', 'a2'] });
  blockersStep(state);
  // Enumeracja (oferta = walidacja, L48): opcja podwójnego bloku guardem istnieje.
  const view = playerView(state, 'p1');
  const doubleBlock = view.legalCommands.find((c) => c.type === 'declare_blockers'
    && (c.assignments?.a1 ?? []).includes('guard') && (c.assignments?.a2 ?? []).includes('guard'));
  assert.ok(doubleBlock, 'oferta podwójnego bloku w legalCommands');
  assert.ok(execute(state, doubleBlock).ok, 'ofertowany podwójny blok przechodzi execute');
  // Stwór bez licznika: podwójny blok ODRZUCONY mimo statyki na stole.
  const s2 = game('p1');
  putCard(s2, 'tact', 'cenns-tactician', 'p1', 'battlefield');
  const plain = putCard(s2, 'plain', 'segmented-krotiq', 'p1', 'battlefield');
  s2.objects.set('plain', Object.freeze({ ...plain, summoningSickness: false }));
  putCard(s2, 'a1', 'highland-game', 'p2', 'battlefield');
  putCard(s2, 'a2', 'highland-game', 'p2', 'battlefield');
  s2.turn = { ...s2.turn, phase: 'combat', step: 'declare_attackers', activePlayerId: 'p2', priorityPlayerId: 'p2' };
  execute(s2, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['a1', 'a2'] });
  s2.turn = { ...s2.turn, phase: 'combat', step: 'declare_blockers', activePlayerId: 'p2', priorityPlayerId: 'p1' };
  const rejected = execute(s2, { type: 'declare_blockers', playerId: 'p1', assignments: { a1: ['plain'], a2: ['plain'] } });
  assert.ok(!rejected.ok, 'bez licznika +1/+1 podwójny blok nadal nielegalny');
});
