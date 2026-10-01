// =============================================================================
// PMSSB-32 — produkcja many (`add_mana`): KIEDY aktywacja źródła many ma sens
//
// Zlecenie właściciela (pętla manualnego strojenia scoringu): wybrać JEDNĄ
// rodzinę, zbadać przyczynowo-skutkowo kiedy efekt jest taktycznie najsilniejszy
// (faza, czyja tura, stan stołu, ręka, zagrożenia) i tak ustawić wycenę, by
// premiowała momenty sensowne, a karała bezsensowne. Bez strojenia maszynowego.
//
// Rodzina: `add_mana` — 25 kart / 28 wystąpień, największa spoza rejestru
// PMSSB. Pomiar PRZED: /home/user/scratch/pmssb32-mana-przed.mjs (25 scenariuszy
// A–F; warianty różnią się WYŁĄCZNIE jedną zmienną). Findingi i fale —
// §PMSSB-32 w docs/PMSSB.md. Skrót reguł, które te piny zamrażają:
//
//  F1  próg LICZBOWY M128 nie widział kolorów: aktywacja Apprentice Wizarda
//      ({U},{T} → 3 bezbarwne) przy 3 Wyspach i karcie {3}{W} w ręce dostawała
//      +10 („odblokowanie” 3 → 5), choć brakuje pipa {W} — mana szła w błoto.
//      PO: próg liczbowy zastąpiony testem PŁATNOŚCI na jednostkach many
//      (kolory, {C}, pula ograniczona drukiem) — ta sama arytmetyka co
//      `matchColorRequirements` w silniku (L41).
//  F2  mana Powerstone'a (`spendOnly:artifact`) „odblokowywała” stwora (+6),
//      a mana ograniczona w PULI liczyła się jako dostępna. PO: −4 i pass.
//  F3  filtr koloru (Jeskai Devotee) nie dostawał żadnej premii (−8). Ale
//      silnik AUTO-PŁACI takie źródło przy rzucie (untappedCostedManaSources),
//      więc ręczna aktywacja nie jest potrzebna: oferta rzutu wygrywa (60).
//      PO: wymiar obsłużony przez L48 — bez osobnego pokrętła (byłoby martwe).
//  F4  `tapCreature` (Dragonbroods' Relic) wyceniano płasko (−3), więc 0/1
//      ściana i 4/4 atakujący mieli IDENTYCZNY wynik, a main1 = main2.
//      PO: dopłata za tracony ATAK (własna tura przed deklaracją) / BLOK
//      (cudza tura przed deklaracją blokujących); czujność i obrońca nic nie
//      tracą (CR 702.20b / 702.3b), po deklaracji tap jest darmowy.
//  F5  klasa L1: reguła E6/A1 (instant w cudzej turze) czytała `types` wpisu
//      ręki, a `playerView` go NIE wysyłał (`kind` czaru to zawsze 'spell')
//      → w produkcji była MARTWA. PO: linia typów w widoku ręki + wspólny
//      predykat `isInstantSpeedCard` (L41).
//  F6  bramka „chcę to rzucić” (źródła jednorazowe) pytała komendę BEZ CELÓW,
//      więc każdy czar z celem wypadał ujemnie (Shock bez celu −10, z celem
//      w 2/2 wroga 86) i Skarb NIGDY nie finansował removal/burna. PO: gdy
//      oferty silnika nie ma, bierzemy NAJLEPSZY cel z widoku.
//  L48 (fala A2) — „oferta = płatność”: jeśli silnik JUŻ oferuje rzut karty,
//      auto-płatność pokryje koszt bez tej aktywacji (lądy + źródła wolne
//      + źródła kosztowe) — aktywacja nic nie odblokowuje, premii nie ma.
//      To domyka M128 u źródła: tapowanie „na zapas” schodzi pod pass.
//
// Anty-over-fix (M429): najsłabszy realny wariant = wartość sprzed pętli
// (B1/B2/B6/A1/A2/A4/A5), nowe wymiary to DOPŁATY/KARY.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createCardDeck, gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

/** Stół: faza/kto aktywny/kto ma priorytet (bot gra p1). */
function stol({ step = 'main1', active = 'p1', priority = active } = {}) {
  const state = createGameState({ seed: 4242, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, active);
  state.turn.activePlayerId = active;
  state.turn.priorityPlayerId = priority;
  state.turn.number = 8;
  return state;
}

/**
 * Karta z rejestru na wskazanej strefie. Karty talii idą przez `createCardDeck`
 * (pełne dane: `types`, deskryptory), tokeny — jak silnik przy `create_token`:
 * deskryptor w OBIEKCIE, nie w card-data.
 */
function put(state, id, cardId, { controllerId = 'p1', zone = 'battlefield', ...extra } = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} istnieje w rejestrze`);
  let data;
  if (def.support?.status === 'supported') {
    const [wpis] = createCardDeck({ cardIds: [cardId], ownerId: controllerId, registry: REGISTRY });
    const { objectId, ...reszta } = wpis;
    data = reszta;
  } else {
    data = gameObjectDataOf(def);
    data.types = def.types ?? [];
    data.keywords = def.keywords ?? [];
    data.subtypes = def.subtypes ?? [];
  }
  addObject(state, { ...data, id, instanceId: `i-${id}`, cardId, controllerId, zone });
  if (zone === 'battlefield') {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false, ...extra }));
  }
  return id;
}

/** Ciało bez karty katalogu (P/T czytane przez wycenę tapnięcia ciała). */
function cialo(state, id, power, toughness, { controllerId = 'p1', ...extra } = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `x-${id}`, controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 3, abilities: [], keywords: extra.keywords ?? [],
    subtypes: [], types: ['Creature'], colors: [], cardName: id,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false, ...extra }));
  return id;
}

/** Decyzja bota (p1) + wyniki ofert po etykiecie śladu. */
function opcje(state, { params, playerId = 'p1' } = {}) {
  const bot = createHeuristicBot({ seed: 3, ...(params ? { params } : {}) });
  const wybrany = bot.chooseCommand(playerView(state, playerId));
  const wszystkie = bot.trace().at(-1)?.options ?? [];
  return {
    wybrany,
    wybrane: bot.trace().at(-1)?.chosen,
    // `+tap:<id>` odróżnia warianty kosztu „tapnij stwora" (pętla PMSSB-32).
    wynik: (prefix) => {
      const trafione = wszystkie.filter((o) => o.cmd.startsWith(prefix));
      assert.equal(trafione.length, 1, `oczekiwano jednej oferty ${prefix}, jest ${trafione.length}`);
      return trafione[0].score;
    },
    oferta: (prefix) => wszystkie.find((o) => o.cmd.startsWith(prefix)),
  };
}

// --- A. Kiedy mana realnie odblokowuje zagranie -----------------------------

test('PMSSB-32/A1 (F1, regresja): mana bezbarwna NIE odblokowuje pipa {W} — bot czeka', () => {
  // Apprentice Wizard ({U},{T}: Add {C}{C}{C}) przy 3 Wyspach i Razorfoot
  // Griffinie ({3}{W}) w ręce. PRZED: próg liczbowy 3 → 5 ≥ 4 = „odblokowane”,
  // score +10 i bot tapował Wizarda; rzut pozostawał nielegalny (brak {W}),
  // a mana wyparowywała w cleanup (CR 500.4).
  const s = stol();
  for (let i = 0; i < 3; i += 1) put(s, `isl${i}`, 'basic-island');
  put(s, 'wiz', 'apprentice-wizard');
  put(s, 'h-griffin', 'razorfoot-griffin', { zone: 'hand' });
  const o = opcje(s);
  assert.equal(o.wynik('activate_ability(wiz#0'), -4,
    'mana bezbarwna nie może „odblokować" pipa {W} — zostaje kara M128 (2 − 6)');
  assert.equal(o.wybrany.type, 'pass_priority', 'bot nie tapuje źródła bez realnego zysku');
});

test('PMSSB-32/A2 (F2, anty-over-fix): mana ograniczona do artefaktów NIE odblokowuje stwora', () => {
  // Powerstone ({T}: Add {C}, mana tylko do czarów-artefaktów) + Las + stwór za
  // 2. Kreatura nie jest celem dozwolonym dla tej many, więc aktywacja nic nie
  // daje. PRZED: próg liczbowy 1 → 2 = „odblokowane” i +6, PO: −4 i pass.
  const s = stol();
  put(s, 'las', 'basic-forest');
  put(s, 'ps', 'token_powerstone');
  put(s, 'h-stwor', 'deadly-recluse', { zone: 'hand' });
  const o = opcje(s);
  assert.equal(o.wynik('activate_ability(ps#0'), -4, 'mana artefaktowa nie odblokowuje stwora');
  assert.equal(o.wybrany.type, 'pass_priority', 'bot czeka, zamiast tapować Powerstone za nic');
});

test('PMSSB-32/A3 (L48): ta sama mana płaci artefakt AUTOMATEM — ręczna aktywacja zbędna', () => {
  // Mana Cylix ({1}) JEST celem dozwolonym dla Powerstone'a, więc silnik sam
  // do-tapuje źródło przy płatności (untappedFreeManaSources/„oferta =
  // płatność”, L48) — dlatego rzut jest w ofertach (62,1) i wygrywa, a ręczna
  // aktywacja nie dostaje premii za „odblokowanie" (PRZED dawała +6 i mogła
  // przesłonić lepsze zagranie). Pozytywne odblokowanie przez źródło
  // jednorazowe (którego silnik NIE auto-tapuje) — patrz PMSSB-32/A5b.
  const s = stol();
  put(s, 'ps', 'token_powerstone');
  put(s, 'h-cylix', 'mana-cylix', { zone: 'hand' });
  const o = opcje(s);
  assert.equal(o.wybrany.type, 'cast_permanent', `artefakt jest płatny: ${o.wybrane}`);
  assert.equal(o.oferta('cast_permanent(h-cylix')?.score, 62.0991, 'oferta = auto-płatność');
  assert.ok(o.wynik('activate_ability(ps#0') < 0, 'skoro silnik płaci sam, aktywacja jest zbędna');
});

test('PMSSB-32/A4 (F2): mana ograniczona w PULI nie liczy się jako „już stać"', () => {
  // 1 jednostka many Powerstone'a w puli + źródło + stwór za 2. PRZED: pula
  // podnosiła próg do 2 → „odblokowane” (+6) i bot poświęcał/tapował źródło,
  // choć stwora nie da się tym opłacić. PO: restricted nie wchodzi do
  // jednostek dla stwora (restrictedManaBlocked, M201).
  const s = stol();
  put(s, 'las', 'basic-forest');
  put(s, 'ps', 'token_powerstone');
  put(s, 'h-stwor', 'deadly-recluse', { zone: 'hand' });
  const p1 = s.players.find((p) => p.id === 'p1');
  p1.mana = 1;
  p1.manaPool = {};
  p1.restrictedPool = { '': 1 };
  p1.artifactOnlyMana = 1;
  const o = opcje(s);
  assert.equal(o.wynik('activate_ability(ps#0'), -4, 'ograniczona pula nie może udawać dostępnej many');
  assert.equal(o.wybrany.type, 'pass_priority', `bot czeka: ${o.wybrane}`);
});

test('PMSSB-32/A5 (L48, F3 rozwiązane): filtr koloru auto-płaci SILNIK — ręcznie nie trzeba', () => {
  // Jeskai Devotee ({1}: Add {U}, {R} or {W}) przy dwóch Wyspach i Shocku {R}
  // w ręce. PRZED: −8 (M150/C1 karze net <= 0) — ale silnik sam aktywuje to
  // źródło przy płatności (untappedCostedManaSources), więc oferta rzutu
  // istnieje (60) i wygrywa. Ręczna aktywacja zachowuje wartość sprzed pętli
  // (anty-over-fix): pokrętło „premia za kolor” okazało się w produkcji MARTWE
  // i nie zostało dodane.
  const s = stol();
  put(s, 'isl0', 'basic-island');
  put(s, 'isl1', 'basic-island');
  put(s, 'dev', 'jeskai-devotee');
  put(s, 'h-shock', 'shock', { zone: 'hand' });
  const o = opcje(s);
  assert.equal(o.wynik('activate_ability(dev#1'), -8, 'wartość sprzed pętli (M150/C1)');
  assert.equal(o.oferta('cast_spell(h-shock->p2')?.score, 60, 'silnik oferuje rzut — sam finansuje filtr');
  assert.equal(o.wybrany.type, 'cast_spell', 'bot rzuca czar, zamiast filtrować manę ręcznie');
});

test('PMSSB-32/A5b (F3+F6): Skarb + kolor odblokowuje CZAR Z CELEM — to najmocniejsze okno', () => {
  // Treasure (poświęcenie — silnik NIE auto-tapuje), Las i Shock {R} z celem
  // (stwór wroga). PRZED: −10 (a) próg liczbowy 1 → 2 nie widział, że brakuje
  // PIPÓW, (b) bramka „chcę to rzucić” pytała komendę bez celów (−10), więc
  // Skarb nigdy nie finansował removal/burna. PO: +6 i wybór aktywacji.
  const s = stol();
  put(s, 'las', 'basic-forest');
  put(s, 'tre', 'token_treasure');
  put(s, 'h-shock', 'shock', { zone: 'hand' });
  cialo(s, 'foe', 2, 2, { controllerId: 'p2' });
  const o = opcje(s);
  assert.equal(o.oferta('cast_spell(h-shock'), undefined, 'silnik nie auto-płaci Skarbem — aktywacja to jedyna droga');
  assert.equal(o.wynik('activate_ability(tre#0'), 6, '2 (baza) + 4 (realne odblokowanie rzutu)');
  assert.equal(o.wybrany.type, 'activate_ability', 'Skarb jest po to, żeby go wydać na wartościowy czar');
});

test('PMSSB-32/A6 (F3, kontrola): kolor, którego źródło NIE produkuje, nie odblokowuje', () => {
  // Ten sam Devotee + Brute Force {G}: {G} nie jest wśród {U},{R},{W} —
  // kara zostaje bez zmian (PRZED = PO = −8).
  const s = stol();
  put(s, 'isl0', 'basic-island');
  put(s, 'isl1', 'basic-island');
  put(s, 'dev', 'jeskai-devotee');
  put(s, 'h-bf', 'brute-force', { zone: 'hand' });
  const o = opcje(s);
  assert.equal(o.wynik('activate_ability(dev#1'), -8, 'brak odblokowania = dawna kara M150/C1');
  assert.equal(o.wybrany.type, 'pass_priority', 'bot czeka');
});

// --- B. Koszt tapnięcia CIAŁA: faza, czyja tura, czujność -------------------

test('PMSSB-32/B1 (F4): tapCreature wybiera ŚCIANĘ, nie 4/4 (PRZED: remis 3 = 3)', () => {
  // Dragonbroods' Relic ({T}, tap an untapped creature: Add one mana of any
  // color) + 3 Wyspy + Hill Giant ({3}{R}, koszt 4) w ręce: bez tapnięcia
  // 3 jednostki, z tapnięciem 4 → rzut realnie odblokowany. Warianty różnią się
  // WYŁĄCZNIE ciałem: ściana 0/1 (nic nie traci) vs 4/4 (traci atak w main1).
  const s = stol();
  for (let i = 0; i < 3; i += 1) put(s, `isl${i}`, 'basic-island');
  put(s, 'rel', 'dragonbroods-relic');
  cialo(s, 'wall', 0, 1);
  cialo(s, 'big', 4, 4);
  put(s, 'h-giant', 'hill-giant', { zone: 'hand' });
  const o = opcje(s);
  assert.equal(o.wybrany.tapCreatureId, 'wall', 'bot tapuje ciało, które i tak nic nie robi');
  assert.equal(o.wynik('activate_ability(rel#0+tap:wall'), 3, 'baza 2 + 4 za rzut − 3 (stara cena tapCreature)');
  assert.equal(o.wynik('activate_ability(rel#0+tap:big'), -5, 'j.w. − 8 za utracony atak 4/4');
});

test('PMSSB-32/B2 (F4): kara za ciało jest sufitem — 6/6 nie schodzi niżej niż 4/4', () => {
  const s = stol();
  for (let i = 0; i < 3; i += 1) put(s, `isl${i}`, 'basic-island');
  put(s, 'rel', 'dragonbroods-relic');
  cialo(s, 'wall', 0, 1);
  cialo(s, 'huge', 6, 6);
  put(s, 'h-giant', 'hill-giant', { zone: 'hand' });
  const o = opcje(s);
  assert.equal(o.wynik('activate_ability(rel#0+tap:huge'), -5,
    'sufit `manaTapBodyMax` (8): 12 pkt kary nie może zablokować rzutu');
  assert.equal(o.wybrany.tapCreatureId, 'wall', 'nadal ściana');
});

test('PMSSB-32/B3 (F4): ta sama mana — main1 droższa od main2 (PRZED: 6,0 = 6,0)', () => {
  // Scorned Villager ({T}: Add {G}) + Las + Deadly Recluse ({1}{G}) w ręce.
  // W main1 tap odbiera atak (CR 508.1a), w main2 po deklaracji atakujących już
  // nic nie odbiera — więc to main2 jest oknem „darmowej” many ze stwora.
  // (W tym stanie silnik płaci rzut sam — Villager to źródło WOLNE, L48 —
  // więc wartości siedzą w gałęzi kary M128: −4 = 2 − 6, plus cena ataku.)
  const zbuduj = (step) => {
    const s = stol({ step });
    put(s, 'vil', 'scorned-villager');
    put(s, 'las', 'basic-forest');
    put(s, 'h-recluse', 'deadly-recluse', { zone: 'hand' });
    return s;
  };
  const a = opcje(zbuduj('main1'));
  const b = opcje(zbuduj('main2'));
  assert.equal(a.wynik('activate_ability(vil#0'), -6, 'main1: −4 − 2 za 1/1 tracącego atak');
  assert.equal(b.wynik('activate_ability(vil#0'), -4, 'main2: ciało zrobiło swoje, tap wolny');
  assert.ok(a.wynik('activate_ability(vil#0') < b.wynik('activate_ability(vil#0'),
    'faza musi różnicować cenę tapnięcia ciała');
});

test('PMSSB-32/B4 (F4): cudza tura — tap obrońcy kosztuje, po blokach już nie', () => {
  // W cudzej turze tap ciała odbiera BLOK (CR 509.1a); po deklaracji
  // blokujących jest spóźniony. Reguła fazowa działa więc bez wyjątków na karty.
  const zbuduj = (step) => {
    const s = stol({ step, active: 'p2', priority: 'p1' });
    for (let i = 0; i < 3; i += 1) put(s, `isl${i}`, 'basic-island');
    put(s, 'vil', 'scorned-villager');
    put(s, 'h-ins', 'inspiration', { zone: 'hand' });   // instant {3}{U}
    return s;
  };
  const a = opcje(zbuduj('main1'));
  const b = opcje(zbuduj('combat_damage'));
  assert.equal(a.wynik('activate_ability(vil#0'), -6, 'cudza main1: −4 − 2 za traconego blokera 1/1');
  assert.equal(b.wynik('activate_ability(vil#0'), -4, 'po blokach tap niczego już nie odbiera');
  assert.equal(a.wybrany.type, 'pass_priority', 'mana niepotrzebna (silnik zapłaci sam) — nie tapujemy obrońcy');
});

test('PMSSB-32/B5 (F5, klasa L1): instant z ręki JEST rozpoznany — reguła E6/A1 żyje', () => {
  // Wpis ręki w playerView nie niósł `types` (a `kind` czaru to 'spell'), więc
  // `o.types.includes('Instant')` nigdy nie zachodziło w produkcji. Ten pin
  // czyta widok i sprawdza, że instant jest widziany jako instant.
  const s = stol({ step: 'main1', active: 'p2', priority: 'p1' });
  put(s, 'h-ins', 'inspiration', { zone: 'hand' });
  const widok = playerView(s, 'p1');
  const wpis = widok.zones.hand.find((o) => o.id === 'h-ins');
  assert.ok((wpis.types ?? []).includes('Instant'),
    `wpis ręki musi nieść linię typów (publiczny Oracle): ${JSON.stringify(wpis.types)}`);
  assert.equal(wpis.spell?.timing, 'instant', 'deskryptor czaru zostaje jako druga, jawna droga');
});

test('PMSSB-32/B6 (L48, anty-over-fix): artefakt many płatny automatem — wartość sprzed pętli', () => {
  // Seer's Lantern ({T}: Add {C}) + Las + Deadly Recluse {1}{G}: latarnia jest
  // źródłem WOLNYM, więc silnik do-tapuje ją sam przy płatności (oferta rzutu
  // istnieje) — ręczna aktywacja jest zbędna, ale jej wynik zostaje dokładnie
  // tam, gdzie był przed falą B dla stanu „jest co zagrać": 2 − 6 = −4.
  const s = stol();
  put(s, 'las', 'basic-forest');
  put(s, 'lan', 'seers-lantern');
  put(s, 'h-recluse', 'deadly-recluse', { zone: 'hand' });
  const o = opcje(s);
  assert.equal(o.wynik('activate_ability(lan#0'), -4, 'PRZED = PO: −4 (kara M128 bez premii)');
  assert.equal(o.wybrany.type, 'cast_permanent', 'bot rzuca to, co chciał');
});

test('PMSSB-32/B7 (CR 702.20b): tap stworu z CZUJNOŚCIĄ nie płaci za atak', () => {
  // Bliźniak: ta sama karta (Moonscarred Werewolf, 2/2 z czujnością, „{T}: Add
  // {G}{G}") raz z keywordem, raz bez — zmienną jest WYŁĄCZNIE czujność, więc
  // różnica wyniku to dokładnie cena ataku z `tapBodyCost`. Czujność: atak nie
  // tapuje, więc mana z takiego stwora w main1 nie kosztuje ani punktu.
  const zbuduj = (bezCzujnosci, step = 'main1') => {
    const s = stol({ step });
    put(s, 'las', 'basic-forest');
    put(s, 'wil', 'moonscarred-werewolf', bezCzujnosci ? { keywords: [] } : {});
    put(s, 'h-surge', 'savage-surge', { zone: 'hand' });
    return s;
  };
  assert.equal(opcje(zbuduj(false)).wynik('activate_ability(wil#0'), -4, 'czujność: kara M128 bez ceny ataku');
  assert.equal(opcje(zbuduj(true)).wynik('activate_ability(wil#0'), -8, 'bez czujności ten sam tap kosztuje 2×2');
  assert.equal(opcje(zbuduj(false, 'main2')).wynik('activate_ability(wil#0'), -4, 'main2: ciało zrobiło swoje');
  assert.equal(opcje(zbuduj(true, 'main2')).wynik('activate_ability(wil#0'), -4, 'main2: bliźniaki równe');
});

test('PMSSB-32/B8 (anty-over-fix): czujność NIE daje darmowego blokera w cudzej turze', () => {
  // W cudzej turze tap odbiera BLOK (CR 509.1a) — czujność nic tu nie daje
  // (odtapowanie jest potrzebne do deklaracji blokera), więc kara za ciało
  // musi zostać identyczna dla obu bliźniaków.
  const zbuduj = (bezCzujnosci) => {
    const s = stol({ step: 'main1', active: 'p2', priority: 'p1' });
    put(s, 'las', 'basic-forest');
    put(s, 'wil', 'moonscarred-werewolf', bezCzujnosci ? { keywords: [] } : {});
    put(s, 'h-surge', 'savage-surge', { zone: 'hand' });
    return s;
  };
  assert.equal(opcje(zbuduj(false)).wynik('activate_ability(wil#0'), -8, 'czujność: −4 − 2×2 za blokera');
  assert.equal(opcje(zbuduj(true)).wynik('activate_ability(wil#0'), -8, 'bez czujności identycznie');
});

test('PMSSB-32/B9 (CR 702.3b): tap stworu z OBROŃCĄ też nic nie odbiera', () => {
  // Ten sam bliźniak z `defender`: obrońca nie może atakować (CR 702.3b), więc
  // kara „za utracony atak" liczona z mocy byłaby karą za coś, czego i tak nie
  // ma. Reguła po keywordzie, nie po nazwie karty (ADR 0002).
  const s = stol();
  put(s, 'las', 'basic-forest');
  put(s, 'wil', 'moonscarred-werewolf', { keywords: ['defender'] });
  put(s, 'h-surge', 'savage-surge', { zone: 'hand' });
  assert.equal(opcje(s).wynik('activate_ability(wil#0'), -4, 'obrońca nie traci ataku, którego nie ma');
});

test('PMSSB-32/B10 (F6, anty-over-fix): trik bez okna nie uzasadnia Skarba', () => {
  // Brute Force {R} (pump) na własnym 2/2 w main1: bot wycenia go negatywnie
  // (−23) — trik bojowy czeka na walkę. Bramka „chcę to rzucić" musi to
  // uszanować: Skarb zostaje w ręce, zamiast finansować zagranie bez okna.
  const s = stol();
  put(s, 'las', 'basic-forest');
  put(s, 'tre', 'token_treasure');
  cialo(s, 'moj', 2, 2);
  put(s, 'h-bf', 'brute-force', { zone: 'hand' });
  const o = opcje(s);
  assert.equal(o.wynik('activate_ability(tre#0'), -10, 'brak odblokowania: kara + cena jednorazówki');
  assert.equal(o.wybrany.type, 'pass_priority', 'Skarb nie jest paliwem dla trików poza oknem walki');
});

// --- C. Pokrętła: najmocniejszy wariant = dawna wartość ---------------------

test('PMSSB-32/C1: pokrętło ciała ×0 przywraca cenę sprzed fali (−4 = −4)', () => {
  const s = stol({ step: 'main1' });
  put(s, 'vil', 'scorned-villager');
  put(s, 'las', 'basic-forest');
  put(s, 'h-recluse', 'deadly-recluse', { zone: 'hand' });
  const zero = opcje(s, { params: { manaTapBodyPerStat: 0 } });
  assert.equal(zero.wynik('activate_ability(vil#0'), -4, 'PRZED: tap ciała nie miał ceny bojowej');
});

test('PMSSB-32/C2: sufit ciała ×0 — kara znika, ale odblokowanie zostaje', () => {
  const s = stol();
  for (let i = 0; i < 3; i += 1) put(s, `isl${i}`, 'basic-island');
  put(s, 'rel', 'dragonbroods-relic');
  cialo(s, 'wall', 0, 1);
  cialo(s, 'big', 4, 4);
  put(s, 'h-giant', 'hill-giant', { zone: 'hand' });
  const zero = opcje(s, { params: { manaTapBodyMax: 0 } });
  assert.equal(zero.wynik('activate_ability(rel#0+tap:big'), 3, 'PRZED: oba warianty po 3');
  assert.equal(zero.wynik('activate_ability(rel#0+tap:wall'), 3, 'sufit 0 = oba warianty równe');
});
