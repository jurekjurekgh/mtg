// M122-rodzina (PR #98 / sesja arena/01a071d1): strażnik pokrycia etykiet
// warunków triggerów. Wspólny helper `triggerConditionClause` (render.js) liczy
// klauzulę intervening-if (CR 603.4) dla gałęzi dies/ETB/attacks/end_step;
// strona czasu dla upkeep (eachUpkeep / enchantedPlayerUpkeep /
// enchantedPermanentControllerUpkeep) jest obsługiwana osobno w gałęzi upkeep.
//
// Klasa błędu (L29/L31): nowa karta z trigger-condition, którego helper NIE
// zna, dostaje na kaflu ucięty warunek — gracz widzi „Gdy ta karta umrze:
// zniszcz cel" zamiast „(gdy opłacono kicker)". Test wymusza, by KAŻDY klucz
// `condition` użyty na triggerze w katalogu był reprezentowany w helperze.
//
// Mutacja: usunięcie jednej gałęzi `if (cond.xxx)` z triggerConditionClause
// musi czerwienić ten test (nowa karta z tym kluczem przestaje być pokryta).
import { createCardRegistry } from '../src/cards/card-data.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RENDER = resolve(__dirname, '../src/table/render.js');

// Klucze condition obsługiwane wspólnie przez triggerConditionClause.
function handledConditionKeys() {
  const src = readFileSync(RENDER, 'utf8');
  return new Set([...src.matchAll(/\bcond\.([A-Za-z][A-Za-z0-9]*)/g)].map((m) => m[1]));
}

// Strona czasu w gałęzi upkeep (NIE warunek intervening-if, tylko „czyj upkeep").
const UPKEEP_TIME_SIDE = new Set([
  'eachUpkeep',
  'enchantedPlayerUpkeep',
  'enchantedPermanentControllerUpkeep',
]);

// Wyjątki celowe: klucz obsługiwany gdzie indziej niż helper.
// - anotherOpponentExists: karta nieaktywna w 1v1 (exterminator-magmarch),
//   describeTriggered zwraca wczesny „Wymaga drugiego przeciwnika".
const INTENTIONAL_EXCEPTIONS = {
  anotherOpponentExists:
    'karta wymaga drugiego przeciwnika — wczesny return w describeTriggered (1v1)',
};

test('każdy klucz condition na triggerze katalogu jest obsłużony na kaflu', () => {
  const handled = handledConditionKeys();
  const reg = createCardRegistry();
  const uncovered = []; // { key, cards }

  for (const card of reg.all()) {
    for (const ab of card.abilities ?? []) {
      if (!ab.trigger || !ab.trigger.condition) continue;
      for (const key of Object.keys(ab.trigger.condition)) {
        const covered =
          handled.has(key) || UPKEEP_TIME_SIDE.has(key) || key in INTENTIONAL_EXCEPTIONS;
        if (!covered) uncovered.push({ key, id: card.id });
      }
    }
  }

  assert.deepEqual(
    uncovered,
    [],
    `Niepokryte klucze condition triggerów (dopisz gałąź w triggerConditionClause ` +
      `lub wyjątek celowy):\n` +
      uncovered.map((u) => `  ${u.key} (${u.id})`).join('\n'),
  );
});

test('helper triggerConditionClause zna klucze użyte przez realne triggery (strażnik kierunku)', () => {
  // Przeciwwaga L5: strażnik mierzy REGUŁĘ, nie tylko że plik niepusty.
  // Jeśli helper NIE czyta ani jednego klucza użytego w katalogu, test pada.
  const reg = createCardRegistry();
  const used = new Set();
  for (const card of reg.all()) {
    for (const ab of card.abilities ?? []) {
      if (ab.trigger?.condition) for (const k of Object.keys(ab.trigger.condition)) used.add(k);
    }
  }
  const handled = handledConditionKeys();
  const liveKeys = [...used].filter((k) => !UPKEEP_TIME_SIDE.has(k) && !(k in INTENTIONAL_EXCEPTIONS));
  assert.ok(liveKeys.length > 0, 'katalog nie używa żadnego condition na triggerze?');
  for (const k of liveKeys) {
    assert.ok(handled.has(k), `helper nie czyta klucza trigger-condition używanego w katalogu: ${k}`);
  }
});
