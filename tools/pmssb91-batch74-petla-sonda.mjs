// PMSSB-91 — POMIAR PRZED: macierzowa sonda scoringu bota dla Batcha 74 (karty 656–665).
//
// Uruchomienie:
//   node tools/pmssb91-batch74-petla-sonda.mjs                 # tabela tekstowa
//   node tools/pmssb91-batch74-petla-sonda.mjs --json          # JSON
//   node tools/pmssb91-batch74-petla-sonda.mjs --karta=grollub # jedna karta
//   node tools/pmssb91-batch74-petla-sonda.mjs --scen=G-01     # jeden scenariusz
//   node tools/pmssb91-batch74-petla-sonda.mjs --przebieg      # wykonuj wybory krok po kroku
//
// Dlaczego NOWA sonda, a nie rozszerzenie PMSSB-90 (plan
// `docs/plans/PLAN_2026-11-16-pmssb91-batch74-petla.md` §1): Batch 74 dokłada cztery klasy
// decyzji, których harness batcha 73 nie modeluje — (1) koszt `{T}` źródła płacony w turze
// PRZECIWNIKA (Saltfield Recluse), (2) poświęcenie własnego permanentu z produkcją many
// (Memorial to Genius, Temur Banner), (3) trigger modalny na wejściu rozstrzygany na stosie
// (Gylwain → wybór Roli), (4) zmiana stanu GRACZA (rad counters, Mirelurk Queen). Poprzednie
// `SCENARIUSZE` PMSSB-90 muszą zostać odtwarzalne w zamrożonym kształcie (L24).
//
// Harness jest kopią H-1…H-7 z PMSSB-90 z trzema rozszerzeniami czytnika stanu:
// `rad`/`attackedThisTurn` graczy oraz `ATAKUJE`/`BLOKUJE` na obiektach — bez nich raport
// nie pokazywałby, czy trigger Radiacji/Raid w ogóle jest aktywny w danym scenariuszu.
//
// Sonda NIE ocenia automatycznie: drukuje fakty (wybór, cel, score alternatyw, stan),
// a werdykt pro-playera jest w raporcie §PMSSB-91 (L24).
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

/**
 * Bladewheel Chariot na polu przez craft (CR 702.167a) — wzór z
 * `test/real-cards-batch73.test.js:chariotAfterCraft`: front + JEDEN inny artefakt, więc
 * wygnanie jest automatyczne (decyzja właściciela: jeden kandydat nie otwiera modalu)
 * i transform jest synchroniczny.
 */
function chariotPoCrafcie(state, controller = 'p1') {
  put(state, 'saw', 'spring-loaded-sawblades', controller);
  put(state, 'mat', 'angels-feather', controller);
  applyEffect(state, { type: 'craft_transform' }, state.objects.get('saw'), [], {});
  const id = state.zones.battlefield.find((oid) => state.objects.get(oid)?.cardId === 'bladewheel-chariot'
    && state.objects.get(oid)?.controllerId === controller);
  if (!id) throw new Error('po craft tył DFC (Bladewheel Chariot) powinien być na polu bitwy');
  return id;
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


// ---------------------------------------------------------------------------
// Scenariusze: T = moment (tura/faza/okno), C = cel, S = kontekst stanu, K = koszt/okazja
// ---------------------------------------------------------------------------

const SCENARIUSZE = [
  // =========================================================================
  // 656. Grollub ({2}{B} 3/3) — trigger „is dealt damage → each opponent gains
  // that much life". Batch 74/Etap 2A dołożył ścieżkę `gain_life` z
  // `scope: 'each_opponent'` + `amountFrom: 'damageAmount'`. Pytanie pętli:
  // czy ta ścieżka jest w ogóle WYCENIANA (nowy efekt = ryzyko „niewycenione")
  // i czy bot nie atakuje Grollubem w ścianę dając wrogowi darmowe życie.
  // =========================================================================
  {
    id: 'G-01', karta: 'grollub', wymiar: 'T',
    tytul: 'Grollub w ręce: kiedy bot go wystawia (main1 puste pole vs pełny stół vs niskie życie)',
    pro: '3/3 za 3 to solidne tempo przy pustym stole; przy niskim życiu (≤6) i wrogu z atakującym 3/3 — bloker z klasą. Pro NIE wystawia go w wyścigu, gdzie każdy blok leczy wroga o 3+; ale przy pustym stole rzut jest po prostu dobry.',
    warianty: [
      { opis: 'main1, pusty stół po obu stronach', życie: { p1: 20, p2: 20 }, pole: [] },
      { opis: 'main1, wróg ma 2/2 (blok-wymiana: my 3/3 zabija 2/2, heal 2 wrogowi)', życie: { p1: 20, p2: 20 }, pole: [{ id: 'wrog-2-2', karta: 'leafcrown-dryad', gracz: 'p2' }] },
      { opis: 'main1, moje życie 5, wróg ma 4/4 atakującego', życie: { p1: 5, p2: 20 }, pole: [{ id: 'wrog-4-4', karta: 'grizzled-outcasts', gracz: 'p2' }] },
    ],
    budowa: (w) => stan({
      mana: { p1: 3 },
      zycie: w.zycie,
      reka: [{ id: 'grollub-hand', karta: 'grollub' }],
      pole: w.pole,
    }),
  },
  {
    id: 'G-02', karta: 'grollub', wymiar: 'S',
    tytul: 'Grollub na stole: czy bot ATAKUJE w blokera, który da wrogowi darmowy heal (ściana 0/4, 1/5)?',
    pro: 'Atak 3/3 w ścianę 0/4 to prezent: 3 życia dla wroga i 0 obrażeń. Pro nie atakuje w ścianę, jeśli nie ma sposobu na jej usunięcie (np. nie ma trample). Analogicznie blok 3/3 w atakującego 1/1 (zabija go, ale daje 1 życie) jest OK, a blok w 5/5 (traci Grolluba + 5 życia wrogowi) — nie.',
    warianty: [
      { opis: 'wróg: ściana 0/4 (nie atakuje, tylko blokuje)', poleWrog: [{ id: 'sciana', karta: 'mnemonic-wall' }] },
      { opis: 'wróg: 5/5 atakujący (blok = oddaję 5 życia wrogowi)', poleWrog: [{ id: 'duzy', karta: 'grizzled-outcasts' }] },
      { opis: 'wróg: 1/1 ({blok = zabijam i oddaję 1 życie}', poleWrog: [{ id: 'maly', karta: 'soulmender' }] },
    ],
    budowa: (w) => {
      const state = stan({
        krok: 'declare_attackers', aktywny: 'p2', priorytet: 'p1',
        pole: [{ id: 'grollub-bf', karta: 'grollub', gracz: 'p1' }],
      });
      for (const [i, wpis] of (w.poleWrog ?? []).entries()) {
        const id = wpis.id ?? `wrog-${i}`;
        put(state, id, wpis.karta, 'p2', 'battlefield');
        state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
      }
      deklarujAtak(state, 'p2', (w.poleWrog ?? []).map((x, i) => x.id ?? `wrog-${i}`));
      state.turn.priorityPlayerId = 'p1';
      return state;
    },
  },
  {
    id: 'G-03', karta: 'grollub', wymiar: 'C',
    tytul: 'wróg ma Grolluba: czy bot CELUJE w niego removalem (Shock 2) wiedząc, że to leczy WROGA?',
    pro: 'Shock w Grolluba przeciwnika to 2 obrażenia i 2 życia wrogowi — jeśli nie zabija (3/3), to strata karty. Pro zabija go tylko, gdy realnie blokuje plan (np. jedyny bloker), i nigdy nie „strzela dla zasady". Uwaga na stronę: Grollub GŁOSI „each opponent gains" — czyli gdy wróg ma Grolluba, to MY zyskujemy życie (dobrze!), a gdy my mamy Grolluba, wróg zyskuje.',
    warianty: [
      { opis: 'mój Shock vs Grollub wroga (3/3, nie zabija — heal dla MNIE jest OK)', cel: 'grollub-wroga' },
      { opis: 'mój Grollub dostaje 2 z mojego Shoca? (nielegalne — tylko wróg może) — pominięty', cel: null },
    ],
    budowa: () => stan({
      mana: { p1: 1 },
      reka: [{ id: 'shock-hand', karta: 'shock' }],
      pole: [
        { id: 'grollub-wroga', karta: 'grollub', gracz: 'p2' },
        { id: 'moj-grollub', karta: 'grollub', gracz: 'p1' },
      ],
    }),
  },

  // =========================================================================
  // 657. Saltfield Recluse ({2}{W} 1/2, {T}: target creature gets -2/-0 EOT) —
  // pytanie o OKNO: efekt „do końca tury" wyparuje, więc użycie w main1/main2
  // własnej tury (bez walki) jest stratą tapnięcia ciała na stole.
  // =========================================================================
  {
    id: 'SR-01', karta: 'saltfield-recluse', wymiar: 'T',
    tytul: 'zdolność {T} -2/-0 w każdym kroku własnej tury (gdzie bot ją odpala?)',
    pro: 'Tylko w walce: przed blokerami (wzmocnienie własnego atakującego) albo w turze przeciwnika przed jego deklaracją ataku (osłabienie atakującego). W main1/main2 bez walki — NIE (tapnięcie 1/2 zostawia nas bez blokera, a efekt wyparuje).',
    warianty: KROKI_TURY.filter((k) => k !== 'untap').map((krok) => ({ krok })),
    budowa: (w) => stan({
      krok: w.krok,
      mana: { p1: 0 },
      pole: [
        { id: 'recluse', karta: 'saltfield-recluse', gracz: 'p1' },
        { id: 'nasz-3-3', karta: 'grollub', gracz: 'p1' },
        { id: 'wrog-3-3', karta: 'grizzled-outcasts', gracz: 'p2', tap: false },
      ],
    }),
  },
  {
    id: 'SR-02', karta: 'saltfield-recluse', wymiar: 'C',
    tytul: 'wybór celu: atakujący 4/4 vs 1/1 vs własny stwór vs moc 0',
    pro: 'Celuje w największego ATAKUJĄCEGO wroga (realnie ratuje życie / zmienia wymianę). 1/1 (moc już 0 po -2? nie: 1-2 = 0 → ginie od SBA przy 0? nie, 0 mocy żyje) — strata. Własny stwór: tylko by ratować z wymiany, ale tu nie ma walki. Moc 0: bez sensu.',
    warianty: [
      { opis: 'wróg: atakujący 4/4 i 1/1 (kogo osłabia?)', poleWrog: [{ id: 'w-4-4', karta: 'grizzled-outcasts', atak: true }, { id: 'w-1-1', karta: 'soulmender', atak: true }] },
      { opis: 'wróg: tylko 1/1 atakujący', poleWrog: [{ id: 'w-1-1', karta: 'soulmender', atak: true }] },
      { opis: 'wróg: moc 0 (wall of wood) atakujący', poleWrog: [{ id: 'w-0', karta: 'emissary-escort', atak: true }] },
    ],
    budowa: (w) => {
      const state = stan({
        krok: 'declare_attackers', aktywny: 'p2', priorytet: 'p1',
        pole: [{ id: 'recluse', karta: 'saltfield-recluse', gracz: 'p1' }],
      });
      const ataki = [];
      for (const wpis of w.poleWrog) {
        put(state, wpis.id, wpis.karta, 'p2', 'battlefield');
        state.objects.set(wpis.id, Object.freeze({ ...state.objects.get(wpis.id), summoningSickness: false }));
        if (wpis.atak) ataki.push(wpis.id);
      }
      if (ataki.length) deklarujAtak(state, 'p2', ataki);
      state.turn.priorityPlayerId = 'p1';
      return state;
    },
  },

  // =========================================================================
  // 658. Memorial to Genius (land, {4}{U},{T},Sac: draw 2) — pytanie o OKNO
  // poświęcenia źródła many i o PROG biblioteki (deck-out).
  // =========================================================================
  {
    id: 'MG-01', karta: 'memorial-to-genius', wymiar: 'T',
    tytul: 'Memorial na stole w każdym kroku własnej tury: kiedy bot poświęca land za 2 karty?',
    pro: 'Nie w main1 (traci źródło many na resztę tury, a karty dobrane teraz i tak leżą do następnej tury) — chyba że brakuje odpowiedzi TERAZ. Optymalnie: koniec tury przeciwnika (mana sink po odkręceniu) albo main2 przy pustej ręce i nadmiarze lądów.',
    warianty: KROKI_TURY.filter((k) => k !== 'untap').map((krok) => ({ krok })),
    budowa: (w) => stan({
      krok: w.krok,
      mana: { p1: 5 },
      // 7 lądów: nadmiar many? Nie — 5 many w puli + Memorial na stole.
      pole: [
        { id: 'memorial', karta: 'memorial-to-genius', gracz: 'p1' },
        { id: 'reka-a', karta: 'leafcrown-dryad', gracz: 'p1', zone: 'hand' },
      ],
      reka: [],
    }),
  },
  {
    id: 'MG-02', karta: 'memorial-to-genius', wymiar: 'S',
    tytul: 'stan: manascrew (5 lądów, drogi czar w ręce) vs flood (9 lądów, pusta ręka) vs cienka biblioteka (3 karty)',
    pro: 'Manascrew: NIE poświęca (spadnie do 4 many). Flood + pusta ręka: TAK (nadmiarowy land → 2 karty). Biblioteka 3 karty: NIE (deck-out = przegrana, CR 121.4/704.5b) — chyba że dobranie i tak wygrywa w tej turze.',
    warianty: [
      { opis: 'manascrew: 5 lądów na stole, w ręce 6-manowy czar', pole_lady: 4, reka: [{ karta: 'grizzled-outcasts' }], biblioteka: 20 },
      { opis: 'flood: 9 lądów, pusta ręka', pole_lady: 8, reka: [], biblioteka: 20 },
      { opis: 'cienka biblioteka: 3 karty, nadmiar lądów', pole_lady: 8, reka: [], biblioteka: 3 },
      { opis: 'pusta biblioteka (1 karta)', pole_lady: 8, reka: [], biblioteka: 1 },
    ],
    budowa: (w) => {
      const pole = [{ id: 'memorial', karta: 'memorial-to-genius', gracz: 'p1' }];
      for (let i = 0; i < w.pole_lady; i += 1) pole.push({ id: `land-${i}`, karta: 'basic-island', gracz: 'p1' });
      return stan({
        krok: 'main2',
        mana: { p1: 5 },
        pole,
        reka: w.reka.map((r, i) => ({ id: `reka-${i}`, karta: r.karta })),
        biblioteka: Array.from({ length: w.biblioteka }, (_, i) => ({ id: `bib-${i}`, karta: 'basic-island', gracz: 'p1' })),
      });
    },
  },

  // =========================================================================
  // 659. Gylwain, Casting Director — trigger modalny na wejściu; wybór Roli
  // (Royal +1/+1 ward{1} / Sorcerer +1/+1 scry-on-attack / Monster +1/+1 trample).
  // =========================================================================
  {
    id: 'GY-01', karta: 'gylwain-casting-director', wymiar: 'T',
    tytul: 'kolejność w main1: Gylwain (3 many) vs drugi stwór (2 many) — kogo bot wystawia pierwszego?',
    pro: 'Najpierw Gylwaina, żeby drugi stwór też dostał Rolę (+1/+1 i keyword) — to darmowa karta wartości na tym samym stole. Odwrotna kolejność marnuje trigger.',
    warianty: [
      { opis: 'mana 3: tylko Gylwain możliwy', mana: 3 },
      { opis: 'mana 5: Gylwain (3) + Grizzly Bears (2) oba możliwe', mana: 5 },
      { opis: 'mana 5, ale Grizzly Bears jest w ręce i Gylwain też', mana: 5, oba: true },
    ],
    budowa: (w) => stan({
      mana: { p1: w.mana },
      reka: [{ id: 'gylwain-hand', karta: 'gylwain-casting-director' },
        ...(w.oba ? [] : [{ id: 'bears-hand', karta: 'leafcrown-dryad' }])],
      pole: w.oba ? [] : [],
    }),
  },
  {
    id: 'GY-02', karta: 'gylwain-casting-director', wymiar: 'C', przelot: true,
    tytul: 'wybór trybu Roli dla 2/2 (bez keywordów): Royal / Sorcerer / Monster — co bot wybiera?',
    pro: 'Dla zwykłego 2/2 bez ewazji: Royal (ward {1}) jest najczęściej lepszy (chroni zainwestowane karty), Monster tylko przy realnym chump-blocku wroga, Sorcerer przy słabej ręce. Wszystkie trzy są blisko — pomiar ma pokazać, czy bot W OGÓLE rozróżnia tryby.',
    warianty: [
      { opis: 'host 2/2, wróg ma 2/2 (chump-block możliwy)' },
      { opis: 'host 4/4, wróg ma 3x 1/1 (chump-block pewny → Monster)' },
      { opis: 'host 2/2, pusta ręka (Sorcerer = scry pomocny)' },
    ],
    budowa: (w) => {
      const state = stan({
        mana: { p1: 3 },
        reka: [{ id: 'gylwain-hand', karta: 'gylwain-casting-director' }],
        pole: [{ id: 'host', karta: w.opis?.includes('4/4') ? 'grizzled-outcasts' : 'leafcrown-dryad', gracz: 'p1' }],
      });
      if (w.opis?.includes('3x 1/1')) {
        for (let i = 0; i < 3; i += 1) {
          put(state, `chump-${i}`, 'soulmender', 'p2', 'battlefield');
          state.objects.set(`chump-${i}`, Object.freeze({ ...state.objects.get(`chump-${i}`), summoningSickness: false }));
        }
      } else if (w.opis?.includes('wróg ma 2/2')) {
        put(state, 'wrog-2-2', 'leafcrown-dryad', 'p2', 'battlefield');
        state.objects.set('wrog-2-2', Object.freeze({ ...state.objects.get('wrog-2-2'), summoningSickness: false }));
      }
      return state;
    },
  },

  // =========================================================================
  // 660. Lambholt Harrier ({1}{R} 2/2, {3}{R}: target creature can't block) —
  // pytanie o OKNO (tylko przed blokerami) i CEL (najgroźniejszy odkręcony bloker).
  // =========================================================================
  {
    id: 'LH-01', karta: 'lambholt-harrier', wymiar: 'T',
    tytul: 'zdolność cant_block w każdym kroku własnej tury (gdzie bot ją odpala?)',
    pro: 'Tylko w main1 lub beginning_of_combat — PRZED deklaracją blokerów. W main2 i w krokach po walce efekt jest martwy (ruling MID 2021-09-24).',
    warianty: KROKI_TURY.filter((k) => k !== 'untap').map((krok) => ({ krok })),
    budowa: (w) => stan({
      krok: w.krok,
      mana: { p1: 4 },
      pole: [
        { id: 'harrier', karta: 'lambholt-harrier', gracz: 'p1' },
        { id: 'nasz-atak', karta: 'grizzled-outcasts', gracz: 'p1' },
        { id: 'bloker', karta: 'leafcrown-dryad', gracz: 'p2' },
      ],
    }),
  },
  {
    id: 'LH-02', karta: 'lambholt-harrier', wymiar: 'C',
    tytul: 'wybór celu: odkręcony bloker 4/4 vs TAPNIĘTY 4/4 vs własny stwór',
    pro: 'Tylko O DKRĘCONY bloker przeciwnika, który realnie zatrzyma atak. Tapnięty bloker nic nie blokuje (zdolność marnotrawiona), własny stwór — nigdy.',
    warianty: [
      { opis: 'odkręcony 4/4 + tapnięty 4/4 (kogo wybiera?)', poleWrog: [{ id: 'odk', karta: 'grizzled-outcasts', tap: false }, { id: 'tap', karta: 'grizzled-outcasts', tap: true }] },
      { opis: 'tylko tapnięty 4/4', poleWrog: [{ id: 'tap', karta: 'grizzled-outcasts', tap: true }] },
      { opis: 'tylko własny 4/4 na stole (brak legalnego wrogiego blokera? są — własne stwory SĄ legalnym celem cant_block!)', poleWrog: [] },
    ],
    budowa: (w) => {
      const state = stan({
        krok: 'main1',
        mana: { p1: 4 },
        pole: [
          { id: 'harrier', karta: 'lambholt-harrier', gracz: 'p1' },
          { id: 'nasz-4-4', karta: 'grizzled-outcasts', gracz: 'p1' },
        ],
      });
      for (const wpis of w.poleWrog) {
        put(state, wpis.id, wpis.karta, 'p2', 'battlefield');
        state.objects.set(wpis.id, Object.freeze({ ...state.objects.get(wpis.id), summoningSickness: false }));
        if (wpis.tap) tapObject(state, wpis.id, 'p2');
      }
      return state;
    },
  },

  // =========================================================================
  // 661. Arrow Storm ({3}{R}{R} sorcery 4 dmg; Raid → 5 dmg nieprewencyjne).
  // Kluczowe pytanie: czy bot ATTACKUJE najpierw (Raid) i strzela w main2?
  // =========================================================================
  {
    id: 'AS-01', karta: 'arrow-storm', wymiar: 'T',
    tytul: 'Raid NIEaktywny vs aktywny (attackedThisTurn) na tym samym celu 5/5 — czy bot czeka na atak?',
    pro: 'Po ataku 5 obrażeń zabija 5/5 (i omija prewencję); przed atakiem 4 nie zabija nic. Rzut w main1 bez Raidu to zmarnowana karta. Pro: atak najpierw, strzał w main2.',
    warianty: [
      { opis: 'main1, attackedThisTurn = false, cel 5/5 (Shock 4 nie zabija)', raid: false },
      { opis: 'main2, attackedThisTurn = true, ten sam cel 5/5', raid: true },
    ],
    budowa: (w) => {
      const state = stan({
        krok: w.raid ? 'declare_attackers' : 'main1',
        mana: { p1: 5 },
        reka: [{ id: 'storm-hand', karta: 'arrow-storm' }],
        pole: [
          { id: 'atakujacy', karta: 'grizzled-outcasts', gracz: 'p1' },
          { id: 'cel-5-5', karta: 'gloomfang-mauler', gracz: 'p2' },
        ],
      });
      if (w.raid) {
        // Raid liczy FAKT deklaracji ataku (CR 508.1) — deklarujemy w kroku walki,
        // potem przenosimy się do main2, gdzie sorcery jest legalne.
        deklarujAtak(state, 'p1', ['atakujacy']);
        state.turn = jumpToStep(state.turn, 'main2', 'p1');
      }
      return state;
    },
  },
  {
    id: 'AS-02', karta: 'arrow-storm', wymiar: 'C',
    tytul: 'wybór celu: token 1/1 vs gracz 5 życia vs stwór 5/5 (Raid aktywny)',
    pro: 'Przy Raid i wrogu na 5: twarz = wygrana. Stwór 5/5 = usunięcie zagrożenia. Token 1/1 = marnotrawstwo 5 many (chyba że token blokuje lethal — tu nie).',
    warianty: [
      { opis: 'wróg 5 życia + stwór 5/5 + token 1/1 (Raid)', zycieP2: 5 },
      { opis: 'wróg 20 życia + stwór 5/5 + token 1/1 (Raid)', zycieP2: 20 },
      { opis: 'wróg 20 życia, tylko token 1/1 (Raid)', zycieP2: 20, tylkoToken: true },
    ],
    budowa: (w) => {
      const state = stan({
        krok: 'declare_attackers',
        zycie: { p1: 20, p2: w.zycieP2 },
        mana: { p1: 5 },
        reka: [{ id: 'storm-hand', karta: 'arrow-storm' }],
        pole: [{ id: 'atakujacy', karta: 'grizzled-outcasts', gracz: 'p1' },
          { id: 'token-1-1', karta: 'soulmender', gracz: 'p2' },
          ...(w.tylkoToken ? [] : [{ id: 'cel-5-5', karta: 'gloomfang-mauler', gracz: 'p2' }])],
      });
      deklarujAtak(state, 'p1', ['atakujacy']);
      state.turn = jumpToStep(state.turn, 'main2', 'p1');
      return state;
    },
  },

  // =========================================================================
  // 662. Loxodon Partisan ({4}{W} 3/4, battle cry) — czy declare_attackers
  // widzi +1/+0 dla współatakujących?
  // =========================================================================
  {
    id: 'LP-01', karta: 'loxodon-partisan', wymiar: 'T',
    tytul: 'Partisan + 2/2 vs tylko Partisan: czy wycena ataku rośnie z battle cry?',
    pro: 'Dwa atakujące (Partisan 3/4 + 2/2) to 6 obrażeń dzięki battle cry (2/2 → 3/2). Sam Partisan = 3. Różnica musi być widoczna w score ataku.',
    warianty: [
      { opis: 'tylko Partisan na stole', zKolega: false },
      { opis: 'Partisan + Grizzly Bears 2/2 (battle cry → 3/2)', zKolega: true },
      { opis: 'Partisan + dwa 1/1 tokeny (battle cry → 2/1 każdy)', dwaTokeny: true },
    ],
    budowa: (w) => {
      const pole = [{ id: 'partisan', karta: 'loxodon-partisan', gracz: 'p1' }];
      if (w.zKolega) pole.push({ id: 'kolega', karta: 'leafcrown-dryad', gracz: 'p1' });
      if (w.dwaTokeny) for (let i = 0; i < 2; i += 1) pole.push({ id: `tok-${i}`, karta: 'soulmender', gracz: 'p1' });
      return stan({
        krok: 'declare_attackers',
        pole,
        poleWrog: [{ id: 'bloker', karta: 'grizzled-outcasts', gracz: 'p2' }],
      });
    },
  },
  {
    id: 'LP-02', karta: 'loxodon-partisan', wymiar: 'S',
    tytul: 'wybór permanentu za 5 many: Partisan przy szerokim stole vs przy pustym stole',
    pro: 'Przy szerokim stole (2+ stworów) battle cry jest realną premią; przy pustym stole Partisan to zwykłe 3/4 — wtedy inny 5-manowy czar może być lepszy. Pomiar: czy score rzutu rośnie z szerokością stołu.',
    warianty: [
      { opis: 'pusty stół + Partisan w ręce vs Serra Angel (5 many)', pole: [] },
      { opis: '2 stwory na stole + Partisan w ręce vs Serra Angel', pole: ['leafcrown-dryad', 'soulmender'] },
    ],
    budowa: (w) => stan({
      mana: { p1: 5 },
      reka: [{ id: 'partisan-hand', karta: 'loxodon-partisan' }, { id: 'angel-hand', karta: 'gloomfang-mauler' }],
      pole: w.pole.map((karta, i) => ({ id: `nasz-${i}`, karta, gracz: 'p1' })),
    }),
  },

  // =========================================================================
  // 663. Temur Banner ({3} artifact, {T}: G/U/R, {G}{U}{R},{T},Sac: draw 1) —
  // rampa vs poświęcenie; cienka biblioteka.
  // =========================================================================
  {
    id: 'TB-01', karta: 'temur-banner', wymiar: 'T',
    tytul: 'Banner w każdym kroku własnej tury: kiedy bot poświęca go na draw?',
    pro: 'Nie w main1 (Banner to źródło many — poświęcenie go teraz blokuje zagranie za G/U/R do końca tury). Optymalnie: end step przeciwnika albo main2 przy pustej ręce i nadmiarze many.',
    warianty: KROKI_TURY.filter((k) => k !== 'untap').map((krok) => ({ krok })),
    budowa: (w) => stan({
      krok: w.krok,
      mana: { p1: 3 },
      pole: [{ id: 'banner', karta: 'temur-banner', gracz: 'p1' },
        { id: 'land-0', karta: 'basic-forest', gracz: 'p1' },
        { id: 'land-1', karta: 'basic-island', gracz: 'p1' },
        { id: 'land-2', karta: 'basic-mountain', gracz: 'p1' }],
      reka: [],
    }),
  },
  {
    id: 'TB-02', karta: 'temur-banner', wymiar: 'S',
    tytul: 'Banner: pusta ręka (flood) vs karta wymagająca G/U/R w ręce vs cienka biblioteka',
    pro: 'Pusta ręka + nadmiar many: poświęcenie na kartę jest dobre. Karta w ręce wymagająca G/U/R: Banner jest potrzebny jako źródło — nie poświęcać. Biblioteka ≤ 4: ostrożnie (deck-out).',
    warianty: [
      { opis: 'pusta ręka, 6 many, 3 lądy', reka: [], biblioteka: 20 },
      { opis: 'kolory w ręce: czar {G}{U}{R} czeka (Banner = źródło)', reka: [{ karta: 'temur-banner' }], biblioteka: 20 },
      { opis: 'biblioteka 2 karty', reka: [], biblioteka: 2 },
    ],
    budowa: (w) => stan({
      krok: 'main2',
      mana: { p1: 6 },
      pole: [{ id: 'banner', karta: 'temur-banner', gracz: 'p1' },
        { id: 'land-0', karta: 'basic-forest', gracz: 'p1' },
        { id: 'land-1', karta: 'basic-island', gracz: 'p1' },
        { id: 'land-2', karta: 'basic-mountain', gracz: 'p1' }],
      reka: w.reka.map((r, i) => ({ id: `reka-${i}`, karta: r.karta })),
      biblioteka: Array.from({ length: w.biblioteka }, (_, i) => ({ id: `bib-${i}`, karta: 'basic-island', gracz: 'p1' })),
    }),
  },

  // =========================================================================
  // 664. Frilled Sea Serpent ({4}{U}{U} 4/6, {5}{U}{U}: unblockable) — koszt
  // 7 many; kontrola S11 (koszt musi być widoczny).
  // =========================================================================
  {
    id: 'FS-01', karta: 'frilled-sea-serpent', wymiar: 'T',
    tytul: 'unblockable w każdym kroku własnej tury (gdzie bot płaci 7 many?)',
    pro: 'Tylko przed deklaracją blokerów (main1/beginning_of_combat) i tylko gdy Serpent może atakować. Po blokach/ruling: nic nie daje.',
    warianty: KROKI_TURY.filter((k) => k !== 'untap').map((krok) => ({ krok })),
    budowa: (w) => stan({
      krok: w.krok,
      mana: { p1: 7 },
      pole: [{ id: 'serpent', karta: 'frilled-sea-serpent', gracz: 'p1' },
        { id: 'bloker', karta: 'grizzled-outcasts', gracz: 'p2' }],
    }),
  },
  {
    id: 'FS-02', karta: 'frilled-sea-serpent', wymiar: 'S',
    tytul: 'pusty stół wroga vs realny bloker vs lethal 4 z nieblokowalności — czy bot płaci 7 many bez sensu?',
    pro: 'Przy pustym stole wroga: NIE (0 dodatkowych obrażeń, 7 many w błoto). Przy blokerze 4/6 lub większym: TAK przy wyścigu. Przy wrogu 4 życia i blokerze: TAK (lethal).',
    warianty: [
      { opis: 'pusty stół wroga', poleWrog: [] },
      { opis: 'bloker 4/6 (zatrzyma Serpenta)', poleWrog: [{ id: 'blok', karta: 'grizzled-outcasts' }] },
      { opis: 'wróg 4 życia + bloker 2/2', poleWrog: [{ id: 'blok', karta: 'leafcrown-dryad' }], zycieP2: 4 },
    ],
    budowa: (w) => {
      const state = stan({
        krok: 'beginning_of_combat',
        zycie: { p1: 20, p2: w.zycieP2 ?? 20 },
        mana: { p1: 7 },
        pole: [{ id: 'serpent', karta: 'frilled-sea-serpent', gracz: 'p1' }],
      });
      for (const wpis of w.poleWrog) {
        put(state, wpis.id, wpis.karta, 'p2', 'battlefield');
        state.objects.set(wpis.id, Object.freeze({ ...state.objects.get(wpis.id), summoningSickness: false }));
      }
      return state;
    },
  },

  // =========================================================================
  // 665. Mirelurk Queen ({4}{U} 4/4 vigilance, ETB: +2 rad counters target
  // player; whenever nonland milled → draw 1 + +1/+1 once/turn).
  // Pytanie o CEL (rad counters zawsze na wroga!) i o synergię z millem.
  // =========================================================================
  {
    id: 'MQ-01', karta: 'mirelurk-queen', wymiar: 'C', przelot: true,
    tytul: 'ETB: rad counters — na kogo bot celuje (przeciwnik vs własna głowa)?',
    pro: 'ZAWSZE przeciwnik: rad counters to mill + utrata życia dla poszkodowanego, a biblioteka własna to zasób. Wybór własnej głowy = sabotaz własnej talii.',
    warianty: [
      { opis: 'zwykły stan (20/20 życia)', zycie: { p1: 20, p2: 20 } },
      { opis: 'wróg na 5 życia (rad = dodatkowa presja)', zycie: { p1: 20, p2: 5 } },
      { opis: 'wróg z cienką biblioteką (rad = deck-out pressure)', zycie: { p1: 20, p2: 20 }, bibliotekaWroga: 4 },
    ],
    budowa: (w) => stan({
      mana: { p1: 5 },
      zycie: w.zycie,
      reka: [{ id: 'queen-hand', karta: 'mirelurk-queen' }],
      biblioteka: [
        ...Array.from({ length: 20 }, (_, i) => ({ id: `moja-bib-${i}`, karta: 'basic-island', gracz: 'p1' })),
        ...Array.from({ length: w.bibliotekaWroga ?? 20 }, (_, i) => ({ id: `wrog-bib-${i}`, karta: 'basic-island', gracz: 'p2' })),
      ],
    }),
  },
  {
    id: 'MQ-02', karta: 'mirelurk-queen', wymiar: 'S',
    tytul: 'synergia: Queen na stole + Tome Scour w ręce — czy pierwszy nonland mill jest doceniany (+1 karta, +1/+1)?',
    pro: 'Pierwszy nonland mill w turze = darmowa karta + licznik. Pro zagra Tome Scour (1 mana) tym chętniej, im więcej realnych korzyści. Gdy biblioteka własna < 10, nie dobiera agresywnie.',
    warianty: [
      { opis: 'Queen na stole, Tome Scour w ręce, biblioteka 20', queen: true, biblioteka: 20 },
      { opis: 'bez Queeny, Tome Scour w ręce (baseline)', queen: false, biblioteka: 20 },
      { opis: 'Queen na stole, biblioteka własna 4 (deck-out ryzyko przy draw triggera)', queen: true, biblioteka: 4 },
    ],
    budowa: (w) => {
      const pole = [];
      if (w.queen) pole.push({ id: 'queen', karta: 'mirelurk-queen', gracz: 'p1' });
      return stan({
        mana: { p1: 1 },
        pole,
        reka: [{ id: 'scour-hand', karta: 'tome-scour' }],
        biblioteka: [
          ...Array.from({ length: w.biblioteka }, (_, i) => ({ id: `moja-bib-${i}`, karta: 'basic-island', gracz: 'p1' })),
          ...Array.from({ length: 15 }, (_, i) => ({ id: `wrog-bib-${i}`, karta: 'basic-island', gracz: 'p2' })),
        ],
      });
    },
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
    console.log('=== PMSSB-91 — POMIAR PRZED (batch 74: T=moment, C=cel, S=kontekst, K=koszt) ===\n');
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
