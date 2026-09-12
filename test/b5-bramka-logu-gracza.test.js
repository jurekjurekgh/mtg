import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HUMAN_ID, isMainLogEvent, isHumanControllerEvent, phaseHeaderText, isRulesZoneMove,
  MAIN_LOG_NOISE, TRANSFORM_DIGEST_EVENTS, HUMAN_DIGEST_EVENTS, BOT_RESOLUTION_EVENTS,
} from '../src/table/session.js';

// B5 — obserwacja F5 z audytu PR #113: „niezspinane bramki `session.js`".
// Pomiar z 2026-09-12: eksportowane `isBotMoveNoise` (2 pliki testów) i
// `describeGameEvent` (69 plików) piny miały, ale bramka GŁÓWNEGO LOGU gracza
// była wrostkowym warunkiem 14 członów wewnątrz `noteBotMove` (lokalne
// domknięcia `inCombatReport`, `isStackResolution`, `isHumanHeadline`,
// `isHumanDraw`, `isAdditionalCostMove`, `isBotDecision`), a `phaseHeaderFor`
// i zbiory `MAIN_LOG_NOISE`/`TRANSFORM_DIGEST_EVENTS`/`HUMAN_DIGEST_EVENTS`/
// `BOT_RESOLUTION_EVENTS` były lokalne w `createSession` — czyli zero testów
// mogło ich dotknąć bez uruchamiania całej sesji w jsdom. Te bramki decydują,
// co gracz widzi w panelu „Rozgrywka", a historia zgłoszeń właściciela jest
// długa (D/E, M99, M100/E5, M100/E8, M106/Z3, M151, M167/E, E2, E6/A2, E7/E) —
// każda poprawka była dotąd weryfikowana wyłącznie ręcznym czytaniem
// transkryptów. Ekstrakcja do czystych funkcji modułowych (zachowanie bez
// zmian) pozwala przypiąć reguły testem; ten plik to robi.

const BOT_ID = 'p2';
const gate = (e, ctx = {}) => isMainLogEvent(e, { botActing: false, phase: 'precombat_main', stackSize: 0, ...ctx });

test('B5/1: botActing (gałąź bota w advance) puszcza wszystko — uwaga D/E 2026-08-11', () => {
  // botActing jest prawdą TYLKO w gałęzi BOTA; sekcja ma wtedy własny podział
  // na noteBotMove/pushBotMove, więc bramka nie może nic odrzucać.
  for (const e of [
    { type: 'mana_produced', playerId: BOT_ID },
    { type: 'step_advanced', phase: 'upkeep' },
    { type: 'card_drawn', playerId: BOT_ID },
    { type: 'spell_cast', playerId: BOT_ID },
  ]) {
    assert.equal(isMainLogEvent(e, { botActing: true }), true, `${e.type} odrzucony przy botActing`);
  }
});

test('B5/2: przy auto-przewijaniu (botActing=false) szum jest odrzucany — M151', () => {
  const noise = [
    { type: 'mana_produced', playerId: BOT_ID },
    { type: 'card_drawn', playerId: BOT_ID },                 // dobieranie BOTA
    { type: 'spell_cast', playerId: BOT_ID },                 // nagłówek bez stosu i bez człowieka
    { type: 'stats_modified', playerId: BOT_ID, objectId: 'x' },
    { type: 'object_moved', playerId: BOT_ID, fromId: 'hand', toId: 'stack' },
  ];
  for (const e of noise) {
    assert.equal(gate(e), false, `${e.type} przeszedł bramkę — szum w panelu gracza`);
  }
});

test('B5/3: początek tury i nagłówek fazy ZAWSZE — uwaga A, M261, M106/Z3', () => {
  assert.equal(gate({ type: 'turn_started', playerId: BOT_ID }), true, 'turn_started bota odrzucony');
  assert.equal(gate({ type: 'game_started' }), true, 'game_started odrzucony (M261: otwiera turę 1)');
  assert.equal(gate({ type: 'step_advanced', phase: 'main1' }), true,
    'step_advanced odrzucony — panel pokazywałby nieaktualną fazę (land drop w upkeepie, CR 305.1)');
});

test('B5/4: CAŁA faza walki jest treścią panelu — uwagi A/B1 2026-08-12', () => {
  // resolve_combat człowieka idzie w advance() bez botActing; whitelista typów
  // gubiła bloki, obrażenia stwór–stwór (bez combat:true), truciznę i triggery.
  for (const e of [
    { type: 'damage_dealt', source: 'a', target: 'b', amount: 3 },
    { type: 'ability_triggered', objectId: 'trig', cardId: 'c' },   // bez controllerId (CR 603.3)
    { type: 'counter_added', objectId: 'x', counter: 'poison' },
    { type: 'mana_produced', playerId: BOT_ID },                    // nawet szum w walce
  ]) {
    assert.equal(gate(e, { phase: 'combat' }), true, `${e.type} odrzucony w fazie walki`);
  }
});

test('B5/5: ruch strefowy z reguł przechodzi (bounce, zero loyalty)', () => {
  assert.equal(isRulesZoneMove({ type: 'object_moved', bounced: true }), true);
  assert.equal(isRulesZoneMove({ type: 'object_moved', sba: 'zero_loyalty' }), true);
  assert.equal(isRulesZoneMove({ type: 'object_moved' }), false);
  assert.equal(gate({ type: 'object_moved', bounced: true, playerId: BOT_ID }), true);
  assert.equal(gate({ type: 'object_moved', sba: 'zero_loyalty', playerId: BOT_ID }), true);
});

test('B5/6: dodatkowy koszt rzucenia jest płatnością jak mana — E7/E (zgłoszenie właściciela)', () => {
  // Makeshift Mauler wygnanie z cmentarza: gracz ma widzieć co i skąd wygnano
  // (CR 400.2 — strefy jawne), także gdy akcję wykonuje CZŁOWIEK.
  const paid = { type: 'object_moved', additionalCost: true, playerId: HUMAN_ID, fromId: 'graveyard', toId: 'exile' };
  assert.equal(gate(paid), true, 'dodatkowy koszt człowieka odrzucony');
  assert.equal(gate({ ...paid, playerId: BOT_ID }), true, 'dodatkowy koszt bota odrzucony');
  assert.equal(gate({ type: 'object_moved', additionalCost: false, playerId: HUMAN_ID }), false,
    'object_moved bez flagi kosztu nie przechodzi tym członem');
});

test('B5/7: decyzja BOTA w turze człowieka należy do panelu — E2 (zgłoszenie właściciela)', () => {
  // Furious Forebear: dopłata {1}{W} po śmierci stwora, w TURZE CZŁOWIEKA, więc
  // botActing=false; główny log gracza promptu nie przyjmuje, a informacja nie
  // może zniknąć.
  assert.equal(gate({ type: 'pay_choice_required', playerId: BOT_ID }), true, 'prompt bota odrzucony');
  assert.equal(gate({ type: 'target_choice_required', controllerId: BOT_ID }), true);
  // Prompt CZŁOWIEKA nie wchodzi tym członem (to treść jego własnego panelu akcji).
  assert.equal(gate({ type: 'pay_choice_required', playerId: HUMAN_ID }), false);
  assert.equal(gate({ type: 'spell_resolved', playerId: BOT_ID }), false,
    'zdarzenie bez _required nie jest promptem decyzji');
});

test('B5/8: rozstrzygnięcie stosu po passie obu graczy — M99 (oś 2 audytu)', () => {
  // stackSize>0 = okno rozstrzygnięcia otwarte (trackStack), wtedy skutki czaru
  // bota są treścią panelu, nie tylko logu.
  assert.equal(gate({ type: 'spell_resolved', playerId: BOT_ID }, { stackSize: 1 }), true);
  assert.equal(gate({ type: 'stats_modified', playerId: BOT_ID }, { stackSize: 2 }), true);
  assert.equal(gate({ type: 'spell_resolved', playerId: BOT_ID }, { stackSize: 0 }), false,
    'bez okna stosu rozstrzygnięcie jest szumem auto-przewijania');
});

test('B5/9: nagłówkowe zagranie CZŁOWIEKA — M100/E5, cztery nośniki kontrolera', () => {
  assert.equal(isHumanControllerEvent({ playerId: HUMAN_ID }), true, 'playerId');
  assert.equal(isHumanControllerEvent({ controllerId: HUMAN_ID }), true, 'controllerId');
  assert.equal(isHumanControllerEvent({ object: { controllerId: HUMAN_ID } }), true, 'object.controllerId');
  assert.equal(isHumanControllerEvent({ sourceControllerId: HUMAN_ID }), true, 'sourceControllerId');
  assert.equal(isHumanControllerEvent({ playerId: BOT_ID }), false);
  assert.equal(isHumanControllerEvent(null), false, 'brak zdarzenia nie może rzucić wyjątkiem');

  for (const carrier of ['playerId', 'controllerId', 'sourceControllerId']) {
    assert.equal(gate({ type: 'land_played', [carrier]: HUMAN_ID }), true, `land_played przez ${carrier}`);
    assert.equal(gate({ type: 'ability_activated', [carrier]: HUMAN_ID }), true, `ability_activated przez ${carrier}`);
  }
  assert.equal(gate({ type: 'spell_cast', object: { controllerId: HUMAN_ID } }), true, 'spell_cast przez object');
  assert.equal(gate({ type: 'land_played', playerId: BOT_ID }), false, 'land bota bez stosu jest szumem');
});

test('B5/10: dobranie CZŁOWIEKA (także w kroku dobierania) — M100/E8', () => {
  assert.equal(gate({ type: 'card_drawn', playerId: HUMAN_ID }), true, 'para nagłówkowa własnej tury zniknęła');
  assert.equal(gate({ type: 'card_drawn', playerId: BOT_ID }), false);
  assert.equal(gate({ type: 'card_drawn', playerId: BOT_ID, source: 'effect' }, { stackSize: 0 }), false);
});

test('B5/11: transformacja permanentu jest publiczna — E6/A2 (Moonscarred Werewolf s20603)', () => {
  // CR 400.2: twarz na polu bitwy widzi każdy (P/T, zdolności, daybound/
  // nightbound) i zmienia ocenę pozycji — niezależnie od okna botActing/stosu.
  const transform = { type: 'object_transformed', objectId: 'w', cardId: 'moonscarred-werewolf', controllerId: BOT_ID };
  assert.equal(gate(transform), true, 'transform bota poza oknem stosu zniknął z panelu');
  assert.equal(gate({ ...transform, controllerId: HUMAN_ID }), true);
});

test('B5/12: dane bramek przypięte — M151, M106/Z1, E6/A2 (bez cichych edycji zbiorów)', () => {
  assert.deepEqual([...MAIN_LOG_NOISE].sort(), ['mana_produced', 'step_advanced'],
    'M151: szum głównego logu; turn_started NIE jest szumem (decyzja właściciela)');
  assert.equal(MAIN_LOG_NOISE.has('turn_started'), false, 'turn_started trafił do szumu — decyzja właściciela cofnięta');
  assert.deepEqual([...TRANSFORM_DIGEST_EVENTS], ['object_transformed']);
  for (const type of ['spell_cast', 'permanent_cast', 'land_played', 'ability_activated',
    'permanent_entered_battlefield', 'object_transformed']) {
    assert.equal(HUMAN_DIGEST_EVENTS.has(type), true, `HUMAN_DIGEST_EVENTS bez ${type} (M100/E5)`);
  }
  for (const type of ['spell_resolved', 'ability_resolved', 'damage_dealt', 'life_changed',
    'counter_added', 'mass_stats_modified', 'object_moved', 'token_created']) {
    assert.equal(BOT_RESOLUTION_EVENTS.has(type), true, `BOT_RESOLUTION_EVENTS bez ${type} (M99/M106-Z1)`);
  }
});

test('B5/13: nagłówek fazy tylko przy ZMIANIE fazy — M151/M167/E (stan deduplikacji jawny)', () => {
  let last = null;
  const step = (phase) => { const r = phaseHeaderText({ type: 'step_advanced', phase }, last); last = r.lastLoggedPhase; return r.header; };
  assert.equal(step('upkeep'), '— upkeep —', 'pierwszy nagłówek fazy');
  assert.equal(step('upkeep'), null, 'M151: ten sam krok powtórzony to szum (140× w jednej partii)');
  assert.equal(step('main1'), '— main1 —', 'zmiana fazy daje nagłówek');
  assert.equal(step('main1'), null);
  // Zdarzenie inne niż step_advanced nie rusza stanu deduplikacji.
  const other = phaseHeaderText({ type: 'turn_started', playerId: HUMAN_ID }, 'main1');
  assert.equal(other.header, null);
  assert.equal(other.lastLoggedPhase, 'main1', 'stan deduplikacji zmieniony przez zdarzenie bez fazy');
  const noPhase = phaseHeaderText({ type: 'step_advanced' }, 'main1');
  assert.equal(noPhase.header, null, 'step_advanced bez phase nie daje nagłówka');
  assert.equal(noPhase.lastLoggedPhase, 'main1');
  assert.equal(phaseHeaderText(null, null).header, null, 'brak zdarzenia nie może rzucić wyjątkiem');
});

test('B5/14: bramka nie rzuca wyjątków na zdarzeniach bez pól (odporność kontraktu)', () => {
  for (const e of [null, undefined, {}, { type: null }, { type: 'unknown_event' }]) {
    assert.equal(typeof isMainLogEvent(e, { botActing: false, phase: null, stackSize: 0 }), 'boolean',
      `bramka na ${JSON.stringify(e)} nie zwróciła booleana`);
  }
  assert.equal(gate({ type: 'unknown_event' }), false, 'nieznane zdarzenie ma być odrzucone, nie przepuszczone');
});
