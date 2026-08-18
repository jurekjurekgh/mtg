// =============================================================================
// M128 — uwaga B właściciela (2026-08-17, testy na telefonie):
//
//   „Przeciwnik wystawił Seer's Lantern po czym od razu ją tapnął dla many,
//    której nie zużył i się zmarnowała. Po co tapował latarnię? Nie lepiej
//    poczekać aż mana będzie potrzebna? Takie tapowanie na zapas i marnowanie
//    jest bez sensu."
//
// ROOT CAUSE (nie „brakująca kara na latarnię"):
// wycena efektu `add_mana` pytała wyłącznie „czy w ręce jest COKOLWIEK
// płatnego" (hasPlayable), a nie „czy ta mana COKOLWIEK zmienia". Silnik
// auto-tapuje przy płatności same LĄDY (`producibleMana` w resources.js), więc
// gdy lądy pokrywają już wszystko, co bot zamierza rzucić, aktywacja artefaktu
// nie odblokowuje niczego. Mana ginie w cleanup (CR 500.4) — czysta strata
// tempa, a przy Seer's Lantern dodatkowo blokada drugiej zdolności
// ({2},{T}: Scry 1), bo źródło zostaje tapnięte.
//
// NAPRAWA (ADR 0002 — po deskryptorach, nigdy po nazwach kart): mana ma
// wartość, gdy PRZESUWA PRÓG opłacalności — istnieje w ręce karta, której nie
// stać nas zagrać teraz, a stać po aktywacji. Jedna reguła dla wszystkich
// źródeł many (L28), zamiast kolejnego `if` per karta.
//
// Testy: (1) regresja wprost na zgłoszenie, (2) anty-over-fix — mana, która
// realnie odblokowuje zagranie, MUSI nadal być brana, (3) rodzina źródeł.
// =============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

let counter = 0;

/**
 * Stół bota (p2) w jego głównej fazie: `source` na bitwisku, N nietapniętych
 * lądów (bot ma z nich manę BEZ aktywowania czegokolwiek) i karty w ręce.
 * Biblioteka niepusta, żeby nie mieszała się bramka jałowego scry z M126.
 */
function botBoard({ source, hand = [], lands = 0, library = [] }) {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  state.turn.number = 8;
  const put = (cardId, controllerId, zone) => {
    const def = REGISTRY.get(cardId);
    assert.ok(def, `karta ${cardId} istnieje w rejestrze`);
    const data = gameObjectDataOf(def);
    const id = `m128-${counter += 1}`;
    addObject(state, {
      id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
      kind: data.kind, power: data.power, toughness: data.toughness, manaCost: data.manaCost,
      abilities: data.abilities ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
      types: def.types ?? [], colors: data.colors ?? [], cardName: def.name, spell: def.spell,
    });
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
    return id;
  };
  const sourceId = put(source, 'p2', 'battlefield');
  for (let i = 0; i < lands; i += 1) put('basic-forest', 'p2', 'battlefield');
  hand.forEach((c) => put(c, 'p2', 'hand'));
  library.forEach((c) => put(c, 'p2', 'library'));
  return { view: playerView(state, 'p2'), sourceId, state };
}

/** Czy bot tapnął wskazane źródło many? */
function tapsSource(view, sourceId, abilityIndex = 0) {
  const chosen = createHeuristicBot({ seed: 3 }).chooseCommand(view);
  return {
    chosen,
    tapped: chosen.type === 'activate_ability'
      && chosen.objectId === sourceId
      && (chosen.abilityIndex ?? 0) === abilityIndex,
  };
}

// --- 1. Regresja wprost na zgłoszenie ---------------------------------------

test('M128/B: bot NIE tapuje Seer\'s Lantern „na zapas" — mana i tak nie starczy', () => {
  // Dokładny scenariusz właściciela. 3 lądy = 3 many; latarnia dorzuca 1
  // (razem 4), a jedyna karta w ręce kosztuje 7 — zagrania i tak nie będzie.
  // Mana wyparowałaby w cleanup (CR 500.4), a źródło zostałoby tapnięte.
  // Zmierzone: PRZED M128 bot tu tapował, PO M128 czeka.
  const { view, sourceId } = botBoard({ source: 'seers-lantern', lands: 3, hand: ['woolly-loxodon'] });
  const { chosen, tapped } = tapsSource(view, sourceId);
  assert.equal(tapped, false,
    `bot zmarnował manę „na zapas": ${JSON.stringify(chosen)}`);
});

test('M128/B: bot NIE tapuje latarni, gdy same lądy już pokrywają koszt karty z ręki', () => {
  // 4 lądy = 4 many bez żadnej aktywacji; Highland Game kosztuje 2. Latarnia
  // nie zmienia NICZEGO — jej tapnięcie to strata (i blokada scry).
  const { view, sourceId } = botBoard({ source: 'seers-lantern', lands: 4, hand: ['highland-game'] });
  const { chosen, tapped } = tapsSource(view, sourceId);
  assert.equal(tapped, false,
    `mana z latarni nie odblokowuje niczego, a bot ją wziął: ${JSON.stringify(chosen)}`);
});

// --- 2. Anty-over-fix: mana, która NAPRAWDĘ odblokowuje zagranie ------------

test('M128 (anty-over-fix): bot TAPUJE latarnię, gdy to odblokowuje zagranie', () => {
  // 6 lądów = 6 many; Woolly Loxodon kosztuje 7. Bez latarni czar jest poza
  // zasięgiem, z latarnią — dokładnie na progu. Tu tapnięcie ma sens.
  const { view, sourceId } = botBoard({ source: 'seers-lantern', lands: 6, hand: ['woolly-loxodon'] });
  const { chosen, tapped } = tapsSource(view, sourceId);
  assert.equal(tapped, true,
    `mana przesuwa próg opłacalności — bot powinien ją wziąć: ${JSON.stringify(chosen)}`);
});

test('M128 (anty-over-fix): decyduje PRÓG, nie typ źródła — ta sama karta, dwa wyniki', () => {
  // Ta sama latarnia, ta sama karta w ręce (Loxodon, koszt 7), ten sam bot.
  // Różni się WYŁĄCZNIE liczba lądów, czyli to, czy mana przesuwa próg:
  //   6 lądów + 1 = 7 → zagranie odblokowane;
  //   3 lądy  + 1 = 4 → mana i tak przepadnie.
  // Gdyby naprawa była „karą na artefakty many", oba przypadki dałyby to samo.
  const unlocks = botBoard({ source: 'seers-lantern', lands: 6, hand: ['woolly-loxodon'] });
  const wasted = botBoard({ source: 'seers-lantern', lands: 3, hand: ['woolly-loxodon'] });
  assert.equal(tapsSource(unlocks.view, unlocks.sourceId).tapped, true, 'odblokowuje → bierze');
  assert.equal(tapsSource(wasted.view, wasted.sourceId).tapped, false, 'nie odblokowuje → czeka');
});

// --- 3. Rodzina źródeł many (reguła generyczna, nie łatka na jedną kartę) ---

test('M128: reguła obejmuje RODZINĘ źródeł many, nie tylko zgłoszoną kartę', () => {
  // Apprentice Wizard: {1}, {T}: Add {C}{C}{C} (bilans +2). Przy ręce, której
  // i tak nie stać zagrać, to również mana „na zapas" — ta sama reguła liczona
  // z deskryptorów kosztu, zero nazw kart (ADR 0002).
  const { view, sourceId } = botBoard({ source: 'apprentice-wizard', lands: 3, hand: ['woolly-loxodon'] });
  const { chosen, tapped } = tapsSource(view, sourceId);
  assert.equal(tapped, false, `mana na zapas z innego źródła: ${JSON.stringify(chosen)}`);
});

test('M128: „czekanie" nie oznacza paraliżu — bot dalej wykonuje sensowne ruchy', () => {
  // Anty-over-fix na poziomie tury: rezygnacja z jałowej many nie może
  // zamienić się w „bot nic nie robi", gdy ma realne zagranie w ręce.
  const { view } = botBoard({ source: 'seers-lantern', lands: 4, hand: ['highland-game'], library: ['basic-island'] });
  const chosen = createHeuristicBot({ seed: 3 }).chooseCommand(view);
  assert.ok(['cast_permanent', 'play_land', 'declare_attackers', 'pass_priority'].includes(chosen.type),
    `oczekiwano sensownego ruchu zamiast tapowania na zapas: ${JSON.stringify(chosen)}`);
});
