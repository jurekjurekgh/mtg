// PMSSB-92 — POMIAR: macierzowa sonda scoringu bota dla Batcha 75 (karty 666–675 + token Junk).
//
// Uruchomienie:
//   node tools/pmssb92-batch75-sonda.mjs                 # tabela tekstowa
//   node tools/pmssb92-batch75-sonda.mjs --json          # JSON
//   node tools/pmssb92-batch75-sonda.mjs --karta=vaporkin
//   node tools/pmssb92-batch75-sonda.mjs --scen=SPE-02
//   node tools/pmssb92-batch75-sonda.mjs --przebieg      # wykonuj wybory krok po kroku
//
// Dlaczego NOWA sonda (plan PMSSB-90/91: SCENARIUSZE poprzednich pętli zostają
// odtwarzalne w zamrożonym kształcie — L24): Batch 75 dokłada klasy decyzji, których
// harness batcha 74 nie modeluje — (1) koszt ofiary „artefakt LUB innego stwora"
// z wyborem KANDYDATA (Malevolent Noble), (2) modal na liczbę WŁASNYCH stworów
// (Coordinated Maneuver, tryb A = creatures_you_control), (3) restrykcja STRONY
// BLOKERA (Vaporkin — canBlockOnlyKeywords), (4) token-impulse z oknem grywalności
// (Junk) i (5) flash z wejściem tapniętym (Undersea Invader).
//
// Sonda NIE ocenia automatycznie: drukuje fakty (wybór, cel, score alternatyw, stan),
// a werdykt pro-playera jest w raporcie §PMSSB-92 (L24).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createCardDeck } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { tapObject, effectivePower, effectiveToughness } from '../src/engine/permanents.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { applyEffect } from '../src/engine/effects.js';
import { declareAttackers, attackerDeclarationViolation } from '../src/engine/combat.js';
import { attachEquipmentToCreature } from '../src/engine/attachments.js';

const REGISTRY = createCardRegistry();

/** Kroki tury skanowane w wymiarze T (bez `untap` — harness nie przyznaje tam priorytetu). */
const KROKI_TURY = ['upkeep', 'draw', 'main1', 'beginning_of_combat', 'declare_attackers',
  'declare_blockers', 'combat_damage', 'end_of_combat', 'main2', 'end'];

/**
 * Deklaracja ataku ODPORNA na nielegalnych kandydatów: odsiewa stworzenia, których
 * pojedyncza deklaracja jest nielegalna (ściany z defenderem, chory, tapnięty), i
 * deklaruje pozostałe. Bez tego sonda padała wyjątkiem silnika zamiast drukować stan —
 * a scenariusz z murem 0/4 ma właśnie mierzyć, czy bot atakuje w mur (L24: pomiar
 * ma być jawny, nie wywalony).
 */
function deklarujAtak(state, gracz, ids) {
  const legalni = ids.filter((id) => attackerDeclarationViolation(state, gracz, [id]) === null);
  if (legalni.length) declareAttackers(state, gracz, legalni);
  return legalni;
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

/** Payload karty dokładnie taki, jaki instaluje `createCardDeck` (bez pól wpisu talii). */
function deckPayload(cardId, ownerId) {
  const [entry] = createCardDeck({ cardIds: [cardId], ownerId, registry: REGISTRY });
  const { id, instanceId, cardId: _c, ownerId: _o, controllerId, zone, objectId, ...rest } = entry;
  return rest;
}

function put(state, id, cardId, controllerId = 'p1', zone = 'battlefield', patch = {}) {
  if (!REGISTRY.has(cardId)) throw new Error(`nieznana karta w scenariuszu: ${cardId}`);
  addObject(state, {
    id, instanceId: `instance-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...deckPayload(cardId, controllerId), ...patch,
  });
  return state.objects.get(id);
}

/** Skrót P/T z silnika (nie z definicji — liczą się modyfikatory). */
function pt(state, id) {
  const o = state.objects.get(id);
  if (!o) return '?';
  return `${effectivePower(o, state)}/${effectiveToughness(o, state)}`;
}

/**
 * Stan gry z jawnym kontekstem. `pole`/`reka`/`grob`/`biblioteka` to listy wpisów
 * `{ id, karta, gracz, tap?, chory? }` (albo goły string = id karty, id obiektu = `k-<n>`).
 * `chory: true` = summoning sickness (nie atakuje, nie tapuje) — potrzebne do wymiaru haste.
 */
function stan({
  seed = 90,
  krok = 'main1',
  aktywny = 'p1',
  priorytet = null,
  zycie = { p1: 20, p2: 20 },
  mana = { p1: 0, p2: 0 },
  pole = [],
  reka = [],
  grob = [],
  biblioteka = [],
  // PMSSB-90/F-90-5: rozmiar biblioteki jest PARAMETREM (domyślnie 20 = wierność
  // pomiaru H-2), żeby dało się zmierzyć presję deck-outu (CR 121.4) przy decyzji
  // explore/surveil — przy zdrowej bibliotece ten człon wyceny jest zerem.
  rozmiarBiblioteki = ROZMIAR_BIBLIOTEKI,
} = {}) {
  const state = createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, krok, priorytet ?? aktywny);
  state.turn.activePlayerId = aktywny;
  state.turn.priorityPlayerId = priorytet ?? aktywny;
  for (const [gracz, ile] of Object.entries(zycie)) {
    const p = state.players.find((x) => x.id === gracz);
    if (!p) throw new Error(`nieznany gracz: ${gracz}`);
    p.life = ile;
  }
  let n = 0;
  const wstaw = (wpis, zone) => {
    const e = typeof wpis === 'string' ? { karta: wpis } : wpis;
    n += 1;
    const id = e.id ?? `k-${n}`;
    const gracz = e.gracz ?? 'p1';
    put(state, id, e.karta, gracz, zone, e.patch ?? {});
    if (zone === 'battlefield') {
      // Domyślnie stwory są „gotowe" (nie weszły w tej turze) — wyjątek: `chory`.
      const gotowy = !e.chory;
      state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: !gotowy }));
      if (e.tap) tapObject(state, id, gracz);
    }
    return id;
  };
  for (const wpis of pole) wstaw(wpis, 'battlefield');
  for (const wpis of reka) wstaw(wpis, 'hand');
  for (const wpis of grob) wstaw(wpis, 'graveyard');
  // Kolejność w `biblioteka` = wierzch pierwszy (`drawPlayerCards` bierze pierwsze trafienie).
  // Dopełnienie do ROZMIARU_BIBLIOTEKI: pusta biblioteka wyłączała w heurystyce bramkę
  // `hardRemovalHeldForWorthierTarget` (`heuristic-bot.js:5938` — `myLibraryCount(view) <=
  // P.removalHoldLibraryFloor`, wartość 10), więc pomiar removalu (Plummet, Get the Point)
  // mierzył bota z mechanizmem „trzymaj na godny cel" WYŁĄCZONYM. W realnej partii
  // biblioteka ma kilkadziesiąt kart, więc sonda musi ją mieć (L24: wierność pomiaru).
  const wypelniacz = (gracz, karta, ile, offset) => Array.from({ length: ile }, (_, i) => ({
    id: `wyp-${gracz}-${offset + i}`, karta, gracz,
  }));
  const bibliotekaP1 = biblioteka.filter((wpis) => (typeof wpis === 'string' || wpis.gracz == null || wpis.gracz === 'p1'));
  const bibliotekaP2 = biblioteka.filter((wpis) => typeof wpis !== 'string' && wpis.gracz === 'p2');
  for (const wpis of bibliotekaP1) wstaw(wpis, 'library');
  for (const wpis of wypelniacz('p1', 'basic-forest', Math.max(0, rozmiarBiblioteki - bibliotekaP1.length), bibliotekaP1.length)) wstaw(wpis, 'library');
  for (const wpis of bibliotekaP2) wstaw(wpis, 'library');
  for (const wpis of wypelniacz('p2', 'basic-island', Math.max(0, rozmiarBiblioteki - bibliotekaP2.length), bibliotekaP2.length)) wstaw(wpis, 'library');
  for (const [gracz, ile] of Object.entries(mana)) if (ile > 0) addMana(state, gracz, ile);
  return state;
}

/** Decyzja bota + ślad (opcje z score). `losowosc: 0`, `lookahead: 0` = czysta heurystyka. */
function decyzja(state, gracz = 'p1', params = undefined) {
  const bot = createHeuristicBot({
    seed: 90, randomness: 0, lookahead: 0, registry: REGISTRY, ...(params ? { params } : {}),
  });
  const view = playerView(state, gracz);
  const cmd = bot.chooseCommand(view, {});
  const wpis = bot.trace().at(-1) ?? {};
  return { cmd, wybrano: wpis.chosen ?? null, score: wpis.score ?? null, opcje: wpis.options ?? [], view };
}

/**
 * Rozmiar biblioteki budowanej przez `stan()`. Musi być > `removalHoldLibraryFloor` (10),
 * inaczej heurystyka wyłącza trzymanie hard removalu na godny cel i pomiar nie odpowiada
 * partii produkcyjnej (`src/table/session.js:406` tworzy bota z `lookahead: 0`,
 * `randomness: 0` — dokładnie te ustawienia ma ta sonda).
 */
const ROZMIAR_BIBLIOTEKI = 20;

/** Opis stanu do wydruku — dokładnie te wymiary, o które pyta zlecenie. */
function opisStanu(state, gracz = 'p1') {
  const zony = (z, g) => state.zones[z]
    .map((id) => state.objects.get(id))
    .filter((o) => o && o.controllerId === g)
    .map((o) => {
      const def = REGISTRY.get(o.cardId);
      const extra = [];
      if (o.tapped) extra.push('TAP');
      if (o.summoningSickness) extra.push('chory');
      if ((def?.types ?? []).includes('Creature') || o.power != null) extra.push(pt(state, o.id));
      if (o.damage > 0) extra.push(`obrażenia ${o.damage}`);
      if (o.attacking === true) extra.push('ATAKUJE');
      if (o.blocking === true) extra.push('BLOKUJE');
      const kw = [...(o.keywords ?? []), ...(def?.keywords ?? [])];
      if (kw.length) extra.push([...new Set(kw)].join('/'));
      // BIEŻĄCE typy, gdy różnią się od drukowanych (crew/animate dokłada 'Creature' do
      // Vehicle — bez tego raport nie pokazywałby, czy animacja w ogóle zaszła).
      const typyDruk = def?.types ?? [];
      const typyTeraz = o.types ?? [];
      if (typyTeraz.join('|') !== typyDruk.join('|')) extra.push(`typy teraz: ${typyTeraz.join(' ')}`);
      const zalaczniki = state.zones.battlefield
        .map((oid) => state.objects.get(oid))
        .filter((x) => x && x.attachedTo === o.id)
        .map((x) => REGISTRY.get(x.cardId)?.name ?? x.cardId);
      if (zalaczniki.length) extra.push(`załączone: ${zalaczniki.join('+')}`);
      return `${o.id}:${def?.name ?? o.cardId}${extra.length ? ` (${extra.join(' ')})` : ''}`;
    });
  const p = (g) => state.players.find((x) => x.id === g);
  const rekaUkryta = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId !== gracz).length;
  return [
    `krok=${state.turn.step} aktywny=${state.turn.activePlayerId} priorytet=${state.turn.priorityPlayerId} tura=${state.turn.number}`,
    `życie p1=${p('p1').life} p2=${p('p2').life} | mana p1=${p('p1').mana ?? 0} p2=${p('p2').mana ?? 0}`
      + ` | rad p1=${p('p1').rad ?? 0} p2=${p('p2').rad ?? 0}`
      + ` | attackedThisTurn p1=${p('p1').attackedThisTurn === true} p2=${p('p2').attackedThisTurn === true}`,
    `stół p1: ${zony('battlefield', 'p1').join(', ') || '—'}`,
    `stół p2: ${zony('battlefield', 'p2').join(', ') || '—'}`,
    `ręka p1: ${zony('hand', 'p1').join(', ') || '—'} | ręka p2: ${rekaUkryta} kart(y)`,
    `grób p1: ${zony('graveyard', 'p1').length} | grób p2: ${zony('graveyard', 'p2').length} | biblioteka p1: ${state.zones.library.filter((id) => state.objects.get(id)?.controllerId === gracz).length}`,
  ].join('\n    ');
}


// ---------------------------------------------------------------------------
// Scenariusze: T = moment (tura/faza/okno), C = cel, S = kontekst stanu, K = koszt/okazja
// ---------------------------------------------------------------------------

const SCENARIUSZE = [
  // =========================================================================
  // 666. Undersea Invader ({4}{U}{U} 5/6, flash, wchodzi tapnięty).
  // Pytanie: czy flash ma wartość w wycenie (rzut w oknie bezpiecznym) i czy
  // „wchodzi tapnięty" nie jest liczone jak gotowy bloker/atakujący.
  // =========================================================================
  {
    id: 'INV-01', karta: 'undersea-invader', wymiar: 'T',
    tytul: '5/6 z flashem: main1 własnej tury vs end step przeciwnika (okno bezpieczne) vs main1 przy wrogich blokerach',
    pro: '5/6 z flashem pro gra w END STEP PRZECIWNIKA: wchodzi tapnięty (i tak nie zaatakuje w tej turze), a przeciwnik nie może już bezpiecznie odpowiedzieć removalem przed walką. Rzut main1 oddaje przeciwnikowi okno odpowiedzi; flash bez użycia = strata tekstu.',
    warianty: [
      { opis: 'main1 własna tura, pusty stół', krok: 'main1', aktywny: 'p1', mana: 6, pole: [] },
      { opis: 'end step PRZECIWNIKA (priorytet p1)', krok: 'end', aktywny: 'p2', priorytet: 'p1', mana: 6, pole: [] },
      { opis: 'main1 własna tura, wróg ma 2/2 i 2/2', krok: 'main1', aktywny: 'p1', mana: 6, pole: [{ id: 'w1', karta: 'leafcrown-dryad', gracz: 'p2' }, { id: 'w2', karta: 'soulmender', gracz: 'p2' }] },
    ],
    budowa: (w) => stan({
      krok: w.krok, aktywny: w.aktywny, priorytet: w.priorytet ?? w.aktywny,
      mana: { p1: w.mana },
      reka: [{ id: 'inv-hand', karta: 'undersea-invader' }],
      pole: w.pole,
    }),
  },
  {
    id: 'INV-02', karta: 'undersea-invader', wymiar: 'S',
    tytul: 'Invader NA POLU (w tej turze wszedł tapnięty) — czy bot nie liczy go jako blokera/atakującego w tej turze?',
    pro: '„Wchodzi tapnięty" znaczy: w tej turze nie atakuje i nie blokuje (tapnięty). Bot musi go traktować jako unavailable do bloku, mimo że T/N są pełne.',
    warianty: [
      { opis: 'wróg atakuje 3/3, Invader wszedł w TEJ turze (tap)', poleWrog: [{ id: 'atk-3-3', karta: 'grollub' }], tap: true },
      { opis: 'wróg atakuje 3/3, Invader nietapnięty (kontrola)', poleWrog: [{ id: 'atk-3-3', karta: 'grollub' }], tap: false },
    ],
    budowa: (w) => {
      const state = stan({
        krok: 'declare_attackers', aktywny: 'p2', priorytet: 'p1',
        pole: [
          { id: 'inv-bf', karta: 'undersea-invader', gracz: 'p1', tap: w.tap },
          ...w.poleWrog.map((x) => ({ id: x.id, karta: x.karta, gracz: 'p2' })),
        ],
      });
      deklarujAtak(state, 'p2', w.poleWrog.map((x) => x.id));
      // Wejście w krok bloków jak w silniku (game-state.js, CR 508.2):
      // deklaracja ataku NIE zmienia kroku — bez jawnego jumpToStep p1 nie
      // dostaje komend declare_blockers (pomiar: pass 0,00 bez ofert bloku).
      state.turn = jumpToStep(state.turn, 'declare_blockers', 'p1');
      state.turn.priorityPlayerId = 'p1';
      return state;
    },
  },

  // =========================================================================
  // 667. Gysahl Greens ({1}{G} sorcery, token Bird + flashback {6}{G}).
  // Pytania: timing rzutu (mana sporna?) i czy flashback z grobu JEST
  // wyceniany (koszt 7 ŁĄCZNIE po naprawie M428).
  // =========================================================================
  {
    id: 'GYS-01', karta: 'gysahl-greens', wymiar: 'T',
    tytul: 'Gysahl w ręce: main1 przy pustym stole vs main1, gdy mana jest potrzebna na inne (2 czary w ręce)',
    pro: 'Token 2/2 za 2 to wartość przy pustym stole; gdy w ręce leży droższy plan (2 dużo lepsze karty), pro albo gra wszystko, albo trzyma Greensa na turę z lądem — nie przepala mana pool przed walką bez potrzeby.',
    warianty: [
      { opis: 'main1, pusty stół, ręka = sam Greens', mana: 2, reka: ['gysahl-greens'] },
      { opis: 'main1, pusty stół, ręka = Greens + Shock + Outcasts (sporna mana 2)', mana: 2, reka: ['gysahl-greens', 'shock', 'grizzled-outcasts'] },
      { opis: 'main2 (po walce), ręka = sam Greens', krok: 'main2', mana: 2, reka: ['gysahl-greens'] },
    ],
    budowa: (w) => stan({
      krok: w.krok ?? 'main1',
      mana: { p1: w.mana },
      reka: w.reka.map((karta) => ({ id: `hand-${karta.replace(/[^a-z-]/g, '')}`, karta })),
      pole: [],
    }),
  },
  {
    id: 'GYS-02', karta: 'gysahl-greens', wymiar: 'K',
    tytul: 'FLASHBACK {6}{G} z grobu: 7 many za 2/2 — czy oferta istnieje i kiedy bot ją bierze?',
    pro: 'Flashback za 7 to ruch z martwej gry (end-game) albo z nadmiaru many w main2 przy pustej ręce. Przy zdrowej ręce pro NIE płaci 7 za 2/2.',
    warianty: [
      { opis: 'main2, grób: Greens, ręka PUSTA, mana 7 (idle)', krok: 'main2', mana: 7, grób: ['gysahl-greens'], reka: [] },
      { opis: 'main1, grób: Greens, ręka: Outcasts (zdrowa ręka)', mana: 7, grób: ['gysahl-greens'], reka: ['grizzled-outcasts'] },
    ],
    budowa: (w) => stan({
      krok: w.krok ?? 'main1',
      mana: { p1: w.mana },
      grob: w.grób,
      reka: w.reka.map((karta) => ({ id: `hand-${karta.replace(/[^a-z-]/g, '')}`, karta })),
    }),
  },

  // =========================================================================
  // 668. Battle Hurda ({4}{W} 3/3 first strike).
  // Pytanie: czy blok z first strike jest wyceniany wg PRAWdziwej wymiany
  // (first strike zabija 3/3 przed ciosem, ale nie zabija 4/4).
  // =========================================================================
  {
    id: 'HUR-01', karta: 'battle-hurda', wymiar: 'T',
    tytul: 'Hurda 5-mana w ręce: main1 pusty stół vs main1 przy własnym 4/4 na stole (tempo vs rozwój)',
    pro: '3/3 first strike za 5 to słaby koszt-tempo, gdy stół już trzyma; przy pustym stole to legitymny rozwój. Pro nie przepala 5 many na trzeciego stworora, gdy ręka ma lepsze ruchy.',
    warianty: [
      { opis: 'main1, pusty stół', mana: 5, pole: [] },
      { opis: 'main1, mam już 4/4 i 1/1', mana: 5, pole: [{ id: 'duzy', karta: 'grizzled-outcasts' }, { id: 'maly', karta: 'soulmender' }] },
    ],
    budowa: (w) => stan({
      mana: { p1: w.mana },
      reka: [{ id: 'hurda-hand', karta: 'battle-hurda' }],
      pole: w.pole,
    }),
  },
  {
    id: 'HUR-02', karta: 'battle-hurda', wymiar: 'S',
    tytul: 'Blok 3/3 z first strike przeciw atakującemu 3/3 i 4/4 — czy bot odróżnia wymiany?',
    pro: 'First strike: 3/3 zabija 3/3 zanim ten zdąży uderzyć, lecz 4/4 przeżywa 3 obrażenia i zabija Hurdę w normalnej turze obrażeń. Pro blokuje pierwszy przypadek, a w drugim zachowuje stwora, o ile nie wymaga tego sytuacja.',
    warianty: [
      { opis: 'wróg atakuje 3/3 (FS zabija, Hurda przeżywa)', poleWrog: [{ id: 'atk-3-3', karta: 'grollub' }] },
      { opis: 'wróg atakuje 4/4 (FS nie zabija — Hurda ginie)', poleWrog: [{ id: 'atk-4-4', karta: 'grizzled-outcasts' }] },
    ],
    budowa: (w) => {
      const state = stan({
        krok: 'declare_attackers', aktywny: 'p2', priorytet: 'p1',
        pole: [
          { id: 'hurda-bf', karta: 'battle-hurda', gracz: 'p1' },
          ...w.poleWrog.map((x) => ({ id: x.id, karta: x.karta, gracz: 'p2' })),
        ],
      });
      deklarujAtak(state, 'p2', w.poleWrog.map((x) => x.id));
      // Wejście w krok bloków jak w silniku (game-state.js, CR 508.2):
      // deklaracja ataku NIE zmienia kroku — bez jawnego jumpToStep p1 nie
      // dostaje komend declare_blockers (pomiar: pass 0,00 bez ofert bloku).
      state.turn = jumpToStep(state.turn, 'declare_blockers', 'p1');
      state.turn.priorityPlayerId = 'p1';
      return state;
    },
  },

  // =========================================================================
  // 669. Lightning Spear — equip {1} (+1/+0 trample) i {2}{R} sac → 3 dmg.
  // Pytania: wybór hosta equipu (C), cel strzału (C: lecie w kill vs gracz),
  // i strzał bez sensu (S: ściana 0/4 — trzymaj sprzęt).
  // =========================================================================
  {
    id: 'SPE-01', karta: 'lightning-spear', wymiar: 'C',
    tytul: 'Equip {1}: wybór hosta — atakujący 4/4 vs 1/1; +1/+0 i trample mają trafić tam, gdzie przepchną',
    pro: 'Trample +1/+0 najbardziej robi na największym atakującym (4/4 → 5/5 z trample); 1/1 z trample przepchnie 1 i tyle. Pro wyposaża największego atakującego.',
    warianty: [
      { opis: 'mam 4/4 i 1/1, equip przed walką', pole: [{ id: 'duzy', karta: 'grizzled-outcasts' }, { id: 'maly', karta: 'soulmender' }] },
      { opis: 'mam tylko 1/1 (kontrola)', pole: [{ id: 'maly', karta: 'soulmender' }] },
    ],
    budowa: (w) => stan({
      // Equip {1} = „only as a sorcery" (CR 702.6b, abilities.js) — beginning_of_combat
      // nie jest oknem sorcery (pomiar PRZED: equip w ogóle nie w ofercie, bot
      // passował; widoczna była tylko darmowa aktywacja Soulmednera).
      krok: 'main1',
      mana: { p1: 2 },
      pole: [...w.pole, { id: 'spear-bf', karta: 'lightning-spear', gracz: 'p1' }],
    }),
  },
  {
    id: 'SPE-02', karta: 'lightning-spear', wymiar: 'C',
    tytul: 'Strzał {2}{R}: cel = stwór do zabicia (2/2) vs gracz przy życiu 3 (LETHAL) vs ściana 0/4',
    pro: 'Pro strzela w stwora, którego zabija (usuwa blokera); przy życiu wroga ≤3 strzela W GRACZA (koniec gry) — lethal zawsze wygrywa z chipem. Strzał w ścianę 0/4 = marnowanie sprzętu (nie zabija, nic nie robi) — trzymaj.',
    warianty: [
      { opis: 'wróg ma 2/2; życie wroga 20 (kill stwora)', cel: 'kill', zycie: { p1: 20, p2: 20 }, poleWrog: [{ id: 'wrog-3-3', karta: 'leafcrown-dryad' }] },
      { opis: 'wróg ma 2/2; życie wroga 3 (LETHAL w gracza)', cel: 'lethal', zycie: { p1: 20, p2: 3 }, poleWrog: [{ id: 'wrog-3-3', karta: 'leafcrown-dryad' }] },
      { opis: 'wróg ma tylko ścianę 0/4 (strzał nie zabija)', cel: 'hold', zycie: { p1: 20, p2: 20 }, poleWrog: [{ id: 'sciana', karta: 'mnemonic-wall' }] },
    ],
    budowa: (w) => {
      const state = stan({
        mana: { p1: 3 },
        zycie: w.zycie,
        pole: [{ id: 'spear-bf', karta: 'lightning-spear', gracz: 'p1' }],
      });
      for (const [i, wpis] of w.poleWrog.entries()) {
        put(state, wpis.id ?? `wrog-${i}`, wpis.karta, 'p2', 'battlefield');
        state.objects.set(wpis.id ?? `wrog-${i}`, Object.freeze({ ...state.objects.get(wpis.id ?? `wrog-${i}`), summoningSickness: false }));
      }
      return state;
    },
  },

  // =========================================================================
  // 670. Vaporkin ({1}{U} 2/1 flying, „can block only creatures with flying").
  // Pytania: atak przy wrogu Z/bez latania (C/S) i blok tylko lotników.
  // =========================================================================
  {
    id: 'VAP-01', karta: 'vaporkin', wymiar: 'S',
    tytul: 'Atak 2/1 flying: wróg ma tylko GROUND blokery (nie może zablokować) vs ma lotnika 2/2',
    pro: 'Vaporkin bez lotnika po stronie wroga jest niemal niezniszczalny w walce — atakuj zawsze. Gdy wróg ma lotnika, atak = fair trade 2/2-za-2/1 (wymiana neutralna, ale aktywna).',
    warianty: [
      { opis: 'wróg: dwa ground blokery 2/2 bez reach (nie zablokują)', poleWrog: [{ id: 'b1', karta: 'phyrexian-rager' }, { id: 'b2', karta: 'phyrexian-rager' }] },
      { opis: 'wróg: lotnik 2/2 (może zablokować)', poleWrog: [{ id: 'lotnik', karta: 'dementia-bat' }] },
    ],
    budowa: (w) => {
      const state = stan({
        krok: 'declare_attackers',
        pole: [{ id: 'vap-bf', karta: 'vaporkin', gracz: 'p1' }],
      });
      for (const [i, wpis] of w.poleWrog.entries()) {
        put(state, wpis.id ?? `wrog-${i}`, wpis.karta, 'p2', 'battlefield');
        state.objects.set(wpis.id ?? `wrog-${i}`, Object.freeze({ ...state.objects.get(wpis.id ?? `wrog-${i}`), summoningSickness: false }));
      }
      return state;
    },
  },
  {
    id: 'VAP-02', karta: 'vaporkin', wymiar: 'S',
    tytul: 'Blok: wróg atakuje ground 3/3 (Vaporkin NIE MOŻE blokować — restrykcja) i lotnika 2/1 (MOŻE)',
    pro: 'Restrykcja blokera: Vaporkin nie zablokuje ground 3/3 nawet, gdy to jedyny bloker — bot musi przyjąć 3 obrażenia i NIE próbować nielegalnego bloku. Blok lotnika 2/1 = legalna wymiana.',
    warianty: [
      { opis: 'wróg atakuje ground 3/3 (nieblokowalne)', poleWrog: [{ id: 'ground', karta: 'grollub' }] },
      { opis: 'wróg atakuje lotnika 2/1 (blok legalny)', poleWrog: [{ id: 'flyer', karta: 'nefarious-imp' }] },
    ],
    budowa: (w) => {
      const state = stan({
        krok: 'declare_attackers', aktywny: 'p2', priorytet: 'p1',
        pole: [
          { id: 'vap-bf', karta: 'vaporkin', gracz: 'p1' },
          ...w.poleWrog.map((x) => ({ id: x.id, karta: x.karta, gracz: 'p2' })),
        ],
      });
      deklarujAtak(state, 'p2', w.poleWrog.map((x) => x.id));
      // Wejście w krok bloków jak w silniku (game-state.js, CR 508.2):
      // deklaracja ataku NIE zmienia kroku — bez jawnego jumpToStep p1 nie
      // dostaje komend declare_blockers (pomiar: pass 0,00 bez ofert bloku).
      state.turn = jumpToStep(state.turn, 'declare_blockers', 'p1');
      state.turn.priorityPlayerId = 'p1';
      return state;
    },
  },

  // =========================================================================
  // 671. Coordinated Maneuver ({1}{W} instant, modal: salwa = # twoich
  // stworów / destroy enchantment).
  // Pytania: wybór TRYBU (C) — salwa zabija vs zniszczenie; i tryb jałowy (S).
  // =========================================================================
  {
    id: 'CM-01', karta: 'coordinated-maneuver', wymiar: 'C',
    tytul: 'Wybór trybu: 4 stworów (salwa 4 zabija 2/2) vs 1 stwór (salwa 1 — nie zabija) + enchantment wroga',
    pro: 'Przy 4+ stworach salwa to removal — bierz ją, jeśli zabija. Przy 1 stworze salwa = chip 1 (słaby), więc jeśli wróg ma enchantment realnie działający, niszcz go. Gdy salwa zabija, zwykle bije zniszczenie zwykłego enchantmentu.',
    warianty: [
      { opis: '4 moje stworów + wrogie enchantmenty + wrogi 2/2', moje: 4, wrogEnchant: true, wrog3: true },
      { opis: '1 mój stwór + wrogie enchantmenty + wrogi 2/2', moje: 1, wrogEnchant: true, wrog3: true },
    ],
    budowa: (w) => {
      const pole = [];
      for (let i = 0; i < w.moje; i += 1) pole.push({ id: `moj-${i}`, karta: 'soulmender', gracz: 'p1' });
      if (w.wrogEnchant) pole.push({ id: 'zacz', karta: 'clawing-torment', gracz: 'p2' });
      if (w.wrog3) pole.push({ id: 'wrog-3-3', karta: 'leafcrown-dryad', gracz: 'p2' });
      return stan({ mana: { p1: 2 }, reka: [{ id: 'cm-hand', karta: 'coordinated-maneuver' }], pole });
    },
  },
  {
    id: 'CM-02', karta: 'coordinated-maneuver', wymiar: 'S',
    tytul: 'Salwa 1 nie zabija 4/4, lecz stwór wroga jest enchantmentem — czy bot wybiera destroy?',
    pro: 'Fear of Burning Alive jest enchantment creature, więc destroy jest legalnym i silnym removalem; salwa 1 nie zabija 4/4. Pro wybiera destroy.',
    warianty: [
      { opis: '1 mój stwór, wróg ma 4/4 enchantment creature (salwa nie zabija, destroy legalny)', pole: [{ id: 'moj-0', karta: 'soulmender', gracz: 'p1' }, { id: 'duzy', karta: 'fear-of-burning-alive', gracz: 'p2' }] },
    ],
    budowa: (w) => stan({
      mana: { p1: 2 },
      reka: [{ id: 'cm-hand', karta: 'coordinated-maneuver' }],
      pole: w.pole,
    }),
  },

  // =========================================================================
  // 672. Malevolent Noble ({1}{B} 2/2; {2}, sac artefakt lub innego stwora
  // → +1/+1). Pytania: wybór KANDYDATA kosztu (C) i opłacalność aktywacji
  // (S/K): fodder vs dobry stwór.
  // =========================================================================
  {
    id: 'NOB-01', karta: 'malevolent-noble', wymiar: 'C',
    tytul: 'Wybór ofiary: Panic Spellbomb (artefakt 1) vs Highland Game 2/1 vs Outcasts 4/4 — kandydaci w jednej ofercie',
    pro: 'Pro poświęca NAJTAŃSZY/WAŻNY-najmniej permanent — artefakt 1-mana przed stworem 2/1 przed 4/4. Różnica straty powinna porządkować warianty aktywacji.',
    warianty: [
      { opis: 'kandydaci: artefakt 1, 2/1, 4/4', kandydaci: ['panic-spellbomb', 'highland-game', 'grizzled-outcasts'] },
      { opis: 'kandydaci: tylko 2/1 i 4/4 (bez artefaktu)', kandydaci: ['highland-game', 'grizzled-outcasts'] },
    ],
    budowa: (w) => stan({
      mana: { p1: 2 },
      pole: [
        { id: 'noble-bf', karta: 'malevolent-noble', gracz: 'p1' },
        ...w.kandydaci.map((karta, i) => ({ id: `kand-${i}`, karta, gracz: 'p1' })),
      ],
    }),
  },
  {
    id: 'NOB-02', karta: 'malevolent-noble', wymiar: 'K',
    tytul: 'Opłacalność aktywacji: artefakt-fodder dostępny (aktywuj) vs tylko dobry stwór 4/4 (trzymaj)',
    pro: '+1/+1 counter za darmowy artefakt (Spellbomb bez innych użyć) = zysk. Ten sam counter za 4/4 = strata karty i ciała — pro trzyma Nobla i czeka na fodder (albo gra go dopiero, gdy stwór i tak umiera).',
    warianty: [
      { opis: 'fodder: artefakt 1-mana', kandydaci: ['panic-spellbomb'] },
      { opis: 'fodder: tylko 4/4', kandydaci: ['grizzled-outcasts'] },
    ],
    budowa: (w) => stan({
      mana: { p1: 2 },
      pole: [
        { id: 'noble-bf', karta: 'malevolent-noble', gracz: 'p1' },
        ...w.kandydaci.map((karta, i) => ({ id: `kand-${i}`, karta, gracz: 'p1' })),
      ],
    }),
  },

  // =========================================================================
  // 673. Hired Blade ({2}{B} 3/2 flash).
  // Pytanie: flash — rzut w end step przeciwnika (bezpieczne okno) vs main1.
  // =========================================================================
  {
    id: 'HIR-01', karta: 'hired-blade', wymiar: 'T',
    tytul: '3/2 flash: main1 własnej tury vs end step przeciwnika (po removach) vs main1 przy wrogich blokerach',
    pro: 'Flash 3/2 pro gra w end step przeciwnika, gdy grozi mu removal przed walką; main1 jest OK, gdy stół jest czysty i ręka pusta (tempo). Przy wrogich blokerach z 2+ wytrzymałości 3/2 i tak zostaje do bloku.',
    warianty: [
      { opis: 'main1 własna tura, pusty stół', krok: 'main1', aktywny: 'p1', mana: 3, pole: [] },
      { opis: 'end step PRZECIWNIKA', krok: 'end', aktywny: 'p2', priorytet: 'p1', mana: 3, pole: [] },
      { opis: 'main1, wróg ma 2/2 (blokera nie ominie)', krok: 'main1', aktywny: 'p1', mana: 3, pole: [{ id: 'w1', karta: 'leafcrown-dryad', gracz: 'p2' }] },
    ],
    budowa: (w) => stan({
      krok: w.krok, aktywny: w.aktywny, priorytet: w.priorytet ?? w.aktywny,
      mana: { p1: w.mana },
      reka: [{ id: 'blade-hand', karta: 'hired-blade' }],
      pole: w.pole,
    }),
  },

  // =========================================================================
  // 674. Mister Gutsy (trigger Aura/Equipment → licznik; dies → X Junków).
  // Pytania: czy rzut Equipment przy Gutsym jest WYCEMIANY ponad zwykły
  // rozwój (paliwo triggera) i czy bot używa Junka (impulse w main2).
  // =========================================================================
  {
    id: 'GUT-01', karta: 'mister-gutsy', wymiar: 'T',
    tytul: 'Gutsy na stole + Lightning Spear w ręce: rzut Equipment (trigger licznik) vs bez Gutsiego',
    pro: 'Przy Gutsym rzut Equipment jest WARTOŚCIĄ PODWÓJNĄ (licznik + sprzęt na stół) — bot powinien go preferować wobec tego samego rzutu bez Gutsiego; bez Gutsiego to zwykły rozwój.',
    warianty: [
      { opis: 'Gutsy na stole, Spear w ręce, mana 2R', gutsy: true },
      { opis: 'BEZ Gutsiego, Spear w ręce (kontrola zwykłego rzutu)', gutsy: false },
    ],
    budowa: (w) => {
      const pole = [];
      if (w.gutsy) pole.push({ id: 'gutsy-bf', karta: 'mister-gutsy', gracz: 'p1' });
      const state = stan({ mana: { p1: 2 }, pole, reka: [{ id: 'spear-hand', karta: 'lightning-spear' }] });
      addMana(state, 'p1', 2, { colors: ['R'] });
      return state;
    },
  },
  {
    id: 'GUT-02', karta: 'token_junk', wymiar: 'K',
    tytul: 'Junk na stole, main2, spare mana: {T}, sac → exile top (may play this turn) — czy bot używa impulse?',
    pro: 'Junk bez innych użyć (nie atakuje, nie blokuje) to darmowy impulse: aktywacja nic nie kosztuje poza tokenem. Pro aktywuje w main2, gdy ręka jest słaba albo ma co dograć; gdy ręka pełna mocnych kart, token może poczekać (sac = strata „przyszłej" aktywacji).',
    warianty: [
      { opis: 'main2, ręka PUSTA (impulse = jedyny ruch)', krok: 'main2', reka: [] },
      { opis: 'main2, ręka: Outcasts 4/4 za 5 (impulse daje zagrywalny land, ale 2 + 1 to za mało na Outcasts)', krok: 'main2', reka: ['grizzled-outcasts'] },
    ],
    budowa: (w) => {
      const state = stan({
        krok: w.krok,
        mana: { p1: 2 },
        reka: w.reka.map((karta) => ({ id: `hand-${karta.replace(/[^a-z-]/g, '')}`, karta })),
      });
      // Token Junk ma status `token` (nie przechodzi przez createCardDeck /
      // assertDeckSupported) — obiekt budujemy RĘCZNIE jak create_token
      // (silnik syntezuje tok z deskryptora, nie z katalogu talii).
      addObject(state, {
        id: 'junk-bf', instanceId: 'instance-junk-bf', cardId: 'token_junk',
        controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
        name: 'Junk', kind: 'artifact', types: ['Artifact', 'Token'], subtypes: ['Junk'],
        colors: [], manaCost: 0,
        abilities: REGISTRY.get('token_junk').abilities,
      });
      return state;
    },
  },

  // =========================================================================
  // 675. Kozilek's Translator ({4}{B} 3/5 Devoid; Pay 1 life: Add {C},
  // raz na turę). Pytania: koszt życia a stan (S) i mana-only z pustą
  // ręką (M167/D).
  // =========================================================================
  {
    id: 'TRA-01', karta: 'kozileks-translator', wymiar: 'K',
    tytul: '„Pay 1 life: Add {C}": ręka z drogi czarem (potrzeba many) vs PUSTA ręka vs życie 3',
    pro: 'Rozgrywaj tylko wtedy, gdy mana PRZEWIDZIANA na coś się przyda: ręka z 5-mana czarem przy 4 manach = tak; pusta ręka = mana wyparuje (nie rób); życie 3 = koszt życia pod presją to ryzyko śmierci — trzymaj, chyba że mana kończy partię.',
    warianty: [
      { opis: 'życie 20, ręka: Outcasts (5) — {C} dopełnia', zycie: 20, reka: ['grizzled-outcasts'], mana: 4 },
      { opis: 'życie 20, ręka PUSTA (mana-marnotrawstwo)', zycie: 20, reka: [], mana: 0 },
      { opis: 'życie 3, ręka: Outcasts (koszt życia krytyczny)', zycie: 3, reka: ['grizzled-outcasts'], mana: 4 },
    ],
    budowa: (w) => stan({
      zycie: { p1: w.zycie, p2: 20 },
      mana: { p1: w.mana },
      pole: [{ id: 'tra-bf', karta: 'kozileks-translator', gracz: 'p1' }],
      reka: w.reka.map((karta) => ({ id: `hand-${karta.replace(/[^a-z-]/g, '')}`, karta })),
    }),
  },
];
// ---------------------------------------------------------------------------
// Wykonanie i wydruk
// ---------------------------------------------------------------------------

/** Score do wydruku: liczba z dwoma miejscami, `null`/`undefined` jako `—`. */
function fmtScore(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v.toFixed(2) : String(v ?? '—');
}

/**
 * Etykieta komendy z WYRÓŻNIAJĄCYMI ją parametrami: `resolve_explore_choice` ma dwie
 * legalne postaci (`putInGraveyard: true|false`), a sam `type` ich nie rozróżnia — bez
 * parametrów raport nie pokazywałby, którą gałąź bot wybrał (L24: pomiar ma być jawny).
 */
function etykietaCmd(cmd) {
  if (!cmd) return '(brak)';
  const { type, playerId, ...reszta } = cmd;
  const klucze = Object.keys(reszta).filter((k) => reszta[k] !== undefined && reszta[k] !== null);
  if (!klucze.length) return type;
  const opis = klucze.map((k) => `${k}:${JSON.stringify(reszta[k])}`).join(',');
  return `${type}{${opis.length > 90 ? `${opis.slice(0, 87)}...` : opis}}`;
}

/**
 * Rozlicza stos do końca. Dla `gracz` (bot) każdy wybór pochodzi z heurystyki i TRAFIA DO
 * `przebieg` razem ze score — bez tego zdolność zostaje na stosie (przeciwnik w sondzie
 * nigdy nie pasuje) i pomiar sekwencji jest niepełny: crew bez rozliczenia nie animuje
 * pojazdu, ETB bez rozliczenia nie wybiera celu, explore bez rozliczenia nie decyduje
 * wierzch/grob. Dla przeciwnika wybór jest mechaniczny (pierwszy `resolve_*`, inaczej
 * `pass_priority`) — sonda mierzy bota, nie rywala.
 */
function rozliczStos(state, gracz, przebieg, limit = 40) {
  for (let i = 0; i < limit; i += 1) {
    const holder = state.turn.priorityPlayerId;
    const cmds = playerView(state, holder)?.legalCommands ?? [];
    const rozwiazania = cmds.filter((c) => c.type.startsWith('resolve_'));
    // Koniec: stos pusty i brak decyzji do podjęcia (pending* — explore, scry, backup... —
    // zgłaszają się jako `resolve_*`, więc ten warunek łapie je wszystkie bez enumeracji pól).
    if (!state.zones.stack.length && !rozwiazania.length) return;
    let pick = null;
    let wpis = null;
    if (holder === gracz) {
      const d = decyzja(state, holder);
      const ocenione = d.opcje.filter((o) => o.cmd?.type?.startsWith('resolve_'))
        .sort((x, y) => (y.score ?? -Infinity) - (x.score ?? -Infinity));
      pick = ocenione.length ? ocenione[0].cmd
        : (d.cmd?.type === 'concede' ? { type: 'pass_priority' } : d.cmd);
      const czyRozwiazanie = Boolean(pick?.type?.startsWith('resolve_'));
      // Ślad bota (`trace()`) niesie ETYKIETĘ, nie obiekt komendy, a obie gałęzie explore
      // mają tę samą etykietę — więc przy `resolve_*` logujemy wykonaną komendę z
      // parametrami (`putInGraveyard`) plus kształty wszystkich legalnych gałęzi i score'y
      // ze śladu. Bez tego raport nie pokazywałby, KTÓRĄ gałąź bot wybrał (L24).
      wpis = {
        krok: `stos-${i + 1}`,
        cmd: czyRozwiazanie ? etykietaCmd(pick) : d.wybrano,
        score: d.score,
        ok: null,
        powod: null,
        ...(czyRozwiazanie ? {
          galezie: rozwiazania.map((c) => etykietaCmd(c)),
          scoreOpcji: d.opcje.filter((o) => String(o.cmd).startsWith('resolve_')).map((o) => fmtScore(o.score)),
        } : {}),
      };
      przebieg.push(wpis);
    } else {
      pick = rozwiazania[0] ?? cmds.find((c) => c.type === 'pass_priority');
    }
    if (!pick) return;
    const res = execute(state, pick);
    if (wpis) { wpis.ok = Boolean(res?.ok); wpis.powod = res?.reason ?? null; }
    if (!res?.ok) return;
  }
}

function uruchom(scenariusz, { przelot = false } = {}) {
  // Scenariusz, którego pytanie PRO dotyczy SEKWENCJI (crew → atak, ETB → cel, explore →
  // wierzch/grob), ma `przelot: true` — inaczej pomiar musiałby być odpalany drugi raz z
  // flagą CLI, a artefakt `.arena/pmssb90-przed.log` nie odpowiadałby na własne pytanie.
  const czyPrzelot = przelot || scenariusz.przelot === true;
  const warianty = scenariusz.warianty ?? [{}];
  return warianty.map((w) => {
    const state = scenariusz.budowa(w);
    const d = decyzja(state, 'p1');
    const top = [...d.opcje].sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity)).slice(0, 5);
    // ZRZUT PRZED sekwencją: `stan` jest mutowany przez `execute`, więc bez tego przy
    // --przebieg raport pokazywałby stan KOŃCOWY i ostatni (a nie pierwszy) wybór bota.
    const stanPrzed = opisStanu(state, 'p1');
    const wybranoPrzed = d.wybrano;
    const scorePrzed = d.score;
    const przebieg = [];
    if (czyPrzelot) {
      let cmd = d.cmd;
      let etykieta = d.wybrano;
      let scoreKroku = d.score;
      for (let i = 0; i < 6 && cmd && cmd.type !== 'pass_priority'; i += 1) {
        const res = execute(state, cmd);
        przebieg.push({ krok: i + 1, cmd: etykieta, score: scoreKroku, ok: Boolean(res?.ok), powod: res?.reason ?? null });
        if (!res?.ok) break;
        rozliczStos(state, 'p1', przebieg);
        const nast = decyzja(state, 'p1');
        przebieg[przebieg.length - 1].nastepnie = nast.wybrano;
        cmd = nast.cmd?.type === 'concede' ? null : nast.cmd;
        etykieta = nast.wybrano;
        scoreKroku = nast.score;
      }
    }
    return {
      id: scenariusz.id,
      karta: scenariusz.karta,
      wymiar: scenariusz.wymiar,
      wariant: w.opis ?? w.krok ?? '(bazowy)',
      stan: stanPrzed,
      wybrano: wybranoPrzed,
      score: scorePrzed,
      alternatywy: top.map((o) => ({ cmd: o.cmd, score: o.score })),
      ...(czyPrzelot ? { przebieg, stanPo: opisStanu(state, 'p1') } : {}),
    };
  });
}

const arg = (nazwa) => {
  const hit = process.argv.find((a) => a.startsWith(`--${nazwa}=`));
  return hit ? hit.slice(nazwa.length + 3) : null;
};
const flaga = (nazwa) => process.argv.includes(`--${nazwa}`);

export function pomiarPrzed({ karta = null, scen = null, przelot = false } = {}) {
  const wybrane = SCENARIUSZE.filter((s) => (!karta || s.karta === karta) && (!scen || s.id === scen));
  return wybrane.flatMap((s) => uruchom(s, { przelot }));
}

export { SCENARIUSZE, stan, put, decyzja, opisStanu, pt };

const uruchomionaBezposrednio = () =>
  import.meta.url === pathToFileURL(path.resolve(fs.realpathSync(process.argv[1]))).href;

if (uruchomionaBezposrednio()) {
  const tylkoJson = flaga('json');
  const przelot = flaga('przebieg');
  const wyniki = pomiarPrzed({ karta: arg('karta'), scen: arg('scen'), przelot });
  if (tylkoJson) {
    console.log(JSON.stringify(wyniki, null, 2));
  } else {
    console.log('=== PMSSB-92 — POMIAR (batch 75: T=moment, C=cel, S=kontekst, K=koszt) ===\n');
    let ostatnia = null;
    for (const w of wyniki) {
      if (w.karta !== ostatnia) {
        console.log(`\n--- ${w.karta} ---`);
        ostatnia = w.karta;
      }
      console.log(`[${w.id}] (${w.wymiar}) ${w.wariant}`);
      console.log(`    ${w.stan}`);
      console.log(`    BOT: ${w.wybrano ?? '(brak)'}  score=${typeof w.score === 'number' ? w.score.toFixed(2) : w.score}`);
      console.log(`    alternatywy: ${w.alternatywy.map((a) => `${a.cmd}=${typeof a.score === 'number' ? a.score.toFixed(2) : a.score}`).join(' | ')}`);
      for (const k of w.przebieg ?? []) {
        const score = k.score === undefined || k.score === null ? '' : ` score=${k.score.toFixed(2)}`;
        console.log(`    przebieg ${k.krok}: ${k.cmd}${score} ok=${k.ok}${k.powod ? ` (${k.powod})` : ''}`
          + `${k.nastepnie ? ` → następnie ${k.nastepnie}` : ''}`);
        if (k.galezie?.length) {
          console.log(`      gałęzie dostępne: ${k.galezie.join(' | ')}`);
          console.log(`      score'y opcji resolve_* ze śladu: ${(k.scoreOpcji ?? []).join(' , ')}`);
        }
      }
      if (w.stanPo) {
        console.log('    stan PO przebiegu:');
        for (const linia of w.stanPo.split('\n')) console.log(`      ${linia}`);
      }
    }
    console.log(`\n=== scenariuszy: ${wyniki.length} (kart: ${new Set(wyniki.map((w) => w.karta)).size}) ===`);
  }
}
