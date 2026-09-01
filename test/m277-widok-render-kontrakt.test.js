import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addCounter } from '../src/engine/counters.js';

/**
 * M277 (kierunek 3 z handoffu M276) — kontrakt widok ↔ WARSTWA RENDERU.
 *
 * M274 (błąd #27) domknął kontrakt widok ↔ BOT dla grobu. Ten strażnik
 * zamyka drugą stronę: `cardInfo` w `src/table/render.js` czyta 43 pola
 * z wpisu widoku, a `playerView` część z nich dokłada WARUNKOWO (tylko gdy
 * cecha istnieje na obiekcie). Dopóki warunki po obu stronach są zgodne,
 * kafla nie da się odróżnić od poprawnego — luka ujawnia się dopiero na
 * karcie, która daną cechę ma (klasa L101/L102: jawna lista pól widoku).
 *
 * Test sprawdza IMPLIKACJĘ: jeśli obiekt na polu bitwy NIESIE cechę, to
 * wpis widoku też ją niesie. Nie wymaga obecności pól, których obiekt nie ma.
 */
const registry = createCardRegistry();

/** Cechy publiczne permanentu na polu bitwy, których render używa do opisu. */
const CECHY_PUBLICZNE = [
  'counters', 'keywords', 'subtypes', 'types', 'kind', 'power', 'toughness',
  'manaCost', 'tapped', 'colors',
];

function niepuste(wartosc) {
  if (wartosc == null) return false;
  if (Array.isArray(wartosc)) return wartosc.length > 0;
  if (typeof wartosc === 'object') return Object.keys(wartosc).length > 0;
  if (typeof wartosc === 'boolean') return wartosc;
  return true;
}

function stanZPermanentem(cardId, { liczniki = 0 } = {}) {
  const karta = registry.get(cardId);
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  addObject(state, {
    id: 'b1', instanceId: 'i1', cardId, controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', ...gameObjectDataOf(karta), types: karta.types,
  });
  if (liczniki > 0) addCounter(state, 'b1', '+1/+1', liczniki);
  return state;
}

test('widok pola bitwy niesie każdą cechę publiczną, którą ma permanent', () => {
  // Karty dobrane tak, by pokryć różne kształty danych (liczniki wejścia,
  // keywordy, podtypy) — nie po nazwie, tylko po tym, co niosą (ADR 0002).
  for (const cardId of ['gorehorn-minotaurs', 'servant-of-the-scale', 'kappa-tech-wrecker']) {
    const state = stanZPermanentem(cardId, { liczniki: 2 });
    const obiekt = state.objects.get('b1');
    const wpis = playerView(state, 'p1').zones.battlefield[0];
    for (const cecha of CECHY_PUBLICZNE) {
      if (!niepuste(obiekt[cecha])) continue;
      assert.ok(
        cecha in wpis,
        `${cardId}: permanent ma cechę \`${cecha}\`, a widok jej nie niesie — `
        + 'render (cardInfo) dostanie undefined (ADR 0017).',
      );
    }
  }
});

test('SKAN ŹRÓDEŁ: cardInfo nie czyta pola spoza kontraktu widoku', () => {
  // Odpowiednik skanu z M274, ale dla warstwy renderu. Lista pól, które
  // `cardInfo` czyta z wpisu, musi mieścić się w tym, co widok potrafi
  // wysłać — inaczej kafel cicho pokazuje „undefined" albo gubi badge.
  const src = fs.readFileSync('src/table/render.js', 'utf8');
  const od = src.indexOf('export function cardInfo(');
  assert.ok(od !== -1, 'cardInfo istnieje w render.js');
  let depth = 0;
  let i = od;
  let started = false;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '{') { depth += 1; started = true; } else if (ch === '}') {
      depth -= 1;
      if (started && depth === 0) { i += 1; break; }
    }
    i += 1;
  }
  const cialo = src.slice(od, i);
  const czytane = new Set([...cialo.matchAll(/\bobject\.([a-zA-Z_$][\w$]*)/g)].map((m) => m[1]));

  // Zbiór pól, jakie playerView REALNIE wysyła: budujemy kilka wpisów widoku
  // dla różnych kształtów permanentu i sumujemy klucze. Parsowanie źródła
  // `playerView` regexem nie wystarcza — część pól wchodzi spreadem
  // (`...(warunek ? { pole } : {})`), więc skan po tekście dawał fałszywe
  // braki dla pól, które w widoku są (counters, damage, toughness).
  const wysylane = new Set();
  for (const cardId of ['gorehorn-minotaurs', 'servant-of-the-scale', 'kappa-tech-wrecker']) {
    for (const liczniki of [0, 2]) {
      const state = stanZPermanentem(cardId, { liczniki });
      for (const strefa of ['battlefield', 'graveyard', 'exile', 'hand', 'stack']) {
        for (const wpisWidoku of playerView(state, 'p1').zones[strefa] ?? []) {
          for (const klucz of Object.keys(wpisWidoku)) wysylane.add(klucz);
        }
      }
    }
  }
  // Pola dokładane wyłącznie przez mechaniki spoza tej próbki (aura/equipment,
  // saga, kopie, efekty tymczasowe) — widok ustawia je warunkowo tam, gdzie
  // występują. Trzymamy je na jawnej liście, żeby skan nie milczał o pomyłce
  // literowej w NOWYM polu (L113: wyjątek z powodu, nie ciche wyciszenie).
  const WARUNKOWE_SPOZA_PROBKI = new Set([
    'attachedTo', 'aura', 'equipment', 'bestow', 'saga', 'spell', 'name',
    'copyNumber', 'faceDown', 'ward', 'protection', 'detained', 'goaded',
    'saddled', 'untapLocked', 'dontUntapNextUntapStep', 'tempControlUntilEOT',
    'cantBeBlocked', 'cantBlock', 'cantBlockPrinted', 'cantBeRegeneratedThisTurn',
    'grantedKeywords', 'grantedPower', 'grantedToughness', 'lostKeywordsUntilEOT',
    'entersWithCounters', 'subtypes', 'keywords', 'counters',
  ]);

  const poza = [...czytane]
    .filter((pole) => !wysylane.has(pole) && !WARUNKOWE_SPOZA_PROBKI.has(pole))
    .sort();
  assert.deepEqual(
    poza, [],
    'cardInfo czyta z wpisu widoku pola, których playerView nigdzie nie ustawia: '
    + `${poza.join(', ')}. Albo dołóż je do widoku (jeśli to informacja `
    + 'publiczna, ADR 0017), albo usuń martwy odczyt z renderu.',
  );
});

test('mgła wojny: zakryty permanent przeciwnika nie ujawnia cech karty (CR 708.2)', () => {
  // Kontrola negatywna dla obu testów wyżej — kontrakt „widok niesie wszystko"
  // nie może przebić Fog of War.
  const state = stanZPermanentem('gorehorn-minotaurs');
  const obiekt = state.objects.get('b1');
  state.objects.set('b1', Object.freeze({ ...obiekt, faceDown: true, controllerId: 'p2' }));
  const wpis = playerView(state, 'p1').zones.battlefield[0];
  assert.equal(wpis.cardId ?? null, null, 'zakryta karta przeciwnika bez cardId');
  assert.equal(wpis.manaCost, undefined, 'bez kosztu many (CR 708.2)');
});
