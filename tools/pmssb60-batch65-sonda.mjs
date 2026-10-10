// PMSSB-60 (batch 65) — sonda POMIAR PRZED.
//
// Metoda (wzorzec PMSSB-59 §2): bot realny `createHeuristicBot` w konfiguracji
// produkcyjnej (`randomness: 0`, `lookahead: 0` — domyślne, jak
// `src/table/session.js:315`), seed zamrożony, punkty z `bot.trace()`.
// Izolacja wartości przez KONTRFAKTYK: ta sama karta z usuniętym efektem, przy
// niezmienionym ciele i koszcie.
//
// PUŁAPKA z planu PMSSB-59 (kosztowna): karty właściciela NIE siedzą w
// `REAL_CARDS` — batch 65 to linie 13299-13491, czyli `VIRTUAL_BASIC_LANDS`
// (od 4352). Kontrfaktyk budowany z `REAL_CARDS` byłby nieskuteczny, więc
// rejestr kontrfaktyczny składamy z `createCardRegistry().all()` (obie listy)
// i `createRegistry(...)` — patrz `registryKontra`.
//
// Uruchomienie: node tools/pmssb60-batch65-sonda.mjs
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry, REAL_CARDS, VIRTUAL_BASIC_LANDS } from '../src/cards/card-data.js';
import { createRegistry } from '../src/cards/registry.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REG = createCardRegistry();
const SEED = 2026;

/** Rejestr z kartą `id` zmodyfikowaną przez `mut(def)` — reszta bez zmian. */
function registryKontra(id, mut) {
  const karty = [...REAL_CARDS, ...VIRTUAL_BASIC_LANDS].map((c) => (c.id === id ? mut({ ...c }) : c));
  return createRegistry(karty);
}

function scene({ registry = REG, many = 14, step = 'main', active = 'p1', lib = 30, setup = () => {} } = {}) {
  const s = createGameState({ seed: SEED, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, step, active);
  s.turn.activePlayerId = active; s.turn.priorityPlayerId = active;
  addMana(s, active, many);
  for (let i = 0; i < lib; i++) addObject(s, { id: `lb${i}`, instanceId: `i-lb${i}`, cardId: 'x',
    controllerId: active, zone: 'library', kind: 'sorcery', power: 0, toughness: 0, manaCost: 2,
    abilities: [], keywords: [], subtypes: [], types: ['Sorcery'], colors: [], cardName: 'lb' });
  setup(s, registry);
  s.__registry = registry; // patrz `punkty` — bot musi czytać TEN sam rejestr
  return s;
}

function put(s, id, cardId, controllerId, zone, registry = REG, patch = {}) {
  const def = registry.get(cardId);
  if (!def) throw new Error(`brak karty ${cardId} w rejestrze`);
  addObject(s, { id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def) });
  const cur = s.objects.get(id);
  s.objects.set(id, Object.freeze({ ...cur, summoningSickness: false, ...patch }));
  return s.objects.get(id);
}

const foe = (s, id, p = 4, t = 4, colors = ['R']) => addObject(s, { id, instanceId: `i-${id}`,
  cardId: 'x', controllerId: 'p2', ownerId: 'p2', zone: 'battlefield', kind: 'creature',
  power: p, toughness: t, manaCost: p, abilities: [], keywords: [], subtypes: [],
  types: ['Creature'], colors, cardName: 'foe' });

/** Punkty bota dla opcji pasujących do `filtr`; null = brak oferty.
 *
 * UWAGA (poprawka metody, PMSSB-60): bot MUSI dostać ten sam rejestr co scena.
 * Bez tego `createHeuristicBot` używa rejestru domyślnego i `cardDef()` czyta
 * PRAWDZIWE definicje kart — kontrfaktyk działałby wyłącznie na obiekcie
 * w widoku, a każda reguła czytana z `def` (np. `def.abilities`) widziałaby
 * kartę pełną. Zmierzono: premia za ewazję odpalała identycznie w wariancie
 * „bez statyki" (975,6 = 975,6 przy prowizorycznym +1000).
 */
function punkty(s, filtr, playerId = 'p1') {
  const b = createHeuristicBot({ seed: SEED + 1, registry: s.__registry ?? REG });
  b.chooseCommand(playerView(s, playerId));
  const opts = b.trace().at(-1)?.options ?? [];
  const traf = opts.filter(filtr);
  return traf.length ? traf.map((o) => ({ cmd: o.cmd, score: o.score })) : null;
}
const fmt = (r) => (r ? r.map((o) => `${o.cmd.slice(0, 42)}=${o.score.toFixed(1)}`).join(' | ') : 'BRAK OFERTY');

// ============================================================ F1 — Blitz
console.log('\n=== F1 Blitz of the Thunder-Raptor — damage = #instant/sorcery w grobie');
function blitz(grób, foePT = [4, 4], kontra = false) {
  const reg = kontra ? registryKontra('blitz-of-the-thunder-raptor', (d) => ({
    ...d, spell: { ...d.spell, effects: [] },
  })) : REG;
  const s = scene({ registry: reg, setup: (st, r) => {
    foe(st, 'f1', foePT[0], foePT[1]);
    for (let i = 0; i < grób; i++) addObject(st, { id: `g${i}`, instanceId: `i-g${i}`, cardId: 'x',
      controllerId: 'p1', ownerId: 'p1', zone: 'graveyard', kind: 'sorcery', power: 0, toughness: 0,
      manaCost: 1, abilities: [], keywords: [], subtypes: [], types: ['Instant'], colors: [], cardName: 'g' });
    put(st, 'c1', 'blitz-of-the-thunder-raptor', 'p1', 'hand', r);
  } });
  return fmt(punkty(s, (o) => o.cmd.includes('(c1->f1')));
}
for (const g of [0, 2, 4, 6]) console.log(`   grób ${g}, wrogi 4/4:      ${blitz(g)}`);
console.log(`   grób 6, wrogi 2/2:      ${blitz(6, [2, 2])}`);
console.log(`   grób 6, wrogi 8/8:      ${blitz(6, [8, 8])}`);
console.log(`   KONTRFAKTYK (bez efektu): ${blitz(6, [4, 4], true)}`);

// ==================================================== F2 — Zombie Boa
console.log('\n=== F2 Zombie Boa — {1}{B} choose color → becomes_blocked_by_color → destroy');
function boa(kontra, wrogowie = [[3, 3, 'R'], [3, 3, 'G']]) {
  const reg = kontra ? registryKontra('zombie-boa', (d) => ({
    ...d, abilities: (d.abilities ?? []).filter((a) => a.type !== 'activated'),
  })) : REG;
  const s = scene({ many: 8, registry: reg, setup: (st, r) => {
    put(st, 'boa', 'zombie-boa', 'p1', 'battlefield', r);
    wrogowie.forEach(([p, t, c], i) => foe(st, `f${i}`, p, t, [c]));
  } });
  return fmt(punkty(s, (o) => o.cmd.includes('(boa')));
}
console.log(`   wróg 3/3 R + 3/3 G:     ${boa(false)}`);
console.log(`   KONTRFAKTYK (bez zdolności): ${boa(true)}`);
// Skalowanie po ofierze i anty-over-fix: pusty stół wroga = brak wkładu.
console.log(`   wróg 1/1 R:             ${boa(false, [[1, 1, 'R']])}`);
console.log(`   wróg 6/6 R:             ${boa(false, [[6, 6, 'R']])}   | kontra: ${boa(true, [[6, 6, 'R']])}`);
console.log(`   pusty stół wroga:       ${boa(false, [])}   | kontra: ${boa(true, [])}`);

// ==================================================== F3 — Impulse (L41)
console.log('\n=== F3 Impulse — look_top_put_one_hand_rest_bottom JAKO CZAR (L41 vs Dockhand/saga)');
function impulse(lib, kontra = false) {
  const reg = kontra ? registryKontra('impulse', (d) => ({ ...d, spell: { ...d.spell, effects: [] } })) : REG;
  const s = scene({ registry: reg, lib, setup: (st, r) => {
    put(st, 'c1', 'impulse', 'p1', 'hand', r);
  } });
  return fmt(punkty(s, (o) => o.cmd.includes('(c1')));
}
for (const l of [0, 1, 4, 30]) console.log(`   biblioteka ${String(l).padStart(2)}:        ${impulse(l)}`);
console.log(`   KONTRFAKTYK (bez efektu): ${impulse(30, true)}`);
// Ten sam typ efektu w ścieżce ZDOLNOŚCI (Merchant's Dockhand) — punkt odniesienia L41.
{
  const s = scene({ setup: (st) => {
    put(st, 'md', 'merchants-dockhand', 'p1', 'battlefield');
    for (let i = 0; i < 3; i++) addObject(st, { id: `a${i}`, instanceId: `i-a${i}`, cardId: 'x',
      controllerId: 'p1', ownerId: 'p1', zone: 'battlefield', kind: 'artifact', power: 0, toughness: 0,
      manaCost: 0, abilities: [], keywords: [], subtypes: [], types: ['Artifact'], colors: [], cardName: 'a' });
  } });
  console.log(`   L41 Dockhand activate:   ${fmt(punkty(s, (o) => o.cmd.includes('(md')))}`);
}

// ==================================================== F4 — Bring to Trial
console.log('\n=== F4 Bring to Trial — exile stwora z mocą >= 4 (rodzina removal)');
function trial(pt) {
  const s = scene({ setup: (st) => { foe(st, 'f1', pt, pt); put(st, 'c1', 'bring-to-trial', 'p1', 'hand'); } });
  return fmt(punkty(s, (o) => o.cmd.includes('(c1->f1')));
}
console.log(`   wrogi 4/4:              ${trial(4)}`);
console.log(`   wrogi 8/8:              ${trial(8)}`);
console.log(`   wrogi 2/2 (nielegalny): ${trial(2)}`);

// ==================================================== F5 — Pacifism
console.log('\n=== F5 Pacifism — aura cantAttack/cantBlock (kierunek celu)');
function paci(cel) {
  const s = scene({ setup: (st) => {
    foe(st, 'f1', 5, 5);
    put(st, 'v1', 'hill-giant', 'p1', 'battlefield');
    put(st, 'c1', 'pacifism', 'p1', 'hand');
  } });
  return fmt(punkty(s, (o) => o.cmd.includes(`(c1->${cel})`)));
}
console.log(`   cel wrogi 5/5:          ${paci('f1')}`);
console.log(`   cel własny:             ${paci('v1')}`);

// ==================================================== F6 — Brine Giant (S11)
console.log('\n=== F6 Brine Giant — affinity for enchantments (wymiar KOSZTU, kontrola S11)');
function giant(ench) {
  const s = scene({ many: 14, setup: (st) => {
    for (let i = 0; i < ench; i++) addObject(st, { id: `e${i}`, instanceId: `i-e${i}`, cardId: 'x',
      controllerId: 'p1', ownerId: 'p1', zone: 'battlefield', kind: 'enchantment', power: 0, toughness: 0,
      manaCost: 1, abilities: [], keywords: [], subtypes: [], types: ['Enchantment'], colors: [], cardName: 'e' });
    put(st, 'c1', 'brine-giant', 'p1', 'hand');
  } });
  return fmt(punkty(s, (o) => o.cmd.includes('(c1')));
}
console.log(`   0 enchantmentów (7 many): ${giant(0)}`);
console.log(`   3 enchantmenty (4 many):  ${giant(3)}`);
console.log(`   6 enchantmentów (1 mana):  ${giant(6)}`);

// ==================================================== F7 — Skyscythe Engulfer
console.log('\n=== F7 Skyscythe Engulfer — 6/5 reach/trample + cantBeBlockedBy(flying)');
function sky(kontra) {
  const reg = kontra ? registryKontra('skyscythe-engulfer', (d) => ({ ...d, abilities: [] })) : REG;
  const s = scene({ registry: reg, setup: (st, r) => { put(st, 'c1', 'skyscythe-engulfer', 'p1', 'hand', r); } });
  return fmt(punkty(s, (o) => o.cmd.includes('(c1')));
}
// Ewazja selektywna ma wartość TYLKO wobec blokera z danym keywordem, więc
// pomiar musi mieć wrogiego blokera: z flying (ewazja działa) i bez (nie działa).
function skyZBlokerem(kontra, keyword) {
  const reg = kontra ? registryKontra('skyscythe-engulfer', (d) => ({ ...d, abilities: [] })) : REG;
  const s = scene({ registry: reg, setup: (st, r) => {
    foe(st, 'f1', 2, 2, ['U']);
    const f1 = st.objects.get('f1');
    st.objects.set('f1', Object.freeze({ ...f1, keywords: keyword ? [keyword] : [] }));
    put(st, 'c1', 'skyscythe-engulfer', 'p1', 'hand', r);
  } });
  return fmt(punkty(s, (o) => o.cmd.includes('(c1')));
}
console.log(`   bez wrogich stworów:    ${sky(false)}`);
console.log(`   KONTRFAKTYK (bez statyki): ${sky(true)}`);
console.log(`   wróg z FLYING:          ${skyZBlokerem(false, 'flying')}`);
console.log(`   wróg z flying, BEZ statyki: ${skyZBlokerem(true, 'flying')}`);
console.log(`   wróg BEZ keywordów:     ${skyZBlokerem(false, null)}`);

// ==================================================== F8 — Ambulatory Edifice
console.log('\n=== F8 Ambulatory Edifice — ETB optionalPay 2 życia → pump -1/-1');
function edifice(kontra, pt = [3, 3]) {
  const reg = kontra ? registryKontra('ambulatory-edifice', (d) => ({ ...d, abilities: [] })) : REG;
  const s = scene({ registry: reg, setup: (st, r) => {
    if (pt !== null) foe(st, 'f1', pt[0], pt[1]); // null = pusty stół wroga
    put(st, 'c1', 'ambulatory-edifice', 'p1', 'hand', r);
  } });
  return fmt(punkty(s, (o) => o.cmd.includes('(c1')));
}
console.log(`   pełny (wróg 3/3):       ${edifice(false)}`);
console.log(`   KONTRFAKTYK (bez triggera): ${edifice(true)}`);
// Czy wyceniany jest SAM efekt -1/-1? Wróg 1/1 ginie od tego pumpa (zysk),
// wróg 5/5 tylko traci 1/1 (mniejszy zysk). Różnica = wartość pumpa.
console.log(`   wróg 1/1 (ginie):       ${edifice(false, [1, 1])}   | kontra: ${edifice(true, [1, 1])}`);
console.log(`   wróg 5/5 (nie ginie):   ${edifice(false, [5, 5])}   | kontra: ${edifice(true, [5, 5])}`);
console.log(`   brak wrogich stworów:   ${edifice(false, null)}   | kontra: ${edifice(true, null)}`);

// ==================================================== F9 — Temple of Abandon
console.log('\n=== F9 Temple of Abandon — entersTapped + scry 1 + {T}: {R} lub {G}');
function temple(manaWBazie, kartaWRęce) {
  const s = scene({ many: 0, setup: (st) => {
    put(st, 't1', 'temple-of-abandon', 'p1', 'battlefield', REG, { tapped: false });
    if (manaWBazie) addMana(st, 'p1', manaWBazie, { colors: ['G'] });
    if (kartaWRęce) put(st, 'c1', kartaWRęce, 'p1', 'hand');
  } });
  return fmt(punkty(s, (o) => o.cmd.includes('(t1')));
}
console.log(`   0 many, pusta ręka:     ${temple(0, null)}`);
console.log(`   5G + 6-mana zielony:    ${temple(5, 'skyscythe-engulfer')}`);
console.log(`   6G + 6-mana zielony:    ${temple(6, 'skyscythe-engulfer')}`);
{
  const s = scene({ setup: (st) => { put(st, 'c1', 'temple-of-abandon', 'p1', 'hand'); } });
  console.log(`   play_land:              ${fmt(punkty(s, (o) => o.cmd.includes('(c1')))}`);
}
// KONTROLA UCZCIWOŚCI F9: jeśli mana nietapniętego lądu jest JUŻ policzona
// w jednostkach (B54/s4008 — auto-płatność tapuje lądy sama), to rzut 6-mana
// zielonego przy 5G + Temple MUSI być oferowany bez jawnej aktywacji. Wtedy
// ujemna aktywacja jest POPRAWNA (redundancja), nie defektem.
{
  const s = scene({ many: 0, setup: (st) => {
    put(st, 't1', 'temple-of-abandon', 'p1', 'battlefield', REG, { tapped: false });
    addMana(st, 'p1', 5, { colors: ['G'] });
    put(st, 'c1', 'skyscythe-engulfer', 'p1', 'hand');
  } });
  console.log(`   czy rzut 6G oferowany:   ${fmt(punkty(s, (o) => o.cmd.includes('(c1')))}`);
}

// ==================================================== F10 — Blinding Drone
console.log('\n=== F10 Blinding Drone — devoid 1/3 + {C},{T}: tap target creature');
function drone(scen) {
  const reg = scen === 'kontra' ? registryKontra('blinding-drone', (d) => ({ ...d, abilities: [] })) : REG;
  const s = scene({ registry: reg, setup: (st, r) => {
    foe(st, 'f1', 4, 4);
    put(st, 'd1', 'blinding-drone', 'p1', 'battlefield', r);
  } });
  return fmt(punkty(s, (o) => o.cmd.includes('(d1')));
}
console.log(`   pełny, wrogi 4/4:       ${drone('pełny')}`);
console.log(`   KONTRFAKTYK (bez zdolności): ${drone('kontra')}`);
// KONTROLA UCZCIWOŚCI: koszt to {C} (bezbarwny, CR 107.4c) — kolorowa mana go
// NIE opłaci, więc „BRAK OFERTY" przy puli kolorowej byłby POPRAWNY. Powtórka
// z maną bezbarwną (colors: [] — resources.js: jawne colors:[] = bezbarwna).
function droneKolor(bezbarwna) {
  const s = scene({ many: 0, setup: (st) => {
    if (bezbarwna) addMana(st, 'p1', 5, { colors: [] });
    else addMana(st, 'p1', 5, { colors: ['R'] });
    foe(st, 'f1', 4, 4);
    put(st, 'd1', 'blinding-drone', 'p1', 'battlefield');
  } });
  return fmt(punkty(s, (o) => o.cmd.includes('(d1')));
}
console.log(`   5 many KOLOROWEJ:       ${droneKolor(false)}`);
console.log(`   5 many BEZBARWNEJ:      ${droneKolor(true)}`);
{
  const s = scene({ setup: (st) => { put(st, 'c1', 'blinding-drone', 'p1', 'hand'); } });
  console.log(`   rzut z ręki:            ${fmt(punkty(s, (o) => o.cmd.includes('(c1')))}`);
}
