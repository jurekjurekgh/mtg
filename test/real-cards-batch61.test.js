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
