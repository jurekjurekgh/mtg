// PMSSB-90 — POMIAR PRZED: macierzowa sonda scoringu bota dla Batcha 73.
//
// Uruchomienie:
//   node tools/pmssb90-batch73-petla-sonda.mjs                 # tabela tekstowa
//   node tools/pmssb90-batch73-petla-sonda.mjs --json          # JSON (do dalszej obróbki)
//   node tools/pmssb90-batch73-petla-sonda.mjs --karta=plummet # tylko jedna karta
//   node tools/pmssb90-batch73-petla-sonda.mjs --scen=P-01     # jeden scenariusz
//   node tools/pmssb90-batch73-petla-sonda.mjs --przebieg      # wykonuj wybory bota krok po kroku
//
// Dlaczego nowa sonda (plan `docs/plans/PLAN_2026-11-16-pmssb90-batch73-petla-reczna.md` §1):
// `tools/pmssb89-batch73-scoring-sonda.mjs` mierzy JEDEN scenariusz na kartę — zawsze
// `stateAt('main')`, zawsze `richMana` (10 many każdego koloru, więc wymiar KOSZTU znika
// wbrew obowiązkowej kontroli (b) procedury PMSSB i S11), zawsze JEDEN generyczny cel
// (nie ma porównania kandydatów) i bez wymiarów ręka/biblioteka/grób/życie. Odpowiada na
// pytanie „czy bot w ogóle coś wybiera", a zlecenie właściciela brzmi: czy bot gra kartę
// w optymalnym MOMENCIE (tura/faza), w optymalny CEL i spójnie z KONTEKSTEM stanu gry.
// Ta sonda mierzy dokładnie te trzy wymiary (T/C/S) + koszt (K).
//
// Harness (L21): payload obiektów z `createCardDeck` — TA sama funkcja, którą
// `setupGame`/`installDeck` kładzie do biblioteki. Sam spread `gameObjectDataOf` NIE niesie
// `keywords`/`types`/`subtypes`/`transformTo`, więc sonda na nim mierzyłaby helper, nie
// produkt (pomiar audytu PR #185: craft dawał 0 ofert właśnie przez ten brak).
//
// Etykiety/oczekiwania „PRO" są zapisane z Oracle (`docs/cards/scryfall-*.json`, ADR 0030/L57)
// i z wiedzy o grze; sonda NIE ocenia automatycznie — drukuje fakty (wybór, cel, score
// alternatyw, stan), a werdykt jest w raporcie §PMSSB-90 (L24: skutek bez śladu nie istnieje).
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
import { declareAttackers } from '../src/engine/combat.js';
import { attachEquipmentToCreature } from '../src/engine/attachments.js';

const REGISTRY = createCardRegistry();
const KROKI_TURY = ['untap', 'upkeep', 'draw', 'main1', 'beginning_of_combat', 'declare_attackers',
  'declare_blockers', 'combat_damage', 'end_of_combat', 'main2', 'end'];

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
  for (const wpis of wypelniacz('p1', 'basic-forest', ROZMIAR_BIBLIOTEKI - bibliotekaP1.length, bibliotekaP1.length)) wstaw(wpis, 'library');
  for (const wpis of bibliotekaP2) wstaw(wpis, 'library');
  for (const wpis of wypelniacz('p2', 'basic-island', ROZMIAR_BIBLIOTEKI - bibliotekaP2.length, bibliotekaP2.length)) wstaw(wpis, 'library');
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
    `życie p1=${p('p1').life} p2=${p('p2').life} | mana p1=${p('p1').mana ?? 0} p2=${p('p2').mana ?? 0}`,
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
  // --- Plummet (artId 655, instant {1}{G}: Destroy target creature with flying) ---
  {
    id: 'P-01', karta: 'plummet', wymiar: 'T',
    tytul: 'instant removal w kolejnych krokach WŁASNEJ tury (gdzie bot go gra?)',
    pro: 'Nie w upkeep/draw (oddaje inicjatywę i nie ma okna); sensowne okna to początek walki/deklaracja blokerów albo tura przeciwnika — instant trzymany daje informację i tempo.',
    // `untap` poza skanem: harness wymusiłby priorytet w kroku, w którym realna gra go
    // nie przyznaje — pomiar takiego stanu byłby fikcją (L24). Numery CR tylko z tabeli
    // `test/helpers/cr-numery-tabela.js`, a dosłownego tekstu reguły nie mam jak pobrać
    // (egress zablokowany), więc krok opisuję bez cytatu (L57/ADR 0030).
    warianty: KROKI_TURY.filter((k) => k !== 'untap').map((krok) => ({ krok })),
    budowa: (w) => stan({
      krok: w.krok,
      mana: { p1: 4 },
      reka: [{ id: 'plummet-hand', karta: 'plummet' }],
      pole: [{ id: 'wrona', karta: 'murder-of-crows', gracz: 'p2' }],
    }),
  },
  {
    id: 'P-02', karta: 'plummet', wymiar: 'T',
    tytul: 'instant w turze PRZECIWNIKA (priorytet p1) — czy bot trzyma removal na okno rywala?',
    pro: 'Tak: to najlepsze okno na removal — przeciwnik zainwestował w rzut, a my nie tracimy swojego tempa. Oczekiwany score rzutu wyższy niż we własnym main1.',
    warianty: [
      { opis: 'tura p2, main1', aktywny: 'p2', krok: 'main1' },
      { opis: 'tura p2, deklaracja ataku', aktywny: 'p2', krok: 'declare_attackers' },
      { opis: 'tura p2, deklaracja blokerów', aktywny: 'p2', krok: 'declare_blockers' },
      { opis: 'tura p2, end step (okno EOT — tam GT-02 mierzył premię)', aktywny: 'p2', krok: 'end' },
      { opis: 'tura p1, main1 (porównanie)', aktywny: 'p1', krok: 'main1' },
    ],
    budowa: (w) => stan({
      aktywny: w.aktywny, krok: w.krok, priorytet: 'p1',
      mana: { p1: 4 },
      reka: [{ id: 'plummet-hand', karta: 'plummet' }],
      pole: [
        { id: 'wrona', karta: 'murder-of-crows', gracz: 'p2' },
        { id: 'nasz-mis', karta: 'leafcrown-dryad', gracz: 'p1' },
      ],
    }),
  },
  {
    id: 'P-03', karta: 'plummet', wymiar: 'C',
    tytul: 'dwa lotniki przeciwnika: 1/1 bez znaczenia vs 5/5 — kogo bot celuje?',
    pro: '5/5 (realne zagrożenie, wymiana 2 many za 5+). Celowanie 1/1 to strata karty, chyba że 1/1 ma wartość (np. trigger) — tu nie ma.',
    budowa: () => stan({
      mana: { p1: 4 },
      reka: [{ id: 'plummet-hand', karta: 'plummet' }],
      pole: [
        { id: 'krebat-1-1', karta: 'dunland-crebain', gracz: 'p2' },
        { id: 'strach-5-5', karta: 'fear-of-abduction', gracz: 'p2' },
      ],
    }),
  },
  {
    id: 'P-04', karta: 'plummet', wymiar: 'S',
    tytul: 'brak legalnego celu (lotnik tylko u nas / pusty stół) — czy bot nie rzuca w próżnię?',
    pro: 'Nie rzucać: brak legalnego celu = fizzle (CR 608.2g) albo nielegalna deklaracja. Oczekiwane: pass albo inna akcja.',
    warianty: [
      { opis: 'pusty stół', pole: [] },
      { opis: 'lotnik tylko WŁASNY', pole: [{ id: 'nasz-lotnik', karta: 'murder-of-crows', gracz: 'p1' }] },
      { opis: 'stół bez latania', pole: [{ id: 'marut-p2', karta: 'marut', gracz: 'p2' }] },
    ],
    budowa: (w) => stan({
      mana: { p1: 4 },
      reka: [{ id: 'plummet-hand', karta: 'plummet' }],
      pole: w.pole,
    }),
  },
  {
    id: 'P-05', karta: 'plummet', wymiar: 'K',
    tytul: 'wymiar kosztu: Plummet {1}{G} vs Get the Point {3}{B}{R} na tym samym celu i przy tej samej manie',
    pro: 'Ta sama wartość skutku przy mniejszym koszcie = lepsza gra; przy ograniczonej manie bot MUSI zagrać tańszy. Różnica score ma wynikać z kosztu/many, nie z przypadku (S11, kontrola (b)).',
    warianty: [
      { opis: 'mana 2 (wystarcza tylko na Plummet)', mana: 2, reka: ['plummet', 'get-the-point'] },
      { opis: 'mana 5 (oba możliwe)', mana: 5, reka: ['plummet', 'get-the-point'] },
    ],
    budowa: (w) => stan({
      mana: { p1: w.mana },
      reka: w.reka.map((karta, i) => ({ id: `reka-${i}`, karta })),
      pole: [{ id: 'wrona', karta: 'murder-of-crows', gracz: 'p2' }],
    }),
  },

  // --- Messenger's Speed (artId 646, aura {R}: trample + haste) ---
  {
    id: 'M-01', karta: 'messengers-speed', wymiar: 'T',
    tytul: 'haste ma wartość tylko PRZED walką — gdzie bot gra aurę haste?',
    pro: 'main1/beginning_of_combat (stwór z haste atakuje w tej turze); w main2/end haste jest warte ~0, a trample tylko przy ataku. Oczekiwane: score maleje po walce.',
    warianty: ['main1', 'beginning_of_combat', 'declare_attackers', 'combat_damage', 'main2', 'end'].map((krok) => ({ krok })),
    budowa: (w) => stan({
      krok: w.krok,
      mana: { p1: 3 },
      reka: [{ id: 'ms-hand', karta: 'messengers-speed' }],
      pole: [{ id: 'nasz-chory', karta: 'highland-game', gracz: 'p1', chory: true }],
    }),
  },
  {
    id: 'M-02', karta: 'messengers-speed', wymiar: 'C',
    tytul: 'trzy kandydaty na hosta: chory 2/1, gotowy 2/2, stwór przeciwnika — kogo bot zaklina?',
    pro: 'Chory 2/1 (haste natychmiast odblokowuje atak = największy przyrost); gotowy stwór dostaje tylko trample (mniejszy przyrost); cudzy stwór NIGDY (wzmacniamy rywala).',
    budowa: () => stan({
      krok: 'main1',
      mana: { p1: 3 },
      reka: [{ id: 'ms-hand', karta: 'messengers-speed' }],
      pole: [
        { id: 'chory-2-1', karta: 'highland-game', gracz: 'p1', chory: true },
        { id: 'gotowy-2-2', karta: 'leafcrown-dryad', gracz: 'p1' },
        { id: 'wrog-4-3', karta: 'illusory-demon', gracz: 'p2' },
      ],
    }),
  },
  {
    id: 'M-03', karta: 'messengers-speed', wymiar: 'S',
    tytul: 'kontekst: czy aury warto grać, gdy nie ma czym atakować / gdy host już ma haste',
    pro: 'Bez własnego stwora (albo przy stworze tapniętym, który nie zaatakuje) aura jest stratą; na stworze, który JUŻ ma haste/trample, przyrost jest zerowy (nadpisanie).',
    warianty: [
      { opis: 'brak własnego stwora', pole: [{ id: 'wrog', karta: 'marut', gracz: 'p2' }] },
      { opis: 'własny stwór TAPNIĘTY', pole: [{ id: 'tapniety', karta: 'highland-game', gracz: 'p1', tap: true }] },
      { opis: 'host JUŻ z haste (Relic Robber 2/2) — haste się nadpisuje, zostaje tylko trample', pole: [{ id: 'speedster', karta: 'relic-robber', gracz: 'p1' }] },
      { opis: 'host JUŻ z trample (Skyclave Geopede 3/1) — zostaje tylko haste', pole: [{ id: 'geopede', karta: 'skyclave-geopede', gracz: 'p1' }] },
    ],
    budowa: (w) => stan({
      krok: 'main1',
      mana: { p1: 3 },
      reka: [{ id: 'ms-hand', karta: 'messengers-speed' }],
      pole: w.pole,
    }),
  },

  // --- Might Beyond Reason (artId 645, instant {3}{G}: 2 liczniki, delirium → 3) ---
  {
    id: 'B-01', karta: 'might-beyond-reason', wymiar: 'S',
    tytul: 'delirium: grób z 3 typami vs 4+ typami kart — czy score różni się o trzeci licznik?',
    pro: 'Przy 4+ typach w grobie efekt daje 3 liczniki zamiast 2 (delirium) — wycena MUSI być wyższa; różnica to +1/+1 na ciele, czyli realna wartość bojowa.',
    warianty: [
      {
        opis: 'grób: 3 typy (creature, land, instant)',
        grob: [{ karta: 'leonin-lightbringer' }, { karta: 'basic-forest' }, { karta: 'plummet' }],
      },
      {
        opis: 'grób: 4 typy (creature, land, instant, enchantment)',
        grob: [{ karta: 'leonin-lightbringer' }, { karta: 'basic-forest' }, { karta: 'plummet' }, { karta: 'setons-desire' }],
      },
      {
        opis: 'grób: 5 typów (+ artifact)',
        grob: [{ karta: 'leonin-lightbringer' }, { karta: 'basic-forest' }, { karta: 'plummet' }, { karta: 'setons-desire' }, { karta: 'spring-loaded-sawblades' }],
      },
    ],
    budowa: (w) => stan({
      krok: 'main1',
      mana: { p1: 6 },
      reka: [{ id: 'mbr-hand', karta: 'might-beyond-reason' }],
      pole: [{ id: 'nasz-3-2', karta: 'leonin-lightbringer', gracz: 'p1' }],
      grob: w.grob.map((g, i) => ({ id: `grob-${i}`, karta: g.karta, gracz: 'p1' })),
    }),
  },
  {
    id: 'B-02', karta: 'might-beyond-reason', wymiar: 'C',
    tytul: 'dwa własne stwory (3/2 i 1/1) oraz stwór przeciwnika — kogo bot pompuje?',
    pro: 'Największy własny stwór, który zyska na walce (3/2 → 5/4); pompowanie 1/1 rzadko jest warte 4 many, a pompowanie CUDZEGO stwora to błąd (chyba że jako setup pod removal — tu nie ma).',
    budowa: () => stan({
      krok: 'main1',
      mana: { p1: 6 },
      reka: [{ id: 'mbr-hand', karta: 'might-beyond-reason' }],
      pole: [
        { id: 'nasz-3-2', karta: 'leonin-lightbringer', gracz: 'p1' },
        { id: 'nasz-1-1', karta: 'soulmender', gracz: 'p1' },
        { id: 'wrog-4-3', karta: 'illusory-demon', gracz: 'p2' },
      ],
    }),
  },
  {
    id: 'M-04', karta: 'messengers-speed', wymiar: 'S',
    tytul: 'TEN SAM host (Leafcrown Dryad 2/2) w trzech stanach: odkręcony gotowy / chory / tapnięty',
    pro: 'Najwięcej warty na chorym (haste odblokowuje atak w tej turze), potem na gotowym (tylko trample), a na TAPNIĘTYM prawie zerowy — tapnięty stwór nie zaatakuje w tej turze nawet z haste.',
    warianty: [
      { opis: 'host odkręcony, gotowy', chory: false, tap: false },
      { opis: 'host odkręcony, chory (summoning sickness)', chory: true, tap: false },
      { opis: 'host TAPNIĘTY', chory: false, tap: true },
    ],
    budowa: (w) => stan({
      krok: 'main1',
      mana: { p1: 3 },
      reka: [{ id: 'ms-hand', karta: 'messengers-speed' }],
      pole: [{ id: 'host', karta: 'leafcrown-dryad', gracz: 'p1', chory: w.chory, tap: w.tap }],
    }),
  },

  // --- Seton's Desire (artId 648, aura {2}{G}: +2/+2; Threshold 7+ w grobie → must-block) ---
  {
    id: 'SD-01', karta: 'setons-desire', wymiar: 'S',
    tytul: 'próg Threshold: 6 vs 7 vs 9 kart we WŁASNYM grobie — czy score rośnie razem z wymogiem bloku?',
    pro: 'Przy 7+ kartach w grobie aura dokłada wymóg blokowania (wszystkie stworzenia mogące blokować muszą blokować zaklętego) — to drugi, większy efekt niż +2/+2, więc wycena musi skokowo rosnąć na progu.',
    warianty: [
      { opis: 'grób 6 kart (poniżej progu)', ile: 6 },
      { opis: 'grób 7 kart (dokładnie próg)', ile: 7 },
      { opis: 'grób 9 kart (za progiem)', ile: 9 },
    ],
    budowa: (w) => stan({
      krok: 'main1',
      mana: { p1: 6 },
      reka: [{ id: 'sd-hand', karta: 'setons-desire' }],
      pole: [
        { id: 'nasz-3-2', karta: 'leonin-lightbringer', gracz: 'p1' },
        { id: 'bloker-1', karta: 'leafcrown-dryad', gracz: 'p2' },
        { id: 'bloker-2', karta: 'soulmender', gracz: 'p2' },
      ],
      grob: Array.from({ length: w.ile }, (_, i) => ({
        id: `grob-${i}`, karta: ['plummet', 'basic-forest', 'leonin-lightbringer', 'setons-desire',
          'spring-loaded-sawblades', 'get-the-point', 'necrosavant', 'messengers-speed',
          'might-beyond-reason'][i % 9], gracz: 'p1',
      })),
    }),
  },
  {
    id: 'SD-02', karta: 'setons-desire', wymiar: 'C',
    tytul: 'wybór hosta: stwór, którego rywal MOŻE zablokować, vs nasz lotnik (rywal bez latania)',
    pro: 'Wymóg bloku jest warty coś tylko wtedy, gdy przeciwnik MA czym blokować. Na lotniku przy braku wrogich lotników must-block jest martwy — zostaje samo +2/+2, więc aura powinna iść na stwora, który realnie ściągnie bloki (albo tam, gdzie +2/+2 wygrywa wymianę).',
    warianty: [
      { opis: 'host lądowy + wrogowie z blokerami', host: 'leonin-lightbringer', wrogowie: ['leafcrown-dryad', 'soulmender'] },
      { opis: 'host lotnik + wrogowie BEZ latania', host: 'murder-of-crows', wrogowie: ['leafcrown-dryad', 'soulmender'] },
      { opis: 'host lądowy + pusty stół wroga', host: 'leonin-lightbringer', wrogowie: [] },
    ],
    budowa: (w) => stan({
      krok: 'main1',
      mana: { p1: 6 },
      reka: [{ id: 'sd-hand', karta: 'setons-desire' }],
      pole: [
        { id: 'host', karta: w.host, gracz: 'p1' },
        ...w.wrogowie.map((karta, i) => ({ id: `wrog-${i}`, karta, gracz: 'p2' })),
      ],
      grob: Array.from({ length: 8 }, (_, i) => ({ id: `grob-${i}`, karta: 'basic-forest', gracz: 'p1' })),
    }),
  },
  {
    id: 'SD-03', karta: 'setons-desire', wymiar: 'T',
    tytul: 'sorcery-speed: main1 (przed walką) vs main2 (po walce) — czy wartość spada po walce?',
    pro: 'Aura +2/+2 z wymogiem bloku jest warta wszystko PRZED walką; w main2 nie wpływa już na tę turę (zostaje wartość na przyszłe tury, wyraźnie mniejsza).',
    warianty: ['main1', 'main2'].map((krok) => ({ krok })),
    budowa: (w) => stan({
      krok: w.krok,
      mana: { p1: 6 },
      reka: [{ id: 'sd-hand', karta: 'setons-desire' }],
      pole: [
        { id: 'nasz-3-2', karta: 'leonin-lightbringer', gracz: 'p1' },
        { id: 'bloker-1', karta: 'leafcrown-dryad', gracz: 'p2' },
      ],
      grob: Array.from({ length: 8 }, (_, i) => ({ id: `grob-${i}`, karta: 'basic-forest', gracz: 'p1' })),
    }),
  },

  // --- Spring-Loaded Sawblades (artId 649, flash {1}{W}: ETB 5 dmg w tapniętego stwora wroga; craft) ---
  {
    id: 'SS-01', karta: 'spring-loaded-sawblades', wymiar: 'C', przelot: true,
    tytul: 'cel ETB: tapnięty 3/3 (5 obrażeń ZABIJA) vs tapnięty 7/7 (nie zabija) vs brak tapniętych',
    pro: 'Wybierz cel, który 5 obrażeń zabija (wymiana 2 many za stwora), a nie największego z nazwy; przy braku tapniętych stworów przeciwnika ETB fizzluje — wtedy nie warto wchodzić (chyba że dla ciała/craftu).',
    warianty: [
      { opis: 'tapnięty 3/3 (lethal) + tapnięty 7/7 (nie-lethal)', pole: [
        { id: 'tap-3-3', karta: 'burning-yard-trainer', gracz: 'p2', tap: true },
        { id: 'tap-7-7', karta: 'marut', gracz: 'p2', tap: true }] },
      { opis: 'tylko tapnięty 7/7 (nie-lethal)', pole: [{ id: 'tap-7-7', karta: 'marut', gracz: 'p2', tap: true }] },
      { opis: 'wszyscy wrogowie odkręceni', pole: [{ id: 'odk-3-3', karta: 'burning-yard-trainer', gracz: 'p2' }] },
      { opis: 'pusty stół wroga', pole: [] },
    ],
    budowa: (w) => stan({
      krok: 'main1',
      aktywny: 'p1',
      mana: { p1: 4 },
      reka: [{ id: 'ss-hand', karta: 'spring-loaded-sawblades' }],
      pole: w.pole,
    }),
  },
  {
    id: 'SS-02', karta: 'spring-loaded-sawblades', wymiar: 'T',
    tytul: 'flash: własna tura (wróg odkręcony) vs tura przeciwnika po jego ataku (cele tapnięte)',
    pro: 'Karta z flash i ETB na tapniętego stwora jest ZAGRANIEM na turę przeciwnika — wtedy jego stworzenia są tapnięte po ataku. We własnej turze, gdy wszystko odkręcone, ETB nie ma celu.',
    warianty: [
      { opis: 'nasza tura, main1, wróg odkręcony', aktywny: 'p1', krok: 'main1', tap: false },
      { opis: 'tura wroga, declare_blockers, jego stwór tapnięty (po ataku)', aktywny: 'p2', krok: 'declare_blockers', tap: true },
      { opis: 'tura wroga, main2, jego stwór tapnięty', aktywny: 'p2', krok: 'main2', tap: true },
    ],
    budowa: (w) => stan({
      aktywny: w.aktywny, krok: w.krok, priorytet: 'p1',
      mana: { p1: 4 },
      reka: [{ id: 'ss-hand', karta: 'spring-loaded-sawblades' }],
      pole: [{ id: 'wrog-3-3', karta: 'burning-yard-trainer', gracz: 'p2', tap: w.tap }],
    }),
  },
  {
    id: 'SS-03', karta: 'spring-loaded-sawblades', wymiar: 'S',
    tytul: 'craft {3}{W} + drugi artefakt: z materiałem (pole/grób) i bez — czy bot craftuje świadomie?',
    pro: 'Craft jest warty zrobienia, gdy mamy zbędny drugi artefakt (front to Artefakt bez P/T, tył to Vehicle 5/5 z dwiema zdolnościami), ale NIE kosztem materiału, który sam w sobie jest wartością; bez drugiego artefaktu craft nie istnieje.',
    warianty: [
      { opis: 'drugi artefakt na polu (Angels Feather)', material: 'pole' },
      { opis: 'drugi artefakt w grobie (Cloak of the Bat)', material: 'grob' },
      { opis: 'brak drugiego artefaktu', material: 'brak' },
      { opis: 'drugi artefakt na polu, ale mana tylko 2 (za mało na craft)', material: 'pole', mana: 2 },
    ],
    budowa: (w) => stan({
      krok: 'main1',
      mana: { p1: w.mana ?? 8 },
      pole: [
        { id: 'saw', karta: 'spring-loaded-sawblades', gracz: 'p1' },
        ...(w.material === 'pole' ? [{ id: 'material', karta: 'angels-feather', gracz: 'p1' }] : []),
      ],
      grob: w.material === 'grob' ? [{ id: 'material-gr', karta: 'cloak-of-the-bat', gracz: 'p1' }] : [],
    }),
  },

  {
    id: 'B-03', karta: 'might-beyond-reason', wymiar: 'T',
    tytul: 'pompka instant: gdzie bot ją gra (upkeep/main1/okno walki/main2) i czy woli okno walki?',
    pro: 'Pompka instant jest najwięcej warta w oknie walki (przed obrażeniami — zaskoczenie i matematyka wymiany); rzucana w upkeep/main2 marnuje potencjał (rywal gra wokół niej albo nic nie zyskujemy).',
    warianty: ['upkeep', 'main1', 'beginning_of_combat', 'declare_blockers', 'main2'].map((krok) => ({ krok })),
    budowa: (w) => stan({
      krok: w.krok,
      mana: { p1: 6 },
      reka: [{ id: 'mbr-hand', karta: 'might-beyond-reason' }],
      pole: [
        { id: 'nasz-3-2', karta: 'leonin-lightbringer', gracz: 'p1' },
        { id: 'wrog-2-2', karta: 'leafcrown-dryad', gracz: 'p2' },
      ],
    }),
  },


  // --- Bladewheel Chariot (artId 650, tył DFC: {T} tap 2 inne artefakty / Crew 1, Vehicle 5/5) ---
  {
    id: 'BC-01', karta: 'bladewheel-chariot', wymiar: 'T', przelot: true,
    tytul: 'animacja pojazdu: main1 (zdąży zaatakować) vs beginning_of_combat vs main2 (po walce)',
    pro: 'Crew/animacja ma sens PRZED deklaracją ataku (5/5 wchodzi do walki); w main2 to czysta strata zasobów (stwór i tak nie zaatakuje w tej turze).',
    warianty: ['main1', 'beginning_of_combat', 'declare_attackers', 'main2'].map((krok) => ({ krok })),
    budowa: (w) => {
      const state = stan({ krok: w.krok, mana: { p1: 4 } });
      const id = chariotPoCrafcie(state);
      put(state, 'zaloga', 'soulmender', 'p1', 'battlefield');
      put(state, 'wrog', 'leafcrown-dryad', 'p2', 'battlefield');
      state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
      return state;
    },
  },
  {
    id: 'BC-02', karta: 'bladewheel-chariot', wymiar: 'C', przelot: true,
    tytul: 'którą zdolnością i jakim kosztem: Crew 1 (tap stwora) vs {T} tap 2 inne artefakty',
    pro: 'Crew 1 kosztem stwora, którego nie potrzebujemy w tej turze (nie atakuje/nie blokuje), albo animacja za tapnięcie dwóch ZBĘDNYCH artefaktów; jeśli stwór jest naszą JEDYNĄ odpowiedzią na zagrożenie (tu: jedyny reach na wrogiego lotnika 4/3), tapnięcie go oddaje atak z powietrza i crew nie jest warty tej ceny.',
    warianty: [
      { opis: 'dwa zbędne artefakty + zbędny stwór (obie drogi tanie)', zalogi: 2, artefakty: 2 },
      { opis: 'mój jedyny reach (Leafcrown Dryad 2/2) vs wrogi lotnik 4/3 — tapnięcie oddaje atak z powietrza', zalogi: 1, zalogaKarta: 'leafcrown-dryad', artefakty: 0, zagrozenie: true, zycieP1: 10 },
      { opis: 'brak stwora, dwa artefakty (tylko {T})', zalogi: 0, artefakty: 2 },
    ],
    budowa: (w) => {
      const state = stan({ krok: 'main1', mana: { p1: 4 }, zycie: { p1: w.zycieP1 ?? 20 } });
      const id = chariotPoCrafcie(state);
      for (let i = 0; i < w.zalogi; i += 1) put(state, `zaloga-${i}`, w.zalogaKarta ?? 'soulmender', 'p1', 'battlefield');
      for (let i = 0; i < w.artefakty; i += 1) put(state, `art-${i}`, 'angels-feather', 'p1', 'battlefield');
      if (w.zagrozenie) put(state, 'zagrozenie', 'illusory-demon', 'p2', 'battlefield');
      state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
      return state;
    },
  },

  // --- River Herald Guide (artId 652, 3/1 vigilance, ETB explore) ---
  {
    id: 'RG-01', karta: 'river-herald-guide', wymiar: 'S', przelot: true,
    tytul: 'explore: wierzch biblioteki = ląd vs nie-ląd (licznik +1/+1 i decyzja wierzch/grob)',
    pro: 'Ląd idzie do ręki (bez decyzji); przy nie-lądzie Guide dostaje licznik, a karta wraca na wierzch ALBO idzie do grobu — wybór zależy od tego, czy karta jest potrzebna (np. removal na kolejną turę) i czy grób coś napędza (delirium, Threshold, reanimacja).',
    warianty: [
      { opis: 'wierzch = Basic Forest (ląd → ręka)', wierzch: 'basic-forest' },
      { opis: 'wierzch = Plummet (instant, potrzebny)', wierzch: 'plummet' },
      { opis: 'wierzch = druga kopia Guide (słaba)', wierzch: 'river-herald-guide' },
    ],
    budowa: (w) => stan({
      krok: 'main1',
      mana: { p1: 6 },
      reka: [{ id: 'rhg-hand', karta: 'river-herald-guide' }],
      biblioteka: [
        { id: 'wierzch', karta: w.wierzch, gracz: 'p1' },
        { id: 'druga', karta: 'basic-forest', gracz: 'p1' },
        { id: 'trzecia', karta: 'leonin-lightbringer', gracz: 'p1' },
      ],
    }),
  },
  {
    id: 'RG-02', karta: 'river-herald-guide', wymiar: 'S', przelot: true,
    tytul: 'decyzja explore (wierzch vs grob): czy bot milluje, gdy grób NAPĘDZA delirium/Threshold?',
    pro: 'Gdy mill jednej karty uzupełnia delirium (4+ typy) albo próg Threshold (7+ kart), wrzucenie jej do grobu jest warte więcej niż trzymanie na wierzchu — to jest wymiar „jaki cmentarz" z zlecenia.',
    warianty: [
      { opis: 'A: wierzch = Angels Feather (NOWY typ: Artifact), grób 3 typy/6 kart, w ręce Seton\'s Desire → MILL daje delirium (4 typy) i Threshold (7)', wierzch: 'angels-feather', grobTypy: 3, rekaExtra: ['setons-desire'] },
      { opis: 'B: wierzch = Plummet (typ instant JUŻ w grobie), grób 3 typy/6 kart, w ręce Seton\'s Desire → MILL daje tylko Threshold (7)', wierzch: 'plummet', grobTypy: 3, rekaExtra: ['setons-desire'] },
      { opis: 'C: wierzch = Angels Feather, grób 5 typów/12 kart → progi spełnione, MILL bez dodatkowej wartości', wierzch: 'angels-feather', grobTypy: 5, rekaExtra: ['setons-desire'] },
    ],
    budowa: (w) => stan({
      krok: 'main1',
      mana: { p1: 6 },
      reka: [
        { id: 'rhg-hand', karta: 'river-herald-guide' },
        ...(w.rekaExtra ?? []).map((karta, i) => ({ id: `reka-x-${i}`, karta })),
      ],
      pole: [{ id: 'nasz-3-2', karta: 'leonin-lightbringer', gracz: 'p1' }],
      biblioteka: [
        { id: 'wierzch', karta: w.wierzch, gracz: 'p1' },
        { id: 'druga', karta: 'basic-forest', gracz: 'p1' },
        { id: 'trzecia', karta: 'get-the-point', gracz: 'p1' },
      ],
      grob: [
        { id: 'g-creature', karta: 'leonin-lightbringer', gracz: 'p1' },
        { id: 'g-land', karta: 'basic-forest', gracz: 'p1' },
        { id: 'g-instant', karta: 'get-the-point', gracz: 'p1' },
        ...(w.grobTypy >= 4 ? [{ id: 'g-enchant', karta: 'setons-desire', gracz: 'p1' }] : []),
        ...(w.grobTypy >= 5 ? [{ id: 'g-artifact', karta: 'angels-feather', gracz: 'p1' }] : []),
        ...Array.from({ length: w.grobTypy >= 5 ? 7 : 3 }, (_, i) => ({ id: `g-dop-${i}`, karta: 'basic-forest', gracz: 'p1' })),
      ],
    }),
  },
  {
    id: 'RG-03', karta: 'river-herald-guide', wymiar: 'T',
    tytul: 'ciało 3/1 z vigilance: wystawienie w main1 vs trzymanie w ręce (porównanie z inną kartą w ręce)',
    pro: 'Wystaw ciało w main1 (tempo + explore od razu); vigilance znaczy, że może atakować i blokować w tej samej turze — trzymanie 3/1 w ręce bez powodu to strata tempa.',
    warianty: [
      { opis: 'w ręce tylko Guide', reka: ['river-herald-guide'] },
      { opis: 'w ręce Guide + Plummet (konkurencja o manę)', reka: ['river-herald-guide', 'plummet'] },
    ],
    budowa: (w) => stan({
      krok: 'main1',
      mana: { p1: 3 },
      reka: w.reka.map((karta, i) => ({ id: `reka-${i}`, karta })),
      biblioteka: [{ id: 'wierzch', karta: 'basic-forest', gracz: 'p1' }],
      pole: [{ id: 'wrog', karta: 'leafcrown-dryad', gracz: 'p2' }],
    }),
  },

  // --- Leonin Lightbringer (artId 651, 3/2 ward {2}, +1/+1 gdy wyposażony) ---
  {
    id: 'LL-01', karta: 'leonin-lightbringer', wymiar: 'S',
    tytul: 'ward z NASZEJ strony stołu: removal (Get the Point) we wrogiego Leonina z ward {2} vs w cel bez warda',
    pro: 'Ward {2} znaczy, że przeciwnik (tu: my) musi dopłacić 2, inaczej czar jest skontrowany — celowanie stwora z wardem kosztuje więcej, więc przy tej samej wartości ciała powinien być WYBRANY cel bez warda (albo removal powinien uwzględniać dopłatę).',
    warianty: [
      { opis: 'na stole tylko Leonin (ward {2})', cele: ['leonin-lightbringer'] },
      { opis: 'Leonin (ward) + Highland Game 2/1 (bez warda)', cele: ['leonin-lightbringer', 'highland-game'] },
      { opis: 'ty Highland Game 2/1 (bez warda)', cele: ['highland-game'] },
    ],
    budowa: (w) => stan({
      krok: 'main1',
      mana: { p1: 8 },
      reka: [{ id: 'gtp-hand', karta: 'get-the-point' }],
      pole: w.cele.map((karta, i) => ({ id: `wrog-${i}`, karta, gracz: 'p2' })),
    }),
  },
  {
    id: 'LL-02', karta: 'leonin-lightbringer', wymiar: 'S',
    tytul: 'equip na Leonina (bonus +1/+1 z warunku `equipped`) vs equip na innego stwora',
    pro: 'Wyposażenie Leonina daje +1/+1 dodatkowo (jego statyczna), więc przy tym samym koszcie equipu powinien być preferowanym hostem — o ile nie ma lepszego celu dla danego ekwipunku.',
    warianty: [
      { opis: 'Leonin + Greatsword of Tyr w ręce/polu', hosty: ['leonin-lightbringer', 'highland-game'] },
      { opis: 'sam Highland Game (porównanie)', hosty: ['highland-game'] },
    ],
    budowa: (w) => stan({
      krok: 'main1',
      mana: { p1: 8 },
      reka: [{ id: 'miecz', karta: 'greatsword-of-tyr' }],
      pole: w.hosty.map((karta, i) => ({ id: `host-${i}`, karta, gracz: 'p1' })),
    }),
  },

  // --- Necrosavant (artId 653, 5/5, {3}{B}{B} + poświęć stwora, tylko w upkeep) ---
  {
    id: 'NS-01', karta: 'necrosavant', wymiar: 'C', przelot: true,
    tytul: 'reaktywacja z grobu: kogo bot poświęca (fodder 1/1 vs najlepszy 4/3) i czy w ogóle aktywuje',
    pro: 'Poświęć NAJTAŃSZEGO/najsłabszego stwora (fodder), a nie najlepszego; wartość 5/5 (z summoning sickness — nie atakuje w tej turze) musi przewyższać stratę poświęconego ciała i 5 many.',
    warianty: [
      { opis: 'fodder 1/1 + nic więcej', pole: ['soulmender'] },
      { opis: 'fodder 1/1 + nasz najlepszy 4/3 (Illusory Demon)', pole: ['soulmender', 'illusory-demon'] },
      { opis: 'tylko nasz najlepszy 4/3 (brak foddera)', pole: ['illusory-demon'] },
      { opis: 'brak stwora do poświęcenia', pole: [] },
    ],
    budowa: (w) => stan({
      krok: 'upkeep',
      mana: { p1: 10 },
      grob: [{ id: 'necro-grave', karta: 'necrosavant', gracz: 'p1' }],
      pole: w.pole.map((karta, i) => ({ id: `nasz-${i}`, karta, gracz: 'p1' })),
    }),
  },
  {
    id: 'NS-02', karta: 'necrosavant', wymiar: 'T',
    tytul: 'okno upkeep: aktywacja w upkeep (jedyna legalna) vs oferta w innych krokach (musi być odrzucona)',
    pro: 'Silnik ma bramkę „Activate only during your upkeep" (F-4/F-9, deskryptor `onlyInStep`) — poza upkeepem nie może być ANI oferty, ANI wykonania; bot nie powinien też planować many pod aktywację, której nie da się zrobić.',
    warianty: ['upkeep', 'main1', 'main2', 'end'].map((krok) => ({ krok })),
    budowa: (w) => stan({
      krok: w.krok,
      mana: { p1: 10 },
      grob: [{ id: 'necro-grave', karta: 'necrosavant', gracz: 'p1' }],
      pole: [{ id: 'nasz-0', karta: 'soulmender', gracz: 'p1' }],
    }),
  },
  {
    id: 'NS-03', karta: 'necrosavant', wymiar: 'K',
    tytul: 'okazja: 10 many i aktywacja vs tańsza alternatywa w ręce (wystawienie stwora 2/2)',
    pro: 'Przy ograniczonej manie i realnej alternatywie (rozwój stołu) aktywacja 5/5 za 5 many + stwora musi być PORÓWNANA z alternatywą, a nie wybierana zawsze; pro porówna tempo (5/5 wchodzi chore, nie atakuje).',
    warianty: [
      { opis: 'mana 10: aktywacja i alternatywa możliwe', mana: 10, reka: ['leafcrown-dryad'] },
      { opis: 'mana 5: tylko aktywacja', mana: 5, reka: ['leafcrown-dryad'] },
      { opis: 'mana 2: tylko alternatywa', mana: 2, reka: ['leafcrown-dryad'] },
    ],
    budowa: (w) => stan({
      krok: 'upkeep',
      mana: { p1: w.mana },
      grob: [{ id: 'necro-grave', karta: 'necrosavant', gracz: 'p1' }],
      reka: w.reka.map((karta, i) => ({ id: `reka-${i}`, karta })),
      pole: [{ id: 'nasz-0', karta: 'soulmender', gracz: 'p1' }],
    }),
  },

  // --- Kessig Flamebreather (artId 654, 1/3, trigger: rzucasz noncreature spell → 1 dmg każdemu wrogowi) ---
  {
    id: 'KF-01', karta: 'kessig-flamebreather', wymiar: 'T', przelot: true,
    tytul: 'sekwencjonowanie: Kessig w ręce + instant w ręce — co bot gra PIERWSZE?',
    pro: 'Najpierw stwór (Kessig), POTEM czar niebędący stworem — trigger działa tylko na czary rzucone PO jego wejściu (CR 603.10/608.2g: zdolność musi istnieć, by się odpalić). Odwrotna kolejność oddaje obrażenia za darmo.',
    warianty: [
      { opis: 'ręka: Kessig + Plummet, mana 3 (oba się nie mieszczą: 2 + 2)', mana: 3 },
      { opis: 'ręka: Kessig + Plummet, mana 4 (oba)', mana: 4 },
      { opis: 'ręka: Kessig + Plummet, wrogi lotnik na stole (Plummet ma cel)', mana: 4, lotnik: true },
    ],
    budowa: (w) => stan({
      krok: 'main1',
      mana: { p1: w.mana },
      reka: [
        { id: 'kessig-hand', karta: 'kessig-flamebreather' },
        { id: 'plummet-hand', karta: 'plummet' },
      ],
      pole: w.lotnik ? [{ id: 'wrona', karta: 'murder-of-crows', gracz: 'p2' }] : [],
    }),
  },
  {
    id: 'KF-02', karta: 'kessig-flamebreather', wymiar: 'S',
    tytul: 'Kessig NA STOLE: czy rzucenie instanta dostaje dopłatę za trigger (1 dmg każdemu wrogowi)?',
    pro: 'Z Kessigiem na stole każdy czar niebędący stworą jest wart +1 obrażenia na przeciwnika (chip do wygranej) — score rzutu instant powinien być WYŻSZY niż bez Kessiga o wartość tych obrażeń.',
    warianty: [
      { opis: 'Kessig na stole', kessig: true },
      { opis: 'bez Kessiga (porównanie)', kessig: false },
    ],
    budowa: (w) => stan({
      krok: 'main1',
      mana: { p1: 6 },
      zycie: { p1: 20, p2: 6 },
      reka: [{ id: 'plummet-hand', karta: 'plummet' }],
      pole: [
        { id: 'wrona', karta: 'murder-of-crows', gracz: 'p2' },
        ...(w.kessig ? [{ id: 'kessig-bf', karta: 'kessig-flamebreather', gracz: 'p1' }] : []),
      ],
    }),
  },
  {
    id: 'KF-03', karta: 'kessig-flamebreather', wymiar: 'C',
    tytul: 'atak ciałem 1/3: czy bot nie atakuje w większego (wymiana 1 za nic) i czy broni 3 toughness',
    pro: '1/3 nie atakuje w 2/2 ani w większe ciało bez wsparcia (wymiana stratna); jego wartość to toughness 3 (bloker) + trigger — atak ma sens tylko przy pustym stole wroga albo pod lethal.',
    warianty: [
      { opis: 'wrogie 2/2 na stole', wrog: 'leafcrown-dryad' },
      { opis: 'wrogi pusty stół', wrog: null },
      { opis: 'wróg przy 1 życiu (lethal z chipu/ataku)', wrog: 'leafcrown-dryad', zycieP2: 1 },
    ],
    budowa: (w) => stan({
      krok: 'declare_attackers',
      mana: { p1: 0 },
      zycie: { p1: 20, p2: w.zycieP2 ?? 20 },
      pole: [
        { id: 'kessig-bf', karta: 'kessig-flamebreather', gracz: 'p1' },
        ...(w.wrog ? [{ id: 'wrog', karta: w.wrog, gracz: 'p2' }] : []),
      ],
    }),
  },
  {
    id: 'RG-04', karta: 'river-herald-guide', wymiar: 'T', przelot: true,
    tytul: 'sekwencjonowanie pod progi: Guide (explore → mill) PRZED Might Beyond Reason, czy MBR od razu bez delirium?',
    pro: 'Przy 6 many i ręce [Guide 3, MBR 4] nie da się obu — ale przy 7+ many PRO gra NAJPIERW Guide (explore milluje artefakt → 4 typy = delirium), a POTEM MBR, który daje wtedy 3 liczniki zamiast 2. Odwrotna kolejność albo brak planowania oddaje jeden licznik za darmo.',
    warianty: [
      { opis: 'mana 6: tylko jedna z kart (MBR bez delirium albo Guide + explore)', mana: 6 },
      { opis: 'mana 7: obie karty — kolejność ma znaczenie', mana: 7 },
      { opis: 'mana 10: obie karty i zapas (czysty test kolejności)', mana: 10 },
    ],
    budowa: (w) => stan({
      krok: 'main1',
      mana: { p1: w.mana },
      reka: [
        { id: 'rhg-hand', karta: 'river-herald-guide' },
        { id: 'mbr-hand', karta: 'might-beyond-reason' },
      ],
      pole: [{ id: 'nasz-3-2', karta: 'leonin-lightbringer', gracz: 'p1' }],
      biblioteka: [
        { id: 'wierzch', karta: 'angels-feather', gracz: 'p1' },
        { id: 'druga', karta: 'basic-forest', gracz: 'p1' },
      ],
      grob: [
        { id: 'g-creature', karta: 'leonin-lightbringer', gracz: 'p1' },
        { id: 'g-land', karta: 'basic-forest', gracz: 'p1' },
        { id: 'g-instant', karta: 'get-the-point', gracz: 'p1' },
        { id: 'g-dop-0', karta: 'basic-forest', gracz: 'p1' },
        { id: 'g-dop-1', karta: 'basic-forest', gracz: 'p1' },
        { id: 'g-dop-2', karta: 'basic-forest', gracz: 'p1' },
      ],
    }),
  },
  {
    id: 'LL-03', karta: 'leonin-lightbringer', wymiar: 'K',
    tytul: 'ward {2} przy CIASNEJ manie: removal 5 many, a na stole warded 3/2 i zwykły 2/1',
    pro: 'Ward {2} znaczy „przeciwnik dopłaca 2 albo jego czar jest skontrowany". Przy manie dokładnie na removal celowanie stwora z wardem ODDAJE czar za darmo — PRO wybiera cel bez warda (albo w ogóle nie rzuca). Przy zapasie many większe ciało z wardem jest lepszym celem.',
    warianty: [
      { opis: 'mana 5 = dokładnie removal (ward nie do opłacenia)', mana: 5 },
      { opis: 'mana 7 = removal + ward {2} (da się dopłacić)', mana: 7 },
      { opis: 'mana 5 i tylko warded cel (albo płacić z przyszłej tury, albo nie rzucać)', mana: 5, tylkoWarded: true },
    ],
    budowa: (w) => stan({
      krok: 'main1',
      mana: { p1: w.mana },
      reka: [{ id: 'gtp-hand', karta: 'get-the-point' }],
      pole: w.tylkoWarded
        ? [{ id: 'wrog-0', karta: 'leonin-lightbringer', gracz: 'p2' }]
        : [
          { id: 'wrog-0', karta: 'leonin-lightbringer', gracz: 'p2' },
          { id: 'wrog-1', karta: 'highland-game', gracz: 'p2' },
        ],
    }),
  },
  {
    id: 'LL-04', karta: 'leonin-lightbringer', wymiar: 'C', przelot: true,
    tytul: 'equip już NA STOLE: którego hosta bot wybiera — Leonina (+1/+1 z warunku `equipped`) czy zwykłego stwora?',
    pro: 'Leonin ma „+1/+1 as long as it is equipped", więc ten sam ekwipunek daje na nim o jeden licznik więcej — przy równym koszcie equipu PRO wyposaża Leonina (chyba że inny host wygrywa walkę).',
    warianty: [
      { opis: 'Leonin 3/2 + Highland Game 2/1, Greatsword of Tyr na stole (niezałożony)', hosty: ['leonin-lightbringer', 'highland-game'] },
      { opis: 'Leonin 3/2 + Illusory Demon 4/3 (większe ciało bez bonusu)', hosty: ['leonin-lightbringer', 'illusory-demon'] },
      { opis: 'tylko Highland Game 2/1 (kontrola)', hosty: ['highland-game'] },
    ],
    budowa: (w) => stan({
      krok: 'main1',
      mana: { p1: 8 },
      pole: [
        { id: 'miecz-bf', karta: 'greatsword-of-tyr', gracz: 'p1' },
        ...w.hosty.map((karta, i) => ({ id: `host-${i}`, karta, gracz: 'p1' })),
        { id: 'wrog', karta: 'leafcrown-dryad', gracz: 'p2' },
      ],
    }),
  },
  {
    id: 'KF-04', karta: 'kessig-flamebreather', wymiar: 'C',
    tytul: 'lethal: wróg przy 1 życiu, jego bloker TAPNIĘTY → atak 1/3 musi być wybrany',
    pro: '1/3 nie atakuje w odkręconego 2/2 (wymiana stratna), ale przy 1 życiu przeciwnika i ZABLOKOWANYM blokerze atak jest wygraną — to musi być score wyraźnie dodatni, nie ten sam co przy zdrowym blokerze.',
    warianty: [
      { opis: 'wróg 1 życie, bloker 2/2 TAPNIĘTY (lethal)', zycieP2: 1, tap: true },
      { opis: 'wróg 1 życie, bloker 2/2 odkręcony (zablokuje)', zycieP2: 1, tap: false },
      { opis: 'wróg 20 życia, bloker 2/2 TAPNIĘTY (chip bez znaczenia)', zycieP2: 20, tap: true },
    ],
    budowa: (w) => stan({
      krok: 'declare_attackers',
      mana: { p1: 0 },
      zycie: { p1: 20, p2: w.zycieP2 },
      pole: [
        { id: 'kessig-bf', karta: 'kessig-flamebreather', gracz: 'p1' },
        { id: 'wrog', karta: 'leafcrown-dryad', gracz: 'p2', tap: w.tap },
      ],
    }),
  },
  {
    id: 'KF-05', karta: 'kessig-flamebreather', wymiar: 'S',
    tytul: 'wartość triggera przy niskim życiu wroga: 20 vs 6 vs 2 życia (chip damage)',
    pro: 'Obrażenie z triggera jest warte tym więcej, im bliżej przeciwnik jest śmierci — przy 2 życiach to prawie lethal, przy 20 to kosmetyka. Score rzutu instanta z Kessigiem na stole powinien rosnąć, gdy życie wroga spada.',
    warianty: [20, 6, 2, 1].map((z) => ({ opis: `wróg przy ${z} życiu`, zycieP2: z })),
    budowa: (w) => stan({
      krok: 'main1',
      mana: { p1: 6 },
      zycie: { p1: 20, p2: w.zycieP2 },
      reka: [{ id: 'plummet-hand', karta: 'plummet' }],
      pole: [
        { id: 'wrona', karta: 'murder-of-crows', gracz: 'p2' },
        { id: 'kessig-bf', karta: 'kessig-flamebreather', gracz: 'p1' },
      ],
    }),
  },

  // --- Get the Point (artId 647, {4}{B} sorcery: zniszcz stwora + scry 1) ---
  {
    id: 'GT-01', karta: 'get-the-point', wymiar: 'C',
    tytul: 'cel zniszczenia przy pełnej bibliotece: godny cel (TMC ≥ koszt czaru) vs tani stwór vs cel z wardem',
    pro: 'Czar za 5 many niszczy NAJWIĘKSZE zagrożenie, a nie pierwszego lepszego stwora; na taniego stwora (TMC < 5) hard removal się TRZYMA — chyba że działa wyjątek (moje życie < 10, biblioteka ≤ 10, deathtouch, cel nieblokowalny/ucieka mojemu stołu).',
    warianty: [
      { opis: 'do wyboru: 6/7 (Woolly Loxodon) i 2/1 (Highland Game)', wrogowie: ['woolly-loxodon', 'highland-game'] },
      { opis: 'do wyboru: 4/4 z lataniem (Murder of Crows) i 2/1', wrogowie: ['murder-of-crows', 'highland-game'] },
      { opis: 'tylko 2/1 (Highland Game) — cel niegodny czaru za 5', wrogowie: ['highland-game'] },
      { opis: 'do wyboru: 3/2 z wardem (Leonin) i 6/7 (Woolly Loxodon)', wrogowie: ['leonin-lightbringer', 'woolly-loxodon'] },
      { opis: 'tylko 3/2 z wardem (Leonin) — ward {2} przy manie 8 (da się dopłacić)', wrogowie: ['leonin-lightbringer'] },
    ],
    budowa: (w) => stan({
      krok: 'main1',
      mana: { p1: 8 },
      reka: [{ id: 'gtp-hand', karta: 'get-the-point' }],
      pole: [
        { id: 'nasz-2-2', karta: 'leafcrown-dryad', gracz: 'p1' },
        ...w.wrogowie.map((karta, i) => ({ id: `wrog-${i}`, karta, gracz: 'p2' })),
      ],
    }),
  },
  {
    id: 'GT-02', karta: 'get-the-point', wymiar: 'T',
    tytul: 'okna rzutu INSTANTA za 5 (godny cel 6/7): własna tura krok po kroku vs tura przeciwnika',
    pro: 'Najlepsze okno na removal to tura przeciwnika (już zainwestował w rzut, my nie tracimy tempa) albo początek naszej walki; najgorsze — po walce (obrażenia weszły) i własny upkeep/draw (kara `removalUpkeepHoldPenalty: 120`, bo marnujemy manę i informację). Oczekiwanie PRO: okna rywala ≥ nasze main1 > main2 > upkeep.',
    warianty: [
      ...['upkeep', 'draw', 'main1', 'beginning_of_combat', 'declare_attackers', 'declare_blockers',
        'combat_damage', 'main2', 'end'].map((krok) => ({ opis: `nasza tura, ${krok}`, aktywny: 'p1', krok })),
      ...['main1', 'beginning_of_combat', 'declare_attackers', 'declare_blockers', 'end'].map((krok) => ({
        opis: `tura p2, ${krok} (priorytet p1)`, aktywny: 'p2', krok,
      })),
    ],
    budowa: (w) => stan({
      aktywny: w.aktywny, krok: w.krok, priorytet: 'p1',
      mana: { p1: 8 },
      reka: [{ id: 'gtp-hand', karta: 'get-the-point' }],
      pole: [{ id: 'wrog-6-7', karta: 'woolly-loxodon', gracz: 'p2' }],
    }),
  },
  {
    id: 'GT-03', karta: 'get-the-point', wymiar: 'S',
    tytul: 'wyjątki bramki „trzymaj na godny cel": życie 20 vs 9, biblioteka 20 vs 8, deathtouch, cel nieblokowalny',
    pro: 'Przy tani celu (2/1) czar za 5 jest trzymany — ale MUSI zostać rzucony, gdy: moje życie < 10 (nie mam czasu czekać), moja biblioteka ≤ 10 (nie doczekam lepszego celu), cel ma deathtouch, albo cel i tak wymija mój stół (latanie/menace bez odpowiedzi). To jest dokładnie wymiar „kontekst stanu gry" ze zlecenia.',
    warianty: [
      { opis: 'bazowo: życie 20, biblioteka 20, cel 2/1 bez ewazji', zycieP1: 20, cel: 'highland-game' },
      { opis: 'moje życie 9 (< 10) — brak czasu na czekanie', zycieP1: 9, cel: 'highland-game' },
      { opis: 'cel 4/4 z lataniem (TMC 5 = koszt czaru → godny) — kontrola', zycieP1: 20, cel: 'murder-of-crows' },
      { opis: 'cel 1/1 z lataniem (TMC 2 < 5 → NIEgodny), a u mnie brak odpowiedzi w powietrzu — wymija mój stół', zycieP1: 20, cel: 'palace-familiar' },
      { opis: 'cel 1/1 z lataniem (TMC 2 < 5) + mój reach (Leafcrown Dryad) — NIE wymija, więc trzymany', zycieP1: 20, cel: 'palace-familiar', mojReach: true },
    ],
    budowa: (w) => stan({
      krok: 'main1',
      mana: { p1: 8 },
      zycie: { p1: w.zycieP1, p2: 20 },
      reka: [{ id: 'gtp-hand', karta: 'get-the-point' }],
      pole: [
        ...(w.mojReach ? [{ id: 'nasz-reach', karta: 'leafcrown-dryad', gracz: 'p1' }] : []),
        { id: 'wrog-cel', karta: w.cel, gracz: 'p2' },
      ],
    }),
  },
  {
    id: 'GT-04', karta: 'get-the-point', wymiar: 'S', przelot: true,
    tytul: 'scry 1 po zniszczeniu: wierzch = ląd vs wierzch = karta już zbędna (drugi egzemplarz tego samego removalu)',
    pro: 'Scry 1: ląd zostaje na wierzchu (mana na kolejną turę), a karta zbędna idzie na spód. Wartość decyzji zależy od tego, czego brakuje (mana vs zagrożenie) — pomiar ma pokazać, czy bot w ogóle rozróżnia gałęzie i z jakim score.',
    warianty: [
      { opis: 'wierzch = Basic Forest (ląd → zostaje)', wierzch: 'basic-forest' },
      { opis: 'wierzch = drugi Get the Point (zbędny, gdy cel już zniszczony)', wierzch: 'get-the-point' },
      { opis: 'wierzch = River Herald Guide 3/1 (ciało, gdy stół pusty)', wierzch: 'river-herald-guide' },
    ],
    budowa: (w) => stan({
      krok: 'main1',
      mana: { p1: 8 },
      reka: [{ id: 'gtp-hand', karta: 'get-the-point' }],
      pole: [{ id: 'wrog-6-7', karta: 'woolly-loxodon', gracz: 'p2' }],
      biblioteka: [
        { id: 'wierzch', karta: w.wierzch, gracz: 'p1' },
        { id: 'druga', karta: 'plummet', gracz: 'p1' },
      ],
    }),
  },

  // --- dodatkowe scenariusze: pokrycie ≥4/kartę + kontrole procedury (L41, S11) ---
  {
    id: 'B-04', karta: 'might-beyond-reason', wymiar: 'C',
    tytul: 'cel pompki przed walką: najmniejsze ciało, które PO pompce wygrywa wymianę, vs za duże (overkill) vs za małe',
    pro: 'Przy wrogim 4/4: pompka +2/+2 na 3/2 daje 5/4 (wygrywa wymianę i przeżywa) — to jest pełna wartość; na 1/1 daje 3/3 (ginie) — prawie zerowa; na 4/4 daje 6/6 (overkill, marnuje 2 punkty siły).',
    warianty: [
      { opis: 'mam 1/1, 3/2 i 4/4 z lataniem; u wroga 4/4 z lataniem', moje: ['soulmender', 'leonin-lightbringer', 'murder-of-crows'], wrog: 'murder-of-crows' },
      { opis: 'mam tylko 1/1 (pompka → 3/3 tylko WYMIENIA się z 3/3 trample); u wroga 3/3 bez latania', moje: ['soulmender'], wrog: 'burning-yard-trainer' },
      { opis: 'mam tylko 3/2 (pompka → 5/4 WYGRYWA z 3/3); u wroga 3/3 bez latania', moje: ['leonin-lightbringer'], wrog: 'burning-yard-trainer' },
      { opis: 'mam 4/4 z lataniem; u wroga 3/3 BEZ latania (ewazja wygrywa i bez pompki)', moje: ['murder-of-crows'], wrog: 'burning-yard-trainer' },
    ],
    budowa: (w) => stan({
      krok: 'beginning_of_combat',
      mana: { p1: 6 },
      reka: [{ id: 'mbr-hand', karta: 'might-beyond-reason' }],
      pole: [
        ...w.moje.map((karta, i) => ({ id: `nasz-${i}`, karta, gracz: 'p1' })),
        { id: 'wrog-4-4', karta: w.wrog, gracz: 'p2' },
      ],
      grob: [
        { id: 'g-creature', karta: 'leonin-lightbringer', gracz: 'p1' },
        { id: 'g-land', karta: 'basic-forest', gracz: 'p1' },
        { id: 'g-instant', karta: 'get-the-point', gracz: 'p1' },
      ],
    }),
  },
  {
    id: 'SD-04', karta: 'setons-desire', wymiar: 'C',
    tytul: 'host aury +2/+2 z Thresholdem: 1/1 vs 3/2 vs 4/4 z lataniem, gdy u wroga jedyny reach 2/2',
    pro: 'Aura idzie tam, gdzie +2/+2 i wymóg bloku robią najwięcej: 4/4 z lataniem → 6/6, które jedyny reach wroga MUSI blokować (i ginie); 3/2 → 5/4 wygrywa wymianę; 1/1 → 3/3 to najmniej (ciało i tak małe). Remis wariantów byłby findingiem (L169).',
    warianty: [
      { opis: 'mam 1/1, 3/2 i 4/4 z lataniem; u wroga 2/2 reach', moje: ['soulmender', 'leonin-lightbringer', 'murder-of-crows'] },
      { opis: 'mam 1/1 i 3/2 (bez latania); u wroga 2/2 reach', moje: ['soulmender', 'leonin-lightbringer'] },
      { opis: 'mam tylko 4/4 z lataniem; u wroga 2/2 reach', moje: ['murder-of-crows'] },
      { opis: 'mam 3/2; u wroga PUSTO (must-block bez znaczenia — zostaje samo +2/+2)', moje: ['leonin-lightbringer'], pustyWrog: true },
    ],
    budowa: (w) => stan({
      krok: 'main1',
      mana: { p1: 6 },
      reka: [{ id: 'sd-hand', karta: 'setons-desire' }],
      pole: [
        ...w.moje.map((karta, i) => ({ id: `nasz-${i}`, karta, gracz: 'p1' })),
        ...(w.pustyWrog ? [] : [{ id: 'wrog-reach', karta: 'leafcrown-dryad', gracz: 'p2' }]),
      ],
      grob: Array.from({ length: 8 }, (_, i) => ({ id: `grob-${i}`, karta: 'basic-forest', gracz: 'p1' })),
    }),
  },
  {
    id: 'SS-04', karta: 'spring-loaded-sawblades', wymiar: 'S',
    tytul: 'czy score RZUTU rozróżnia „wróg ma tapniętego stwora" (ETB trafi) od „ma tylko odkręconych" (ETB spudłuje)?',
    pro: 'ETB zadaje 5 obrażeń TYLKO tapniętemu stworowi przeciwnika. Bez tapniętego celu trigger nie ma celu i karta jest gołym artefaktem za 2 — więc rzut w main1 na odkręcony stół jest stratą, a flash istnieje właśnie po to, by czekać na okno po ataku rywala.',
    warianty: [
      { opis: 'wróg ma tylko ODKRĘCONEGO 3/3 (ETB spudłuje)', odk: ['burning-yard-trainer'], tap: [] },
      { opis: 'wróg ma TAPNIĘTEGO 3/3 (ETB zabija)', odk: [], tap: ['burning-yard-trainer'] },
      { opis: 'wróg ma TAPNIĘTEGO 7/7 (ETB nie zabija)', odk: [], tap: ['marut'] },
      { opis: 'wróg ma TAPNIĘTEGO 1/1 i ODKRĘCONEGO 6/7 (ETB marnuje się na drobiazgu)', odk: ['woolly-loxodon'], tap: ['soulmender'] },
    ],
    budowa: (w) => stan({
      krok: 'main1',
      mana: { p1: 4 },
      reka: [{ id: 'ss-hand', karta: 'spring-loaded-sawblades' }],
      pole: [
        ...w.odk.map((karta, i) => ({ id: `odk-${i}`, karta, gracz: 'p2' })),
        ...w.tap.map((karta, i) => ({ id: `tap-${i}`, karta, gracz: 'p2', tap: true })),
      ],
    }),
  },
  {
    id: 'BC-03', karta: 'bladewheel-chariot', wymiar: 'K', przelot: true,
    tytul: 'w oknie ataku: {T} tap dwa ZBĘDNE artefakty (stwór zostaje wolny) vs Crew 1 (tap stwora)',
    pro: 'Obie drogi animują to samo 5/5, ale crew kasuje atak stwora (tu 2/1 = 2 obrażenia), a {T} kasuje tylko aktywacje dwóch śmieciowych artefaktów. Przy dwóch zbędnych artefaktach {T} jest więc droższe o 0 i tańsze o utracony atak → powinno wygrać.',
    warianty: [
      { opis: 'dwa zbędne artefakty + atakujący 2/1 (obie drogi dostępne)', artefakty: 2, zalogi: 1 },
      { opis: 'JEDEN zbędny artefakt (na {T} trzeba dwóch) + atakujący 2/1', artefakty: 1, zalogi: 1 },
      { opis: 'dwa zbędne artefakty, brak stwora (tylko {T})', artefakty: 2, zalogi: 0 },
      { opis: 'dwa zbędne artefakty + atakujący 4/4 z lataniem (crew kasuje duży atak)', artefakty: 2, zalogi: 1, zalogaKarta: 'murder-of-crows' },
    ],
    budowa: (w) => {
      const state = stan({ krok: 'beginning_of_combat', mana: { p1: 4 } });
      const id = chariotPoCrafcie(state);
      for (let i = 0; i < w.zalogi; i += 1) put(state, `zaloga-${i}`, w.zalogaKarta ?? 'highland-game', 'p1', 'battlefield');
      for (let i = 0; i < w.artefakty; i += 1) put(state, `art-${i}`, 'angels-feather', 'p1', 'battlefield');
      put(state, 'wrog', 'leafcrown-dryad', 'p2', 'battlefield');
      state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
      return state;
    },
  },
  {
    id: 'BC-04', karta: 'bladewheel-chariot', wymiar: 'S', przelot: true,
    tytul: 'okno OBRONY: tura rywala po zadeklarowanym ataku — czy bot crew/animuje, żeby zablokować?',
    pro: 'Pojazd 5/5 to odpowiedź na atak: crew w oknie bloków (po deklaracji atakujących rywala) jest warty tyle, ile obrażenia, które zatrzyma. Gdy atakujący lata, a pojazd nie ma latania, blok jest niemożliwy i aktywacja jest czystą stratą.',
    warianty: [
      { opis: 'rywal atakuje 6/7 bez latania (Woolly Loxodon) — pojazd 5/5 blokuje', atakujacy: 'murder-of-crows-ground', zycieP1: 12 },
      { opis: 'rywal atakuje 4/4 Z LATANIEM (pojazd nie zablokuje)', atakujacy: 'murder-of-crows', zycieP1: 12 },
      { opis: 'rywal atakuje 2/1 (pojazd 5/5 to overkill, ale i tak zatrzyma)', atakujacy: 'highland-game', zycieP1: 20 },
    ],
    budowa: (w) => {
      const kartaAtakujacego = w.atakujacy === 'murder-of-crows-ground' ? 'woolly-loxodon' : w.atakujacy;
      const state = stan({
        aktywny: 'p2', krok: 'declare_attackers', priorytet: 'p2', zycie: { p1: w.zycieP1, p2: 20 },
        mana: { p1: 4 },
      });
      const id = chariotPoCrafcie(state, 'p1');
      put(state, 'zaloga-0', 'highland-game', 'p1', 'battlefield');
      put(state, 'art-0', 'angels-feather', 'p1', 'battlefield');
      put(state, 'art-1', 'angels-feather', 'p1', 'battlefield');
      put(state, 'atakujacy', kartaAtakujacego, 'p2', 'battlefield');
      state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
      // PRAWDZIWA deklaracja ataku (silnik ustawia `state.combat`, z którego czyta
      // `crewValue` gałąź (b)) — podrabianie pola `combat` byłoby niewiernością (L24).
      declareAttackers(state, 'p2', ['atakujacy']);
      state.turn.priorityPlayerId = 'p1';
      return state;
    },
  },
  {
    id: 'NS-04', karta: 'necrosavant', wymiar: 'C', przelot: true,
    tytul: 'kogo bot poświęca: fodder 1/1 vs 2/1 z triggerem śmierci (+2 życia) vs 4/4 z lataniem',
    pro: 'Poświęca się ciało o najmniejszej wartości utraconej; jeśli jedno z nich ma korzystny trigger śmierci (Highland Game: „when it dies, gain 2 life"), to dopłata, nie strata. Poświęcenie 4/4 z lataniem dla 5/5 z chorobą atakową jest wątpliwe.',
    warianty: [
      { opis: '1/1 (Soulmender) + 2/1 z triggerem śmierci (Highland Game)', pole: ['soulmender', 'highland-game'] },
      { opis: '1/1 (Soulmender) + 4/4 z lataniem (Murder of Crows)', pole: ['soulmender', 'murder-of-crows'] },
      { opis: 'dwa identyczne 1/1 (remis — która kopia i czy remis jest zgłoszony)', pole: ['soulmender', 'soulmender'] },
      { opis: 'tylko 2/1 z triggerem śmierci (Highland Game)', pole: ['highland-game'] },
    ],
    budowa: (w) => stan({
      krok: 'upkeep',
      mana: { p1: 10 },
      grob: [{ id: 'necro-grave', karta: 'necrosavant', gracz: 'p1' }],
      pole: w.pole.map((karta, i) => ({ id: `nasz-${i}`, karta, gracz: 'p1' })),
    }),
  },
  {
    id: 'LL-05', karta: 'leonin-lightbringer', wymiar: 'S', przelot: true,
    tytul: 'KONTROLA L41: equip „pierwsze założenie" (sprzęt niezałożony) vs „przeniesienie" (ten sam sprzęt z innego hosta) dla tej samej pary (sprzęt, Leonin)',
    pro: 'Procedura wymaga, żeby obie gałęzie `activate_ability` liczyły TO SAMO (L41) — rozjazd to finding. Dodatkowo kontrola dodatnia: sprzęt z `pump` (Brawler\'s Plate +2/+2 trample) musi być zakładany chętnie, więc jeśli Greatsword (korzyść z TRIGGERA ataku, bez `pump`) jest zawsze na minusie, to nie jest „bot nie zakłada sprzętu", tylko „brak modelu sprzętu triggerowego".',
    warianty: [
      { opis: 'Greatsword (trigger ataku, bez pump) NIEzałożony, hosty: Leonin + Highland Game', sprzet: 'greatsword-of-tyr', zalozony: false },
      { opis: 'Greatsword ZAŁOŻONY na Highland Game → przeniesienie na Leonina', sprzet: 'greatsword-of-tyr', zalozony: true },
      { opis: 'Brawler\'s Plate (+2/+2 trample, equip 4) NIEzałożony — kontrola dodatnia', sprzet: 'brawlers-plate', zalozony: false },
      { opis: 'Brawler\'s Plate ZAŁOŻONY na Highland Game → przeniesienie na Leonina', sprzet: 'brawlers-plate', zalozony: true },
    ],
    budowa: (w) => {
      const state = stan({
        krok: 'main1',
        mana: { p1: 8 },
        pole: [
          { id: 'sprzet', karta: w.sprzet, gracz: 'p1' },
          { id: 'leonin', karta: 'leonin-lightbringer', gracz: 'p1' },
          { id: 'maly', karta: 'highland-game', gracz: 'p1' },
          { id: 'wrog', karta: 'leafcrown-dryad', gracz: 'p2' },
        ],
      });
      if (w.zalozony) attachEquipmentToCreature(state, 'sprzet', 'maly');
      return state;
    },
  },
  {
    id: 'KF-06', karta: 'kessig-flamebreather', wymiar: 'S',
    tytul: 'wartość samego Kessiga jako permanentu: w ręce paliwo (instant) vs tylko stwory vs pusto',
    pro: 'Kessig 1/3 jest wart tyle, co ciało PLUS trigger „gdy rzucasz czar niebędący stworą, zadaj 1 obrażenie każdemu przeciwnikowi". Z paliwem w ręce trigger żyje, bez niego jest martwy — różnica w score rzutu musi to pokazywać (ta sama wartość triggera, którą KF-02 mierzy po drugiej stronie: przy rzucaniu instanta).',
    warianty: [
      { opis: 'w ręce Kessig + Plummet (paliwo)', reszta: ['plummet'] },
      { opis: 'w ręce Kessig + Get the Point (paliwo, droższe)', reszta: ['get-the-point'] },
      { opis: 'w ręce Kessig + Leonin (sam stwór — trigger martwy w tej turze)', reszta: ['leonin-lightbringer'] },
      { opis: 'w ręce tylko Kessig', reszta: [] },
    ],
    budowa: (w) => stan({
      krok: 'main1',
      mana: { p1: 6 },
      zycie: { p1: 20, p2: 20 },
      reka: [
        { id: 'kessig-hand', karta: 'kessig-flamebreather' },
        ...w.reszta.map((karta, i) => ({ id: `reszta-${i}`, karta })),
      ],
      pole: [{ id: 'wrog', karta: 'leafcrown-dryad', gracz: 'p2' }],
    }),
  },
  {
    id: 'SD-05', karta: 'setons-desire', wymiar: 'S',
    tytul: 'czy wymóg bloku (Threshold) jest wyceniany przy wyborze hosta: mam DRUGIEGO atakującego, którego must-block odsłania, vs nie mam',
    pro: 'Z Thresholdem „all creatures able to block enchanted creature do so": aura na moim 3/2 ściąga jedynego reach-blokera wroga i odsłania mojego lotnika 4/4 (4 obrażenia w twarz). Bez drugiego atakującego ten sam wymóg bloku nie dodaje nic — więc wartość aury musi być WYŻSZA w wariancie, w którym jest co odsłonić.',
    warianty: [
      { opis: 'host 3/2 + mój lotnik 4/4; u wroga 2/2 REACH (musi blokować hosta → lotnik odsłonięty)', drugi: true, bezReach: false },
      { opis: 'host 3/2 bez drugiego atakującego; u wroga 2/2 REACH (nie ma co odsłaniać)', drugi: false, bezReach: false },
      { opis: 'host 3/2 + mój lotnik 4/4; u wroga 2/1 BEZ reach (lotnika i tak nie zablokuje)', drugi: true, bezReach: true },
    ],
    budowa: (w) => stan({
      krok: 'main1',
      mana: { p1: 6 },
      reka: [{ id: 'sd-hand', karta: 'setons-desire' }],
      pole: [
        { id: 'host', karta: 'leonin-lightbringer', gracz: 'p1' },
        ...(w.drugi ? [{ id: 'drugi-atakujacy', karta: 'murder-of-crows', gracz: 'p1' }] : []),
        { id: 'wrog', karta: w.bezReach ? 'highland-game' : 'leafcrown-dryad', gracz: 'p2' },
      ],
      grob: Array.from({ length: 8 }, (_, i) => ({ id: `grob-${i}`, karta: 'basic-forest', gracz: 'p1' })),
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
    console.log('=== PMSSB-90 — POMIAR PRZED (batch 73: T=moment, C=cel, S=kontekst, K=koszt) ===\n');
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
