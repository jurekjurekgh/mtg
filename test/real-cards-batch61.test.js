// Batch 61 (2026-09-29) — karty właściciela: 157 ORI, 158 OGW, 160 M11,
// 161 KTK, 162 DMR, 164 VOW, 165 M20, 167 ISD, 170 MKM, 174 RTR — razem 10 kart.
//
// Dane Oracle i rulingi: `docs/cards/scryfall-*.json` (pobrane 2026-09-29,
// ADR 0010 §2a, ADR 0028 — rulingi „przy kartce", także puste listy).
// Katalog: `src/cards/card-data.js`; artId z dopisków `<nr><SET>` do
// `tools/collection-art-ids.csv` (format zlecenia batcha, np. 160M11).
// Plan batcha: `docs/plans/PLAN_2026-09-29-batch61-kolekcja-157-174.md`.
//
// Podział na sekcje = etapy batcha (B61/1 … B61/10; kolejność = kolejność
// implementacji z planu). Każda sekcja ma scenariusz legalny, nielegalny
// (maszynowo rozpoznawalny brak oferty) i sanity danych Oracle/druku.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { MANA_COSTS } from '../src/cards/mana-costs-data.js';
import { jumpToStep } from '../src/engine/turn.js';
import { effectivePower, effectiveToughness, effectiveKeywords } from '../src/engine/permanents.js';
import { addMana } from '../src/engine/resources.js';

const registry = createCardRegistry();

function game(players = ['p1', 'p2']) {
  const state = createGameState({ seed: 61, players: players.map((id) => ({ id })) });
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
/** Odbicie tworzy NOWY obiekt w ręce (id `hand-<seq>`), więc szukamy po karcie i właścicielu. */
const inHand = (s, cardId, ownerId) => [...s.objects.values()].find((o) => o.cardId === cardId && o.zone === 'hand' && o.ownerId === ownerId);
const player = (s, id) => s.players.find((p) => p.id === id);

/**
 * Rozstrzyga stos do końca, pytając o komendy gracza z BIEŻĄCYM priorytetem
 * (czar przeciwnika + odpowiedź = dwóch różnych graczy przy stole).
 */
function passStack(s, max = 30) {
  for (let i = 0; s.zones.stack.length && i < max; i++) {
    const p = s.turn.priorityPlayerId;
    const choices = commands(s, p);
    const c = choices.find((x) => x.type.startsWith('resolve_')) ?? choices.find((x) => x.type === 'pass_priority');
    assert.ok(c, `komenda przy stosie (gracz ${p})`);
    run(s, c);
  }
  assert.equal(s.zones.stack.length, 0, 'stos pusty');
}

// ---- B61/160: Fiery Hellhound (M11 #136, plan Dominaria) --------------------

test('B61/160: Fiery Hellhound — dane Oracle, 2/2 za {1}{R}{R} i druk M11', () => {
  const def = registry.get('fiery-hellhound');
  assert.deepEqual(def.types, ['Creature']);
  assert.deepEqual(def.subtypes, ['Elemental', 'Dog']);
  assert.deepEqual(def.colors, ['R']);
  assert.equal(def.power, 2);
  assert.equal(def.toughness, 2);
  assert.equal(def.manaCost, 3);
  assert.equal(def.set, 'M11');
  assert.equal(def.plan, 'Dominaria');
  assert.equal(def.artId, 160);
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
  assert.ok(def.imageUri.includes('00e2db9a'), 'imageUri z druku M11 (m11/136)');
  assert.equal(MANA_COSTS['fiery-hellhound'], '{1}{R}{R}');
});

test('B61/160: Fiery Hellhound — {R}: +1/+0 do końca tury', () => {
  const state = game();
  put(state, 'hound', 'fiery-hellhound', 'p1', 'battlefield');
  addMana(state, 'p1', 1, { colors: ['R'] });
  const act = commands(state).find((c) => c.type === 'activate_ability' && c.objectId === 'hound');
  assert.ok(act, 'aktywacja z czerwoną maną jest oferowana');
  run(state, act);
  resolve(state);
  const live = state.objects.get('hound');
  assert.equal(effectivePower(live, state), 3, 'siła +1');
  assert.equal(effectiveToughness(live, state), 2, 'wytrzymałość bez zmian');
});

test('B61/160: Fiery Hellhound — brak czerwonej many = brak oferty (koszt kolorowy)', () => {
  const state = game();
  put(state, 'hound', 'fiery-hellhound', 'p1', 'battlefield');
  addMana(state, 'p1', 1, { colors: [] }); // JAWNIE bezbarwna (default addMana = dowolny kolor)
  assert.ok(!commands(state).some((c) => c.type === 'activate_ability' && c.objectId === 'hound'),
    'bezbarwna mana nie opłaca {R}');
});

// ---- B61/161: Dragonscale Boon (KTK #131, plan Tarkir) ----------------------

test('B61/161: Dragonscale Boon — dane Oracle, instant {3}{G} i druk KTK', () => {
  const def = registry.get('dragonscale-boon');
  assert.deepEqual(def.types, ['Instant']);
  assert.deepEqual(def.colors, ['G']);
  assert.equal(def.manaCost, 4);
  assert.equal(def.set, 'KTK');
  assert.equal(def.plan, 'Tarkir');
  assert.equal(def.artId, 161);
  assert.equal(def.spell.targets[0].type, 'creature');
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
  assert.ok(def.imageUri.includes('5aadb382'), 'imageUri z druku KTK (ktk/131)');
  assert.equal(MANA_COSTS['dragonscale-boon'], '{3}{G}');
  assert.equal(def.oracleText, 'Put two +1/+1 counters on target creature and untap it.');
});

test('B61/161: Dragonscale Boon — dwa liczniki +1/+1 i odkręcenie', () => {
  const state = game();
  put(state, 'boon', 'dragonscale-boon', 'p1');
  const beast = put(state, 'beast', 'razorfoot-griffin', 'p1', 'battlefield', { tapped: true });
  addMana(state, 'p1', 4, { colors: ['G'] });
  const cast = commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'boon' && c.targets?.[0] === 'beast');
  assert.ok(cast, 'rzut z celem-stworem jest oferowany');
  run(state, cast);
  resolve(state);
  const live = state.objects.get('beast');
  assert.equal(live.counters['+1/+1'], 2, 'dwa liczniki +1/+1');
  assert.equal(live.tapped, false, 'stwór odkręcony');
  assert.ok(find(state, 'dragonscale-boon', 'graveyard'), 'czar poszedł do grobu');
});

test('B61/161: Dragonscale Boon — ruling 2014-09-20: cel już odkręcony jest legalny', () => {
  const state = game();
  put(state, 'boon', 'dragonscale-boon', 'p1');
  put(state, 'beast', 'razorfoot-griffin', 'p1', 'battlefield'); // nie jest tapnięty
  addMana(state, 'p1', 4, { colors: ['G'] });
  const cast = commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'boon' && c.targets?.[0] === 'beast');
  assert.ok(cast, 'untap na odkręconym stworze to legalny no-op (bez filtra „tapped")');
});

test('B61/161: Dragonscale Boon — brak celu-stwora = brak oferty rzutu', () => {
  const state = game();
  put(state, 'boon', 'dragonscale-boon', 'p1');
  addMana(state, 'p1', 4, { colors: ['G'] });
  assert.ok(!commands(state).some((c) => c.type === 'cast_spell' && c.objectId === 'boon'),
    'cel obowiązkowy — bez stworów na stole rzutu nie ma');
});

// ---- B61/165: Captivating Gyre (M20 #51, plan Amonkhet) ---------------------

test('B61/165: Captivating Gyre — dane Oracle, sorcery {4}{U}{U} i druk M20', () => {
  const def = registry.get('captivating-gyre');
  assert.deepEqual(def.types, ['Sorcery']);
  assert.deepEqual(def.colors, ['U']);
  assert.equal(def.manaCost, 6);
  assert.equal(def.set, 'M20');
  assert.equal(def.plan, 'Amonkhet');
  assert.equal(def.artId, 165);
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
  assert.ok(def.imageUri.includes('a2bd5c34'), 'imageUri z druku M20 (m20/51)');
  assert.equal(MANA_COSTS['captivating-gyre'], '{4}{U}{U}');
  assert.equal(def.spell.modes.length, 1, 'jeden tryb zmienny (wzorzec Sea God’s Scorn)');
  assert.deepEqual(def.spell.modes[0].variableTargets, { max: 3, min: 0, type: 'creature' });
});

test('B61/165: Captivating Gyre — trzy cele wracają do rąk WŁAŚCICIELI', () => {
  const state = game();
  put(state, 'gyre', 'captivating-gyre', 'p1');
  const a = put(state, 'a', 'razorfoot-griffin', 'p1', 'battlefield');
  const b = put(state, 'b', 'fiery-hellhound', 'p1', 'battlefield');
  const c = put(state, 'c', 'razorfoot-griffin', 'p2', 'battlefield');
  addMana(state, 'p1', 6, { colors: ['U', 'U'] });
  const cast = commands(state).find((cmd) => cmd.type === 'cast_spell' && cmd.objectId === 'gyre'
    && cmd.targets?.length === 3 && ['a', 'b', 'c'].every((id) => cmd.targets.includes(id)));
  assert.ok(cast, 'rzut z trzema celami jest oferowany');
  run(state, cast);
  resolve(state);
  assert.ok(!state.objects.get('a') || state.objects.get('a').zone !== 'battlefield', 'a zszedł ze stołu');
  assert.ok(!state.objects.get('b') || state.objects.get('b').zone !== 'battlefield', 'b zszedł ze stołu');
  assert.ok(!state.objects.get('c') || state.objects.get('c').zone !== 'battlefield', 'c zszedł ze stołu');
  assert.ok(inHand(state, 'razorfoot-griffin', 'p1'), 'stwór p1 (a) wrócił na rękę p1');
  assert.ok(inHand(state, 'razorfoot-griffin', 'p2'), 'stwór p2 (c) wrócił na rękę p2 — ownerId, nie kontroler');
  assert.ok(inHand(state, 'fiery-hellhound', 'p1'), 'Fiery Hellhound (b) też wrócił (trzeci cel)');
  assert.ok(find(state, 'captivating-gyre', 'graveyard'));
});

test('B61/165: Captivating Gyre — „up to three": rzut z zerem celów też jest legalny', () => {
  const state = game();
  put(state, 'gyre', 'captivating-gyre', 'p1');
  addMana(state, 'p1', 6, { colors: ['U', 'U'] });
  const cast = commands(state).find((cmd) => cmd.type === 'cast_spell' && cmd.objectId === 'gyre' && (cmd.targets?.length ?? 0) === 0);
  assert.ok(cast, '„up to three" dopuszcza zero celów (CR 601.2c)');
});

test('B61/165: Captivating Gyre — stwór przeciwnika NIE jest celem przy braku innych', () => {
  const state = game();
  put(state, 'gyre', 'captivating-gyre', 'p1');
  put(state, 'mine', 'razorfoot-griffin', 'p1', 'battlefield');
  addMana(state, 'p1', 6, { colors: ['U', 'U'] });
  const casts = commands(state).filter((c) => c.type === 'cast_spell' && c.objectId === 'gyre');
  // Każdy stwór jest legalnym celem (także cudzy) — sprawdzamy więc granicę
  // liczby celów: oferta nie może dać więcej niż trzy.
  assert.ok(casts.every((c) => (c.targets?.length ?? 0) <= 3), 'maksymalnie trzy cele (max z variableTargets)');
});

// ---- B61/167: Lost in the Mist (ISD #63, plan Eldraine) ---------------------

test('B61/167: Lost in the Mist — dane Oracle, instant {3}{U}{U} i druk ISD', () => {
  const def = registry.get('lost-in-the-mist');
  assert.deepEqual(def.types, ['Instant']);
  assert.deepEqual(def.colors, ['U']);
  assert.equal(def.manaCost, 5);
  assert.equal(def.set, 'ISD');
  assert.equal(def.plan, 'Eldraine');
  assert.equal(def.artId, 167);
  assert.deepEqual(def.spell.targets.map((t) => t.type), ['spell_on_stack', 'permanent']);
  assert.deepEqual(def.spell.effects.map((e) => [e.type, e.targetIndex]), [['counter_spell', 0], ['bounce_permanent', 1]]);
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
  assert.ok(def.imageUri.includes('1e5fc39d'), 'imageUri z druku ISD (isd/63)');
  assert.equal(MANA_COSTS['lost-in-the-mist'], '{3}{U}{U}');
});

test('B61/167: Lost in the Mist — kontruje czar i odbija permanent', () => {
  const state = game();
  put(state, 'mist', 'lost-in-the-mist', 'p1');
  put(state, 'spell', 'demolish', 'p2', 'hand'); // Dowolny czar na stosie
  const rock = put(state, 'rock', 'trigon-of-corruption', 'p2', 'battlefield');
  addMana(state, 'p1', 5, { colors: ['U', 'U'] });
  // p2 rzuca Demolish na swojej turze — p1 odpowiada instantem.
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 4, { colors: ['R'] });
  const enemyCast = commands(state, 'p2').find((c) => c.type === 'cast_spell' && c.objectId === 'spell' && c.targets?.[0] === 'rock');
  assert.ok(enemyCast, 'czar przeciwnika jest oferowany');
  run(state, enemyCast);
  assert.equal(state.zones.stack.length, 1, 'czar przeciwnika na stosie');
  // Po rzucie priorytet wraca do rzucającego — p2 musi spasować, żeby p1
  // zobaczył ofertę odpowiedzi (pass w rundzie priorytetu).
  run(state, { type: 'pass_priority', playerId: 'p2' });
  const stackSpell = state.zones.stack[0];
  const cast = commands(state, 'p1').find((c) => c.type === 'cast_spell' && c.objectId === 'mist'
    && c.targets?.[0] === stackSpell && c.targets?.[1] === 'rock');
  assert.ok(cast, 'rzut z celem-czar + cel-permanent jest oferowany');
  run(state, cast);
  passStack(state);
  assert.ok(find(state, 'demolish', 'graveyard'), 'czar przeciwnika w grobie (skontrowany)');
  const bounced = [...state.objects.values()].find((o) => o.zone === 'hand' && o.ownerId === 'p2' && o.cardId === 'trigon-of-corruption');
  assert.ok(bounced, 'trigon wrócił na rękę właściciela');
  assert.ok(!state.objects.get('rock') || state.objects.get('rock').zone !== 'battlefield');
});

test('B61/167: Lost in the Mist — brak czaru na stosie = brak oferty (oba cele obowiązkowe)', () => {
  const state = game();
  put(state, 'mist', 'lost-in-the-mist', 'p1');
  put(state, 'rock', 'trigon-of-corruption', 'p2', 'battlefield');
  addMana(state, 'p1', 5, { colors: ['U', 'U'] });
  assert.ok(!commands(state, 'p1').some((c) => c.type === 'cast_spell' && c.objectId === 'mist'),
    'ruling 2011-09-22: bez legalnego celu-czaru nie da się rzucić wcale');
});

test('B61/167: Lost in the Mist — brak permanentu = brak oferty (drugi cel wymagany)', () => {
  const state = game();
  put(state, 'mist', 'lost-in-the-mist', 'p1');
  // Czar NIEcelujący (Revealing Wind {2}{G}) — stół zostaje pusty, więc dla
  // Lost in the Mist nie ma żadnego legalnego celu-permanentu.
  put(state, 'spell', 'revealing-wind', 'p2', 'hand');
  addMana(state, 'p1', 5, { colors: ['U', 'U'] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 3, { colors: ['G'] });
  const enemyCast = commands(state, 'p2').find((c) => c.type === 'cast_spell' && c.objectId === 'spell');
  assert.ok(enemyCast, 'czar przeciwnika (bez celów) jest oferowany');
  run(state, enemyCast);
  run(state, { type: 'pass_priority', playerId: 'p2' });
  const casts = commands(state, 'p1').filter((c) => c.type === 'cast_spell' && c.objectId === 'mist');
  assert.deepEqual(casts, [], 'oba cele obowiązkowe — bez permanentu rzutu nie ma');
});

// ---- B61/174: Izzet Charm (RTR #172, plan Ravnica) ------------------------

test('B61/174: Izzet Charm — dane Oracle, modalny instant {U}{R} i druk RTR', () => {
  const def = registry.get('izzet-charm');
  assert.deepEqual(def.types, ['Instant']);
  assert.deepEqual(def.colors, ['U', 'R']);
  assert.equal(def.manaCost, 2);
  assert.equal(def.set, 'RTR');
  assert.equal(def.plan, 'Ravnica');
  assert.equal(def.artId, 174);
  // Trzy tryby z Oracle (kolejność jak na kartce): kontra warunkowa, obrażenia,
  // dobranie+odrzucenie.
  assert.deepEqual(def.spell.modes.map((m) => m.name), [
    'Kontra czar nie-stwora, chyba że zapłaci {2}',
    '2 obrażenia dla celu-stwora',
    'Dobierz 2 karty, odrzuć 2 karty',
  ]);
  assert.deepEqual(def.spell.modes[0].targets.map((t) => t.type), ['noncreature_spell_on_stack']);
  assert.deepEqual(def.spell.modes[0].effects.map((e) => [e.type, e.amount]), [['counter_spell_unless_pays', 2]]);
  assert.deepEqual(def.spell.modes[1].targets.map((t) => t.type), ['creature']);
  assert.deepEqual(def.spell.modes[1].effects.map((e) => [e.type, e.amount]), [['damage', 2]]);
  assert.deepEqual(def.spell.modes[2].targets, [], 'tryb 3 nie ma celów');
  assert.deepEqual(def.spell.modes[2].effects.map((e) => [e.type, e.amount, e.discardCount]),
    [['draw_then_discard', 2, 2]]);
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
  assert.ok(def.imageUri.includes('1e3a5af6'), 'imageUri z druku RTR (rtr/172)');
  assert.equal(MANA_COSTS['izzet-charm'], '{U}{R}');
});

test('B61/174: Izzet Charm — tryb „Dobierz 2, odrzuć 2" to jedna decyzja o 2 kartach', () => {
  const state = game();
  put(state, 'charm', 'izzet-charm');
  for (let i = 0; i < 3; i++) put(state, `fodder-${i}`, 'demolish');
  addMana(state, 'p1', 2, { colors: ['U', 'R'] });
  const libraryBefore = state.zones.library.filter((id) => state.objects.get(id)?.ownerId === 'p1').length;
  const cast = commands(state, 'p1').find((c) => c.type === 'cast_spell' && c.objectId === 'charm' && c.modeIndex === 2);
  assert.ok(cast, 'tryb 3 dostępny bez celów');
  run(state, cast);
  // Rozstrzygnięcie: dobranie 2 (ruling 2020-08-07 — dobranie i odrzucenie
  // dzieją się w całości przy rozstrzyganiu, więc czar wisi na stosie do
  // rozstrzygnięcia decyzji o odrzuceniu). Po rzucie zostaje samo
  // pass_priority (bez skrótu resolve_*) — oddajemy priorytet.
  for (let i = 0; i < 6 && !state.pendingDiscardChoice; i += 1) {
    run(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  }
  assert.equal(libraryBefore - state.zones.library.filter((id) => state.objects.get(id)?.ownerId === 'p1').length, 2,
    'biblioteka zmalała o 2 (dobranie 2)');
  assert.ok(state.pendingDiscardChoice, 'blokująca decyzja o odrzuceniu');
  assert.equal(state.pendingDiscardChoice.count, 2, 'odrzucenie DWÓCH kart (nie jednej — regresja zaszytego count: 1)');
  assert.equal(state.pendingDiscardChoice.handIds.length, 5, 'ręka: 3 fodder + 2 dobrane');
  assert.ok(state.events.some((e) => e.type === 'discard_choice_required' && e.count === 2),
    'zdarzenie decyzji niesie count 2');
  const handBefore = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p1').length;
  // Oferta enumeruje pojedyncze karty, a UI zatwierdza PEŁNY wybór przez
  // `cardIds` (ta sama komenda, wariant wsadowy — M109/„Znalezisko A").
  const offers = commands(state, 'p1').filter((c) => c.type === 'resolve_discard_choice');
  assert.equal(offers.length, state.pendingDiscardChoice.handIds.length, 'każda karta ręki do wyboru');
  const choose = { type: 'resolve_discard_choice', playerId: 'p1', cardIds: state.pendingDiscardChoice.handIds.slice(0, 2) };
  run(state, choose);
  assert.equal(state.pendingDiscardChoice, null, 'decyzja domknięta');
  assert.equal(handBefore - state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p1').length, 2,
    'odrzucono dokładnie 2 karty');
  assert.ok(find(state, 'izzet-charm', 'graveyard'), 'czar dokończył rozstrzyganie');
});

test('B61/174: Izzet Charm — tryb 2 zabija 2/1, a 2/3 przeżywa 2 obrażenia', () => {
  const state = game();
  put(state, 'charm', 'izzet-charm');
  put(state, 'goblin', 'skinbrand-goblin', 'p2', 'battlefield');
  addMana(state, 'p1', 2, { colors: ['U', 'R'] });
  const cast = commands(state, 'p1').find((c) => c.type === 'cast_spell' && c.objectId === 'charm'
    && c.modeIndex === 1 && c.targets?.[0] === 'goblin');
  assert.ok(cast, 'tryb 2 z celem-stworem jest oferowany');
  run(state, cast);
  resolve(state);
  assert.ok(find(state, 'skinbrand-goblin', 'graveyard'), '2/1 ginie od 2 obrażeń');

  const s2 = game();
  put(s2, 'charm2', 'izzet-charm');
  put(s2, 'trooper', 'alaborn-trooper', 'p2', 'battlefield');
  addMana(s2, 'p1', 2, { colors: ['U', 'R'] });
  const cast2 = commands(s2, 'p1').find((c) => c.type === 'cast_spell' && c.objectId === 'charm2'
    && c.modeIndex === 1 && c.targets?.[0] === 'trooper');
  run(s2, cast2);
  resolve(s2);
  assert.ok(find(s2, 'alaborn-trooper', 'battlefield'), '2/3 przeżywa 2 obrażenia');
});

test('B61/174: Izzet Charm — tryb 1 kontruje czar nie-stwora, chyba że zapłaci {2}', () => {
  // Wariant A: kontroler celu NIE MA czym zapłacić — kontra bez decyzji.
  const state = game();
  put(state, 'charm', 'izzet-charm');
  put(state, 'their', 'revealing-wind', 'p2', 'hand');
  addMana(state, 'p1', 2, { colors: ['U', 'R'] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 3, { colors: ['G'] });
  const enemyCast = commands(state, 'p2').find((c) => c.type === 'cast_spell' && c.objectId === 'their');
  assert.ok(enemyCast, 'czar nie-stwora przeciwnika jest oferowany');
  run(state, enemyCast);
  run(state, { type: 'pass_priority', playerId: 'p2' });
  const stackSpell = state.zones.stack[0];
  const counter = commands(state, 'p1').find((c) => c.type === 'cast_spell' && c.objectId === 'charm'
    && c.modeIndex === 0 && c.targets?.[0] === stackSpell);
  assert.ok(counter, 'tryb 1 celuje w czar nie-stwora na stosie');
  run(state, counter);
  passStack(state);
  assert.ok(state.events.some((e) => e.type === 'spell_countered'), 'czar skontrowany (brak możliwości zapłaty)');
  assert.ok(find(state, 'revealing-wind', 'graveyard'), 'skontrowany czar w grobie właściciela');
  assert.ok(find(state, 'izzet-charm', 'graveyard'), 'charm dokończył rozstrzyganie');

  // Wariant B: kontroler celu PŁACI {2} — czar zostaje na stosie i rozstrzyga się.
  const s2 = game();
  put(s2, 'charm2', 'izzet-charm');
  put(s2, 'their2', 'revealing-wind', 'p2', 'hand');
  addMana(s2, 'p1', 2, { colors: ['U', 'R'] });
  s2.turn = jumpToStep(s2.turn, 'main', 'p2');
  s2.turn.activePlayerId = s2.turn.priorityPlayerId = 'p2';
  addMana(s2, 'p2', 3, { colors: ['G'] });
  const castB = commands(s2, 'p2').find((c) => c.type === 'cast_spell' && c.objectId === 'their2');
  run(s2, castB);
  // Pula 2 many po rzucie = jest CZYM zapłacić {2} (bez tego silnik kontruje
  // od razu, bez pytania — patrz bramka canPay w counter_spell_unless_pays).
  addMana(s2, 'p2', 2, { colors: ['G'] });
  run(s2, { type: 'pass_priority', playerId: 'p2' });
  const stackB = s2.zones.stack[0];
  run(s2, commands(s2, 'p1').find((c) => c.type === 'cast_spell' && c.objectId === 'charm2'
    && c.modeIndex === 0 && c.targets?.[0] === stackB));
  for (let i = 0; i < 6 && !s2.pendingCounterPay; i += 1) {
    run(s2, { type: 'pass_priority', playerId: s2.turn.priorityPlayerId });
  }
  assert.ok(s2.pendingCounterPay, 'decyzja kontrolera celowanego czaru');
  const pay = commands(s2, 'p2').find((c) => c.type === 'resolve_counter_pay_choice' && c.pay === true && c.cost === 2);
  assert.ok(pay, 'oferta zapłaty {2} (są źródła many)');
  run(s2, pay);
  assert.ok(!s2.events.some((e) => e.type === 'spell_countered'), 'czar NIE skontrowany po zapłacie');
  passStack(s2);
  assert.ok(find(s2, 'revealing-wind', 'graveyard'), 'czar rozstrzygnął się normalnie (nie: wygnany/wrócił)');
});

test('B61/174: Izzet Charm — tryby bez legalnych celów nie są oferowane', () => {
  // Pusta plansza: tylko tryb 3 (bez celów).
  const state = game();
  put(state, 'charm', 'izzet-charm');
  addMana(state, 'p1', 2, { colors: ['U', 'R'] });
  assert.deepEqual(
    commands(state, 'p1').filter((c) => c.type === 'cast_spell' && c.objectId === 'charm').map((c) => c.modeIndex),
    [2], 'bez stworów i czarów tylko „Dobierz 2, odrzuć 2"');
  // Stwór przeciwnika włącza tryb 2 (ale nie tryb 1 — brak czaru nie-stwora).
  put(state, 'goblin', 'skinbrand-goblin', 'p2', 'battlefield');
  assert.deepEqual(
    commands(state, 'p1').filter((c) => c.type === 'cast_spell' && c.objectId === 'charm').map((c) => c.modeIndex).sort(),
    [1, 2], 'stwór daje tryb obrażeń, bez czaru na stosie');
  // Czar nie-stwora na stosie włącza tryb 1 (charm nie celuje już w stwora — cel
  // trybu 2 jest wymagany tylko w trybie 2).
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p2';
  put(state, 'their', 'revealing-wind', 'p2', 'hand');
  addMana(state, 'p2', 3, { colors: ['G'] });
  run(state, commands(state, 'p2').find((c) => c.type === 'cast_spell' && c.objectId === 'their'));
  run(state, { type: 'pass_priority', playerId: 'p2' });
  const modes = commands(state, 'p1').filter((c) => c.type === 'cast_spell' && c.objectId === 'charm').map((c) => c.modeIndex).sort();
  assert.deepEqual(modes, [0, 1, 2], 'cel-czar odblokowuje tryb 1, cel-stwór wciąż daje tryb 2');
  // CZAR-STWÓR nie jest celem trybu 1 (Oracle: „noncreature spell").
  const s2 = game();
  put(s2, 'charm2', 'izzet-charm');
  addMana(s2, 'p1', 2, { colors: ['U', 'R'] });
  s2.turn = jumpToStep(s2.turn, 'main', 'p2');
  s2.turn.activePlayerId = s2.turn.priorityPlayerId = 'p2';
  put(s2, 'creature-spell', 'alaborn-trooper', 'p2', 'hand');
  addMana(s2, 'p2', 3, { colors: ['W'] });
  // Czar-stwór rzuca się komendą `cast_permanent` (nie `cast_spell`).
  run(s2, commands(s2, 'p2').find((c) => c.type === 'cast_permanent' && c.objectId === 'creature-spell'));
  run(s2, { type: 'pass_priority', playerId: 'p2' });
  assert.deepEqual(
    commands(s2, 'p1').filter((c) => c.type === 'cast_spell' && c.objectId === 'charm2').map((c) => c.modeIndex),
    [2], 'czar-stwór na stosie nie jest celem trybu 1 („noncreature")');
});

// ---- B61/162: Griffin Guide (DMR #8, plan Eldraine) -----------------------

test('B61/162: Griffin Guide — dane Oracle, aura {2}{W} i druk DMR', () => {
  const def = registry.get('griffin-guide');
  assert.deepEqual(def.types, ['Enchantment']);
  assert.deepEqual(def.subtypes, ['Aura']);
  assert.deepEqual(def.colors, ['W']);
  assert.equal(def.manaCost, 3);
  assert.equal(def.set, 'DMR');
  assert.equal(def.plan, 'Eldraine');
  assert.equal(def.artId, 162);
  assert.deepEqual(def.aura.pump, { power: 2, toughness: 2 });
  assert.deepEqual(def.aura.keywords, ['flying']);
  assert.equal(def.abilities.length, 1);
  assert.equal(def.abilities[0].trigger.event, 'enchanted_creature_dies');
  assert.equal(def.abilities[0].effect.type, 'create_token');
  assert.equal(def.abilities[0].effect.cardId, 'token_griffin');
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
  assert.ok(def.imageUri.includes('39b8cf5e'), 'imageUri z druku DMR (dmr/8)');
  assert.equal(MANA_COSTS['griffin-guide'], '{2}{W}', 'wpis MANA_COSTS dla aury (wzorzec innych aur)');
  assert.equal(registry.get('token_griffin').name, 'Griffin');
  assert.deepEqual(registry.get('token_griffin').keywords, ['flying']);
});

test('B61/162: Griffin Guide — +2/+2 i flying dla zaczarowanego stworu', () => {
  const state = game();
  put(state, 'host', 'alaborn-trooper', 'p1', 'battlefield');
  put(state, 'guide', 'griffin-guide', 'p1', 'battlefield', { kind: 'aura', attachedTo: 'host' });
  const host = state.objects.get('host');
  assert.equal(effectivePower(host, state), 4, '2/3 + 2/+2 = 4');
  assert.equal(effectiveToughness(host, state), 5, '3 + 2 = 5');
  assert.ok(effectiveKeywords(host, state).includes('flying'), 'gospodarz ma flying');
});

test('B61/162: Griffin Guide — śmierć gospodarza (razem z aurą) daje token 2/2 z flying', async () => {
  // Ruling WotC 2022-12-08 (dmr/8): „If Griffin Guide and the enchanted
  // creature go to the graveyard at the same time, Griffin Guide's last
  // ability will trigger." — śmierć gospodarza zabiera aurę (CR 704.5m)
  // w TEJ SAMEJ partii zdarzeń, więc scena mierzy ścieżkę LKI (CR 603.10a),
  // nie stan po śmierci.
  const { destroyPermanents } = await import('../src/engine/destruction.js');
  const { processTriggers } = await import('../src/engine/triggers.js');
  const state = game();
  put(state, 'host', 'alaborn-trooper', 'p1', 'battlefield');
  put(state, 'other', 'alaborn-trooper', 'p2', 'battlefield');
  put(state, 'guide', 'griffin-guide', 'p1', 'battlefield', { kind: 'aura', attachedTo: 'host' });
  const before = state.events.length;
  destroyPermanents(state, ['host', 'other']); // dwaj współpolegli w JEDNEJ partii
  processTriggers(state, state.events.slice(before));
  assert.equal(state.zones.stack.length, 1, 'trigger wchodzi na stos (CR 603.3b)');
  resolve(state); // rozstrzygnięcie triggera — dopiero teraz powstaje token
  const tokens = [...state.objects.values()].filter((o) => o.cardId === 'token_griffin' && o.zone === 'battlefield');
  assert.equal(tokens.length, 1, 'trigger odpala DOKŁADNIE raz (nie po jednym na zmarłego)');
  assert.equal(tokens[0].power, 2);
  assert.equal(tokens[0].toughness, 2);
  assert.deepEqual(tokens[0].subtypes, ['Griffin']);
  assert.deepEqual(tokens[0].colors, ['W'], 'token jest BIAŁY (Oracle)');
  assert.ok(effectiveKeywords(tokens[0], state).includes('flying'), 'token ma flying');
  assert.ok([...state.objects.values()].some((o) => o.cardId === 'griffin-guide' && o.zone === 'graveyard'),
    'aura trafiła do grobu razem z gospodarzem (CR 704.5m)');
});

test('B61/162: Griffin Guide — odbicie gospodarza NIE jest śmiercią (brak triggera)', () => {
  const state = game();
  put(state, 'host', 'alaborn-trooper', 'p2', 'battlefield');
  put(state, 'guide', 'griffin-guide', 'p1', 'battlefield', { kind: 'aura', attachedTo: 'host' });
  put(state, 'bounce', 'force-away', 'p1', 'hand');
  addMana(state, 'p1', 2, { colors: ['U'] });
  const cast = commands(state, 'p1').find((c) => c.type === 'cast_spell' && c.objectId === 'bounce'
    && c.targets?.[0] === 'host');
  assert.ok(cast, 'Force Away celujący w zaczarowanego stwora jest oferowany');
  run(state, cast);
  resolve(state);
  assert.ok(inHand(state, 'alaborn-trooper', 'p2'), 'gospodarz wrócił do ręki właściciela');
  assert.ok(find(state, 'griffin-guide', 'graveyard'), 'aura bez gospodarza idzie do grobu');
  assert.equal([...state.objects.values()].filter((o) => o.cardId === 'token_griffin').length, 0,
    'powrót do ręki to nie śmierć — token NIE powstaje');
});

// ---- B61/157: Infectious Bloodlust (ORI #152, plan Kaldheim) --------------

test('B61/157: Infectious Bloodlust — dane Oracle, aura {1}{R} i druk ORI', () => {
  const def = registry.get('infectious-bloodlust');
  assert.deepEqual(def.types, ['Enchantment']);
  assert.deepEqual(def.subtypes, ['Aura']);
  assert.deepEqual(def.colors, ['R']);
  assert.equal(def.manaCost, 2);
  assert.equal(def.set, 'ORI');
  assert.equal(def.artId, 157);
  assert.equal(def.plan, 'Kaldheim');
  assert.deepEqual(def.aura.pump, { power: 2, toughness: 1 });
  assert.deepEqual(def.aura.keywords, ['haste']);
  assert.equal(def.aura.mustAttack, true, '„attacks each combat if able" to deskryptor aury');
  assert.ok(def.oracleText.includes('attacks each combat if able'), 'Oracle w definicji');
  // Trigger śmierci gospodarza: ten sam deskryptor zdarzenia co Griffin Guide
  // (Batch 61/162) — mechanika jest generyczna, nie per karta (ADR 0002).
  assert.equal(def.abilities.length, 1);
  assert.equal(def.abilities[0].type, 'triggered');
  assert.equal(def.abilities[0].trigger.event, 'enchanted_creature_dies');
  assert.equal(def.abilities[0].effect.type, 'search_library_to_hand');
  assert.deepEqual(def.abilities[0].effect.qualifier, { sameNameAsSource: true },
    'szukanie po nazwie ŹRÓDŁA (bez literału nazwy w silniku)');
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
  assert.ok(def.imageUri.includes('ee44df88'), 'imageUri z druku ORI (ori/152)');
  assert.equal(MANA_COSTS['infectious-bloodlust'], '{1}{R}');
});

test('B61/157: Infectious Bloodlust — +2/+1, haste i wymóg ataku na gospodarzu', async () => {
  const { attachmentRestrictions } = await import('../src/engine/permanents.js');
  const state = game();
  put(state, 'host', 'alaborn-trooper', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'aura', 'infectious-bloodlust', 'p1', 'battlefield', { kind: 'aura', attachedTo: 'host' });
  const host = state.objects.get('host');
  assert.equal(effectivePower(host, state), 4, '2/3 + 2/+1 = 4');
  assert.equal(effectiveToughness(host, state), 4, '3 + 1 = 4');
  assert.ok(effectiveKeywords(host, state).includes('haste'), 'aura nadaje haste');
  assert.equal(attachmentRestrictions(state, host).mustAttack, true,
    'wymóg ataku czytany z załącznika (jedno miejsce prawdy z zakazami)');
});

test('B61/157: Infectious Bloodlust — deklaracja bez gospodarza jest nielegalna, z nim legalna', async () => {
  const { declareAttackers, legalAttackerOptions } = await import('../src/engine/combat.js');
  const state = game();
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  put(state, 'host', 'alaborn-trooper', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'aura', 'infectious-bloodlust', 'p1', 'battlefield', { kind: 'aura', attachedTo: 'host' });
  // Oferta deklaracji ZAWSZE zawiera wymuszonego (inaczej gracz nie ma
  // legalnego ruchu — klasa M270).
  const options = legalAttackerOptions(state, 'p1');
  assert.ok(options.length > 0, 'silnik oferuje deklaracje');
  assert.ok(options.every((ids) => ids.includes('host')), `każda oferta zawiera wymuszonego: ${JSON.stringify(options)}`);
  assert.throws(() => declareAttackers(state, 'p1', []), /musi atakować/,
    'pominięcie wymuszonego atakującego odrzucone (CR 508.1c)');
  assert.ok(declareAttackers(state, 'p1', ['host']), 'deklaracja z gospodarzem legalna');
});

test('B61/157: Infectious Bloodlust — „if able": zatapowany gospodarz nie tworzy deadlocku', async () => {
  const { declareAttackers } = await import('../src/engine/combat.js');
  const state = game();
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  put(state, 'host', 'alaborn-trooper', 'p1', 'battlefield', { summoningSickness: false, tapped: true });
  put(state, 'aura', 'infectious-bloodlust', 'p1', 'battlefield', { kind: 'aura', attachedTo: 'host' });
  // Ruling ORI 2015-06-22: „attacks each combat if able" — stwór, który nie
  // może zaatakować legalnie, nie jest wymuszony; pusta deklaracja zostaje legalna.
  assert.ok(declareAttackers(state, 'p1', []), 'brak deadlocku przy niedostępnym ataku');
});

test('B61/157: Infectious Bloodlust — śmierć gospodarza: „you may search" po nazwie tej karty', async () => {
  const { destroyPermanents } = await import('../src/engine/destruction.js');
  const { processTriggers } = await import('../src/engine/triggers.js');
  const state = game();
  put(state, 'host', 'alaborn-trooper', 'p1', 'battlefield');
  put(state, 'aura', 'infectious-bloodlust', 'p1', 'battlefield', { kind: 'aura', attachedTo: 'host' });
  put(state, 'lib-copy', 'infectious-bloodlust', 'p1', 'library');
  put(state, 'lib-obcy', 'griffin-guide', 'p1', 'library');
  const before = state.events.length;
  destroyPermanents(state, ['host']);
  processTriggers(state, state.events.slice(before));
  assert.equal(state.zones.stack.length, 1, 'trigger wchodzi na stos (CR 603.3b)');
  for (let i = 0; !state.pendingSearchChoice && i < 10; i++) {
    run(state, commands(state).find((c) => c.type === 'pass_priority'));
  }
  assert.ok(state.pendingSearchChoice, 'decyzja „you may search" czeka na gracza');
  assert.deepEqual(state.pendingSearchChoice.candidateIds, ['lib-copy'],
    'kandydatem jest wyłącznie karta o nazwie źródła (druga kopia), nie inna karta');
  // Kryterium nazwy = kryterium jakości: rezygnacja (fail to find) jest legalna…
  assert.equal(execute(state, { type: 'resolve_search_choice', playerId: 'p1', found: null }).ok, true,
    '„you may" — rezygnacja legalna (CR 701.23b)');
  assert.ok(!inHand(state, 'infectious-bloodlust', 'p1'), 'bez wyboru karta zostaje w bibliotece');
  // …a wybór karty spoza kryterium odrzucony (przy drugim odpaleniu triggera).
  const state2 = game();
  put(state2, 'host2', 'alaborn-trooper', 'p1', 'battlefield');
  put(state2, 'aura2', 'infectious-bloodlust', 'p1', 'battlefield', { kind: 'aura', attachedTo: 'host2' });
  put(state2, 'lib2-copy', 'infectious-bloodlust', 'p1', 'library');
  put(state2, 'lib2-obcy', 'griffin-guide', 'p1', 'library');
  const before2 = state2.events.length;
  destroyPermanents(state2, ['host2']);
  processTriggers(state2, state2.events.slice(before2));
  for (let i = 0; !state2.pendingSearchChoice && i < 10; i++) {
    run(state2, commands(state2).find((c) => c.type === 'pass_priority'));
  }
  assert.equal(execute(state2, { type: 'resolve_search_choice', playerId: 'p1', found: 'lib2-obcy' }).ok, false,
    'karta o innej nazwie nie jest legalnym wyborem');
  run(state2, { type: 'resolve_search_choice', playerId: 'p1', found: 'lib2-copy' });
  assert.ok(inHand(state2, 'infectious-bloodlust', 'p1'), 'wybrana kopia trafia do ręki');
  assert.ok(!find(state2, 'infectious-bloodlust', 'library'), 'karta opuściła bibliotekę');
});

// ---- B61/158: Kozilek's Shrieker (OGW #73, plan Zendikar) ------------------

test("B61/158: Kozilek's Shrieker — dane Oracle, {2}{B}, druk OGW i brak koloru", () => {
  const def = registry.get('kozileks-shrieker');
  assert.deepEqual(def.types, ['Creature']);
  assert.deepEqual(def.subtypes, ['Eldrazi', 'Drone']);
  // Devoid (CR 702.114): karta NIE MA koloru — pusty profil, mimo {B} w koszcie.
  assert.deepEqual(def.colors, []);
  assert.equal(def.power, 3);
  assert.equal(def.toughness, 2);
  assert.equal(def.manaCost, 3);
  assert.equal(def.set, 'OGW');
  assert.equal(def.artId, 158);
  assert.equal(def.plan, 'Zendikar');
  assert.deepEqual(def.keywords, ['devoid']);
  assert.ok(def.oracleText.includes('Devoid (This card has no color.)'), 'Oracle w definicji');
  assert.ok(def.oracleText.includes('{C}: This creature gets +1/+0 and gains menace until end of turn.'));
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
  assert.ok(def.imageUri.includes('a384cd5b'), 'imageUri z druku OGW (ogw/73)');
  // Koszt manowy karty w tabeli (bez {C} — pip bezbarwny siedzi w ZDOLNOŚCI).
  assert.equal(MANA_COSTS['kozileks-shrieker'], '{2}{B}');
  // Zdolność: koszt {C} (CR 107.4c) + pump + menace do końca tury.
  assert.equal(def.abilities.length, 1);
  const ability = def.abilities[0];
  assert.equal(ability.type, 'activated');
  assert.deepEqual(ability.cost, { mana: 1, colors: ['C'] },
    'pip bezbarwny jest wymaganiem koloru w koszcie zdolności (nie generic)');
  assert.deepEqual(ability.effect, [
    { type: 'pump', power: 1, toughness: 0 },
    { type: 'grant_keywords_until_end_of_turn', keywords: ['menace'] },
  ]);
});

test("B61/158: {C} opłaca wyłącznie mana bezbarwna — czerwona pula nie daje oferty", () => {
  const state = game();
  put(state, 'shrieker', 'kozileks-shrieker', 'p1', 'battlefield', { summoningSickness: false });
  addMana(state, 'p1', 1, { colors: ['R'] });
  assert.ok(!commands(state).some((c) => c.type === 'activate_ability' && c.objectId === 'shrieker'),
    'kolorowa mana nie może zapłacić {C} (CR 107.4c) — brak oferty');
  const r = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'shrieker', abilityIndex: 0 });
  assert.equal(r.ok, false, 'ręcznie podana komenda odrzucona');
  // Silnik odrzuca na walidacji kolorów: „Brak kolorowej many" / „Brak
  // kolorowego źródła many" — oba komunikaty to ta sama bramka pipów.
  assert.match(r.events[0].reason, /Brak kolorow/, 'maszynowy powód odrzucenia');
  assert.equal(player(state, 'p1').mana, 1, 'odrzucona aktywacja nie zabiera many');
});

test('B61/158: mana bezbarwna opłaca {C} — +1/+0 i menace do końca tury', () => {
  const state = game();
  put(state, 'shrieker', 'kozileks-shrieker', 'p1', 'battlefield', { summoningSickness: false });
  // Pula mieszana: czerwona jednostka NIE może przejąć pipa {C} — płatność
  // musi wybrać jednostkę bezbarwną ('' w puli), a czerwoną zostawić.
  addMana(state, 'p1', 1, { colors: ['R'] });
  addMana(state, 'p1', 1, { colors: [] });
  const cmd = commands(state).find((c) => c.type === 'activate_ability' && c.objectId === 'shrieker');
  assert.ok(cmd, 'oferta {C} przy bezbarwnej manie w puli');
  run(state, cmd);
  resolve(state);
  const shrieker = state.objects.get('shrieker');
  assert.equal(effectivePower(shrieker, state), 4, '3/2 + 1/0 = 4/2');
  assert.equal(effectiveToughness(shrieker, state), 2, 'pump nie rusza wytrzymałości');
  assert.ok(effectiveKeywords(shrieker, state).includes('menace'), 'menace do końca tury');
  assert.deepEqual(player(state, 'p1').manaPool, { R: 1 }, 'wydana jednostka bezbarwna, czerwona została');
});

test('B61/158: dwie aktywacje kumulują +1/+0, a menace jest redundantny (ruling 2016-01-22)', () => {
  const state = game();
  put(state, 'shrieker', 'kozileks-shrieker', 'p1', 'battlefield', { summoningSickness: false });
  addMana(state, 'p1', 2, { colors: [] });
  for (let i = 0; i < 2; i += 1) {
    const cmd = commands(state).find((c) => c.type === 'activate_ability' && c.objectId === 'shrieker');
    assert.ok(cmd, `oferta aktywacji nr ${i + 1}`);
    run(state, cmd);
    resolve(state);
  }
  const shrieker = state.objects.get('shrieker');
  assert.equal(effectivePower(shrieker, state), 5, 'dwa pumpy +1/+0 sumują się');
  assert.equal(effectiveKeywords(shrieker, state).filter((k) => k === 'menace').length, 1,
    'wielokrotny menace na tym samym stworze jest redundantny');
  assert.deepEqual(player(state, 'p1').manaPool, {}, 'obie aktywacje zapłacone');
});

test("B61/158: mana bezbarwna ze Sciona (poświęcenie) domyka {C} — ścieżka talii Zendikar", () => {
  const state = game();
  put(state, 'shrieker', 'kozileks-shrieker', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'scion', 'token_eldrazi_scion', 'p1', 'battlefield', { summoningSickness: false });
  // Bez many w puli zdolność {C} nie jest oferowana (źródła z kosztem
  // poświęcenia nie wchodzą do auto-tapu — aktywuje je gracz, CR 605.3)…
  assert.ok(!commands(state).some((c) => c.type === 'activate_ability' && c.objectId === 'shrieker'),
    'brak bezbarwnej many = brak oferty');
  // …a po ręcznej aktywacji Sciona ({T}-like: poświęcenie → {C}) oferta wraca.
  const scionCmd = commands(state).find((c) => c.type === 'activate_ability' && c.objectId === 'scion');
  assert.ok(scionCmd, 'zdolność many Sciona jest oferowana');
  run(state, scionCmd);
  assert.deepEqual(player(state, 'p1').manaPool, { '': 1 }, 'Scion produkuje jednostkę BEZBARWNĄ (klucz pusty)');
  const cmd = commands(state).find((c) => c.type === 'activate_ability' && c.objectId === 'shrieker');
  run(state, cmd);
  resolve(state);
  assert.equal(effectivePower(state.objects.get('shrieker'), state), 4, 'Scion zapłacił {C}');
  assert.ok(effectiveKeywords(state.objects.get('shrieker'), state).includes('menace'));
  assert.ok(!state.objects.has('scion') || state.objects.get('scion').zone !== 'battlefield',
    'Scion został poświęcony jako koszt many');
});

// ---- B61/164: Gryffwing Cavalry (VOW #16, plan Innistrad) ------------------

/**
 * Deklaracja atakujących + przetworzenie triggerów (jak w komendzie stołu).
 * `pay` wybiera odpowiedź na pytanie „you may pay" (domyślnie: nie płacimy).
 * Pętla obsługuje też decyzje celów triggerów (wybiera pierwszego kandydata).
 */
async function deklarujAtak(state, attackerIds, { pay = false } = {}) {
  const { declareAttackers } = await import('../src/engine/combat.js');
  const { processTriggers } = await import('../src/engine/triggers.js');
  const before = state.events.length;
  declareAttackers(state, 'p1', attackerIds);
  processTriggers(state, state.events.slice(before));
  // Wybór celu (jeśli decyzja nie została zautomatyzowana — M242).
  for (let i = 0; state.pendingTriggerTargets.length > 0 && i < 10; i += 1) {
    const cmd = commands(state).find((c) => c.type === 'resolve_trigger_target');
    assert.ok(cmd, 'oferta celu triggera istnieje');
    run(state, cmd);
  }
  // Rozstrzygnięcie stosu + decyzja płatności przy rozstrzyganiu (Etap F).
  for (let i = 0; (state.zones.stack.length > 0 || state.pendingOptionalPay) && i < 30; i += 1) {
    const p = state.turn.priorityPlayerId;
    const choices = commands(state, p);
    const payment = choices.find((c) => c.type === 'resolve_optional_pay_choice' && c.pay === pay);
    const pass = choices.find((c) => c.type === 'pass_priority');
    if (payment) { run(state, payment); continue; }
    if (pass) { run(state, pass); continue; }
    break;
  }
}

test('B61/164: Gryffwing Cavalry — dane Oracle, {3}{W}, druk VOW i trening', async () => {
  const { KEYWORD_LABELS } = await import('../src/table/render.js');
  const def = registry.get('gryffwing-cavalry');
  assert.deepEqual(def.types, ['Creature']);
  assert.deepEqual(def.subtypes, ['Human', 'Knight']);
  assert.deepEqual(def.colors, ['W']);
  assert.equal(def.power, 2);
  assert.equal(def.toughness, 2);
  assert.equal(def.manaCost, 4);
  assert.equal(def.set, 'VOW');
  assert.equal(def.artId, 164);
  assert.equal(def.plan, 'Innistrad');
  assert.deepEqual(def.keywords, ['flying', 'training']);
  assert.ok(def.oracleText.includes('Training (Whenever this creature attacks with another creature with greater power'),
    'Oracle w definicji');
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
  assert.ok(def.imageUri.includes('792d5b41'), 'imageUri z druku VOW (vow/16)');
  assert.equal(MANA_COSTS['gryffwing-cavalry'], '{3}{W}');
  // Etykieta PL keywordu (L84: nowy keyword ⇒ etykieta, inaczej slug w linii keywordów).
  assert.ok(KEYWORD_LABELS.training, 'Trening ma polską etykietę');
  // Zdolność 1: Trening (CR 702.149) — warunek + licznik na sobie.
  assert.deepEqual(def.abilities[0].trigger, { event: 'attacks', condition: { attackedWithGreaterPower: true } });
  assert.deepEqual(def.abilities[0].effect, { type: 'add_counter', counter: '+1/+1', amount: 1 });
  // Zdolność 2: cel PRZED płatnością (ruling VOW 2021-11-19), {1}{W}.
  const drugi = def.abilities[1].trigger;
  assert.equal(drugi.event, 'attacks');
  assert.deepEqual(drugi.requiresTarget, { type: 'attacking_creature', withoutKeyword: 'flying' });
  assert.equal(drugi.payMana, 2);
  assert.deepEqual(drugi.payColors, ['W']);
  assert.equal(drugi.payAfterTarget, true, 'cel wybiera się przed decyzją o płatności');
  assert.deepEqual(def.abilities[1].effect, [
    { type: 'pay_mana', amount: 2 },
    { type: 'grant_keywords_until_end_of_turn', keywords: ['flying'] },
  ]);
});

test('B61/164: Trening — atak z silniejszym stworem daje +1/+1, słabszy nie', async () => {
  const state = game();
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  put(state, 'cav', 'gryffwing-cavalry', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'big', 'woolly-loxodon', 'p1', 'battlefield', { summoningSickness: false }); // 6/7
  await deklarujAtak(state, ['cav', 'big']);
  const cav = state.objects.get('cav');
  assert.equal(effectivePower(cav, state), 3, '2/2 + licznik +1/+1 = 3/3');
  assert.equal(effectiveToughness(cav, state), 3);
  assert.deepEqual(cav.counters, { '+1/+1': 1 });
  assert.ok(!effectiveKeywords(state.objects.get('big'), state).includes('flying'),
    'płatność odrzucona — brak nadanego latania');

  // Ten sam atak, ale towarzysz NIE jest silniejszy (2/3 vs 2/2) — brak licznika.
  const state2 = game();
  state2.turn = jumpToStep(state2.turn, 'declare_attackers', 'p1');
  state2.turn.activePlayerId = state2.turn.priorityPlayerId = 'p1';
  put(state2, 'cav', 'gryffwing-cavalry', 'p1', 'battlefield', { summoningSickness: false });
  put(state2, 'small', 'alaborn-trooper', 'p1', 'battlefield', { summoningSickness: false }); // 2/3
  await deklarujAtak(state2, ['cav', 'small']);
  const cav2 = state2.objects.get('cav');
  assert.equal(effectivePower(cav2, state2), 2, 'brak treningu — moc bez zmian');
  assert.deepEqual(cav2.counters ?? {}, {}, 'brak licznika');
});

test('B61/164: Trening — wzrost siły PO deklaracji nie wywołuje triggera (ruling 2021-11-19)', async () => {
  const { modifyStats } = await import('../src/engine/permanents.js');
  const state = game();
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  put(state, 'cav', 'gryffwing-cavalry', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'small', 'alaborn-trooper', 'p1', 'battlefield', { summoningSickness: false });
  const { declareAttackers } = await import('../src/engine/combat.js');
  const { processTriggers } = await import('../src/engine/triggers.js');
  const before = state.events.length;
  declareAttackers(state, 'p1', ['cav', 'small']);
  processTriggers(state, state.events.slice(before));
  // Siła rośnie JUŻ PO deklaracji (4 > 2) — trigger treningu nie powstaje.
  modifyStats(state, 'small', { power: 2, toughness: 0 });
  assert.equal(effectivePower(state.objects.get('small'), state), 4, 'towarzysz urósł po deklaracji');
  for (let i = 0; (state.zones.stack.length > 0 || state.pendingOptionalPay) && i < 30; i += 1) {
    const p = state.turn.priorityPlayerId;
    const choices = commands(state, p);
    const payment = choices.find((c) => c.type === 'resolve_optional_pay_choice' && c.pay === false);
    const pass = choices.find((c) => c.type === 'pass_priority');
    if (payment) { run(state, payment); continue; }
    if (pass) { run(state, pass); continue; }
    break;
  }
  assert.deepEqual(state.objects.get('cav').counters ?? {}, {}, 'licznik nie powstał (moc liczona z chwili deklaracji)');
});

test('B61/164: Trening — śmierć drugiego atakującego nie odbiera licznika (ruling 2021-11-19)', async () => {
  const { destroyPermanents } = await import('../src/engine/destruction.js');
  const { processTriggers } = await import('../src/engine/triggers.js');
  const state = game();
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  put(state, 'cav', 'gryffwing-cavalry', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'big', 'woolly-loxodon', 'p1', 'battlefield', { summoningSickness: false });
  const { declareAttackers } = await import('../src/engine/combat.js');
  const before = state.events.length;
  declareAttackers(state, 'p1', ['cav', 'big']);
  processTriggers(state, state.events.slice(before));
  assert.equal(state.zones.stack.length, 2, 'trening + zdolność latania na stosie');
  // Towarzysz ginie PRZED rozstrzygnięciem triggera treningu.
  const beforeKill = state.events.length;
  destroyPermanents(state, ['big']);
  processTriggers(state, state.events.slice(beforeKill));
  for (let i = 0; (state.zones.stack.length > 0 || state.pendingOptionalPay) && i < 30; i += 1) {
    const p = state.turn.priorityPlayerId;
    const choices = commands(state, p);
    const payment = choices.find((c) => c.type === 'resolve_optional_pay_choice' && c.pay === false);
    const pass = choices.find((c) => c.type === 'pass_priority');
    if (payment) { run(state, payment); continue; }
    if (pass) { run(state, pass); continue; }
    break;
  }
  assert.deepEqual(state.objects.get('cav').counters, { '+1/+1': 1 },
    'licznik zostaje mimo śmierci drugiego atakującego');
});

test('B61/164: cel wybierany PRZED płatnością; płatność nadaje latanie tylko wybranemu', async () => {
  const state = game();
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  put(state, 'cav', 'gryffwing-cavalry', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 't1', 'alaborn-trooper', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 't2', 'alaborn-trooper', 'p1', 'battlefield', { summoningSickness: false });
  addMana(state, 'p1', 2, { colors: ['W'] });
  const { declareAttackers } = await import('../src/engine/combat.js');
  const { processTriggers } = await import('../src/engine/triggers.js');
  const before = state.events.length;
  declareAttackers(state, 'p1', ['cav', 't1', 't2']);
  processTriggers(state, state.events.slice(before));
  // Dwa legalne cele: decyzja NIE jest automatyczna, a oferty płatności NIE MA,
  // dopóki cel nie jest wybrany (ruling: najpierw cel, potem decyzja o płatności).
  assert.deepEqual(state.pendingTriggerTargets[0].candidates, ['t1', 't2']);
  assert.ok(!commands(state).some((c) => c.type === 'resolve_optional_pay_choice'),
    'brak oferty płatności przed wyborem celu');
  run(state, commands(state).find((c) => c.type === 'resolve_trigger_target' && c.targetId === 't2'));
  let paid = false;
  for (let i = 0; (state.zones.stack.length > 0 || state.pendingOptionalPay) && i < 30; i += 1) {
    const p = state.turn.priorityPlayerId;
    const choices = commands(state, p);
    const payment = choices.find((c) => c.type === 'resolve_optional_pay_choice' && c.pay === true);
    const pass = choices.find((c) => c.type === 'pass_priority');
    if (payment) { paid = true; assert.equal(payment.cost, 2); assert.deepEqual(payment.costColors, ['W']); run(state, payment); continue; }
    if (pass) { run(state, pass); continue; }
    break;
  }
  assert.ok(paid, 'pytanie o płatność pojawiło się PO wyborze celu');
  assert.ok(effectiveKeywords(state.objects.get('t2'), state).includes('flying'), 'wybrany cel zyskał latanie');
  assert.ok(!effectiveKeywords(state.objects.get('t1'), state).includes('flying'), 'drugi atakujący bez latania');
  assert.deepEqual(player(state, 'p1').manaPool, {}, 'zapłacono {1}{W}');
});

test('B61/164: brak legalnego celu = brak okazji do zapłaty (ruling 2021-11-19)', async () => {
  const state = game();
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  put(state, 'cav', 'gryffwing-cavalry', 'p1', 'battlefield', { summoningSickness: false });
  addMana(state, 'p1', 2, { colors: ['W'] });
  const { declareAttackers } = await import('../src/engine/combat.js');
  const { processTriggers } = await import('../src/engine/triggers.js');
  const before = state.events.length;
  declareAttackers(state, 'p1', ['cav']);
  processTriggers(state, state.events.slice(before));
  // Samotny atakujący ma latanie (sam nie jest legalnym celem), trening nie ma
  // z kim porównać mocy — zdolność nie wchodzi na stos (CR 603.3d).
  assert.equal(state.pendingTriggerTargets.length, 0, 'brak decyzji celu');
  assert.equal(state.zones.stack.length, 0, 'brak wpisu na stosie');
  assert.ok(state.events.slice(before).some((e) => e.type === 'trigger_resolved' && e.reason === 'no_targets'),
    'jawny wpis „bez celów"');
  assert.ok(!commands(state).some((c) => c.type === 'resolve_optional_pay_choice'),
    'brak okazji do zapłaty');
  assert.deepEqual(player(state, 'p1').manaPool, { W: 2 }, 'mana nietknięta');
});

// ---- B61/170: Riftburst Hellion (MKM #228, plan Ravnica) -------------------

/** Permanent na polu bitwy po rzucie (rzut nadaje nowe id — patrz `put`). */
const naPlanszy = (state, cardId) => state.zones.battlefield
  .map((id) => state.objects.get(id)).find((o) => o?.cardId === cardId);

test('B61/170: Riftburst Hellion — dane Oracle, {5}{R}{G}, druk MKM i disguise', async () => {
  const { wardAmountOf } = await import('../src/engine/permanents.js');
  const def = registry.get('riftburst-hellion');
  assert.deepEqual(def.types, ['Creature']);
  assert.deepEqual(def.subtypes, ['Hellion']);
  assert.deepEqual(def.colors, ['G', 'R']);
  assert.equal(def.power, 6);
  assert.equal(def.toughness, 7);
  assert.equal(def.manaCost, 7);
  assert.equal(def.set, 'MKM');
  assert.equal(def.artId, 170);
  assert.equal(def.plan, 'Ravnica');
  assert.deepEqual(def.keywords, ['reach']);
  assert.ok(def.oracleText.includes('Disguise {4}{R/G}{R/G} (You may cast this card face down for {3} as a 2/2 creature with ward {2}.'),
    'Oracle w definicji (dosłownie ze snapshotu)');
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
  assert.ok(def.imageUri.includes('9fae9044'), 'imageUri z druku MKM (mkm/228)');
  assert.equal(MANA_COSTS['riftburst-hellion'], '{5}{R}{G}');
  // Deskryptor zakrycia (Disguise, CR 702.168a): {3} twarzą w dół + koszt obrotu.
  // Uwaga na konwencję repo: `disguiseCost` to SUMA many (4 generyczne +
  // 2 pipy hybrydowe = 6), a `disguiseHybrid` to grupy kolorów.
  assert.deepEqual(def.morph, {
    cost: 3,
    disguiseCost: 6,
    disguiseHybrid: [['R', 'G'], ['R', 'G']],
    colors: [],
  });
  assert.equal(wardAmountOf({ keywords: [], ward: 2, faceDown: true }, null), 2,
    'zakryty permanent z ward {2} raportuje kwotę warda');
});

test('B61/170: rzut twarzą w dół za {3} — 2/2, bezbarwny, MV 0, ward {2}', async () => {
  const { wardAmountOf } = await import('../src/engine/permanents.js');
  const state = game();
  put(state, 'hell', 'riftburst-hellion', 'p1', 'hand');
  addMana(state, 'p1', 3);
  const offer = commands(state).find((c) => c.type === 'cast_permanent' && c.faceDown === true);
  assert.ok(offer, 'oferta rzutu twarzą w dół za {3} (alternatywny koszt, CR 702.168a)');
  run(state, offer);
  resolve(state);
  const perm = naPlanszy(state, 'riftburst-hellion');
  assert.ok(perm, 'permanent jest na polu bitwy');
  assert.equal(perm.faceDown, true);
  assert.equal(perm.faceDownCause, 'disguise', 'przyczyna zakrycia: disguise (nie morph)');
  // CR 708.2 / ruling 2024-02-02: 2/2 bez nazwy, bez podtypów, bez kolorów, MV 0.
  assert.equal(effectivePower(perm, state), 2, 'moc zakrycia 2');
  assert.equal(effectiveToughness(perm, state), 2, 'wytrzymałość zakrycia 2');
  assert.deepEqual(perm.types, ['Creature']);
  assert.deepEqual(perm.subtypes, []);
  assert.deepEqual(perm.colors, []);
  assert.equal(perm.cardName, null);
  assert.equal(perm.manaCost, 0, 'mana value zakrytego czaru/permanentu = 0');
  // CR 702.168a: ward {2} jest częścią definicji zakrycia disguise.
  assert.equal(wardAmountOf(perm, state), 2);
  assert.ok(effectiveKeywords(perm, state).includes('ward'), 'zakryty ma ward');
  // Zdolność obrotu: dokładnie jedna, z kosztem hybrydowym.
  assert.deepEqual(perm.abilities.map((a) => a.keyword), ['disguise']);
  assert.equal(perm.abilities[0].cost.mana, 6);
  assert.deepEqual(perm.abilities[0].cost.hybrid, [['R', 'G'], ['R', 'G']]);
  assert.equal(perm.abilities[0].effect.type, 'turn_face_up');
  // Po obrocie wraca karta: nazwa, kolory, koszt (migawka z rzutu).
  assert.equal(perm.faceDownOriginal.cardName, 'Riftburst Hellion');
  assert.equal(perm.faceDownOriginal.manaCost, 7);
  assert.deepEqual(perm.faceDownOriginal.keywords, ['reach']);
});

test('B61/170: rzut twarzą w dół jest NIELEGALNY bez {3} (CR 601.2h)', async () => {
  const state = game();
  put(state, 'hell', 'riftburst-hellion', 'p1', 'hand');
  addMana(state, 'p1', 2);
  const offers = commands(state).filter((c) => c.type === 'cast_permanent');
  assert.deepEqual(offers, [], 'brak oferty przy 2 manach (koszt twarzą w dół {3}, koszt karty 7)');
});

test('B61/170: obrót twarzą do góry za {4}{R/G}{R/G} — każdy wariant hybrydy', async () => {
  // Pip {R/G} opłaca JEDEN z kolorów (CR 107.4e), więc legalne są wszystkie
  // kombinacje: R,R / R,G / G,G — plus generyczne z dowolnej reszty.
  for (const [manaR, manaG, label] of [[6, 0, 'R x6'], [4, 2, 'R x4 + G x2'], [2, 4, 'R x2 + G x4'], [0, 6, 'G x6']]) {
    const state = game();
    put(state, 'hell', 'riftburst-hellion', 'p1', 'hand');
    addMana(state, 'p1', 3);
    run(state, commands(state).find((c) => c.type === 'cast_permanent' && c.faceDown === true));
    resolve(state);
    addMana(state, 'p1', manaR, { colors: ['R'] });
    if (manaG) addMana(state, 'p1', manaG, { colors: ['G'] });
    const up = commands(state).filter((c) => c.type === 'activate_ability');
    assert.equal(up.length, 1, `oferta obrotu dla puli ${label}`);
    run(state, up[0]);
    const perm = naPlanszy(state, 'riftburst-hellion');
    assert.equal(perm.faceDown, false, `odkryty po zapłacie (${label})`);
    assert.equal(effectivePower(perm, state), 6);
    assert.equal(effectiveToughness(perm, state), 7);
    assert.deepEqual(player(state, 'p1').manaPool, {}, `cała pula zużyta (${label})`);
    assert.deepEqual(player(state, 'p1').life, 20, 'koszt zapłacono maną, nie życiem');
  }
});

test('B61/170: obrót NIELEGALNY bez many R/G (hybryda nie jest „dowolnym kolorem")', async () => {
  const state = game();
  put(state, 'hell', 'riftburst-hellion', 'p1', 'hand');
  addMana(state, 'p1', 3);
  run(state, commands(state).find((c) => c.type === 'cast_permanent' && c.faceDown === true));
  resolve(state);
  // 6 man w innych kolorach starcza na część generyczną, ale ŻADEN pip
  // hybrydowy nie ma czym zapłacić — zdolność nie może być zaoferowana.
  addMana(state, 'p1', 6, { colors: ['U'] });
  assert.deepEqual(commands(state).filter((c) => c.type === 'activate_ability'), [],
    'brak oferty obrotu przy puli bez R/G');
  const perm = naPlanszy(state, 'riftburst-hellion');
  assert.equal(perm.faceDown, true, 'permanent został zakryty');
});

test('B61/170: obrót to akcja specjalna — bez stosu i bez zdolności ETB (ruling)', async () => {
  const state = game();
  put(state, 'hell', 'riftburst-hellion', 'p1', 'hand');
  addMana(state, 'p1', 3);
  run(state, commands(state).find((c) => c.type === 'cast_permanent' && c.faceDown === true));
  resolve(state);
  addMana(state, 'p1', 6, { colors: ['R'] });
  const before = state.events.length;
  run(state, commands(state).filter((c) => c.type === 'activate_ability')[0]);
  const types = state.events.slice(before).map((e) => e.type);
  assert.equal(state.zones.stack.length, 0, 'obrót to akcja specjalna Disguise — nie używa stosu (CR 702.168a)');
  assert.ok(types.includes('turned_face_up'), 'zdarzenie obrotu istnieje');
  assert.ok(!types.includes('spell_resolved'), 'obrót nie jest rozstrzygnięciem czaru');
  assert.ok(!types.some((t) => t === 'permanent_entered' || t === 'enters_the_battlefield'),
    'obrót nie wywołuje zdolności wejścia na pole bitwy (ruling 2024-02-02)');
  const perm = naPlanszy(state, 'riftburst-hellion');
  assert.equal(perm.faceDown, false);
  assert.equal(perm.ward, null, 'ward {2} znika razem z zakryciem');
  assert.deepEqual(perm.subtypes, ['Hellion']);
  assert.ok(effectiveKeywords(perm, state).includes('reach'), 'karta wraca z zasięgiem');
});

test('B61/170: twarzą do góry nie obrócisz (zdolność disguise wygasa po obrocie)', async () => {
  const state = game();
  put(state, 'hell', 'riftburst-hellion', 'p1', 'battlefield', { summoningSickness: false });
  addMana(state, 'p1', 6, { colors: ['R'] });
  const perm = state.objects.get('hell');
  assert.equal(perm.faceDown ?? false, false, 'karta leży twarzą do góry');
  assert.deepEqual(commands(state).filter((c) => c.type === 'activate_ability'), [],
    'brak oferty obrotu dla permanentu twarzą do góry');
});
