// M385 (znalezisko #3 wyzwania „srebrna odznaka", ADR 0030): changeling
// przechodził kwalifikator PODTYPÓW nie-stworzych w szukaniu w bibliotece.
//
// Źródła online (dostęp 2026-09-18):
//  • CR 702.73a (MagicCompRules 2026-08-19, efektywne 2026-08-07;
//    https://media.wizards.com/2026/downloads/MagicCompRules%2020260819.txt,
//    chunk 68): „Changeling is a characteristic-defining ability. »Changeling«
//    means »This object is every creature type.« This ability works
//    everywhere, even outside the game."
//  • CR 205.3i (ten sam dokument, chunk 20): „Lands have their own unique set
//    of subtypes; these subtypes are called land types. The land types are
//    Cave, Desert, Forest, Gate, Island, Lair, Locus, Mine, Mountain, Plains,
//    Planet, Power-Plant, Sphere, Swamp, Tower, Town, and Urza's. Of that
//    list, Forest, Island, Mountain, Plains, and Swamp are the basic land
//    types."
//  • CR 205.3m: lista TYPÓW STWORÓW (Plains, Mountain i Swamp na niej NIE
//    występują) — „These subtypes are called creature types".
//  • Scryfall Kor Cartographer (Oracle: „When this creature enters, you may
//    search your library for a Plains card, put it onto the battlefield
//    tapped, then shuffle."; rulings WotC: puste).
//  • Scryfall Call the Mountain Chocobo (Oracle: „Search your library for a
//    Mountain card, reveal it, put it into your hand, then shuffle. …";
//    rulings 2025-06-06 dotyczą wyłącznie flashbacku).
//  • Scryfall Gloomfang Mauler (Oracle: „Swampcycling {2} ({2}, Discard this
//    card: Search your library for a Swamp card, reveal it, put it into your
//    hand, then shuffle.) …"; rulings 2023-04-14 dotyczą backupu).
//  • mtg.wiki/Changeling (cytat CR + Lorwyn Rules Primer): changeling działa
//    we WSZYSTKICH strefach, ale wyłącznie na typy STWORÓW („reveal a Merfolk
//    card … return a Goblin card … gain control of a Goat").
//
// Stan przed M385: `librarySearchMatches` dopasowywało `qualifier.subtypes`
// przez `hasCreatureType`, a ta funkcja rozszerza dopasowanie o changeling
// (słusznie — dla typów stworów). Podtypy lądów (Plains/Mountain/Swamp) szły
// więc TĄ SAMĄ ścieżką, więc changeling w bibliotece był oferowany jako
// „Plains card" / „Mountain card" / „Swamp card". Martwa kopia tej samej
// reguły (`matchesCyclingQualifier`) powtarzała błąd.
//
// Piny: (A) changeling NIE pasuje na podtypy nie-stworze (lądy, artefakty,
// enchantmenty), a pasuje na TYPY STWORÓW (nowy klucz `creatureTypes`),
// (B) kontrola predykatu (podtypy czytane z linii typów), (C) end-to-end
// Kor Cartographer — oferta szukania bez changelinga, ląd trafia na pole
// tapnięty, (D) end-to-end typecycling (Swampcycling, ścieżka spells.js),
// (E) end-to-end Call the Mountain Chocobo (Mountain card).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createCardDeck } from '../src/cards/materialize.js';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { librarySearchMatches } from '../src/engine/effects.js';
import { jumpToStep } from '../src/engine/turn.js';

const REGISTRY = createCardRegistry();
const CHANGELING = 'barkform-harvester'; // changeling (keyword) — Shapeshifter

/** Kładzie kartę w strefie (bez pola `objectId` z createCardDeck — L21). */
function place(state, id, cardId, playerId, zone) {
  const { objectId, ...entry } = createCardDeck({ cardIds: [cardId], ownerId: playerId, registry: REGISTRY })[0];
  addObject(state, {
    ...entry, id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId, zone,
  });
}

function scenario(seed, cards, libraries = {}) {
  const state = createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = 7;
  state.pendingMulligans = [];
  for (const pid of ['p1', 'p2']) for (let i = 0; i < 8; i += 1) place(state, `lib-${pid}-${i}`, 'basic-forest', pid, 'library');
  for (const [id, cardId, zone] of cards) place(state, id, cardId, 'p1', zone);
  for (const [id, cardId] of libraries.p1 ?? []) place(state, id, cardId, 'p1', 'library');
  return state;
}

/** Rozstrzyga stos (passy) aż do spokoju albo decyzji szukania. */
function resolveStack(state, limit = 20) {
  for (let i = 0; i < limit; i += 1) {
    if (state.zones.stack.length === 0) break;
    const pass = playerView(state, state.turn.priorityPlayerId).legalCommands
      .find((command) => command.type === 'pass_priority');
    if (!pass) break;
    execute(state, pass);
  }
}

/** Rzuca czar z ręki (bez celów) i rozstrzyga stos. */
function castFromHand(state, objectId) {
  const command = playerView(state, 'p1').legalCommands
    .find((c) => c.objectId === objectId && String(c.type).startsWith('cast'));
  assert.ok(command, `oferta rzutu ${objectId}`);
  const result = execute(state, { ...command });
  assert.equal(result.ok, true, `rzut ${objectId} przyjęty`);
  resolveStack(state);
}

/** Kandydaci oczekującej decyzji szukania (cardId w kolejności biblioteki). */
const candidates = (state) => (state.pendingSearchChoice?.candidateIds ?? [])
  .map((id) => state.objects.get(id)?.cardId);

test('M385/A: changeling to typy STWORÓW, nie podtypy lądów/artefaktów (CR 702.73a)', () => {
  const state = scenario(385, [[CHANGELING, CHANGELING, 'library']]);
  const goyf = { ...state.objects.get(CHANGELING), zone: 'library', controllerId: 'p1' };
  // CR 205.3i: Plains/Mountain/Swamp to typy lądów; CR 205.3g/h: Equipment/
  // Saga to typy artefaktów/enchantmentów — changeling ich NIE daje.
  for (const subtype of ['Plains', 'Mountain', 'Swamp', 'Equipment', 'Saga', 'Aura']) {
    assert.equal(librarySearchMatches(goyf, { subtypes: [subtype] }, 'p1'), false,
      `changeling nie jest kartą podtypu ${subtype}`);
  }
  // CR 702.73a: „every creature type" — tu changeling pasuje (nowy klucz).
  assert.equal(librarySearchMatches(goyf, { creatureTypes: ['Giant'] }, 'p1'), true,
    'changeling jest każdym typem stwora');
  assert.equal(librarySearchMatches(goyf, { creatureTypes: ['Sliver', 'Scout'] }, 'p1'), true,
    'changeling pasuje do każdego typu stwora z listy');
});

test('M385/B: kontrola predykatu — podtypy czytane z linii typów, typy z listy', () => {
  const state = scenario(386, [
    ['p-plains', 'basic-plains', 'library'],
    ['p-grange', 'idyllic-grange', 'library'],   // nie-basic, ale z podtypem Plains
    ['p-mountain', 'basic-mountain', 'library'],
    ['p-game', 'highland-game', 'library'],      // zwykły stwór (bez changelinga)
  ]);
  const obj = (id) => ({ ...state.objects.get(id), zone: 'library', controllerId: 'p1' });
  assert.equal(librarySearchMatches(obj('p-plains'), { subtypes: ['Plains'] }, 'p1'), true);
  assert.equal(librarySearchMatches(obj('p-grange'), { subtypes: ['Plains'] }, 'p1'), true,
    'nie-basic ląd z podtypem Plains JEST kartą Plains');
  assert.equal(librarySearchMatches(obj('p-mountain'), { subtypes: ['Plains'] }, 'p1'), false);
  assert.equal(librarySearchMatches(obj('p-game'), { subtypes: ['Plains'] }, 'p1'), false,
    'zwykły stwór nie jest kartą Plains');
  assert.equal(librarySearchMatches(obj('p-game'), { creatureTypes: ['Giant'] }, 'p1'), false,
    'brak typu stwora = brak dopasowania');
  assert.equal(librarySearchMatches(obj('p-plains'), { types: ['Basic', 'Land'] }, 'p1'), true,
    'kontrola: zwykły kwalifikator typów bez zmian');
});

test('M385/C: Kor Cartographer — oferta szukania bez changelinga („Plains card")', () => {
  const state = scenario(387,
    [['kor', 'kor-cartographer', 'hand']],
    { p1: [['lib-plains', 'basic-plains'], ['lib-grange', 'idyllic-grange'], ['lib-change', CHANGELING]] });
  addMana(state, 'p1', 4, { colors: ['W'] });
  castFromHand(state, 'kor');
  assert.deepEqual(candidates(state), ['basic-plains', 'idyllic-grange'],
    'kandydaci = karty z podtypem Plains (changeling odpada)');
  // Wybór lądu: wchodzi na pole TAPNIĘTY (Oracle), a changeling nie jest ofertą.
  const offer = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'resolve_search_choice' && c.found === 'lib-grange');
  assert.ok(offer, 'Idyllic Grange jest w ofercie wyboru');
  assert.equal(execute(state, offer).ok, true);
  // Ruch stref tworzy NOWY obiekt (CR 400.7) — szukamy po cardId, nie po id.
  const grange = [...state.objects.values()]
    .find((object) => object.cardId === 'idyllic-grange' && object.zone === 'battlefield');
  assert.ok(grange, 'Idyllic Grange weszła na pole bitwy');
  assert.equal(grange.tapped, true, 'wchodzi tapnięty');
  assert.equal(state.objects.get('lib-change').zone, 'library', 'changeling zostaje w bibliotece');
});

test('M385/D: typecycling (Swampcycling) — szukanie bez changelinga (ścieżka spells.js)', () => {
  const state = scenario(388,
    [['mauler', 'gloomfang-mauler', 'hand']],
    { p1: [['lib-swamp', 'basic-swamp'], ['lib-change', CHANGELING]] });
  addMana(state, 'p1', 2, { colors: ['B'] });
  const cycling = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'mauler');
  assert.ok(cycling, 'cycling z ręki jest oferowany');
  assert.equal(execute(state, { ...cycling }).ok, true);
  resolveStack(state);
  assert.deepEqual(candidates(state), ['basic-swamp'],
    'Swampcycling znajduje tylko kartę z podtypem Swamp');
});

test('M385/E: Call the Mountain Chocobo — „Mountain card" bez changelinga', () => {
  const state = scenario(389,
    [['choco', 'call-the-mountain-chocobo', 'hand']],
    { p1: [['lib-mountain', 'basic-mountain'], ['lib-change', CHANGELING]] });
  addMana(state, 'p1', 4, { colors: ['R'] });
  castFromHand(state, 'choco');
  assert.deepEqual(candidates(state), ['basic-mountain'],
    'kandydat = karta z podtypem Mountain (changeling odpada)');
  assert.equal(state.objects.get('lib-change').zone, 'library');
});
