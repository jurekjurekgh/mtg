// M265 (Żywy Tester, worek-legend vs tarkir-wur seed 323): panel akcji
// pokazał „Rzuć za warp: Weftblade Enhancer (koszt ?)". Gracz nie wiedział,
// ile kosztuje wariant, który właśnie wybiera.
//
// Klasa L93/L21 (recydywa M151 — wtedy to samo zdarzyło się z `suspend`):
// wpis RĘKI w `playerView` składany jest z JAWNEJ listy pól. Deskryptory
// kosztów alternatywnych, które na liście nie są, nie docierają do UI, a
// `commandLabel` renderuje „?" albo pustkę — mimo że silnik zna koszt i
// poprawnie go pobiera. Koszt alternatywny to publiczny Oracle (CR 601.2b),
// nie informacja ukryta.
//
// Strażnik jest KLASOWY: enumeruje cały katalog kart, nie wybrane nazwy
// (ADR 0002 — żadnych specjalnych przypadków po id karty).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { commandLabel } from '../src/table/render.js';

const REGISTRY = createCardRegistry();
const SESSION = {
  nameOf: (id) => REGISTRY.get(id)?.name ?? String(id),
  nameOfObject: (id) => String(id),
  cardDetails: (id) => REGISTRY.get(id) ?? null,
};

/** Deskryptory KOSZTU widoczne dla gracza planującego rzut z ręki. */
const ALT_COST_FIELDS = ['warp', 'surge', 'kicker', 'suspend', 'plot', 'bestow', 'morph', 'adventure', 'treasureAltCost'];

function handEntryFor(cardId) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  addObject(state, {
    id: 'c', instanceId: 'i-c', cardId, controllerId: 'p1', ownerId: 'p1', zone: 'hand',
    ...data, types: def.types ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
  });
  return { view: playerView(state, 'p1'), entry: playerView(state, 'p1').zones.hand.find((o) => o.id === 'c'), data };
}

const plain = (html) => String(html).replace(/<[^>]*>/g, '');

test('M265 (klasa): KAŻDY deskryptor kosztu alternatywnego dociera do wpisu ręki', () => {
  const missing = [];
  for (const def of REGISTRY.all()) {
    const data = gameObjectDataOf(def);
    const present = ALT_COST_FIELDS.filter((f) => data[f] != null);
    if (present.length === 0) continue;
    const { entry } = handEntryFor(def.id);
    for (const field of present) {
      if (entry?.[field] == null) missing.push(`${def.id}.${field}`);
    }
  }
  assert.deepEqual(missing, [],
    `deskryptory kosztu gubione w playerView (etykieta pokaże „?"): ${missing.join(', ')}`);
});

test('M265: etykieta warp pokazuje koszt {2}{W}, nie „?" (Weftblade Enhancer)', () => {
  const { view } = handEntryFor('weftblade-enhancer');
  const label = plain(commandLabel({ type: 'warp_card', playerId: 'p1', objectId: 'c' }, SESSION, view));
  assert.ok(!label.includes('?'), `koszt warp musi być znany: ${label}`);
  assert.ok(/2\s*W|W\s*2/.test(label.replace(/[{}]/g, '')), `koszt warp {2}{W}: ${label}`);
});

test('M265: warp-ready karta w EXILE też zna swój koszt (rzut z wygnania)', () => {
  // Po rzucie za warp karta ląduje w exile z `warpReady` i można ją rzucić
  // ponownie w późniejszej turze — druga strefa, ta sama etykieta.
  const def = REGISTRY.get('weftblade-enhancer');
  const data = gameObjectDataOf(def);
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  addObject(state, {
    id: 'c', instanceId: 'i-c', cardId: 'weftblade-enhancer', controllerId: 'p1', ownerId: 'p1',
    zone: 'exile', ...data, warpReady: true, types: def.types ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
  });
  const view = playerView(state, 'p1');
  const entry = view.zones.exile.find((o) => o.id === 'c');
  assert.ok(entry?.warpReady, 'gotowość rzutu z wygnania jest jawna');
  assert.ok(entry?.warp, 'deskryptor kosztu warp musi dotrzeć do widoku exile');
  const label = plain(commandLabel({ type: 'warp_card', playerId: 'p1', objectId: 'c' }, SESSION, view));
  assert.ok(!label.includes('?'), `koszt warp z wygnania musi być znany: ${label}`);
});

test('M265: etykieta surge pokazuje koszt {2}{U}, nie „?" (Jwar Isle Avenger)', () => {
  const { view } = handEntryFor('jwar-isle-avenger');
  const label = plain(commandLabel(
    { type: 'cast_permanent', playerId: 'p1', objectId: 'c', cardId: 'jwar-isle-avenger', surgeCast: true }, SESSION, view));
  assert.ok(!label.includes('?'), `koszt surge musi być znany: ${label}`);
  assert.ok(/2\s*U|U\s*2/.test(label.replace(/[{}]/g, '')), `koszt surge {2}{U}: ${label}`);
});

test('M265: etykieta kickera pokazuje dopłatę {W}, nie pustkę (Kor Sanctifiers)', () => {
  const { view } = handEntryFor('kor-sanctifiers');
  const label = plain(commandLabel(
    { type: 'cast_permanent', playerId: 'p1', objectId: 'c', cardId: 'kor-sanctifiers', kicked: true }, SESSION, view));
  assert.doesNotMatch(label, /kicker\s*\)/, `dopłata kickera nie może być pusta: ${label}`);
  assert.match(label, /kicker[^)]*W/, `kicker {W}: ${label}`);
});

test('M265: wariant „tylko ze Skarbów" odróżnia się od zwykłego rzutu (Security Rhox)', () => {
  // CR 601.2b — dwa różne koszty tej samej karty muszą mieć różne etykiety,
  // inaczej panel oferuje dwa identyczne przyciski (klasa M101/B).
  const { view } = handEntryFor('security-rhox');
  const base = plain(commandLabel(
    { type: 'cast_permanent', playerId: 'p1', objectId: 'c', cardId: 'security-rhox' }, SESSION, view));
  const alt = plain(commandLabel(
    { type: 'cast_permanent', playerId: 'p1', objectId: 'c', cardId: 'security-rhox', treasureAlt: true }, SESSION, view));
  assert.notEqual(alt, base, `wariant ze Skarbów ma własną etykietę, obie brzmią: ${base}`);
  assert.match(alt, /Skarb/i, `etykieta musi powiedzieć, że płacisz maną ze Skarbów: ${alt}`);
});
