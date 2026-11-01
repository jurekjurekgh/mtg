// M (zgłoszenie właściciela 2026-10-29): „Karta Lorescale Coatl. Zdolność
// dodawania counterów +1/+1 przy draw ma dopisek «you may», a silnik nie dał
// mi wyboru tylko dodał counter bez pytania. To błąd.”
//
// WŁAŚCICIEL MA RACJĘ CO DO DRUKU — i to jest sedno sprawy:
//   • DRUK (MM2 #179; foto od właściciela, ARB #101, A25 #207):
//       "Whenever you draw a card, you may put a +1/+1 counter on Lorescale
//        Coatl."
//   • BIEŻĄCY ORACLE (Scryfall, wydruk m21/221 oraz mm2/179 — pole
//     `oracle_text`; snapshot w repo `docs/cards/scryfall-lorescale-coatl.json`):
//       "Whenever you draw a card, put a +1/+1 counter on this creature."
//     Opcjonalność zniknęła przy Core Set 2021 (2020-07-03): WotC skasowało
//     „you may” w ramach zmiany polityki Oracle z 2020 r. — ten sam zabieg,
//     który spotkał Ajani's Pridemate. Spoiler M21 z 2020-06-08 wywołał
//     publiczną dyskusję dokładnie o tej karcie („it got the Ajani's Pridemate
//     treatment and the ‘may’ got errata'd out”).
//   • UWAGA na dane: Scryfall NIE publikuje pola `printed_text` dla mm2/179
//     (brak klucza w odpowiedzi API), więc snapshot w repo nie pokazuje tekstu
//     druku. To luka źródła danych, nie dowód — drukowany tekst bierzemy
//     z fizycznej karty właściciela i zapisujemy w `notes` karty.
//
// REGUŁA (L57: zgłoszenie ≠ reguła): obowiązuje Oracle — CR 108.1 („Oracle
// card reference … use the Oracle text”) i ADR 0022 (karta `supported` =
// 100% Oracle). Po erracie licznik jest OBOWIĄZKOWY (CR 603.5: decyzję daje
// wyłącznie „you may”), więc silnik zachowuje się poprawnie, a dopisanie
// `mayFire` byłoby złamaniem Oracle. Ten pin pilnuje, żeby nikt nie „naprawił”
// karty wbrew Oracle ani nie zgubił informacji o rozjeździe druk↔Oracle:
//   M/1 — katalog = bieżący Oracle, BEZ „you may”;
//   M/2 — rozjazd jest UDOKUMENTOWANY w `notes` (druk mówi „you may”);
//   M/3 — deskryptor bez pól opcjonalności;
//   M/4/M/5 — silnik nie otwiera okna decyzji i nie gubi liczników;
//   M/6 — kontra: karta z PRAWDZIWYM „you may” (Angel's Feather) pyta;
//   M/7 — mutacja lokalna: samo `mayFire: true` natychmiast czerwieni pin.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createGameState, addObject, playerView, execute } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry, REAL_CARDS, VIRTUAL_BASIC_LANDS } from '../src/cards/card-data.js';
import { createRegistry } from '../src/cards/registry.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { processTriggers } from '../src/engine/triggers.js';
import { drawPlayerCards } from '../src/engine/effects.js';

const REG = createCardRegistry();
const SEED = 2066;
const SNAPSHOT = JSON.parse(fs.readFileSync('docs/cards/scryfall-lorescale-coatl.json', 'utf8'));

/** Dosłowny tekst DRUKU MM2 #179 (foto właściciela; ten sam na ARB #101 i A25 #207). */
const DRUK_MM2 = 'Whenever you draw a card, you may put a +1/+1 counter on Lorescale Coatl.';

const wariantRejestru = (mutate) => createRegistry(
  [...REAL_CARDS, ...VIRTUAL_BASIC_LANDS].map((card) => (card.id === 'lorescale-coatl' ? mutate({ ...card }) : card)),
);

function scene(cardId = 'lorescale-coatl', registry = REG) {
  const state = createGameState({ seed: SEED, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  for (let i = 0; i < 8; i += 1) {
    addObject(state, {
      id: `lib-${i}`, instanceId: `i-lib-${i}`, cardId: 'library-blank', controllerId: 'p1',
      ownerId: 'p1', zone: 'library', kind: 'sorcery', power: 0, toughness: 0, manaCost: 2,
      abilities: [], keywords: [], subtypes: [], types: ['Sorcery'], colors: [], cardName: 'blank',
    });
  }
  const def = registry.get(cardId);
  assert.ok(def, `${cardId} w rejestrze`);
  addObject(state, {
    id: 'src', instanceId: 'i-src', cardId, controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
    ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes, keywords: def.keywords,
  });
  state.objects.set('src', Object.freeze({ ...state.objects.get('src'), summoningSickness: false }));
  return state;
}

/** Dobiera `n` kart i rozstrzyga stos passami; raportuje okno decyzji. */
function dobierzIObserwuj(state, n = 1) {
  const przed = state.events.length;
  drawPlayerCards(state, 'p1', n, 'test_draw');
  processTriggers(state, state.events.slice(przed));
  const naStosie = state.zones.stack.length;
  for (let i = 0; i < 8 && state.zones.stack.length; i += 1) {
    execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  }
  return {
    naStosie,
    oknoDecyzji: Boolean(state.pendingOptionalTrigger)
      || playerView(state, 'p1').legalCommands.some((c) => c.type === 'resolve_optional_trigger_choice'),
    liczniki: state.objects.get('src').counters?.['+1/+1'] ?? 0,
  };
}

// ── M/1: obowiązuje Oracle (bez „you may”), nie druk ──────────────────────
test('M/1: katalog = bieżący Oracle, BEZ „you may” (druk MM2 mówi inaczej)', () => {
  const def = REG.get('lorescale-coatl');
  assert.equal(def.oracleText, SNAPSHOT.oracle_text,
    'oracleText musi być dosłownym bieżącym Oracle ze snapshotu (ADR 0022)');
  assert.equal(def.oracleText,
    'Whenever you draw a card, put a +1/+1 counter on this creature.');
  assert.equal(/you may/i.test(def.oracleText), false,
    'bieżący Oracle nie zawiera „you may” (errata M21/2020) — licznik obowiązkowy');
  // Druk miał „you may” — to NIE jest wymysł zgłaszającego.
  assert.equal(/you may/i.test(DRUK_MM2), true);
});

// ── M/2: rozjazd druk ↔ Oracle jest udokumentowany w karcie ───────────────
test('M/2: rozjazd druk↔Oracle zapisany w `notes` karty (nikt go nie zgubi)', () => {
  const notatki = (REG.get('lorescale-coatl').notes ?? []).join(' ');
  assert.ok(/ERRATA/.test(notatki), `brak notatki o erracie: ${notatki}`);
  assert.ok(/you may/.test(notatki), 'notatka musi przytaczać tekst druku („you may …”)');
  assert.ok(/Oracle/.test(notatki), 'notatka musi wskazywać, że obowiązuje Oracle');
  assert.ok(/M21|2020/.test(notatki), 'notatka musi datować erratę (M21 / 2020)');
  assert.ok(/108\.1/.test(notatki), 'podstawa regułowa: CR 108.1 (Oracle jest władny)');
});

// ── M/3: deskryptor nie niesie opcjonalności ──────────────────────────────
test('M/3: trigger nie ma `mayFire` ani innego pola opcjonalności', () => {
  const [ability] = REG.get('lorescale-coatl').abilities;
  assert.equal(ability.trigger.event, 'you_draw_card');
  assert.deepEqual(ability.effect, { type: 'add_counter', counter: '+1/+1', amount: 1 });
  assert.equal(ability.trigger.mayFire ?? false, false);
  assert.equal(ability.trigger.requiresTarget ?? null, null);
  assert.equal(ability.trigger.payLife ?? 0, 0);
  assert.equal(ability.trigger.payMana ?? 0, 0);
});

// ── M/4/M/5: silnik = Oracle (bez okna decyzji, liczniki nietknięte) ──────
test('M/4: po dobraniu licznik ląduje bez okna decyzji (zgodnie z Oracle)', () => {
  const wynik = dobierzIObserwuj(scene(), 1);
  assert.equal(wynik.naStosie, 1, 'trigger idzie na stos (CR 603.2)');
  assert.equal(wynik.oknoDecyzji, false, 'brak „you may” → brak pytania');
  assert.equal(wynik.liczniki, 1);
});

test('M/5: dwa dobrania = dwa triggery, dwa liczniki, nadal bez decyzji', () => {
  const wynik = dobierzIObserwuj(scene(), 2);
  assert.equal(wynik.oknoDecyzji, false);
  assert.equal(wynik.liczniki, 2);
});

// ── M/6: kontra — mechanizm `mayFire` żyje w silniku ──────────────────────
test('M/6 (kontra): karta z PRAWDZIWYM „you may” otwiera okno decyzji', () => {
  // Angel's Feather: „Whenever a player casts a white spell, you may gain 1 life.”
  const state = scene('angels-feather');
  const przed = state.events.length;
  state.events.push({ type: 'spell_cast', playerId: 'p1', colors: ['W'], cardId: 'testowy-czar' });
  processTriggers(state, state.events.slice(przed));
  for (let i = 0; i < 8 && state.zones.stack.length; i += 1) {
    execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  }
  const okno = Boolean(state.pendingOptionalTrigger)
    || playerView(state, 'p1').legalCommands.some((c) => c.type === 'resolve_optional_trigger_choice');
  assert.equal(okno, true,
    'deskryptor `mayFire` MUSI dawać wybór — inaczej byłaby to luka silnika, a nie errata');
});

// ── M/7: mutacja — dopisanie `mayFire` czerwieni pin ──────────────────────
test('M/7 (mutacja): samo `mayFire: true` wystarcza, by pojawiło się pytanie', () => {
  const mutacja = wariantRejestru((card) => ({
    ...card,
    abilities: card.abilities.map((ability) => ({ ...ability, trigger: { ...ability.trigger, mayFire: true } })),
  }));
  const wynik = dobierzIObserwuj(scene('lorescale-coatl', mutacja), 1);
  assert.equal(wynik.oknoDecyzji, true, 'mutacja wykryta — pin jest żywym detektorem');
  assert.equal(wynik.liczniki, 0, 'brak decyzji = brak licznika (mayFire blokuje efekt)');
});
