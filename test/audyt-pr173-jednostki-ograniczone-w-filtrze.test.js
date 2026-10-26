/**
 * Audyt PR #173 (F-2, 2026-10-26): wspólna miara automatu
 * (`mana-offer-guards`) nie może dokładać many OGRANICZONEJ drukiem
 * do castów nie-artefaktowych.
 *
 * Kontrakt: `player.mana` = suma pul (wolnej i `restrictedPool` — komentarz
 * M214 w `resources.js`), a silnik manę ograniczoną blokuje dla celu
 * nie-artefaktowego (`producibleMana` z `restrictedManaBlocked`,
 * `consumeManaPool(..., restricted=false)`, pin M201/M214: „manę Powerstone
 * da się wydać wyłącznie na dozwolony cel"). Zdolność Powerstone ma koszt
 * `{T}` (klucze „auto"), więc `manaAbilityHasManualCost` jej nie odróżnia —
 * pętla wolnych źródeł w `autoManaUnits` też nie czytała `spendOnly`.
 *
 * Sprzed naprawy (sonda `.arena/probe-f2.mjs`): Góra + Scion + 2 many
 * Powerstone w puli, *Goblin Piker* {1}{R}: oferta castu istnieje (bramka N
 * — osiągalna ręczna maną), `producibleMana` (nie-artefakt) = 1,
 * `castBeyondAutoMana` = false („wykonalny" — FANTOM), `execute` →
 * `illegal_cast:Niewystarczająca mana`. Guard przepuszczał komendę, której
 * executor nie zapłaci — dokładnie ta klasa, którą zgłoszenia K/N miały
 * usunąć (L188).
 *
 * Piny:
 *   F2/1 — filtr mówi „POZA automatem" dla nie-artefaktu opłacanego
 *          ograniczoną maną (RED przed naprawą);
 *   F2/2 — repro przez pełną komendę: `execute` odrzuca (L68);
 *   F2/3a — anty-over-fix: ARTEFAKT {2} za maną ograniczoną z PULI
 *          przechodzi przez filtr I przez `execute` (M214 dozwala — naprawa
 *          musi znać cel wydania, nie wyłączać padu w ciemno);
 *   F2/3b — anty-over-fix: artefakt opłacany źródłem `spendOnly` NA STOLE
 *          (token Powerstone z pustą pulą) też przechodzi obie bramki;
 *   F2/4 — klasyczna scena N bez many ograniczonej: filtr nadal odcina
 *          cast do czasu produkcji (regresja kontraktu N);
 *   F2/5 — `autoManaUnits` (miara celowo-ślepa) nie liczy `restrictedPool`
 *          ani źródeł `spendOnly` — bez padu i bez wolnych źródeł
 *          warunkowanych celem.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana, producibleMana } from '../src/engine/resources.js';
import { autoManaUnits, castBeyondAutoMana, hasManaActivationOffer } from '../src/controllers/mana-offer-guards.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, zone = 'battlefield', playerId = 'p1') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  return state.objects.get(id);
}

/** Góra + Scion + 2 many Powerstone w puli (dozwolone tylko na artefakty). */
function board() {
  const state = createGameState({ seed: 92, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  state.pendingMulligans = [];
  put(state, 'mtn', 'basic-mountain');
  put(state, 'scion', 'token_eldrazi_scion');
  addMana(state, 'p1', 2, { colors: [], spendOnly: 'artifact' });
  return state;
}

/** Góra + token Powerstone na stole, pula pusta. */
function boardWithStone() {
  const state = createGameState({ seed: 94, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  state.pendingMulligans = [];
  put(state, 'mtn', 'basic-mountain');
  put(state, 'stone', 'token_powerstone');
  return state;
}

const castOf = (state, id) => playerView(state, 'p1').legalCommands
  .find((c) => c.type === 'cast_permanent' && c.objectId === id);

test('F2/1: nie-artefakt {1}{R} przy samej manie ograniczonej jest POZA automatem', () => {
  const state = board();
  put(state, 'piker', 'goblin-piker', 'hand');
  const view = playerView(state, 'p1');
  const cast = castOf(state, 'piker');
  assert.ok(cast, 'oferta castu istnieje (bramka N: osiągalna ręczna maną — CR 605.3a)');
  assert.equal(producibleMana(state, 'p1', null, { castingSpell: true, artifactSpell: false }, []), 1,
    'automat nie-artefaktu widzi tylko Górę');
  assert.ok(hasManaActivationOffer(view), 'scion wystawia aktywację — filtr jest aktywny');
  assert.equal(castBeyondAutoMana(view, cast, autoManaUnits(view)), true,
    'filtr musi odcinać cast nieopłacalny dla automatu (pad restrictedPool wyłączony)');
});

test('F2/2: repro przez komendę — executor odrzuca fantoma, którego filtr przepuścił', () => {
  const state = board();
  put(state, 'piker', 'goblin-piker', 'hand');
  const cast = castOf(state, 'piker');
  assert.ok(cast);
  const r = execute(state, cast); // L68: dowód odrzucenia PRZED wyciąganiem wniosków
  assert.equal(r.ok, false);
  assert.match(String(r.events?.[0]?.reason ?? ''), /Niewystarczająca mana/);
});

test('F2/3a: anty-over-fix — artefakt {2} za maną ograniczoną z puli: filtr i executor mówią TAK', () => {
  const state = board();
  put(state, 'door', 'cellar-door', 'hand');
  const view = playerView(state, 'p1');
  const cast = castOf(state, 'door');
  assert.ok(cast, 'oferta castu artefaktu');
  assert.equal(castBeyondAutoMana(view, cast, autoManaUnits(view)), false,
    'cel artefaktowy WIDZI manę Powerstone z puli (M214: restricted dozwolony)');
  const r = execute(state, cast);
  assert.equal(r.ok, true, JSON.stringify(r.events?.slice(-1)));
});

test('F2/3b: anty-over-fix — artefakt opłacany tokenem Powerstone na stole (pula pusta)', () => {
  const state = boardWithStone();
  put(state, 'door', 'cellar-door', 'hand');
  const view = playerView(state, 'p1');
  const cast = castOf(state, 'door');
  assert.ok(cast, 'oferta: Góra (1) + zdolność spendOnly powerstone (1) = {2}');
  assert.equal(castBeyondAutoMana(view, cast, autoManaUnits(view)), false,
    'źródło spendOnly na stole wchodzi do jednostek ARTEFAKTU');
  const r = execute(state, cast);
  assert.equal(r.ok, true, JSON.stringify(r.events?.slice(-1)));
});

test('F2/4: scena N bez many ograniczonej — filtr nadal odcina do czasu produkcji', () => {
  const state = createGameState({ seed: 93, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  state.pendingMulligans = [];
  put(state, 'mtn', 'basic-mountain');
  put(state, 'scion', 'token_eldrazi_scion');
  put(state, 'piker', 'goblin-piker', 'hand');
  const view = playerView(state, 'p1');
  const cast = castOf(state, 'piker');
  assert.ok(cast, 'oferta bramki N jest');
  assert.equal(castBeyondAutoMana(view, cast, autoManaUnits(view)), true,
    '{1}{R} > 1 (sama Góra) — najpierw produkcja sciona (kontrakt N/L188)');
});

test('F2/5: miara automatu nie liczy ograniczonej — ani z puli (pad), ani źródeł spendOnly', () => {
  const state = board();
  put(state, 'piker', 'goblin-piker', 'hand');
  const view = playerView(state, 'p1');
  // Automat celowo-ślepy: pula WOLNA (0) + lądy (1 Góra) — pad
  // `me.mana > units.length` nie dokłada 2 z restrictedPool.
  assert.equal(autoManaUnits(view).length, 1,
    'autoManaUnits = wyłącznie jednostki bez ograniczeń celu (bez padu)');
  // Token Powerstone na stole: zdolność spendOnly nie jest „automatem".
  const state2 = boardWithStone();
  const view2 = playerView(state2, 'p1');
  assert.equal(autoManaUnits(view2).length, 1,
    'powerstone (spendOnly) poza miarą automatu — tylko Góra');
});
