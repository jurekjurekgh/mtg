// PMSSB-51 (2026-10-03n) — „etap 2 planu PMSSB-47 z kartą demonstrującą":
// ETB lądu wymagający MOJEGO stworzenia (Idyllic Grange) i KOLEJNOŚĆ
// „najpierw gospodarz, potem ląd".
//
// POMIAR PRZED (sonda `tools/probe-pmssb51-etb-ladu.mjs`):
//   G1: 4 Plainsy, pusty stół, ręka Grange + stwór  → play_land = 82 (ląd pierwszy)
//   G2: 4 Plainsy, stwór na stole                   → play_land = 82 (ETB ma cel,
//        a ląd i tak płacił −8 za „wchodzi tapnięty", choć z 3+ Plains wchodzi odkręcony)
//   G3: 4 Plainsy, pusty stół, ręka tylko Grange    → play_land = 82
//   G4: 4 Plainsy, pusty stół, Grange + koszt 3     → play_land 82 > rzut 63,9
//        → bot grał LĄD PIERWSZY i licznik ETB przepadał (nie ma celu)
//   G5: 2 Plainsy (warunek „3+ inne Plains" NIESPEŁNIONY) → ląd wchodzi tapnięty
//
// Dwie wady modelu (obie w `landAnaliza`/`play_land`):
//  1. `entersTapped` czytane z samej flagi karty — warunek „enters tapped
//     unless …" (CR 614.1c) rozstrzyga `resources.playLand`, więc bot płacił
//     −8 za tapnięcie także wtedy, gdy ląd wchodzi ODKRĘCONY (i dopiero wtedy
//     odpala ETB).
//  2. ETB lądu nie był wyceniany w ogóle: przy pustym stole trigger z celem
//     („+1/+1 counter on target creature you control") przepada, a ląd i tak
//     wygrywał kolejność z rzutem gospodarza.
//
// Naprawa (generycznie, ADR 0002/0017; L41 — jedno miejsce na regułę):
//   • `entersTappedOfLand` — lustro warunków z `playLand` (CR 614.1c),
//   • `futileFriendlyCounterEtbPenalty` — kara `castFutileEtbPenalty` (40),
//     gdy trigger „add_counter na moim stworze" nie ma legalnego celu
//     (dla STWORÓW nie zachodzi: wchodzący jest celem sam dla siebie,
//     CR 603.6a — korekta F1; dla lądu/artefaktu zachodzi),
//   • kara wołana po klamrze `landPlayDelta` (±14/25) i tylko gdy trigger
//     naprawdę odpala (`condition.enteredUntapped` przy tapniętym wejściu).
//
// Piny: E1 kolejność (rzut gospodarza wygrywa z lądem), E2 anty-over-fix
// (land drop nadal opłacalny), E3 warunek spełniony + cel na stole = brak kary
// i brak −8 za tapnięcie, E4 warunek NIEspełniony (ląd tapnięty → trigger nie
// odpala → −8 zostaje, kary nie ma), E5 pokrętło `castFutileEtbPenalty` ×0 =
// stan sprzed PMSSB-51 (M429), E6 generycznie (L41/ADR 0002): zwykły Plains
// bez triggera nie dostaje żadnej kary ani −8.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, playerView, addObject } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, playerId, zone, patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId,
    zone, ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes, keywords: def.keywords,
  });
  if (Object.keys(patch).length) state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
}

/**
 * p1 = bot w Głównej 1. `lands` Plainsów, opcjonalnie mój stwór na stole,
 * w ręce: karta `inHand` (domyślnie Idyllic Grange) + opcjonalna druga karta.
 */
function scena({ lands = 4, creaturesOnBoard = 0, inHand = 'idyllic-grange', extraInHand = null } = {}) {
  const s = createGameState({ seed: 51, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main', 'p1');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  s.turn.number = 4;
  for (let i = 0; i < lands; i += 1) {
    put(s, `L${i}`, 'basic-plains', 'p1', 'battlefield',
      { kind: 'land', subtypes: ['Plains'], colors: ['W'], manaSource: { colors: ['W'], amount: 1 }, tapped: false });
  }
  for (let i = 0; i < creaturesOnBoard; i += 1) {
    put(s, `B${i}`, 'hill-giant', 'p1', 'battlefield', { power: 2, toughness: 2, keywords: [], summoningSickness: false });
  }
  put(s, 'G', inHand, 'p1', 'hand', { kind: 'land', subtypes: ['Plains'], colors: [] });
  if (extraInHand) put(s, 'C', extraInHand, 'p1', 'hand', {});
  return s;
}

/** Wybrana komenda + mapa etykieta → wynik (ślad bota). */
function decyzja(s, params) {
  const bot = createHeuristicBot({ seed: 4, params });
  const cmd = bot.chooseCommand(playerView(s, 'p1'));
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
const LAD = 'play_land(G:idyllic-grange)';

// ── E1–E2: kolejność i opłacalność land dropu ──────────────────────────────

test('E1: pusty stół → rzut gospodarza wygrywa kolejność z lądem (ETB ma wtedy cel)', () => {
  const s = scena({ extraInHand: 'porcelain-legionnaire' });
  const rzut = wynik(s, 'cast_permanent(C)');
  const lad = wynik(s, LAD);
  assert.equal(lad, 50, 'ląd 90 − 40 (ETB bez celu)');
  assert.ok(rzut > lad, `rzut gospodarza wyżej niż ląd (${rzut} > ${lad}) — inaczej licznik przepada`);
  assert.equal(decyzja(s).cmd.type, 'cast_permanent', 'bot NAJPIERW wystawia stwora');
});

test('E2 (anty-over-fix): sam ląd w ręce nadal jest zagrywany (land drop nie przepada)', () => {
  const s = scena();
  assert.equal(wynik(s, LAD), 50, 'kara 40 nie wyklucza land dropu');
  assert.equal(decyzja(s).cmd.type, 'play_land', 'ląd wciąż wybierany (50 > pass 0)');
});

// ── E3–E4: warunek „enters untapped" (CR 614.1c) ───────────────────────────

test('E3: stwór na stole → ETB ma cel i ląd wchodzi ODKRĘCONY (bez kary −8)', () => {
  const s = scena({ creaturesOnBoard: 1 });
  assert.equal(wynik(s, LAD), 90, '3+ inne Plains → wchodzi odkręcony; cel jest → bez kary');
  assert.equal(decyzja(s).cmd.type, 'play_land');
});

test('E4: 2 Plainsy → warunek niespełniony, ląd wchodzi TAPNIĘTY i trigger nie odpala', () => {
  const s = scena({ lands: 2 });
  assert.equal(wynik(s, LAD), 82, '−8 za tapnięcie zostaje, a kary za ETB nie ma (trigger nie odpali)');
  assert.equal(decyzja(s).cmd.type, 'play_land');
});

// ── E5–E6: pokrętło M429 i generyczność ───────────────────────────────────

test('E5 (M429): pokrętło `castFutileEtbPenalty` ×0 przywraca stan sprzed PMSSB-51', () => {
  const s = scena({ extraInHand: 'porcelain-legionnaire' });
  assert.equal(wynik(s, LAD, { castFutileEtbPenalty: 0 }), 90, 'bez kary ląd znowu wygrywa (90 > 63,9)');
  assert.equal(decyzja(s, { castFutileEtbPenalty: 0 }).cmd.type, 'play_land');
});

test('E6 (generycznie, ADR 0002): zwykły Plains bez ETB nie dostaje żadnej kary', () => {
  const s = scena({ inHand: 'basic-plains' });
  const label = 'play_land(G:basic-plains)';
  assert.equal(wynik(s, label), 90, 'brak triggera → brak kary i brak −8');
  assert.equal(decyzja(s).cmd.type, 'play_land');
});
