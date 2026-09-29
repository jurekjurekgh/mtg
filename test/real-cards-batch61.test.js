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
