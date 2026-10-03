// PMSSB-49 (2026-10-03l) — „warp_card vs rzut w następnej turze: opóźdzony
// zysk vs stracona tura" (kolejka z handoffu 03d/03e/03f, granica (2) §PMSSB-41).
//
// POMIAR PRZED (sonda `tools/probe-pmssb49-warp-vs-nastepna-tura.mjs`):
//   S1 (3 lądy)                          → warp 85,000
//   S3 (6 lądów, 4 nietapnięte)          → warp 85,000  ← IDENTYCZNIE jak S1
//   S5 (5 lądów, brak lądu w ręce)       → warp 85,000  ← identycznie
// Model nie odróżniał „rzutu nie ma i nie będzie" od „rzut jest za turę", bo
// porównywał się wyłącznie z OFERTĄ rzutu TERAZ (L48). Tymczasem karta po
// warp-caście wraca z wygnania ZA KOSZT MANY (CR 702.185a) i tam ETB odpala
// DRUGI raz — sonda `tools/probe-pmssb49-double-etb.mjs`:
//   1) rzut z exile oferowany jako `cast_permanent` (6 lądów) — TAK,
//   2) przy 3 dostępnych manach oferta znika → koszt = koszt many (6), nie warp,
//   3) po recaście licznik ląduje na gospodarzu PONOWNIE → podwójny ETB realny.
//
// Naprawa: gdy recast jest osiągalny już w NASTĘPNEJ turze (wszystkie lądy +
// ląd z ręki pokrywają koszt many i kolory), druga wypłata jest liczona z wagą
// `warpRecastEtbWeight` (< 1 = dyskont czasu; CR 702.185a). Wiersze S1/S1b
// (recast nieosiągalny) zostają bez zmian — M429: pokrętło ×0 = stan sprzed.
//
// Piny: W1–W3 rozróżnienie „za turę" vs „nigdy" (bramka kosztu, land dropu
// i kolorów), W4 S1/S3 przestają być nierozróżnialne (+ brak oferty rzutu),
// W5 kolor bez źródła (generycznie, ADR 0002), W6 pokrętło ×0 (M429),
// W7–W8 anty-over-fix (redundancja i jałowy warp bez zmian), W9 brak
// podwójnego liczenia w `cast_permanent`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, playerView, addObject } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();
const READY = { summoningSick: false, summoningSickness: false };

function game() {
  const s = createGameState({ seed: 49, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main', 'p1');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  s.turn.number = 5;
  return s;
}

function put(state, id, cardId, playerId = 'p1', zone = 'hand', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId,
    zone, ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes, keywords: def.keywords,
  });
  if (Object.keys(patch).length) state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  return state.objects.get(id);
}

/** n Plainsów (k z nich nietapniętych) + karta w ręce + gospodarz 3/3 pod ETB. */
function scena({ lands = 3, untapped = null, card = 'weftblade-enhancer', host = true, landInHand = false, cardPatch = null } = {}) {
  const s = game();
  const up = untapped ?? lands;
  for (let i = 0; i < lands; i += 1) {
    put(s, `L${i}`, 'basic-plains', 'p1', 'battlefield', { kind: 'land', subtypes: ['Plains'], colors: ['W'], manaSource: { colors: ['W'], amount: 1 }, tapped: i >= up });
  }
  put(s, 'h0', card, 'p1', 'hand', cardPatch ?? {});
  if (landInHand) put(s, 'h1', 'basic-plains', 'p1', 'hand', { kind: 'land', subtypes: ['Plains'] });
  if (host) put(s, 'g1', 'hill-giant', 'p1', 'battlefield', { ...READY, power: 3, toughness: 3 });
  return s;
}

/** Decyzja bota: wybrana komenda + mapa etykieta → wynik (ślad). */
function decyzja(s, params) {
  const bot = createHeuristicBot({ seed: 5, params });
  const cmd = bot.chooseCommand(playerView(s, 'p1'), {});
  const scores = {};
  for (const option of bot.trace().at(-1).options) {
    if (typeof option.cmd === 'string') scores[option.cmd] = option.score;
  }
  return { cmd, scores };
}
const wynik = (s, label, params) => {
  const { scores } = decyzja(s, params);
  assert.ok(label in scores, `oferta „${label}” istnieje (są: ${Object.keys(scores).join(' | ')})`);
  return scores[label];
};

// ── Bramka „recast za turę" ─────────────────────────────────────────────────

test('W1: recast NIEosiągalny za turę (3 lądy) → warp bez dopłaty drugiego ETB (85)', () => {
  const s = scena({ lands: 3 });
  assert.equal(wynik(s, 'warp_card'), 85, 'baza: ciało 3/4 (70+6+4) − 15 tymczasowości + ETB 24 − koszt warp (3+1 pip)');
  assert.equal(decyzja(s).cmd.type, 'warp_card', 'jedyna droga do ETB — warp nadal wybierany');
});

test('W2: recast osiągalny za turę (5 lądów + ląd w ręce) → druga wypłata ETB liczona', () => {
  const s = scena({ lands: 5, landInHand: true });
  // 85 + 0,5 × 24 = 97 — różnica jest DOKŁADNIE pokrętłem.
  assert.equal(wynik(s, 'warp_card'), 97, 'recast: koszt many pokryty (5 lądów + land drop), kolory W pokryte');
});

test('W3: ląd w ręce bez pokrycia kosztu (5 lądów i brak land dropu) → bez drugiej wypłaty', () => {
  const s = scena({ lands: 5, landInHand: false });
  assert.equal(wynik(s, 'warp_card'), 85, '5 lądów < koszt 6 — recast nie jest oczywisty, dopłata nie wchodzi');
});

test('W4: 6 lądów (4 nietapnięte) — S1 i S3 przestają być nierozróżnialne', () => {
  const nigdy = scena({ lands: 3 });
  const zaTure = scena({ lands: 6, untapped: 4 });
  const nigdyWarp = wynik(nigdy, 'warp_card');
  const zaTureWarp = wynik(zaTure, 'warp_card');
  assert.equal(zaTureWarp - nigdyWarp, 12, 'model rozróżnia perspektywę recastu (0,5 × 24)');
  // Rzut normalny NIE jest oferowany (tylko 4 nietapnięte lądy) — bramka
  // „recast za turę" czyta przyszłość z widoku, nie z oferty silnika (L48).
  assert.ok(!('cast_permanent(h0)' in decyzja(zaTure).scores), 'oferty rzutu teraz nie ma');
  assert.equal(decyzja(zaTure).cmd.type, 'warp_card');
});

test('W5 (generycznie, ADR 0002): kolor karty bez źródła → brak drugiej wypłaty', () => {
  // Karta syntetyczna: koszt many pokryty liczbą lądów, ale wymaga koloru,
  // którego żaden mój ląd nie produkuje (patch kolorów obiektu, nie nazwy karty).
  const s = scena({
    lands: 6, untapped: 4,
    cardPatch: { colors: ['W', 'U'] },
  });
  assert.equal(wynik(s, 'warp_card'), 85, 'brak źródła U → recast nieosiągalny, dopłata nie wchodzi');
});

test('W6 (M429): pokrętło `warpRecastEtbWeight` ×0 przywraca zachowanie sprzed PMSSB-49', () => {
  const s = scena({ lands: 5, landInHand: true });
  assert.equal(wynik(s, 'warp_card', { warpRecastEtbWeight: 0 }), 85);
  assert.equal(wynik(s, 'warp_card'), 97);
  const bez = wynik(s, 'warp_card', { warpRecastEtbWeight: 0 });
  assert.equal(wynik(s, 'warp_card') - bez, 12, 'pokrętło steruje dokładnie wymiarem drugiego ETB');
});

// ── Anty-over-fix ───────────────────────────────────────────────────────────

test('W7: rzut normalny oferowany teraz → cast_permanent (redundancja bez zmian)', () => {
  const s = scena({ lands: 6 });
  assert.equal(decyzja(s).cmd.type, 'cast_permanent');
  const warp = wynik(s, 'warp_card');
  assert.ok(warp < wynik(s, 'cast_permanent(h0)'), 'warp przegrywa z rzutem normalnym');
  // Kara redundancji nadal 60, a dopłata drugiego ETB NIE wchodzi (rzut teraz = inna gałąź).
  assert.equal(wynik(s, 'warp_card', { warpRedundantPenalty: 0, warpRecastEtbWeight: 0 }), 85);
});

test('W8: jałowy warp (brak gospodarza ETB) → kara futile bez zmian, dopłata nie liczona', () => {
  const s = scena({ lands: 5, landInHand: true, host: false });
  assert.equal(wynik(s, 'warp_card'), -29, '−90 futile nie zmienia się (druga wypłata = 0, nie ma czego dublować)');
  assert.ok(wynik(s, 'warp_card') < wynik(s, 'pass_priority'), 'warp schodzi pod pass (kryterium właściciela)');
});

test('W9: rzut z ręki (cast_permanent) nie dostaje drugiej wypłaty ETB (brak podwójnego liczenia)', () => {
  const s = scena({ lands: 6, untapped: 4 });
  const zWaga = wynik(s, 'warp_card');
  const zZerem = wynik(s, 'warp_card', { warpRecastEtbWeight: 0 });
  assert.equal(zWaga - zZerem, 12, 'różnica jest tylko po stronie warp');
});
