// Audyt B54 Żywym Testerem (2026-09-09): strażnik poprawek językowych F1–F8.
// Każde znalezisko tekstowe ma tu pinezkę na ŚCIEŻCE PUBLICZNEJ (rulesText /
// describeGameEvent / rejestr / eksportowane mapy) — żeby kolejny batch nie
// przywrócił surowego angielskiego ani rozjechanej terminologii. Badge'e
// ('nie odkręca się', 'Dotyk śmierci', 'Zajrzyj') pilnują zaktualizowane
// testy e7/m168/m173/m175/m257r4/m260/m293.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { rulesText, KEYWORD_LABELS } from '../src/table/render.js';
import { describeGameEvent, TRIGGER_EVENT_LABELS, KEYWORD_EVENT_LABELS } from '../src/table/session.js';

const REGISTRY = createCardRegistry();
const HELPERS = {
  nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? String(cardId),
  nameOfObject: (objectId) => String(objectId),
};

function defText(cardId, extra = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `brak karty ${cardId} w rejestrze`);
  return rulesText({
    cardId: def.id, controllerId: 'p1', abilities: def.abilities ?? [],
    keywords: def.keywords ?? [], spell: def.spell ?? null,
    equipment: def.equipment ?? null, plot: def.plot ?? null,
    saga: def.saga ?? null, entersWithCounters: def.entersWithCounters ?? null,
    aura: def.aura ?? null, ...extra,
  });
}

const activatedLine = (effectTypes, extra = {}) => describeGameEvent({
  type: 'ability_activated', cardId: 'death-hood-cobra', objectId: 'o1',
  playerId: 'p1', effectTypes, ...extra,
}, HELPERS);

// --- F1: untap mówi jednym rdzeniem (odkręc-), zero surowego angielskiego ---
test('F1: aura Membrane — „nie odkręca się podczas kroku odkręcania”, bez „untap”', () => {
  const text = defText('containment-membrane');
  assert.ok(text.includes('nie odkręca się podczas kroku odkręcania'),
    `tekst aury: ${text}`);
  assert.ok(!text.toLowerCase().includes('untap'), `surowy untap: ${text}`);
});

test('F1: log zdolności lock_untap/untap — „odkręca/odkręcenie”, bez „untap”', () => {
  const lock = activatedLine(['lock_untap']);
  assert.ok(lock.includes('nie odkręca się podczas następnego kroku odkręcania kontrolera'),
    `lock_untap: ${lock}`);
  assert.ok(!lock.includes('untap'), `surowy untap: ${lock}`);
  const untap = activatedLine(['untap_permanent']);
  assert.ok(untap.includes('odkręcenie celu'), `untap_permanent: ${untap}`);
});

test('F1: log regeneracji — „odkręcony, bez obrażeń”', () => {
  const line = describeGameEvent(
    { type: 'permanent_regenerated', cardId: 'leafcrown-dryad', objectId: 'o1', playerId: 'p1' }, HELPERS);
  assert.ok(line.includes('odkręcony, bez obrażeń'), `regeneracja: ${line}`);
});

// --- F2: tryby Keep Out po polsku ---
test('F2: Keep Out — „zatapniętemu stworowi” i „Zniszcz zaklęcie”', () => {
  const modes = REGISTRY.get('keep-out').spell.modes;
  assert.equal(modes[0].name, 'Zadaj 4 obrażenia zatapniętemu stworowi');
  assert.equal(modes[1].name, 'Zniszcz zaklęcie');
});

// --- F4: upkeep to „podtrzymanie” (faza tak się nazywa w UI) ---
test('F4: Plague Reaver — „na początku podtrzymania”, bez „upkeep”', () => {
  const text = defText('plague-reaver');
  assert.ok(text.includes('na początku podtrzymania'), `plague: ${text}`);
  assert.ok(!text.toLowerCase().includes('upkeep'), `surowy upkeep: ${text}`);
});

test('F4: etykiety upkeep — „krok podtrzymania”, „(podtrzymanie)”, echo', () => {
  assert.equal(TRIGGER_EVENT_LABELS.upkeep, 'krok podtrzymania');
  const ret = activatedLine(['return_to_battlefield_under_control_at_upkeep']);
  assert.ok(ret.includes('(podtrzymanie)'), `powrót: ${ret}`);
  assert.ok(KEYWORD_EVENT_LABELS.echo.includes('podtrzymaniu'),
    `echo: ${KEYWORD_EVENT_LABELS.echo}`);
});

// --- F5: domain to „dziedzina” ---
test('F5: Exploding Borders — „(dziedzina)”, bez „(domain)”', () => {
  const text = defText('exploding-borders');
  assert.ok(text.includes('(dziedzina)'), `borders: ${text}`);
  assert.ok(!text.includes('(domain)'), `surowy domain: ${text}`);
});

// --- F7: lifelink/deathtouch po polsku w obu mapach ---
test('F7: „Więź życia” i „Dotyk śmierci” (duże i małe litery)', () => {
  assert.equal(KEYWORD_LABELS.lifelink, 'Więź życia');
  assert.equal(KEYWORD_LABELS.deathtouch, 'Dotyk śmierci');
  assert.equal(KEYWORD_EVENT_LABELS.lifelink, 'więź życia');
  assert.equal(KEYWORD_EVENT_LABELS.deathtouch, 'dotyk śmierci');
});

// --- F8: finality to „ostateczność”, nonland po polsku ---
test('F8: Zoraline — „permanent niebędący lądem” i „licznik ostateczności”', () => {
  const text = defText('zoraline');
  assert.ok(text.includes('permanent niebędący lądem'), `zoraline: ${text}`);
  assert.ok(text.includes('licznikiem ostateczności'), `zoraline: ${text}`);
  assert.ok(!text.includes('nonland'), `surowy nonland: ${text}`);
  assert.ok(!text.toLowerCase().includes('finality'), `surowy finality: ${text}`);
});

test('F8: log zniszczenia do wygnania — „(licznik ostateczności)”', () => {
  const line = describeGameEvent(
    { type: 'permanent_destroyed', cardId: 'leafcrown-dryad', toZone: 'exile' }, HELPERS);
  assert.ok(line.includes('(licznik ostateczności)'), `log: ${line}`);
});
