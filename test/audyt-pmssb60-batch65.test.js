// PMSSB-60 (batch 65) — audyt jakości scoringu dla mechanik nowych kart.
// Kotwice pomiarowe: bot realny (`createHeuristicBot`), seed 2026 zamrożony,
// `randomness: 0`, `lookahead: 0` (konfiguracja produkcyjna,
// `src/table/session.js:315`), punkty z `bot.trace()`. Każdy test = pomiar
// NA ŻYWYM silniku. Izolacja wartości przez kontrfaktyk: ta sama karta
// z usuniętym efektem, ciało i koszt bez zmian.
//
// PUŁAPKA PMSSB-59 (potwierdzona dla batcha 65): karty właściciela siedzą
// w `VIRTUAL_BASIC_LANDS` (card-data.js 13299-13491), NIE w `REAL_CARDS`,
// więc rejestr kontrfaktyczny składamy z obu list przez `createRegistry`.
//
// Fala A (F1) — Blitz of the Thunder-Raptor: `damage` z
// `amount: 'instants_and_sorceries_in_your_graveyard'` nie miał gałęzi
// w heurystyce (0 trafień deskryptora), więc amount spadał na 0 i efekt
// ciągnął score w dół: −30,0 płasko dla grobu 0/2/4/6 i celu 2/2–8/8, przy
// kontrfaktyku bez efektów +50,0 (delta −80). Silnik działał poprawnie
// (damage_dealt amount:6 → creature_destroyed toZone:'exile'), więc bot po
// prostu nigdy nie rzucał tej karty. Naprawa: wspólny licznik
// `instantSorceryGraveyardCount` w `engine/permanents.js` podpięty po OBU
// stronach (effects.js przy rozstrzyganiu, heurystyka przy wycenie) — L41.
//
// Fala B (F3) — Impulse: `look_top_put_one_hand_rest_bottom` było wyceniane
// w sadze, w exploicie i w zdolności aktywowanej (Merchant's Dockhand), ale
// NIE w `cast_spell`. Delta 0 wobec kontrfaktyku, płaskie 50,0 dla biblioteki
// 0/1/4/30. Naprawa: ten sam `impulseLookValue` w ścieżce czaru (jedna skala).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { REAL_CARDS, VIRTUAL_BASIC_LANDS, createCardRegistry } from '../src/cards/card-data.js';
import { createRegistry } from '../src/cards/registry.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { instantSorceryGraveyardCount } from '../src/engine/permanents.js';

const REGISTRY = createCardRegistry();
const SEED = 2026;

const registryKontra = (id, mut) => createRegistry(
  [...REAL_CARDS, ...VIRTUAL_BASIC_LANDS].map((c) => (c.id === id ? mut({ ...c }) : c)),
);

function put(state, id, cardId, controllerId, zone, registry = REGISTRY) {
  const def = registry.get(cardId);
  assert.ok(def, `${cardId} w rejestrze`);
  addObject(state, { id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def) });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function scene({ registry = REGISTRY, many = 14, lib = 30, setup = () => {} } = {}) {
  const state = createGameState({ seed: SEED, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1'; state.turn.priorityPlayerId = 'p1';
  addMana(state, 'p1', many);
  for (let i = 0; i < lib; i++) addObject(state, { id: `lb${i}`, instanceId: `i-lb${i}`, cardId: 'x',
    controllerId: 'p1', zone: 'library', kind: 'sorcery', power: 0, toughness: 0, manaCost: 2,
    abilities: [], keywords: [], subtypes: [], types: ['Sorcery'], colors: [], cardName: 'lb' });
  setup(state, registry);
  state.__registry = registry; // patrz `scoreOf` — bot musi czytać TEN sam rejestr
  return state;
}

const foe = (state, id, power, toughness, colors = ['R']) => addObject(state, { id,
  instanceId: `i-${id}`, cardId: 'x', controllerId: 'p2', ownerId: 'p2', zone: 'battlefield',
  kind: 'creature', power, toughness, manaCost: power, abilities: [], keywords: [],
  subtypes: [], types: ['Creature'], colors, cardName: 'foe' });

const instants = (state, n) => {
  for (let i = 0; i < n; i++) addObject(state, { id: `g${i}`, instanceId: `i-g${i}`, cardId: 'x',
    controllerId: 'p1', ownerId: 'p1', zone: 'graveyard', kind: 'sorcery', power: 0, toughness: 0,
    manaCost: 1, abilities: [], keywords: [], subtypes: [], types: ['Instant'], colors: [], cardName: 'g' });
};

/** Score bota dla pierwszej opcji pasującej do filtru; null = brak oferty. */
/**
 * UWAGA (poprawka metody, PMSSB-60): bot musi dostać rejestr sceny. Bez tego
 * używa rejestru domyślnego i `cardDef()` czyta PRAWDZIWE definicje, więc
 * kontrfaktyk działa tylko na obiekcie w widoku, a reguły czytane z `def`
 * (np. `def.abilities` u F7) widzą kartę pełną.
 */
function scoreOf(state, filtr, playerId = 'p1') {
  const bot = createHeuristicBot({ seed: SEED + 1, registry: state.__registry ?? REGISTRY });
  bot.chooseCommand(playerView(state, playerId));
  const traf = (bot.trace().at(-1)?.options ?? []).filter(filtr);
  return traf.length ? traf[0].score : null;
}

// ============================================================ FALA A — F1

/** Blitz w ręce, `grob` instantów, wrogi cel `pt`. `kontra` = bez efektów. */
function blitzScene(grob, pt = [4, 4], kontra = false) {
  const registry = kontra
    ? registryKontra('blitz-of-the-thunder-raptor', (d) => ({ ...d, spell: { ...d.spell, effects: [] } }))
    : REGISTRY;
  return scene({ registry, setup: (st, r) => {
    foe(st, 'f1', pt[0], pt[1]);
    instants(st, grob);
    put(st, 'c1', 'blitz-of-the-thunder-raptor', 'p1', 'hand', r);
  } });
}
const blitz = (grob, pt, kontra) => scoreOf(blitzScene(grob, pt, kontra), (o) => o.cmd.includes('(c1->f1'));

test('PMSSB-60/A1: Blitz z pełnym grobem jest rzucany (przed fixem: nigdy)', () => {
  const s = blitz(6, [4, 4]);
  assert.ok(s > 0, `score dodatni przy 6 instantach i wrogim 4/4, było ${s}`);
});

test('PMSSB-60/A2: Blitz skaluje się z liczbą instant/sorcery w grobie', () => {
  const pusty = blitz(0, [4, 4]);
  const cztery = blitz(4, [4, 4]);
  assert.ok(cztery > pusty, `grób 4 (${cztery}) > grób 0 (${pusty})`);
  assert.ok(blitz(6, [4, 4]) >= cztery, 'grób 6 nie jest gorszy niż grób 4');
});

test('PMSSB-60/A3: Blitz skaluje się wartością ofiary (4/4 > 2/2)', () => {
  const duzy = blitz(6, [4, 4]);
  const maly = blitz(6, [2, 2]);
  assert.ok(duzy > maly, `cel 4/4 (${duzy}) > cel 2/2 (${maly})`);
});

test('PMSSB-60/A4: anty-over-fix M429 — pusty grób zachowuje dawną wartość', () => {
  // Najsłabszy realny wariant (0 obrażeń) musi zostać tam, gdzie był PRZED:
  // nowe wymiary to dopłaty, nie podnoszenie bazy.
  assert.equal(blitz(0, [4, 4]), -30.0, 'grób 0 = −30,0 (wartość sprzed fali A)');
});

test('PMSSB-60/A5: L41 — jeden licznik dla silnika i bota', () => {
  // Ten sam helper liczy kwotę przy rozstrzyganiu (effects.js) i przy wycenie
  // (heuristic-bot.js), więc wycena nie może się rozjechać ze skutkiem.
  const obiekty = [
    { controllerId: 'p1', types: ['Instant'] },
    { controllerId: 'p1', types: ['Sorcery'] },
    { controllerId: 'p1', types: ['Creature'] },
    { controllerId: 'p2', types: ['Instant'] },
    { controllerId: 'p1', types: [] },
  ];
  assert.equal(instantSorceryGraveyardCount(obiekty, 'p1'), 2, 'tylko instant/sorcery p1');
  assert.equal(instantSorceryGraveyardCount(obiekty, 'p2'), 1, 'grób liczymy per kontroler');
  assert.equal(instantSorceryGraveyardCount([], 'p1'), 0, 'pusty grób = 0');
  assert.equal(instantSorceryGraveyardCount(null, 'p1'), 0, 'brak strefy = 0');
});

test('PMSSB-60/A6: Blitz — nieletalny chip poza walką bez premii (model M237/4)', () => {
  // 6 obrażeń w 8/8 nie zabija: model obrażeń celowo nie wycenia chipa poza
  // walką, więc score zostaje na bazie. To zachowanie zastane, pinowane,
  // żeby fala A go po cichu nie zmieniła.
  assert.equal(blitz(6, [8, 8]), blitz(0, [4, 4]), '6 w 8/8 nie dostaje premii');
});

// ============================================================ FALA B — F3

function impulseScene(lib, kontra = false) {
  const registry = kontra
    ? registryKontra('impulse', (d) => ({ ...d, spell: { ...d.spell, effects: [] } }))
    : REGISTRY;
  return scene({ registry, lib, setup: (st, r) => { put(st, 'c1', 'impulse', 'p1', 'hand', r); } });
}
const impulse = (lib, kontra) => scoreOf(impulseScene(lib, kontra), (o) => o.cmd.includes('(c1'));

test('PMSSB-60/B1: efekt Impulse ma wartość dodatnią wobec kontrfaktyku', () => {
  const pelny = impulse(30);
  const kontra = impulse(30, true);
  assert.ok(pelny > kontra, `z efektem (${pelny}) > bez efektu (${kontra}) — przed falą B obie = 50,0`);
});

test('PMSSB-60/B2: Impulse reaguje na rozmiar biblioteki (przed falą B: płasko)', () => {
  const pusta = impulse(0);
  const zdrowa = impulse(30);
  assert.ok(zdrowa > pusta, `biblioteka 30 (${zdrowa}) > biblioteka 0 (${pusta})`);
});

test('PMSSB-60/B3: L41 — ten sam typ efektu wyceniany w obu ścieżkach', () => {
  // Merchant's Dockhand (activate_ability) i Impulse (cast_spell) niosą TEN SAM
  // typ efektu `look_top_put_one_hand_rest_bottom`. Przed falą B tylko aktywacja
  // reagowała na X/bibliotekę; teraz obie ścieżki idą przez `impulseLookValue`.
  const dockhand = scene({ setup: (st) => {
    put(st, 'md', 'merchants-dockhand', 'p1', 'battlefield');
    for (let i = 0; i < 3; i++) addObject(st, { id: `a${i}`, instanceId: `i-a${i}`, cardId: 'x',
      controllerId: 'p1', ownerId: 'p1', zone: 'battlefield', kind: 'artifact', power: 0, toughness: 0,
      manaCost: 0, abilities: [], keywords: [], subtypes: [], types: ['Artifact'], colors: [], cardName: 'a' });
  } });
  const bot = createHeuristicBot({ seed: SEED + 1 });
  bot.chooseCommand(playerView(dockhand, 'p1'));
  const opcje = (bot.trace().at(-1)?.options ?? []).filter((o) => o.cmd.includes('(md'));
  const x0 = opcje.find((o) => o.cmd.includes('X=0'));
  const x1 = opcje.find((o) => o.cmd.includes('X=1'));
  assert.ok(x0 && x1, 'Dockhand oferuje warianty X');
  assert.ok(x1.score > x0.score, `X=1 (${x1.score}) > X=0 (${x0.score}) — jałowy X karany`);
  // Oś L41: obie ścieżki reagują na rozmiar przeglądu (tu: Impulse na bibliotekę).
  assert.ok(impulse(30) > impulse(0), 'cast_spell też reaguje — jedna skala, nie kopia');
});

// ============================================================ FALA D — F6

function giantScene(enchantments) {
  return scene({ many: 14, setup: (st) => {
    for (let i = 0; i < enchantments; i++) addObject(st, { id: `e${i}`, instanceId: `i-e${i}`,
      cardId: 'x', controllerId: 'p1', ownerId: 'p1', zone: 'battlefield', kind: 'enchantment',
      power: 0, toughness: 0, manaCost: 1, abilities: [], keywords: [], subtypes: [],
      types: ['Enchantment'], colors: [], cardName: 'e' });
    put(st, 'c1', 'brine-giant', 'p1', 'hand');
  } });
}
const giant = (ench) => scoreOf(giantScene(ench), (o) => o.cmd.includes('(c1'));

test('PMSSB-60/D1: affinity obniża koszt w wycenie (kontrola S11)', () => {
  const zero = giant(0);
  const trzy = giant(3);
  const szesc = giant(6);
  assert.ok(trzy > zero, `3 enchantmenty (${trzy}) > 0 (${zero}) — koszt 4 vs 7 many`);
  assert.ok(szesc > trzy, `6 enchantmentów (${szesc}) > 3 (${trzy}) — koszt 1 vs 4 many`);
});

// Wartość bazowa zmierzona PRZED falą D (sonda .arena/pomiar-giant.mjs po
// zdjęciu redukcji): 70.2072 — identyczna dla 0 enchantmentów, 3 własnych
// i 4 wrogich, czyli płasko. To dokładnie defekt F6.
const GIANT_PRZED = 70.2072;

test('PMSSB-60/D2: anty-over-fix M429 — bez enchantmentów dawna wartość', () => {
  assert.equal(giant(0), GIANT_PRZED, '0 enchantmentów = 70,2072 (sprzed fali D)');
});

test('PMSSB-60/D3: enchantmenty PRZECIWNIKA nie obniżają mojego kosztu', () => {
  const state = scene({ many: 14, setup: (st) => {
    for (let i = 0; i < 4; i++) addObject(st, { id: `e${i}`, instanceId: `i-e${i}`, cardId: 'x',
      controllerId: 'p2', ownerId: 'p2', zone: 'battlefield', kind: 'enchantment', power: 0,
      toughness: 0, manaCost: 1, abilities: [], keywords: [], subtypes: [],
      types: ['Enchantment'], colors: [], cardName: 'e' });
    put(st, 'c1', 'brine-giant', 'p1', 'hand');
  } });
  assert.equal(scoreOf(state, (o) => o.cmd.includes('(c1')), GIANT_PRZED,
    'affinity liczy wyłącznie enchantmenty pod MOJĄ kontrolą (CR 601.2f)');
});

// ============================================================ FALA E — F7

/**
 * Skyscythe Engulfer w ręce + opcjonalny wrogi bloker. `foeKeywords === null`
 * oznacza scenę bez wrogich stworów wcale. `kontra` wycina statykę
 * `cantBeBlockedByKeywords` z definicji — kontrfaktyk musi dostać TEN rejestr
 * zarówno w scenie, jak i w bocie (patrz `scoreOf`).
 */
function skyScene(foeKeywords, kontra = false) {
  const registry = kontra
    ? registryKontra('skyscythe-engulfer', (d) => ({ ...d, abilities: [] }))
    : REGISTRY;
  return scene({ registry, setup: (st, r) => {
    if (foeKeywords !== null) {
      foe(st, 'f1', 2, 2, ['U']);
      const f1 = st.objects.get('f1');
      st.objects.set('f1', Object.freeze({ ...f1, keywords: foeKeywords }));
    }
    put(st, 'c1', 'skyscythe-engulfer', 'p1', 'hand', r);
  } });
}
const sky = (foeKeywords, kontra = false) => scoreOf(skyScene(foeKeywords, kontra), (o) => o.cmd.includes('(c1'));

/** Porównanie z tolerancją — wyceny bota to łańcuch operacji FP. */
const blisko = (a, b) => Math.abs(a - b) < 1e-9;

/** Zmierzono na `3027ed0`+fala E (harness tego pliku, nie sonda). */
const SKY_FLYER = 78.309;      // wróg z flying: statyka wchodzi do wyceny
const SKY_BAZA = 75.609;       // wróg bez zakazanego keywordu = kontrfaktyk
const SKY_BEZ_WROGA = 72.009;  // brak wrogich stworów = kontrfaktyk

test('PMSSB-60/E1: cantBeBlockedBy(flying) podnosi wycenę rzutu wobec wrogiego flyera', () => {
  const pelny = sky(['flying']);
  const kontra = sky(['flying'], true);
  assert.ok(blisko(pelny, SKY_FLYER), `oczekiwano ${SKY_FLYER}, jest ${pelny}`);
  assert.ok(blisko(kontra, SKY_BAZA), `oczekiwano ${SKY_BAZA}, jest ${kontra}`);
  // POMIAR PRZED: delta 0 (72,0 = 72,0) — statyka nie wchodziła do wyceny.
  assert.ok(pelny - kontra > 2.5, `oczekiwano delty > 2.5, jest ${pelny - kontra}`);
});

test('PMSSB-60/E2: anty-over-fix — bloker bez zakazanego keywordu nie daje premii', () => {
  assert.ok(blisko(sky([]), SKY_BAZA), `oczekiwano ${SKY_BAZA}, jest ${sky([])}`);
  assert.ok(blisko(sky([]), sky([], true)), `over-fix: ${sky([])} vs ${sky([], true)}`);
});

test('PMSSB-60/E3: bez wrogich stworów nie ma czego wyeważować — dawna wartość', () => {
  assert.ok(blisko(sky(null), SKY_BEZ_WROGA), `oczekiwano ${SKY_BEZ_WROGA}, jest ${sky(null)}`);
  assert.ok(blisko(sky(null), sky(null, true)), `over-fix: ${sky(null)} vs ${sky(null, true)}`);
});
