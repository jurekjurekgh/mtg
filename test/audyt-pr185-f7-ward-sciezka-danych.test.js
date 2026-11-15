// Audyt PR #185, F-7 (Etap E2.7) — `ward {2}` z katalogu nie docierało na obiekt
// gry: mechanika działała WYŁĄCZNIE z twardego fallbacku `object.ward ?? 2`.
//
// Pomiar audytu (sonda .arena/probe4-batch73.mjs §A, stan 5df0e96): obiekt po
// `installDeck` miał `ward = null`, `keywords = ["ward"]`, a `wardAmountOf`
// zwracał 2 z fallbacku; `addObject` przy próbie podania pola zgłaszał
// „pole spoza kontraktu (ginie po cichu — L21): ward". Zachowanie end-to-end
// było poprawne TYLKO dlatego, że drukowana kwota Leonin Lightbringer wynosi 2.
// Pomiar uzupełniający (2026-11-15, ten plik): pole ginęło już w `defineCard`
// (rejestr zwracał `ward: undefined`), więc brakowało nie jednego, a CZTERECH
// dowiązań ścieżki danych (L84): rejestr → `gameObjectDataOf` → `installDeck`
// → kontrakt `addObject`. Każda przyszła karta z ward {1} albo {3} dostałaby po
// cichu kwotę 2 (klasa M379/L21).
//
// Reguła (CR 2026-11-06, dosłowny tekst 702.21a): „Ward is a triggered ability.
// Ward [cost] means ‘Whenever this permanent becomes the target of a spell or
// ability an opponent controls, counter that spell or ability unless that player
// pays [cost].'" — kwota jest CZĘŚCIĄ mechaniki, więc musi podróżować z danymi,
// a nie być zgadywana (ADR 0002: generycznie po deskryptorach).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { defineCard } from '../src/cards/registry.js';
import { gameObjectDataOf, createCardDeck, setupCardMatch } from '../src/cards/materialize.js';
import { addObject, createGameState, playerView, addObjectContractStats } from '../src/engine/game-state.js';
import { wardAmountOf, effectiveKeywords } from '../src/engine/permanents.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();
const LEONIN = 'leonin-lightbringer';
const pula = (n, id) => Array(n).fill(id);

/** Prawdziwy łańcuch: setupCardMatch → createCardDeck → setupGame → installDeck. */
function stolZLeoninem(seed = 7) {
  return setupCardMatch({
    seed,
    players: [{ id: 'p1' }, { id: 'p2' }],
    decks: new Map([
      ['p1', [LEONIN, ...pula(9, 'basic-plains')]],
      ['p2', pula(10, 'basic-plains')],
    ]),
    registry: REGISTRY,
    openingHandSize: 1, // Leonin zostaje w bibliotece — mierzymy obiekt po installDeck
  });
}

test('F-7/1: kwota ward przechodzi CAŁĄ ścieżkę danych (rejestr → materialize → talia → installDeck → obiekt)', () => {
  const def = REGISTRY.get(LEONIN);
  assert.equal(def.ward, 2, 'rejestr niesie drukowaną kwotę (dziś `defineCard` gubił pole)');
  assert.deepEqual(def.keywords, ['ward'], 'keyword ward z Oracle');
  assert.equal(gameObjectDataOf(def).ward, 2,
    '`gameObjectDataOf` kopiuje kwotę (gałęzie kopiują pola ręcznie — klasa M161/O1/Z5)');
  const [entry] = createCardDeck({ cardIds: [LEONIN], ownerId: 'p1', registry: REGISTRY });
  assert.equal(entry.ward, 2, 'wpis talii z `createCardDeck` niesie kwotę');

  const state = stolZLeoninem();
  const wGrze = [...state.objects.values()].find((o) => o.cardId === LEONIN);
  assert.ok(wGrze, 'Leonin wszedł do gry (deck zainstalowany)');
  assert.equal(wGrze.ward, 2,
    'po `installDeck` obiekt MUSI nieść kwotę — `deck.js` ma DRUGĄ, niezależną listę pól (tak zginął `offspring`, M379)');
  assert.equal(wardAmountOf(wGrze, state), 2, 'silnik czyta kwotę z obiektu');
});

test('F-7/2: `wardAmountOf` nie zgaduje kwoty — brak pola oznacza brak warda (koniec fallbacku `?? 2`)', () => {
  const state = createGameState({ seed: 11, players: [{ id: 'p1' }, { id: 'p2' }] });
  // Obiekt z keywordem, ale BEZ kwoty: przed naprawą dostawał 2 z fallbacku,
  // czyli reguła „ward = 2" była zaszyta w silniku zamiast w danych karty.
  addObject(state, {
    id: 'bez-kwoty', instanceId: 'i-bez-kwoty', cardId: LEONIN, controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'creature', power: 3, toughness: 2,
    types: ['Creature'], subtypes: ['Cat', 'Rebel'], keywords: ['ward'], abilities: [],
  });
  const obiekt = state.objects.get('bez-kwoty');
  assert.equal(obiekt.ward, null, 'domyślnie brak kwoty');
  assert.ok(effectiveKeywords(obiekt, state).includes('ward'), 'keyword jest (warunek konieczny warda)');
  assert.equal(wardAmountOf(obiekt, state), null,
    'bez kwoty nie ma warda — fallback `?? 2` maskował dziurę w ścieżce danych (F-7)');

  // Ten sam obiekt Z kwotą działa — czyli czyta pole, nie stałą.
  state.objects.set('bez-kwoty', Object.freeze({ ...obiekt, ward: 3 }));
  assert.equal(wardAmountOf(state.objects.get('bez-kwoty'), state), 3, 'kwota 3 jest kwotą 3 (nie 2)');
});

test('F-7/3: `defineCard` wymaga kwoty przy keywordie `ward` (CR 702.21a — „Ward [cost]")', () => {
  const baza = {
    id: 'ward-bez-kwoty', name: 'Ward Bez Kwoty', set: null, types: ['Creature'], subtypes: ['Cat'],
    colors: ['W'], manaCost: 1, power: 1, toughness: 1, oracleText: 'Ward', plan: null,
    support: { status: 'supported', limitations: [] },
  };
  assert.throws(() => defineCard({ ...baza, keywords: ['ward'] }), /ward/i,
    'keyword bez kwoty = martwy deskryptor (L21) — lepiej rzucić niż zgadywać 2');
  assert.throws(() => defineCard({ ...baza, keywords: [], ward: 2 }), /ward/i,
    'kwota bez keywordu = pole bez desygnatu (wardAmountOf wymaga keywordu)');
  assert.throws(() => defineCard({ ...baza, keywords: ['ward'], ward: 0 }), /ward/i,
    'ward {0} nie jest kosztem (CR 702.21a)');
  assert.throws(() => defineCard({ ...baza, keywords: ['ward'], ward: 2.5 }), /ward/i,
    'kwota musi być liczbą całkowitą');
  const ok = defineCard({ ...baza, keywords: ['ward'], ward: 2 });
  assert.equal(ok.ward, 2, 'poprawny wpis przechodzi i niesie kwotę');
});

test('F-7/4: PlayerView niesie kwotę warda — render i bot czytają widok, nie stałą (ADR 0017)', () => {
  const state = createGameState({ seed: 13, players: [{ id: 'p1' }, { id: 'p2' }] });
  const [entry] = createCardDeck({ cardIds: [LEONIN], ownerId: 'p1', registry: REGISTRY });
  const { id: _id, instanceId: _i, cardId, ownerId: _o, controllerId: _c, zone: _z, ...payload } = entry;
  addObject(state, {
    id: 'leonin', instanceId: 'i-leonin', cardId, controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', ...payload,
  });
  for (const widz of ['p1', 'p2']) {
    const wpis = playerView(state, widz).zones.battlefield.find((o) => o.id === 'leonin');
    assert.equal(wpis?.ward, 2, `widok ${widz} niesie kwotę warda (jawna informacja, M258/F3)`);
    assert.ok((wpis?.keywords ?? []).includes('ward'), `widok ${widz} niesie keyword`);
  }
});

test('F-7/5: kontrakt `addObject` zna pole `ward` (bez ostrzeżenia „pole spoza kontraktu")', () => {
  const state = createGameState({ seed: 17, players: [{ id: 'p1' }, { id: 'p2' }] });
  addObject(state, {
    id: 'ward-3', instanceId: 'i-ward-3', cardId: LEONIN, controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'creature', power: 3, toughness: 2, types: ['Creature'],
    subtypes: ['Cat'], keywords: ['ward'], abilities: [], ward: 3,
  });
  assert.equal(state.objects.get('ward-3').ward, 3, 'pole przeżyło fabrykę obiektu');
  assert.equal(wardAmountOf(state.objects.get('ward-3'), state), 3);
  // Pomiar audytu: `addObject` zgłaszał „pole spoza kontraktu (ginie po cichu —
  // L21): ward". Licznik ostrzeżeń jest współdzielony w procesie, więc asercja
  // obejmuje też `installDeck` z F-7/1 (druga lista pól w `deck.js`).
  assert.equal(addObjectContractStats.fields.has('ward'), false,
    'pole `ward` jest w kontrakcie ADD_OBJECT_FIELDS — nic nie ginie po cichu');
});

// ---------------------------------------------------------------------------
// F-7, część bota: `wardTargetTax` miał DRUGĄ, niezależną kopię reguły „ward = 2"
// (`o.ward ?? (keywords.includes('ward') ? 2 : null)`). Kwota podatku musi iść
// z PlayerView (`entry.ward`, ADR 0017 — bot czyta widok, nie reguły z głowy),
// więc jedna wartość, jedno źródło (L41). Scena = wzór z test/m320-bot-ward-cele.
// ---------------------------------------------------------------------------

function botScena({ botSwamps, wrog }) {
  const state = createGameState({ seed: 700 + botSwamps, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  const wstaw = (id, cardId, controllerId, zone, extra = {}) => {
    const def = REGISTRY.get(cardId);
    assert.ok(def, `karta ${cardId} w rejestrze`);
    addObject(state, {
      id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
      ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
      subtypes: def.subtypes ?? [], spell: def.spell, ...extra,
    });
    return state.objects.get(id);
  };
  for (let i = 0; i < botSwamps; i += 1) wstaw(`sw${i}`, 'basic-swamp', 'p2', 'battlefield');
  wstaw('cel', 'goblin-piker', 'p1', 'battlefield', {
    power: 5, toughness: 5, manaCost: 6, summoningSickness: false, ...wrog,
  });
  wstaw('rekaw', 'expunge', 'p2', 'hand'); // {2}{B}: zniszcz nieczarnego stwora
  return { state, choice: createHeuristicBot({ seed: 700 + botSwamps }).chooseCommand(playerView(state, 'p2'), {}) };
}

/** Wrogi stwór 5/5 za 6 z ward o kwocie `kwota` (null = keyword bez kwoty). */
const wrogZ = (kwota) => ({
  keywords: ['ward'],
  ...(kwota == null ? { ward: null } : { ward: kwota }),
});

test('F-7/6: podatek ward bota idzie z KWOTY w widoku — ward {4} wymaga 4 man zapasu (CR 702.21a)', () => {
  // 5 bagien: koszt Expunge {2}{B} = 3, zapas 2. Ward {4} jest nie do
  // zapłacenia → wariant fiknie (tax 200) i bot nie rzuca. Twarda „2" w bocie
  // uznałaby dopłatę za możliwą i rzuciła czar wprost w kontrę.
  const skap = botScena({ botSwamps: 5, wrog: wrogZ(4) });
  assert.notEqual(skap.choice.type, 'cast_spell',
    `bot nie rzuca w ward {4} z zapasem 2 man: ${JSON.stringify(skap.choice)}`);
  // Kontrola dodatnia: 7 bagien = zapas 4 → dopłata realna, rzut się opłaca.
  const bogaty = botScena({ botSwamps: 7, wrog: wrogZ(4) });
  assert.equal(bogaty.choice.type, 'cast_spell',
    `z zapasem 4 bot rzuca w ward {4}: ${JSON.stringify(bogaty.choice)}`);
  assert.deepEqual(bogaty.choice.targets, ['cel'], 'cel = stwór z ward {4}');
});

test('F-7/7: bot NIE zgaduje kwoty z keywordu — brak kwoty to brak podatku (L41)', () => {
  // Kształt, którego `defineCard` dziś nie przepuszcza (F-7/3), ale który
  // cloaki/disguise budują jawnie z kwotą: keyword + pole. Bot ma czytać POLE,
  // a nie podstawiać 2 z keywordu — inaczej druga kopia reguły żyje (L41).
  const { choice } = botScena({ botSwamps: 3, wrog: wrogZ(null) });
  assert.equal(choice.type, 'cast_spell',
    `brak kwoty = brak podatku, bot rzuca: ${JSON.stringify(choice)}`);
  // Kontrola: ta sama scena z ward {2} (3 bagna = dokładnie koszt czaru, zapas 0)
  // → dopłata niemożliwa → bot nie rzuca (M320/A).
  const zKwota = botScena({ botSwamps: 3, wrog: wrogZ(2) });
  assert.notEqual(zKwota.choice.type, 'cast_spell',
    `z kwotą {2} i zerowym zapasem bot nie rzuca: ${JSON.stringify(zKwota.choice)}`);
});

test('F-7/8: kwota ward jest kopiowana w KAŻDEJ gałęzi `gameObjectDataOf` (klasa Z5/L21)', () => {
  // `gameObjectDataOf` buduje dane obiektu RĘCZNIE dla każdego rodzaju
  // permanentu — pole pominięte w jednej gałęzi ginie po cichu i mechanika jest
  // martwa dla tego typu karty (tak zginęły echo/surge/toxic/offspring, M379).
  // Dziś katalog ma ward wyłącznie na stworze (Leonin Lightbringer), więc pin
  // obejmuje wszystkie rodzaje syntetycznymi wpisami z `defineCard`.
  const support = { status: 'supported', limitations: [] };
  const wspólne = { set: null, oracleText: 'Ward {3}', plan: null, support, keywords: ['ward'], ward: 3 };
  const rodzaje = [
    ['land', { id: 'f7-land', name: 'F7 Land', types: ['Land'] }],
    ['artifact', { id: 'f7-art', name: 'F7 Art', types: ['Artifact'], manaCost: 2 }],
    ['vehicle', { id: 'f7-veh', name: 'F7 Veh', types: ['Artifact'], subtypes: ['Vehicle'], manaCost: 3, power: 4, toughness: 4, crew: 2 }],
    ['enchantment', { id: 'f7-ench', name: 'F7 Ench', types: ['Enchantment'], manaCost: 2 }],
    ['aura', { id: 'f7-aura', name: 'F7 Aura', types: ['Enchantment'], subtypes: ['Aura'], manaCost: 2, aura: { enchant: 'creature' } }],
    ['planeswalker', { id: 'f7-pw', name: 'F7 PW', types: ['Planeswalker'], manaCost: 4, loyalty: 4, abilities: [] }],
    ['creature', { id: 'f7-cr', name: 'F7 Cr', types: ['Creature'], subtypes: ['Cat'], manaCost: 2, power: 2, toughness: 2 }],
  ];
  for (const [nazwa, spec] of rodzaje) {
    const def = defineCard({ ...wspólne, ...spec });
    assert.equal(def.ward, 3, `${nazwa}: rejestr niesie kwotę`);
    const dane = gameObjectDataOf(def);
    assert.equal(dane.ward, 3, `${nazwa}: gałąź ${dane.kind} kopiuje kwotę warda (F-7)`);
    // Keywordy niesie osobno ścieżka talii (`deck.js` — patrz F-7/1); gałąź
    // landu w ogóle ich nie kopiuje, więc tu mierzymy tylko kwotę.
  }
});
