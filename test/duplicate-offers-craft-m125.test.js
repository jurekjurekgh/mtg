// M125 — dwa zgłoszenia właściciela z testów na telefonie (2026-08-17).
//
// A. „Mam JEDNĄ Lodestone Needle na ręku, a w «Twoje działania» widzę DWIE
//    identyczne opcje «Zagraj: Lodestone Needle (koszt 1U)»."
//
//    Root cause: permanent z FLASH jest enumerowany w DWÓCH blokach
//    `playerView` — raz jako „czar z flash" (dostępny przy każdym priorytecie),
//    raz w zwykłym bloku main-phase. Aury miały już na to bramkę
//    (`if (keywords.includes('flash')) continue`), zwykłe permanenty nie.
//    Naprawa generyczna: deduplikacja CAŁEJ listy `legalCommands` po tożsamości
//    komendy — oferta ma odzwierciedlać liczbę RÓŻNYCH decyzji (ta sama zasada
//    co dedup wariantów mulligana w M119/Z3 i ofert szukania w M122/#2).
//
// B. „Craft: wygnaj Emissary Escort — prawie na pewno nie miałem tej karty
//    na swoim cmentarzu, wygnałem ją z cmentarza przeciwnika."
//
//    Weryfikacja NIE potwierdziła błędu: talia `mechanicy.txt` zawiera zarówno
//    Emissary Escort, Lodestone Needle, jak i Armored Skaab („mieli 4 karty"),
//    więc karta trafiła do WŁASNEGO grobu właściciela przez mielenie — co
//    właściciel sam potem potwierdził. Audyt ujawnił jednak realną słabość
//    obok: filtr kandydatów sprawdzał `controllerId` zamiast `ownerId`.
//    Grób jest strefą WŁAŚCICIELA (CR 400.7), a Craft mówi „an artifact card
//    from YOUR graveyard". Dziś silnik przywraca kontrolę właścicielowi przy
//    wejściu do grobu, więc luka była nieosiągalna w grze — ale reguła strefy
//    ukrytej oparta na kontrolerze to pułapka czekająca na pierwszy efekt
//    kradzieży kontroli. Utwardzone + przykryte testem.

import test from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { applyEffect } from '../src/engine/effects.js';

const REGISTRY = createCardRegistry();

function makeState() {
  const state = createGameState({ seed: 5, players: [{ id: 'p1' }, { id: 'p2' }] });
  // M257-r5b/B: pin aktora (starter losowy) — test gra turą p1.
  state.turn.activePlayerId = 'p1'; state.turn.priorityPlayerId = 'p1';
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.number = 6;
  return state;
}

let counter = 0;
function put(state, cardId, controllerId, zone, ownerId) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} istnieje`);
  const data = gameObjectDataOf(def);
  const id = `m125-${counter += 1}`;
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: ownerId ?? controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness, manaCost: data.manaCost,
    abilities: data.abilities ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
    types: def.types ?? [], colors: data.colors ?? [], cardName: def.name,
    transformTo: data.transformTo ?? def.transformTo ?? null,
    // Bez deskryptorów aury `playerView` potraktowałby Spectral Prison jak
    // zwykły permanent i nie wyliczyłby wariantów per cel (L: kształt obiektu
    // czytać z materializacji, nie zgadywać).
    aura: data.aura ?? def.aura ?? null, bestow: data.bestow ?? def.bestow ?? null,
  });
  return id;
}

// --- A: brak duplikatów w ofercie -----------------------------------------

test('M125/A: permanent z flash daje JEDNĄ ofertę zagrania, nie dwie', () => {
  const state = makeState();
  const needle = put(state, 'lodestone-needle', 'p1', 'hand'); // ma Flash
  put(state, 'seers-lantern', 'p1', 'battlefield');
  addMana(state, 'p1', 6, { colors: ['U', 'U', 'U', 'U', 'U', 'U'] });
  const offers = playerView(state, 'p1').legalCommands.filter((c) => c.objectId === needle);
  assert.equal(offers.length, 1,
    `jedna karta w ręce = jedna oferta, jest ${offers.length}: ${JSON.stringify(offers)}`);
});

test('M125/A: żadna oferta w widoku nie powtarza się dwa razy', () => {
  // Strażnik na całą listę, nie tylko na flash: dowolne dwa bloki enumeracji
  // produkujące tę samą komendę zapalą ten test.
  const state = makeState();
  put(state, 'lodestone-needle', 'p1', 'hand');
  put(state, 'seers-lantern', 'p1', 'battlefield');
  put(state, 'emissary-escort', 'p1', 'graveyard');
  addMana(state, 'p1', 8, { colors: ['U', 'U', 'U', 'U', 'U', 'U', 'U', 'U'] });
  const commands = playerView(state, 'p1').legalCommands;
  const keys = commands.map((cmd) => JSON.stringify(Object.keys(cmd).sort().map((k) => [k, cmd[k]])));
  const duplicates = keys.filter((key, i) => keys.indexOf(key) !== i);
  assert.deepEqual([...new Set(duplicates)], [],
    'lista legalnych komend zawiera duplikaty (ta sama decyzja oferowana wielokrotnie)');
});

test('M125/A (anty-over-fix): RÓŻNE warianty tej samej karty zostają', () => {
  // Dedup działa po tożsamości komendy, więc warianty (np. inny cel) muszą
  // przetrwać — inaczej gracz straciłby realne wybory.
  const state = makeState();
  const aura = put(state, 'spectral-prison', 'p1', 'hand');
  put(state, 'highland-game', 'p1', 'battlefield');
  put(state, 'goblin-piker', 'p2', 'battlefield');
  addMana(state, 'p1', 6, { colors: ['U', 'B', 'U', 'B', 'U', 'B'] });
  const offers = playerView(state, 'p1').legalCommands.filter((c) => c.objectId === aura);
  const targets = new Set(offers.map((c) => c.targets?.[0]));
  assert.ok(targets.size >= 2,
    `aura musi nadal oferować osobny wariant na każdy legalny cel: ${JSON.stringify(offers)}`);
});

// --- B: Craft bierze artefakty wyłącznie z WŁASNEGO grobu ------------------

test('M125/B: Craft nie oferuje artefaktu z grobu PRZECIWNIKA', () => {
  const state = makeState();
  const needle = put(state, 'lodestone-needle', 'p1', 'battlefield');
  put(state, 'emissary-escort', 'p2', 'graveyard'); // cudza karta, cudzy grób
  applyEffect(state, { type: 'craft_transform' }, state.objects.get(needle), [], {});
  const candidates = state.pendingCraftExile?.candidateIds ?? [];
  assert.equal(candidates.length, 0,
    `grób przeciwnika nie jest źródłem dla Craft: ${JSON.stringify(candidates)}`);
});

test('M125/B: o przynależności karty w grobie decyduje ownerId (CR 400.7)', () => {
  // Scenariusz obronny: obiekt z obcym `ownerId`, ale naszym `controllerId`.
  // Silnik dziś przywraca kontrolę właścicielowi przy wejściu do grobu, więc
  // ten układ jest syntetyczny — test pilnuje, żeby reguła nie opierała się
  // na kontrolerze, gdyby kiedyś pojawił się efekt kradzieży kontroli.
  const state = makeState();
  const needle = put(state, 'lodestone-needle', 'p1', 'battlefield');
  const stolen = put(state, 'emissary-escort', 'p1', 'graveyard', 'p2');
  applyEffect(state, { type: 'craft_transform' }, state.objects.get(needle), [], {});
  const candidates = state.pendingCraftExile?.candidateIds ?? [];
  assert.equal(candidates.includes(stolen), false,
    'karta należąca do przeciwnika nie może być kosztem Craft');
});

test('M125/B: walidacja odrzuca próbę wygnania cudzej karty', () => {
  // Obrona w głąb: nawet gdyby UI podsunęło zły cel, `execute` musi odmówić.
  const state = makeState();
  const needle = put(state, 'lodestone-needle', 'p1', 'battlefield');
  put(state, 'seers-lantern', 'p1', 'graveyard'); // legalny kandydat
  const foe = put(state, 'emissary-escort', 'p2', 'graveyard');
  applyEffect(state, { type: 'craft_transform' }, state.objects.get(needle), [], {});
  const result = execute(state, { type: 'resolve_craft_exile', playerId: 'p1', targetId: foe });
  assert.equal(result.ok, false, 'wygnanie cudzej karty musi być odrzucone');
  assert.equal(result.events?.[0]?.reason, 'illegal_craft_target');
});

test('M125/B (anty-over-fix): własny artefakt w własnym grobie NADAL działa', () => {
  const state = makeState();
  const needle = put(state, 'lodestone-needle', 'p1', 'battlefield');
  const mine = put(state, 'emissary-escort', 'p1', 'graveyard');
  applyEffect(state, { type: 'craft_transform' }, state.objects.get(needle), [], {});
  const candidates = state.pendingCraftExile?.candidateIds ?? [];
  assert.ok(candidates.includes(mine),
    'artefakt z własnego grobu (np. po zmieleniu) to legalny koszt Craft');
});
