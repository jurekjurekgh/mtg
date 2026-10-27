// Batch 70 / E5 — CZTERY DOWIĄZANIA nowych deskryptorów (L84) sprawdzone
// na ŚCIEŻCE PRODUKCYJNEJ, nie na samych danych:
//   (a) log zdarzenia (`describeGameEvent`) nazywa skutek prewencji licznikowej,
//   (b) kafel (`cardInfo`/`rulesText`) nazywa mechanikę PL, bez surowych slugów
//       i bez placeholderów („? obrażeń", „cel: stwór ×2"),
//   (c) strażnik KLASOWY: każda karta katalogu z deskryptorem płacenia przez
//       tapowanie (improvise/convoke) ma linię na kaflu — nowa karta nie może
//       odziedziczyć ciszy (M138/#11),
//   (d) `gameObjectDataOf` + `installDeck` niosą `xCost` na obiekt gry.
//
// Reguły: CR 615.1a (efekt zastępujący), CR 601.2c (cel warunkowany kosztem
// dodatkowym), CR 115.4 („another target"), CR 702.126a (improvise),
// CR 107.3a (X). Źródło CR: `rules/cr-raw.txt`, CR 2026-09-25
// (sha256 8d860e45…). Rulings kart: `docs/cards/scryfall-*.json`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cardInfo, rulesText } from '../src/table/render.js';
import { describeGameEvent } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { installDecks } from '../src/engine/deck.js';
import { createCardDeck } from '../src/cards/materialize.js';
import { createGameState } from '../src/engine/game-state.js';

const REGISTRY = createCardRegistry();

/** Sesja-stub: tylko to, czego `cardInfo` potrzebuje dla kafla w ręce. */
function stubSession() {
  return {
    cardDetails: (cardId) => REGISTRY.get(cardId) ?? null,
    colorsOf: (cardId) => REGISTRY.get(cardId)?.colors ?? [],
    nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? cardId,
    nameOfObject: () => '',
    nameOrdinalSuffix: () => '',
    view: () => ({ zones: { battlefield: [] } }),
    state: null,
  };
}

function tileOf(cardId) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `${cardId} jest w rejestrze`);
  const object = {
    id: `obj-${cardId}`, cardId, zone: 'hand',
    controllerId: 'p1', ownerId: 'p1', types: def.types, subtypes: def.subtypes ?? [],
    keywords: def.keywords ?? [],
  };
  return rulesText(cardInfo(stubSession(), object));
}

test('B70/E5 log: prewencja przez zdjęcie liczników jest opisana (CR 615.1a)', () => {
  const helpers = {
    nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? cardId,
    nameOfObject: () => 'Magma Pummeler',
  };
  const opis = describeGameEvent({
    type: 'damage_prevented',
    objectId: 'o1', cardId: 'magma-pummeler', amount: 3,
    countersRemoved: 2, counterRemoval: true, counterName: '+1/+1',
  }, helpers);
  assert.match(opis, /zapobiegnięte/);
  assert.match(opis, /zdjęto 2 licznik/i, `log nie mówi o zdjętych licznikach: ${opis}`);
  assert.match(opis, /\+1\/\+1/, `log nie nazywa licznika: ${opis}`);
  assert.doesNotMatch(opis, /zapobiegnięte \(prewencja\)$/,
    'wariant licznikowy nie może wpaść w ogólne „(prewencja)"');
});

test('B70/E5 kafel: Magma Pummeler nazywa prewencję i kwotę z kontekstu', () => {
  const tekst = tileOf('magma-pummeler');
  assert.match(tekst, /zdejmij licznik \+1\/\+1/, `brak opisu prewencji: ${tekst}`);
  assert.match(tekst, /tyle obrażeń, ile zdjęto liczników/,
    `refleksyjny trigger bez kwoty („? obrażeń"): ${tekst}`);
  assert.doesNotMatch(tekst, /\? obrażeń/, 'placeholder nie może trafić na kafel');
});

test('B70/E5 kafel: Jilt — cel kickerowy jest warunkowy, nie „×2"', () => {
  const tekst = tileOf('jilt');
  assert.match(tekst, /jeśli opłacono kicker: [^·]*obrażenia/i,
    `obrażenia nie są oznaczone jako warunkowane kickerem: ${tekst}`);
  assert.match(tekst, /jeśli kopnięty: stwór \(inny\)/,
    `drugi cel nie jest opisany jako „inny" i warunkowy: ${tekst}`);
  assert.doesNotMatch(tekst, /stwór ×2/, 'dwa cele obowiązkowe to kłamstwo bez kickera');
});

test('B70/E5 kafel: Kaleidoscorch (Converge) bez surowego sluga', () => {
  const tekst = tileOf('kaleidoscorch');
  assert.match(tekst, /kolorów many wydano na rzut/, `brak brzmienia Converge: ${tekst}`);
  assert.doesNotMatch(tekst, /colors_of_mana_spent|_mana_|snake_case/,
    `na kaflu został identyfikator z danych: ${tekst}`);
});

test('B70/E5 kafel: Moldgraf Millipede mówi, skąd bierze się liczba liczników', () => {
  const tekst = tileOf('moldgraf-millipede');
  assert.match(tekst, /za każdą kartę typu stwór w twoim cmentarzu/, tekst);
});

test('B70/E5 kafel: Orazca Puzzle-Door — koszt „poświęć TO", nie „poświęć:"', () => {
  const tekst = tileOf('orazca-puzzle-door');
  assert.match(tekst, /\{1\}, \{T\}, poświęć to:/, `koszt bez dopełnienia: ${tekst}`);
});

test('B70/E5 kafel: Trigon of Rage — symbole many tworzą jeden ciąg', () => {
  const tekst = tileOf('trigon-of-rage');
  assert.match(tekst, /\{R\}\{R\}, \{T\}:/, `pipy rozdzielone przecinkiem: ${tekst}`);
  assert.doesNotMatch(tekst, /\{R\}, \{R\}/, 'przecinek między pipami sugeruje dwa koszty');
});

test('B70/E5 strażnik klasowy: każda karta z improvise/convoke ma linię na kaflu', () => {
  const karty = REGISTRY.all().filter((def) => def.improvise || def.convoke);
  assert.ok(karty.length >= 2, `klasa nie jest pusta (dziś Fen Hauler + Kavu Primarch): ${karty.length}`);
  for (const def of karty) {
    const tekst = rulesText(def);
    assert.match(tekst, def.improvise ? /Improvise/ : /Convoke/,
      `${def.name}: deskryptor płacenia kosztu jest niemy na kaflu („${tekst}")`);
  }
});

test('B70/E5 kafel: Magma Pummeler na polu bitwy też niesie linię prewencji', () => {
  // Widok permanentu: zdolności przychodzą z obiektu gry (materializacja),
  // a nie z definicji karty — inna ścieżka niż kafel w ręce (L21/L84).
  const def = REGISTRY.get('magma-pummeler');
  const object = {
    id: 'obj-perm', cardId: 'magma-pummeler', zone: 'battlefield',
    controllerId: 'p1', ownerId: 'p1', types: def.types, subtypes: def.subtypes ?? [],
    keywords: [], power: 0, toughness: 0, counters: { '+1/+1': 2 },
    abilities: gameObjectDataOf(def).abilities,
  };
  const tekst = rulesText(cardInfo(stubSession(), object));
  assert.match(tekst, /zdejmij licznik \+1\/\+1/, `permanent bez opisu prewencji: ${tekst}`);
});

test('B70/E5 gameObjectDataOf + installDeck: xCost dochodzi na obiekt gry', () => {
  const def = REGISTRY.get('magma-pummeler');
  assert.deepEqual(gameObjectDataOf(def).xCost, { cap: 15 },
    'gameObjectDataOf gubi deskryptor xCost (L21)');
  const state = createGameState({ seed: 4, players: [{ id: 'p1' }, { id: 'p2' }] });
  installDecks(state, new Map([
    ['p1', createCardDeck({
      cardIds: [...Array(20).fill('basic-mountain'), 'magma-pummeler'], ownerId: 'p1', registry: REGISTRY,
    })],
    ['p2', createCardDeck({ cardIds: Array(20).fill('basic-island'), ownerId: 'p2', registry: REGISTRY })],
  ]), 4);
  const obiekt = [...state.objects.values()].find((o) => o.cardId === 'magma-pummeler');
  assert.ok(obiekt, 'karta trafiła do stanu gry');
  assert.deepEqual(obiekt.xCost, { cap: 15 },
    'installDeck ma WŁASNĄ listę pól — bez wpisu xCost obiekt gry ma null (M379)');
});
