// PMSSB-40 (2026-10-03a) — payoffy rzutu II: efekty SKIEROWANE (`requiresTarget`:
// Molten Nursery, Goblin Battle Jester) i wymiar NIETAPNIĘCIA (vigilance Kulratha,
// untap Steelfin Whale). Plan: `docs/plans/PLAN_2026-10-03a-pmssb40-skierowane-nietapniecie.md`.
//
// Pomiar PRZED (`/tmp/pr/probe-pmssb40-przed.mjs`): S1 = 0 (Molten Nursery —
// bramka `requiresTarget` pomijała CAŁY trigger), S2 = 0 (Goblin Battle Jester —
// jw.), S3 = 7 (sam pump, rider vigilance bez wyceny), S4 = 0 (Steelfin Whale —
// noga `untap_permanent` poza zbiorem payoffów).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const registry = createCardRegistry();

function put(state, id, cardId, playerId = 'p1', zone = 'hand', patch = {}) {
  const def = registry.get(cardId);
  assert.ok(def, `${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId,
    zone, ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes, keywords: def.keywords,
  });
  if (Object.keys(patch).length) state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
}

const READY = { summoningSick: false, summoningSickness: false };

function game(main = 'main1') {
  const s = createGameState({ seed: 40, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, main, 'p1');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  s.turn.number = 6;
  for (const p of ['p1', 'p2']) for (let i = 0; i < 30; i += 1) put(s, `lib-${p}-${i}`, 'basic-swamp', p, 'library');
  return s;
}

const lands = (s, n) => { for (let i = 0; i < n; i += 1) put(s, `L${i}`, 'basic-mountain', 'p1', 'battlefield', { tapped: false }); };

/** Porównanie liczb zmiennoprzecinkowych (wyniki bota mają ogony 1e-15). */
const blisko = (actual, expected, msg) => assert.ok(Math.abs(actual - expected) < 1e-9,
  `${msg ?? 'wartość'}: oczekiwano ${expected}, jest ${actual}`);

/** Wynik oferty o danej etykiecie (dokładnie jedna pasująca). */
function wynik(s, label, params) {
  const bot = createHeuristicBot({ seed: 2026, params });
  bot.chooseCommand(playerView(s, 'p1'), {});
  const opcje = new Map();
  for (const o of bot.trace().at(-1)?.options ?? []) opcje.set(o.cmd, o.score);
  assert.ok(opcje.has(label), `oferta „${label}” istnieje (są: ${[...opcje.keys()].join(' | ')})`);
  return opcje.get(label);
}

/** Różnica wyniku oferty z payoffem i bez (`boardPayoffWeight` 0). */
const zysk = (s, label, params = {}) => wynik(s, label, params) - wynik(s, label, { ...params, boardPayoffWeight: 0 });

// ── A. Molten Nursery: `damage` z `requiresTarget: any_target` (bezbarwny czar) ──
function scenaNursery({ host = 'molten-nursery', hand = 'angels-feather', lands_n = 2 } = {}) {
  const s = game();
  lands(s, lands_n);
  if (host) put(s, 'host', host, 'p1', 'battlefield');
  put(s, 'h0', hand);
  put(s, 'b', 'hill-giant', 'p2', 'battlefield', READY);
  return s;
}
const naszArt = 'cast_permanent(h0)';

test('A1 Molten Nursery (enchantment) + bezbarwny artefakt: payoff obrażeń 3 × waga 0,5', () => {
  blisko(zysk(scenaNursery(), naszArt), 1.35, 'A1');
});

test('A2 brak nosiciela w grze: payoff 0 (przyczyna jest po stronie karty, nie artefaktu)', () => {
  assert.equal(zysk(scenaNursery({ host: null }), naszArt), 0);
});

test('A3 czar CZERWONY nie spełnia warunku (spellIsColorless): 0 (1 R nie wystarcza)', () => {
  assert.equal(zysk(scenaNursery({ hand: 'shock', lands_n: 1 }), 'cast_spell(h0->b)'), 0);
});

test('A4 pokrętło skaluje payoff liniowo (anty-over-fix: w=1 → 2,7; w=2 → 5,4)', () => {
  const s = scenaNursery();
  blisko(wynik(s, naszArt, { boardPayoffWeight: 1 }) - wynik(s, naszArt, { boardPayoffWeight: 0 }), 2.7, 'A4/w=1');
  blisko(wynik(s, naszArt, { boardPayoffWeight: 2 }) - wynik(s, naszArt, { boardPayoffWeight: 0 }), 5.4, 'A4/w=2');
});

// ── B. Goblin Battle Jester: `cant_block` z `requiresTarget: creature` ──
function scenaJester({ main = 'main1', foe = 'maritime-guard', myAtk = true } = {}) {
  const s = game(main);
  lands(s, 1);
  put(s, 'gj', 'goblin-battle-jester', 'p1', 'battlefield', READY);
  if (myAtk) put(s, 'atk', 'hill-giant', 'p1', 'battlefield', READY);
  if (foe) put(s, 'b', foe, 'p2', 'battlefield', READY);
  put(s, 'h0', 'shock');
  return s;
}
const naszBolt = 'cast_spell(h0->b)';

test('B1 Goblin Battle Jester + czerwony czar, główna 1: wartość zdjętego blokera (2)', () => {
  assert.equal(zysk(scenaJester(), naszBolt), 2);
});

test('B2 druga główna — efekt nie kupuje już ataku: 0', () => {
  assert.equal(zysk(scenaJester({ main: 'main2' }), naszBolt), 0);
});

test('B3 wróg bez blokerów: 0 (nie ma czego zdejmować — nawet gdy czar leci w twarz)', () => {
  assert.equal(zysk(scenaJester({ foe: null }), 'cast_spell(h0->p2)'), 0);
});

test('B4 nowy wymiar nietapnięcia NIE dotyka cant_block (rozdział pokręteł)', () => {
  assert.equal(zysk(scenaJester(), naszBolt, { payoffUntappedBodyWeight: 0 }), 2);
  assert.equal(zysk(scenaJester(), naszBolt, { payoffUntappedBodyWeight: 4 }), 2);
});

test('B5 żaden mój stwór nie może zaatakować: cant_block nie kupuje ataku: 0', () => {
  const s = scenaJester();
  // Atakujący z chorobą przyzwania, a sam Jester tapnięty (też nie zaatakuje).
  s.objects.set('atk', Object.freeze({ ...s.objects.get('atk'), summoningSickness: true }));
  s.objects.set('gj', Object.freeze({ ...s.objects.get('gj'), tapped: true }));
  assert.equal(zysk(s, naszBolt), 0);
});

// ── C. Kulrath Mystic: pump + NOWE słowo `vigilance` przy rzucie MV≥4 ──
function scenaKulrath({ hostPatch = {}, knob = 1 } = {}) {
  const s = game();
  lands(s, 5);
  put(s, 'km', 'kulrath-mystic', 'p1', 'battlefield', { ...READY, ...hostPatch });
  put(s, 'h0', 'rage-of-purphoros');
  put(s, 'b', 'hill-giant', 'p2', 'battlefield', READY);
  return s;
}
const naszPurphoros = 'cast_spell(h0->b)';

test('C1 Kulrath Mystic + czar MV 5: pump 7 + rider nietapnięcia 4 = 11', () => {
  assert.equal(zysk(scenaKulrath(), naszPurphoros), 11);
});

test('C2 pokrętło = 0 odtwarza stan sprzed zmiany (7 = sam pump; anty-over-fix M429)', () => {
  assert.equal(zysk(scenaKulrath(), naszPurphoros, { payoffUntappedBodyWeight: 0 }), 7);
});

test('C3 rider skaluje się pokrętłem do sufitu (knob 0,5 → 9; knob ≥1 → sufit 8)', () => {
  const s = scenaKulrath();
  assert.equal(zysk(s, naszPurphoros, { payoffUntappedBodyWeight: 0.5 }), 9);
  assert.equal(zysk(s, naszPurphoros, { payoffUntappedBodyWeight: 2 }), 11);
});

test('C4 nosiciel z chorobą przyzwania nie zaatakuje: rider 0 (zostaje sam drenaż twarzy)', () => {
  const s = scenaKulrath({ hostPatch: { summoningSickness: true } });
  assert.equal(zysk(s, naszPurphoros, { payoffUntappedBodyWeight: 1 })
    - zysk(s, naszPurphoros, { payoffUntappedBodyWeight: 0 }), 0);
});

// ── D. Steelfin Whale: untap NOSICIELA przy wejściu artefaktu ──
function scenaSteelfin({ whalePatch = {} } = {}) {
  const s = game();
  lands(s, 2);
  put(s, 'sw', 'steelfin-whale', 'p1', 'battlefield', { ...READY, tapped: true, ...whalePatch });
  put(s, 'h0', 'angels-feather');
  put(s, 'b', 'hill-giant', 'p2', 'battlefield', READY);
  return s;
}

test('D1 Steelfin Whale TAPNIĘTY + artefakt: untap przywraca ciało 3/4 (sufit 8 × 0,5 × 0,9)', () => {
  blisko(zysk(scenaSteelfin(), naszArt), 3.6, 'D1');
  blisko(zysk(scenaSteelfin(), naszArt, { payoffUntappedBodyWeight: 0.5 }), 1.8, 'D1/knob 0,5');
});

test('D2 ten sam untap na nosicielu NIETAPNIĘTYM to no-op: 0', () => {
  assert.equal(zysk(scenaSteelfin({ whalePatch: { tapped: false } }), naszArt), 0);
});

test('D3 pokrętło = 0: payoff znika (anty-over-fix M429)', () => {
  assert.equal(zysk(scenaSteelfin(), naszArt, { payoffUntappedBodyWeight: 0 }), 0);
});

// ── E. Regresja: payoffy spoza wymiaru nietapnięcia nie drgnęły ──
test('E1 Tackle Artist: licznik z rzutu instant/sorcery bez zmian przy obu wartościach pokrętła', () => {
  const s = game();
  lands(s, 1);
  put(s, 'ta', 'tackle-artist', 'p1', 'battlefield', READY);
  put(s, 'h0', 'titans-strength');
  put(s, 'atk', 'hill-giant', 'p1', 'battlefield', READY);
  put(s, 'b', 'maritime-guard', 'p2', 'battlefield', READY);
  const label = 'cast_spell(h0->atk)';
  const bazowy = zysk(s, label);
  assert.ok(bazowy > 0, 'payoff Tackle Artist nadal działa');
  assert.equal(zysk(s, label, { payoffUntappedBodyWeight: 0 }), bazowy);
});
