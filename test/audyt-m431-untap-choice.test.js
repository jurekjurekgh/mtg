// =============================================================================
// M431 (uwaga z gry A, właściciel 2026-09-25) — „You may choose not to untap"
// musi być DECYZJĄ GRACZA w kroku odkręcania, nie heurystyką silnika.
//
// Zgłoszenie: „Entrancing Lyre: You may choose not to untap this artifact
// during your untap step. (…) kontroler musi w panelu «Twoje działania» dostać
// ofertę o odtapowaniu artefaktu; wybór = odtapowanie lir i zwolnienie stwora,
// «Dalej (Pass)» = lira zostaje tapnięta i stwór też."
//
// STAN PRZED (sonda na żywym silniku; linia 80 planu 2026-09-25a):
//  * definicja liry w `card-data.js` NIE miała deskryptora wyboru — tylko
//    {X},{T} → tap_permanent + lock_untap (zakodowane pół Oracle: zdanie
//    „You may choose not to untap…" było w `oracleText`, ale nic go nie czytało);
//  * decyzję podejmował SILNIK: `permanents.js:isActiveLockSource`
//    deterministycznie zostawiał lirę w tapie, gdy kogoś blokuje (własny
//    komentarz: „zawsze wybieramy «nie odkręcaj»");
//  * oferta kontrolera w upkeep = TYLKO `concede` + `pass_priority`.
// To niezgodne z CR 502.3 i z ADR 0022 (status „supported" = 100% Oracle).
//
// PODSTAWA REGUŁOWA — dosłownie z lustra CR w repo (ADR 0030; numer tylko z
// tekstu, nigdy z pamięci):
//  * CR 502.3: „Third, the active player determines which permanents they
//    control will untap. Then they untap them all simultaneously. This turn-based
//    action doesn't use the stack. Normally, all of a player's permanents untap,
//    but effects can keep one or more of them from untapping."
//    ⇒ wybór jest CZĘŚCIĄ akcji turowej, a nie aktywacją ani triggerem;
//  * CR 502.4: „No player receives priority during the untap step, so no spells
//    can be cast or resolve and no abilities can be activated or resolve. Any
//    ability that triggers during this step will be held until the next time a
//    player would receive priority, which is usually during the upkeep step."
//    ⇒ decyzja nie może dać okna na czary (dlatego `abilities.js:553` zostaje),
//      a triggery z odkręcania muszą czekać do upkeepu;
//  * CR 502.4: krok bez okna priorytetu kończy się po wykonaniu WSZYSTKICH
//    akcji turowych ⇒ po wyborze gramy dalej te same akcje (beginTurn → upkeep).
//
// PROJEKT (plan 2026-09-25a, etap A): deskryptor `untapChoice` na obiekcie →
// `state.pendingUntapChoice = {playerId, candidateIds}` ZANIM cokolwiek z
// `beginTurn` (dzień/noc CR 502.2 idzie PRZED decyzją) → komenda
// `resolve_untap_choice {keepTappedIds}` walidowana tym samym predykatem,
// który wystawia oferty (L48) → kontynuacja startu tury.
//
// STRAŻNIK: testy A2/A3/A5 czerwienieją, jeśli ktoś przywróci heurystykę
// „lira nie odkręca się, bo blokuje" zamiast wyboru gracza.
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createGameState, playerView, addObject, execute } from '../src/engine/game-state.js';
import { initializeResources, addMana, beginTurn } from '../src/engine/resources.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf, setupCardMatch } from '../src/cards/materialize.js';
import { stateFingerprint } from '../src/engine/fingerprint.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { createAggroBot } from '../src/controllers/aggro-bot.js';

const REGISTRY = createCardRegistry();
const LYRE = 'entrancing-lyre';

const setFlag = (state, id, patch) => state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));

/**
 * Stół: p1 ma 8 Plains + Lirę (tapniętą), p2 ma 3/3 tapniętą i zablokowaną
 * (`untapLockedBy: ['lyre']`). Runda passów p2 → p1 otwiera nową turę p1,
 * czyli exactly początek kroku odkręcania (CR 502.1–502.3).
 */
function stolLyry({ lyreTapped = true, kandydat = true, extra = [] } = {}) {
  const state = createGameState({ players: [{ id: 'p1' }, { id: 'p2' }], registry: REGISTRY, seed: 41 });
  initializeResources(state);
  // Biblioteki NIE są puste: dobieranie w kroku draw przy pustej bibliotece
  // kończy partię (CR 704.5b), a wtedy „pass odrzucony: game_over" maskowałoby
  // to, co test mierzy (L5 pkt 2: pomiar ma nie zależeć od przypadków brzegowych).
  for (const pid of ['p1', 'p2']) {
    for (let i = 0; i < 12; i += 1) {
      addObject(state, {
        id: `lib-${pid}-${i}`, instanceId: `lib-${pid}-${i}-i`, cardId: 'plains',
        controllerId: pid, ownerId: pid, zone: 'library', kind: 'land', power: 0, toughness: 0,
        types: ['Land'], subtypes: ['Plains'], keywords: [], abilities: [], colors: ['W'], manaCost: 0,
      });
    }
  }
  // P1 jest nieaktywny, P2 na końcu swojej tury (krok `end`) — pełna runda
  // passów domyka turę i uruchamia START TURY p1 (CR 502.1–502.3).
  state.turn.number = 3;
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  state.turn = jumpToStep(state.turn, 'end', 'p2');
  for (let i = 0; i < 8; i += 1) {
    addObject(state, {
      id: `land${i}`, instanceId: `land${i}-i`, cardId: 'plains', controllerId: 'p1', ownerId: 'p1',
      zone: 'battlefield', kind: 'land', power: 0, toughness: 0, types: ['Land'], subtypes: ['Plains'],
      keywords: [], abilities: [], colors: ['W'], manaCost: 0,
    });
  }
  const lyre = REGISTRY.get(LYRE);
  addObject(state, {
    id: 'lyre', instanceId: 'lyre-i', cardId: LYRE, controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'artifact', types: lyre.types, manaCost: lyre.manaCost,
    colors: [], keywords: [], abilities: lyre.abilities,
  });
  setFlag(state, 'lyre', { tapped: lyreTapped, untapChoice: kandydat });
  addObject(state, {
    id: 'prey', instanceId: 'prey-i', cardId: 'synthetic-prey', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'creature', power: 3, toughness: 3, types: ['Creature'],
    keywords: [], abilities: [], colors: ['R'], manaCost: 3,
  });
  setFlag(state, 'prey', {
    tapped: true, summoningSickness: false, untapLockedBy: ['lyre'],
    untapLockVersions: { lyre: state.objects.get('lyre').untapVersion ?? 0 },
  });
  for (const e of extra) {
    addObject(state, {
      id: e.id, instanceId: `${e.id}-i`, cardId: e.cardId ?? 'synthetic-x',
      controllerId: e.controllerId ?? 'p1', ownerId: e.controllerId ?? 'p1',
      zone: 'battlefield', kind: e.kind ?? 'artifact', power: e.power ?? 0, toughness: e.toughness ?? 0,
      types: e.types ?? ['Artifact'], keywords: [], abilities: [], colors: [], manaCost: 0,
    });
    setFlag(state, e.id, { tapped: e.tapped !== false, untapChoice: e.untapChoice !== false });
  }
  return state;
}

/**
 * Prowadzi graczę do PROGU nowej tury (koniec cleanupu →untap krok). Wymaga
 * PEŁNEJ rundy passów (dwa `pass_priority`) — pojedynczy pass tylko oddaje
 * priorytet (CR 117.3b/117.4). Asercja, żeby pomiar nie był „ciche przejście" (L5).
 */
function doStartuTury(state, aktywny = 'p2') {
  const przed = state.turn.number;
  for (let i = 0; i < 6 && state.turn.number === przed; i += 1) {
    const pid = state.turn.priorityPlayerId ?? aktywny;
    const r = execute(state, { type: 'pass_priority', playerId: pid });
    assert.equal(r.ok, true, `pass ${pid} odrzucony: ${JSON.stringify(r.events?.[0]?.reason ?? r)}`);
  }
  assert.notEqual(state.turn.number, przed,
    'harness: tura MUSI ruszyć (inaczej test mierzy pustkę — L5 pkt 2)');
  assert.equal(state.turn.activePlayerId, 'p1', 'nowa tura ma być turą p1 (właściciela liry)');
}

const decyzje = (state, playerId = 'p1') => (playerView(state, playerId).legalCommands ?? [])
  .filter((c) => c.type === 'resolve_untap_choice');
/** Opcja „odtapuj wszystko" (pusty zbiór keepTappedIds). */
const opcjaPass = (state) => decyzje(state).find((c) => (c.keepTappedIds ?? []).length === 0);
/** Opcja „zostaw w tapie" podane permanenty. */
const opcjaKeep = (state, ids) => decyzje(state).find((c) => [...(c.keepTappedIds ?? [])].sort().join('|') === [...ids].sort().join('|'));

test('A1 — deskryptor przechodzi CAŁĄ ścieżkę danych: rejestr → materialize → installDecks → obiekt (L21/M379)', () => {
  const def = REGISTRY.get(LYRE);
  assert.equal(def.untapChoice, true,
    'karta musi nosić deskryptor wyboru — nie wolno rozpoznawać liry po id ani po nazwie (ADR 0002)');
  assert.equal(gameObjectDataOf(def).untapChoice, true,
    '`gameObjectDataOf` musi przekazać deskryptor na obiekt (gałęzie kopiują pola ręcznie — klasa M161/O1)');
  // Prawdziwy łańcuch (setupCardMatch → createCardDeck → setupGame → installDeck):
  // tak samo jak strażnik m379, żeby test NIE mierzył helpera (L21).
  const state = setupCardMatch({
    seed: 3,
    players: [{ id: 'p1' }, { id: 'p2' }],
    decks: new Map([
      ['p1', [LYRE, 'basic-plains', 'basic-plains', 'basic-plains', 'basic-plains',
        'basic-plains', 'basic-plains', 'basic-plains', 'basic-plains', 'basic-plains']],
      ['p2', ['basic-plains', 'basic-plains', 'basic-plains', 'basic-plains', 'basic-plains',
        'basic-plains', 'basic-plains', 'basic-plains', 'basic-plains', 'basic-plains']],
    ]),
    registry: REGISTRY,
    openingHandSize: 1, // lira zostaje w bibliotece — sprawdzamy obiekt po installDeck
  });
  const wGrze = [...state.objects.values()].find((o) => o.cardId === LYRE);
  assert.ok(wGrze, 'lira weszła do gry (deck zainstalowany)');
  assert.equal(wGrze.untapChoice, true,
    'po `installDecks` obiekt MUSI nieść deskryptor — tam jest DRUGA, niezależna lista pól (tak zginął `offspring`, M379)');
});

test('A1b — permanent BEZ klauzuli nie może być trzymany w tapie przez silnik (CR 502.3 — decyduje gracz, nie heurystyka)', () => {
  // Zmierzony stan PRZED: `permanents.js:isActiveLockSource` zostawiał w tapie
  // KAŻDY tapnięty permanent, który jest źródłem aktywnej blokady — czyli
  // silnik podejmował decyzję „nie odkręcaj\" za gracza. To był błąd: nawet
  // gdy karta faktycznie kogoś blokuje, a NIE ma klauzuli wyboru (np. aura
  // „as long as\" bez „you may\"), krok odkręcania musi ją odkręcić.
  const state = stolLyry({ kandydat: false });
  assert.deepEqual(state.objects.get('prey').untapLockedBy, ['lyre'],
    'scenariusz mierzalny: źródło blokady jest tapnięte i kogoś trzyma');
  doStartuTury(state);
  assert.equal(state.objects.get('lyre').tapped, false,
    'brak deskryptora = brak wyboru = odkręcamy (CR 502.3: „normally, all of a player\'s permanents untap\")');
  assert.equal(state.objects.get('prey').tapped, true,
    'cel zostaje tapnięty w TYM kroku (zbiór odkręceń liczony przed odkręcaniem) — blokada wygaśnie w kolejnym');
});

test('A2 — brak kandydata = brak decyzji: permanent bez klauzuli odkręca się normalnie', () => {
  const state = stolLyry({ kandydat: false });
  doStartuTury(state);
  assert.equal(state.pendingUntapChoice ?? null, null,
    'decyzja wystawiana WYŁĄCZNIE gdy jest kandydat (plan E3) — przy każdej turze byłby podatek od klikania');
  assert.equal(state.objects.get('lyre').tapped, false,
    'bez klauzuli wyboru permanent odkręca się jak każdy inny (CR 502.3: „normally, all of a player\'s permanents untap")');
  // Druga noga: kandydat JEST, ale nikt go nie blokuje — wybór nadal istnieje
  // (to gracz decyduje, nie silnik; oszczędność many {T} bywa taktyczna).
  const zKandydatem = stolLyry();
  doStartuTury(zKandydatem);
  assert.ok(zKandydatem.pendingUntapChoice, 'kandydat = tapnięty permanent z deskryptorem, niezależnie od tego, czy blokuje');
  assert.deepEqual(zKandydatem.pendingUntapChoice.candidateIds, ['lyre']);
});

test('A3 — kandydat jest: decyzja wisi, a WSZYSTKIE inne komendy są odrzucone', () => {
  const state = stolLyry();
  doStartuTury(state);
  const p = state.pendingUntapChoice;
  assert.ok(p, 'tapnięta lira z klauzulą MUSI wystawić decyzję kontrolera w kroku odkręcania (CR 502.3)');
  assert.equal(p.playerId, 'p1', 'decyzję podejmuje kontroler permanentu (CR 502.3: „the active player determines which permanents THEY control")');
  assert.equal(state.turn.step, 'untap',
    'krok się NIE kończy, dopóki akcja turowa wisi (CR 502.4) — inaczej upkeep odpaliłby triggery przed decyzją');
  for (const typ of ['play_land', 'activate_ability', 'cast_permanent', 'declare_attackers']) {
    const re = execute(state, { type: typ, playerId: 'p1', objectId: 'land0', cardId: LYRE, index: 0, attackerIds: [] });
    assert.equal(re.ok, false, `${typ} nie może ominąć czekającej decyzji o odkręcaniu`);
    assert.equal(re.events?.[0]?.reason, 'untap_choice_unresolved',
      `${typ}: komunikat odmowy musi nazywać przyczynę (wzorzec mulligan_unresolved)`);
  }
  // Poddać się wolno zawsze — wzorzec wszystkich bramek blokujących (concede).
  const reConcede = execute(state, { type: 'concede', playerId: 'p1' });
  assert.equal(reConcede.ok, true, 'concede nie może być blokowany czekającą decyzją');
});

test('A4 — oferta = walidacja (L48): „odtapuj wszystkie" + podzbiory, bez duplikatów i nie-kandydatów', () => {
  const state = stolLyry();
  doStartuTury(state);
  const oferty = decyzje(state);
  assert.ok(oferty.length >= 2,
    `co najmniej dwie opcje: „odtapuj wszystkie" i „zostaw tapnięte" (dostałem ${oferty.length})`);
  assert.ok(opcjaPass(state), 'musi być opcja „odtapuj wszystkie" = pusty zbiór (pełny standard CR 502.3)');
  assert.ok(opcjaKeep(state, ['lyre']), 'musi być opcja „zostaw lirę w tapie" — cała treść klauzuli Oracle');
  for (const zly of [
    { keepTappedIds: ['nie-ma-takiego'] },
    { keepTappedIds: ['lyre', 'lyre'] },
    { keepTappedIds: ['prey'] },   // nie mój permanent
    { keepTappedIds: ['land0'] },  // kandydat bez klauzuli
  ]) {
    const re = execute(state, { type: 'resolve_untap_choice', playerId: 'p1', ...zly });
    assert.equal(re.ok, false, `${JSON.stringify(zly)} nie jest legalnym wyborem — oferta i walidacja tym samym predykatem`);
  }
  const reObcy = execute(state, { type: 'resolve_untap_choice', playerId: 'p2', keepTappedIds: [] });
  assert.equal(reObcy.ok, false, 'cudzej decyzji o odkręcaniu nie podejmuje przeciwnik');
  // Po rozstrzygnięciu ta sama komenda jest nielegalna (brak decyzji) i nie
  // wolno jej drugi raz ruszyć stanu — odcisk MUSI zostać nietknięty.
  assert.equal(execute(state, opcjaPass(state)).ok, true);
  const odciskPo = stateFingerprint(state);
  const rePo = execute(state, { type: 'resolve_untap_choice', playerId: 'p1', keepTappedIds: [] });
  assert.equal(rePo.ok, false, 'rozstrzygnięta decyzja nie może zostać odgrzebana');
  assert.equal(stateFingerprint(state), odciskPo,
    'odrzucona komenda nie może mutaować stanu (te same prawa co przy innych bramkach)');
});

test('A5 — konsekwencje obu wyborów (jądro uwagi właściciela)', () => {
  // (a) Odmowa = odtapuj wszystko: lira wstaje. Cel pozostaje tapnięty, bo
  //     CR 502.3 liczy zbiór odkręceń PRZED samym odkręcaniem („determines
  //     which permanents they control will untap. Then they untap them all
  //     simultaneously") — nie dlatego, że silnik coś zostawił w tapie.
  const a = stolLyry();
  doStartuTury(a);
  const ra = execute(a, opcjaPass(a));
  assert.equal(ra.ok, true, JSON.stringify(ra.events?.[0]?.reason ?? ra));
  assert.equal(a.objects.get('lyre').tapped, false, 'wybór „odtapuj" MUSI odkręcić lirę (przed naprawą decyzję podejmował silnik)');
  assert.equal(a.objects.get('prey').tapped, true, 'cel nie wstaje w tym kroku (blokada liczona ze stanu PRZED odkręceniem)');
  assert.equal(a.pendingUntapChoice ?? null, null, 'decyzja zdjęta po rozstrzygnięciu');
  assert.equal(a.turn.step, 'upkeep', `po wyborze gra JEDZIE DALEJ (CR 502.4), krok=${a.turn.step} — inaczej wybór jest ślepą uliczką`);
  // (b) Zgoda = zostaw w tapie: blokada przeżywa, cel nie wstaje także w SWOIM
  //     kroku odkręcania (następna tura p2).
  const b = stolLyry();
  doStartuTury(b);
  const rb = execute(b, opcjaKeep(b, ['lyre']));
  assert.equal(rb.ok, true, JSON.stringify(rb.events?.[0]?.reason ?? rb));
  assert.equal(b.objects.get('lyre').tapped, true, 'lira zostaje tapnięta NA ŻĄDANIE GRACZA');
  // Start tury p2 ( jej krok odkręcania) — wzorzec istniejącego pinu
  // `test/choroba-przywolania-zablokowany-untap.test.js`: `beginTurn` wprost,
  // bez żonglowania dobieraniem (pusta/obca biblioteka skończyłaby partię i
  // maskowała miarę, L5 pkt 2).
  b.turn.number += 1;
  b.turn = jumpToStep(b.turn, 'untap', 'p2');
  b.turn = { ...b.turn, activePlayerId: 'p2' };
  beginTurn(b, 'p2');
  assert.equal(b.objects.get('prey').tapped, true,
    'zablokowany cel NIE odkręca się w swoim kroku, dopóki źródło zostaje w tapie (Oracle liry)');
  // A po odkręceniu źródła (następny wybór p1 = „odtapuj") blokada gaśnie.
  b.pendingUntapChoice = null;
  beginTurn(b, 'p1');
  assert.equal(b.objects.get('lyre').tapped, false, 'kolejny krok odkręcania p1 odkręca lirę (decyzja: odtapuj wszystko)');
  b.turn.number += 1;
  b.turn = jumpToStep(b.turn, 'untap', 'p2');
  b.turn = { ...b.turn, activePlayerId: 'p2' };
  beginTurn(b, 'p2');
  assert.equal(b.objects.get('prey').tapped, false,
    'skoro źródło jest odkręcone, blokada nie trzyma — cel wstaje w kolejnym kroku (CR 611.2: „for as long as…" liczone w momencie odkręcania)');
});

test('A6 — widok i priorytet (ADR 0003/0017): właściciel dostaje decyzję, przeciwnik nie', () => {
  const state = stolLyry();
  doStartuTury(state);
  assert.equal(state.turn.priorityPlayerId, 'p1', 'priorytet jest u właściciela decyzji');
  const v = playerView(state, 'p1');
  assert.ok(v.pendingUntapChoice, 'widok NIESIE decyzję — bez tego UI nie ma czego pokazać (L24)');
  assert.deepEqual(v.pendingUntapChoice.candidateIds, ['lyre'], 'widok musi nieść kandydatów');
  assert.equal(v.legalCommands.filter((c) => c.type === 'resolve_untap_choice').length, decyzje(state).length,
    'kompletność widoku: oferty widoku == decyzje silnika');
  const vObcy = playerView(state, 'p2');
  assert.equal(vObcy.legalCommands.filter((c) => c.type === 'resolve_untap_choice').length, 0,
    'przeciwnik nie podejmuje cudzej decyzji');
});

test('A7 — fingerprint: stan z czekającą decyzją ma INNY odcisk niż bez niej (L16, L102 pkt 3)', () => {
  const state = stolLyry();
  doStartuTury(state);
  const z = stateFingerprint(state);
  state.pendingUntapChoice = null;
  assert.notEqual(z, stateFingerprint(state),
    'pole decyzji MUSI wejść do odcisku — inaczej weryfikacja replayów nie odróżnia „czeka" od „nie czeka"');
});

test('A8 — determinizm i cap ofert (L19/L151): 40 kandydatów ≠ 2^40 opcji', () => {
  const kandydaci = Array.from({ length: 40 }, (_, i) => ({ id: `x${i}` }));
  const state = stolLyry({ extra: kandydaci });
  doStartuTury(state);
  assert.equal(state.pendingUntapChoice.candidateIds.length, 41,
    'kandydaci: lira + 40 doklejonych (wszyscy tapnięci, wszyscy z klauzulą)');
  const oferty = decyzje(state);
  assert.ok(oferty.length > 1 && oferty.length <= 32,
    `liczba ofert ograniczona capem (dostałem ${oferty.length})`);
  const klucze = oferty.map((c) => [...(c.keepTappedIds ?? [])].sort().join('|'));
  assert.equal(new Set(klucze).size, klucze.length, 'oferty nie mogą się powtarzać (kanoniczny klucz zbioru, L151)');
  assert.ok(oferty.length === new Set(oferty.map((c) => JSON.stringify(c.keepTappedIds))).size);
});

test('A9 — bot ocenia OBA kierunki (bez tego decyzja jest atrapą, L131/L169)', () => {
  const zBlokada = stolLyry();
  doStartuTury(zBlokada);
  const bot = createHeuristicBot({ seed: 5 });
  const komenda = bot.chooseCommand(playerView(zBlokada, 'p1'));
  assert.equal(komenda.type, 'resolve_untap_choice', 'bot musi rozwiązać decyzję kroku odkręcania');
  const wpis = bot.trace().at(-1);
  assert.ok(wpis.options.length >= 2, 'drzewo bota musi widzieć obie opcje');
  assert.ok(new Set(wpis.options.map((o) => o.score)).size > 1,
    `wycena MUSI różnicować „zostaw w tapie" od „odtapuj" — inaczej wybór zapada kolejnością enumeracji (L169): ${JSON.stringify(wpis.options)}`);
  assert.ok((komenda.keepTappedIds ?? []).includes('lyre'),
    'gdy lira trzyma wrogi stwór, sensowny wybór to „zostaw tapnięte" (utrzymanie blokady ma wartość)');

  // Ten sam stół bez blokady — brak argumentu za trzymaniem liry w tapie.
  const bezBlokady = stolLyry();
  setFlag(bezBlokady, 'prey', { untapLockedBy: [], untapLockVersions: null });
  doStartuTury(bezBlokady);
  const bot2 = createHeuristicBot({ seed: 5 });
  const k2 = bot2.chooseCommand(playerView(bezBlokady, 'p1'));
  assert.equal((k2.keepTappedIds ?? []).length, 0,
    `bez zablokowanych celów lira się odkręca: ${JSON.stringify(k2)}`);
});

test('A10 — triggery „na odkręcenie" czekają do upkeepu (CR 502.4), a nie przed decyzją', () => {
  // Miara: zdarzenia startu tury MUSZĄ pojawić się po rozstrzygnięciu wyboru,
  // nie przed nim — a kolejność w strumieniu to [turn_started, object_untapped…,
  // step_advanced(upkeep)], bez `ability_triggered` w kroku untap.
  const state = stolLyry();
  doStartuTury(state);
  const przed = state.events.map((e) => e.type);
  assert.ok(!przed.includes('step_advanced') || przed.lastIndexOf('step_advanced') < state.events.length,
    'w stanie czekającym nie ma kroku upkeep');
  const upkeepPrzed = przed.filter((t, i) => t === 'step_advanced' && state.events[i].step === 'upkeep');
  assert.equal(upkeepPrzed.length, 0, 'upkeep NIE może nastąpić przed decyzją o odkręcaniu');
  const r = execute(state, opcjaPass(state));
  const typy = r.events.map((e) => e.type);
  assert.ok(typy.includes('turn_started'), `start tury idzie razem z kontynuacją (dostałem ${typy.join(', ')})`);
  assert.ok(typy.includes('object_untapped'), 'odkręcenie jest ZDARZENIEM (L24: skutek bez zdarzenia nie istnieje dla logu i UI)');
  assert.ok(typy.includes('step_advanced'), 'gra weszła w upkeep');
  const idxUntap = typy.lastIndexOf('object_untapped');
  const idxUpkeep = typy.lastIndexOf('step_advanced');
  assert.ok(idxUntap >= 0 && idxUntap < idxUpkeep, 'kolejność CR 502.3 → 503.1: odkręcenie PRZED upkeepiem');
});

test('A11 — aggro nie podejmuje decyzji „kolejnością ofert" i nie wiesza się (CR 502.3)', () => {
  // Dwa kandydaty: lira (trzyma wroga) i bezpański artefakt. Enumeracja idzie
  // porządkiem kanonicznym, więc „pierwszy wariant" to NIE to samo co „dobry
  // wariant" (L169) — aggro musi JAWNIE brać „odtapuj wszystkie".
  const state = stolLyry({ extra: [{ id: 'luźny', kind: 'artifact' }] });
  doStartuTury(state);
  assert.deepEqual(state.pendingUntapChoice.candidateIds, ['luźny', 'lyre'], // porządek kanoniczny (sort()) — nie wydrukowy
    'harness: dwaj kandydaci (inaczej miara nie odróżnia „pierwszy" od „dobry")');
  const warianty = (playerView(state, 'p1').legalCommands ?? [])
    .filter((c) => c.type === 'resolve_untap_choice');
  assert.ok(warianty.length >= 3, `enumeracja podzbiorów: ${warianty.length} wariantów`);

  const aggro = createAggroBot();
  const r1 = aggro.chooseCommand(playerView(state, 'p1'));
  assert.equal(r1.type, 'resolve_untap_choice', 'aggro musi rozstrzygnąć decyzję (inaczej partia wisi — wzorzec F12)');
  assert.deepEqual(r1.keepTappedIds, [], 'aggro odkręca wszystko: jego źródła mają atakować i płacić {T}');
  assert.equal(execute(state, r1).ok, true, 'wybór aggro musi być legalny dla silnika');
  assert.equal(state.pendingUntapChoice, null);
  assert.equal(state.objects.get('lyre').tapped, false, 'lira wstała');
  assert.equal(state.objects.get('luźny').tapped, false, 'drugi kandydat też');

  // Ten sam stół dla bota heurystycznego: warianty MUSZĄ mieć różną cenę, a
  // wygrywa ten, który trzyma ONLY źródło z realną blokadą (nie „pierwszy").
  const state2 = stolLyry({ extra: [{ id: 'luźny', kind: 'artifact' }] });
  doStartuTury(state2);
  const bot = createHeuristicBot({ seed: 5 });
  const r2 = bot.chooseCommand(playerView(state2, 'p1'));
  assert.deepEqual([...(r2.keepTappedIds ?? [])].sort(), ['lyre'],
    `bot zostawia w tapie wyłącznie źródło z blokadą: ${JSON.stringify(r2)}`);
});

test('A12 — E2-lite: para źródeł, porządek kanoniczny i „decyduje TYLKO kontroler źródła"', () => {
  // Dwa egzemplarze klauzuli na stole (u tego samego gracza) + wróg trzymany
  // przez jedno z nich. Miary: (1) enumeracja jest SORTOWANA, nie kolejnością
  // wstawiania (ADR 0005), (2) odtapowanie WSZYSTKICH źródeł uwalnia cel,
  // (3) gracz, który NIE ma kandydata, nie dostaje żadnej decyzji.
  const buduj = () => {
    const s = stolLyry({ extra: [{ id: 'lyre2', kind: 'artifact' }] });
    // drugi egzemplarz też coś trzyma — inaczej „zostaw oba" nie ma sensu
    setFlag(s, 'prey', { untapLockedBy: ['lyre', 'lyre2'] });
    return s;
  };
  const a = buduj();
  doStartuTury(a);
  assert.deepEqual(a.pendingUntapChoice.candidateIds, ['lyre', 'lyre2'],
    'kandydaci w porządku kanonicznym (sort), nie kolejnością strefy (L19/L151)');
  const warianty = (playerView(a, 'p2').legalCommands ?? []).filter((c) => c.type === 'resolve_untap_choice');
  assert.equal(warianty.length, 0, 'przeciwnik NIE dostaje decyzji o cudzych permanentach (CR 502.3)');
  // „Zostaw tylko drugie źródło" — pierwsze wstaje, więc jego blokada gaśnie,
  // ale trzyma drugie: cel nadal tapnięty (reguła 611.2, nie heurystyka).
  assert.equal(execute(a, {
    type: 'resolve_untap_choice', playerId: 'p1', keepTappedIds: ['lyre2'],
  }).ok, true);
  assert.equal(a.objects.get('lyre').tapped, false);
  assert.equal(a.objects.get('lyre2').tapped, true);
  a.turn.number += 1;
  a.turn = jumpToStep(a.turn, 'untap', 'p2');
  a.turn = { ...a.turn, activePlayerId: 'p2' };
  beginTurn(a, 'p2');
  assert.equal(a.objects.get('prey').tapped, true,
    'jedno źródło nadal tapnięte → blokada żyje, cel nie wstaje');
  // Trzeci krok p1: `beginTurn` BEZ `keepTappedIds` to dokladnie 'odtapuj
  // wszystkie' (pusty wybor = ten sam, co po `pass_priority`). Skok sterowany,
  // nie petla passow: pelna tura p2 wymagaby walki i dobierania, a to nie jest
  // przedmiotem tej miary (L5 pkt 2).
  assert.equal(a.pendingUntapChoice, null, 'rozstrzygnieta decyzja nie wisi w stanie');
  a.turn.number += 1;
  a.turn = jumpToStep(a.turn, 'untap', 'p1');
  a.turn = { ...a.turn, activePlayerId: 'p1' };
  beginTurn(a, 'p1');
  a.turn.number += 1;
  a.turn = jumpToStep(a.turn, 'untap', 'p2');
  a.turn = { ...a.turn, activePlayerId: 'p2' };
  beginTurn(a, 'p2');
  assert.equal(a.objects.get('prey').tapped, false,
    'żadne źródło nie jest już tapnięte → cel wstaje (Oracle: „for as long as… remains tapped")');

  // Determinizm: dwa identyczne przebiegi (ta sama sekwencja wyborów) dają
  // IDENTYCZNY odcisk, a odcisk z pozostawionym źródłem różni się od „odtapuj".
  const przebieg = (keep) => {
    const s = buduj();
    doStartuTury(s);
    execute(s, { type: 'resolve_untap_choice', playerId: 'p1', keepTappedIds: keep });
    return stateFingerprint(s);
  };
  assert.equal(przebieg([]), przebieg([]), 'ten sam wybór ⇒ ten sam odcisk (ADR 0005)');
  assert.notEqual(przebieg(['lyre']), przebieg([]),
    'inny wybór ⇒ inny odcisk (decyzja nie może być stanem niewidzialnym dla hashu)');
});
