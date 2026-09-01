import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCardRegistry } from '../src/cards/card-data.js';
import { costSymbols } from '../src/table/mana-icons.js';
import { commandLabel } from '../src/table/render.js';

/**
 * M268 — domknięcie punktów otwartych po M267 (L104/1).
 *
 * L104 nazwała rodzinę alternatywnych kosztów (cleave, escape, madness,
 * suspend, plot, bestow, morph, warp, surge, kicker, flashback, buyback,
 * adventure), ale skan Oracle↔definicja przeszedł wtedy tylko po cleave
 * i escape. Ten strażnik enumeruje CAŁĄ rodzinę — dokładnie to, czego
 * wymaga L104/4 i L101/2.
 *
 * Znalezione tym skanem (2 karty, ta sama klasa co M267/C):
 *   leafcrown-dryad   „Bestow {3}{G}" → def. bestow bez `colors`
 *   tumbleweed-rising „Plot {2}{G}"   → def. plot bez `colors`
 * przy czym bliźniak plot (spinewoods-paladin, „Plot {3}{G}") miał
 * `colors: ['G']` od początku — te same dane, dwa różne zapisy.
 *
 * Morph jest w tej rodzinie SZCZEGÓLNY i celowo pominięty w porównaniu
 * kwoty: ma DWA koszty (`cost` = rzut zakryty za {3} wg CR 702.37a,
 * `morphCost`/`megamorphCost` = odkrycie). Pierwsza wersja skanera
 * porównywała Oracle z polem `cost` i dała 6 fałszywych trafień.
 */

const REGISTRY = createCardRegistry();

/** Deskryptory kosztowe: słowo z Oracle → miejsce w definicji karty. */
const COST_DESCRIPTORS = [
  ['Bestow', (c) => c.bestow],
  ['Plot', (c) => c.plot],
  ['Suspend', (c) => c.suspend],
  ['Madness', (c) => c.madness],
  ['Warp', (c) => c.warp],
  ['Surge', (c) => c.surge],
  ['Kicker', (c) => c.kicker],
  ['Flashback', (c) => c.spell?.flashback],
  ['Buyback', (c) => c.spell?.buyback],
  ['Escape', (c) => c.spell?.escape],
  ['Cleave', (c) => c.spell?.cleave],
  ['Adventure', (c) => c.adventure],
  // Morph/Megamorph: pip koloru dotyczy kosztu ODKRYCIA (morphCost).
  ['Morph', (c) => c.morph],
  ['Megamorph', (c) => c.morph],
];

function oraclePips(text, keyword) {
  const re = new RegExp(`${keyword}\\s*(?:—|-|\\u2014)?\\s*((?:\\{[^}]+\\}\\s*)+)`, 'i');
  const match = re.exec(text ?? '');
  if (!match) return null;
  return [...match[1].matchAll(/\{([WUBRG])\}/g)].map((m) => m[1]);
}

test('M268 (klasa): każdy alt-koszt z pipem w Oracle ma `colors` w definicji', () => {
  const offenders = [];
  for (const card of REGISTRY.all()) {
    for (const [keyword, get] of COST_DESCRIPTORS) {
      const descriptor = get(card);
      if (!descriptor) continue;
      const pips = oraclePips(card.oracleText, keyword);
      if (pips == null || pips.length === 0) continue;
      const declared = [...(descriptor.colors ?? [])].sort();
      if (JSON.stringify(declared) !== JSON.stringify([...pips].sort())) {
        offenders.push(`${card.id} [${keyword}] oracle=${pips.join('')} def=${declared.join('') || 'BRAK'}`);
      }
    }
  }
  assert.deepEqual(offenders, [], 'alt-koszty bez pipów kolorów w definicji');
});

test('M268: bestow Leafcrown Dryad i plot Tumbleweed Rising niosą pip {G}', () => {
  const dryad = REGISTRY.get('leafcrown-dryad');
  assert.deepEqual(dryad.bestow.colors, ['G'], 'Bestow {3}{G}');
  assert.equal(costSymbols(dryad.bestow.cost, dryad.bestow.colors), '{3}{G}');
  const tumbleweed = REGISTRY.get('tumbleweed-rising');
  assert.deepEqual(tumbleweed.plot.colors, ['G'], 'Plot {2}{G}');
  assert.equal(costSymbols(tumbleweed.plot.cost, tumbleweed.plot.colors), '{2}{G}');
});

test('M268: bliźniak plot (Spinewoods Paladin) bez zmian — te same dane, jeden zapis', () => {
  const paladin = REGISTRY.get('spinewoods-paladin');
  assert.deepEqual(paladin.plot.colors, ['G'], 'Plot {3}{G}');
  assert.equal(costSymbols(paladin.plot.cost, paladin.plot.colors), '{3}{G}');
});

test('M268: łączna kwota alt-kosztów bez zmian (anty-over-fix)', () => {
  // Dopisanie pipów nie może przesunąć ceny: {3}{G} to nadal 4 many razem.
  assert.equal(REGISTRY.get('leafcrown-dryad').bestow.cost, 4);
  assert.equal(REGISTRY.get('tumbleweed-rising').plot.cost, 3);
  assert.equal(REGISTRY.get('spinewoods-paladin').plot.cost, 4);
});

test('M268 (normalizacja): `colors` przechodzi przez registry dla bestow', () => {
  // Klasa L104/3: pole widać w card-data.js, a ginie w drodze do rejestru,
  // bo normalizacja przepisuje jawną listę pól. Bestow był ostatnim
  // deskryptorem kosztowym w registry.js bez `colors`.
  const source = fs.readFileSync(new URL('../src/cards/registry.js', import.meta.url), 'utf8');
  const bestowBlock = /bestow:\s*data\.bestow\s*\?\s*Object\.freeze\(\{([\s\S]*?)\}\)\s*:\s*null/.exec(source);
  assert.ok(bestowBlock, 'blok normalizacji bestow istnieje');
  assert.match(bestowBlock[1], /colors:/, 'normalizacja bestow przepuszcza `colors`');
});

test('M268 (silnik): rzut za bestow płaci pipami KOSZTU BESTOW, nie karty bazowej', () => {
  // L104/2: dziś Leafcrown Dryad ma ten sam {G} w koszcie bazowym i bestow,
  // więc `coloredPipsOf(cardId)` trafia PRZYPADKIEM. Pytamy o źródło.
  // Uwaga: ta sama funkcja obsługuje ZWYKŁĄ aurę, która płaci koszt bazowy —
  // tam `coloredPipsOf(cardId)` jest poprawne. Pytamy więc nie o obecność
  // fallbacku, tylko o to, czy gałąź bestow ma własne wymagania kolorów.
  const source = fs.readFileSync(new URL('../src/engine/resources.js', import.meta.url), 'utf8');
  const lines = source.split('\n');
  const offenders = [];
  lines.forEach((line, index) => {
    if (!/spendMana\(/.test(line)) return;
    const context = lines.slice(Math.max(0, index - 90), index).join('\n');
    if (!/bestow/i.test(context)) return;
    const usesBestowColors = /bestow\w*[Rr]equirements/.test(line)
      || /bestow(?:\?)?\.colors/.test(line);
    if (!usesBestowColors) offenders.push(`resources.js:${index + 1}: ${line.trim().slice(0, 80)}`);
  });
  assert.deepEqual(offenders, [],
    'ścieżka bestow płaci pipami kosztu BAZOWEGO — pierwsza karta o innym '
    + 'kolorze kosztu bestow złamie regułę płatności (CR 601.2b)');
});

// --- Etykiety: druga rzecz otwarta po M267 -----------------------------------

const LABEL_VIEW = (objects) => ({
  zones: {
    hand: objects, battlefield: objects, stack: [], graveyard: [], library: [], exile: [],
  },
  players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Nieprzyjaciel' }],
});
const LABEL_SESSION = {
  nameOf: (id) => String(id),
  cardDetails: () => null,
  state: { objects: new Map() },
};

test('M268/label: koszt bestow w etykiecie to {3}{G}, nie gołe 4', () => {
  const card = REGISTRY.get('leafcrown-dryad');
  const view = LABEL_VIEW([
    { id: 'o1', cardId: 'leafcrown-dryad', bestow: card.bestow, aura: card.aura ?? null },
    { id: 'h1', cardId: 'giant-spider' },
  ]);
  const label = commandLabel(
    { type: 'cast_permanent', objectId: 'o1', bestow: true, targets: ['h1'] },
    LABEL_SESSION, view,
  );
  assert.doesNotMatch(label, /koszt[^<]*\b4\b/, 'gołe „4" to cena nie do zapłacenia');
  assert.match(label, /3/, 'część generyczna {3}');
  assert.match(label, /\bG\b|ms-g/i, 'pip {G}');
});

test('M268/label: koszt ODKRYCIA morph liczy pipy W RAMACH kwoty', () => {
  // Willbender: Oracle „Morph {1}{U}" → morphCost 2, colors ['U'].
  // Stary zapis sklejał `{2}` + `{U}` = „{2}{U}", czyli TRZY many —
  // etykieta zawyżała cenę, a nie tylko ją brzydko formatowała.
  const card = REGISTRY.get('willbender');
  assert.equal(card.morph.morphCost, 2);
  assert.deepEqual(card.morph.colors, ['U']);
  assert.equal(costSymbols(card.morph.morphCost, card.morph.colors), '{1}{U}');

  // Odkrycie zakrytego stwora to `activate_ability` na permanencie z faceDown
  // (flip-zdolność buduje engine z deskryptora morph, nie ma jej w registry).
  const object = { id: 'o1', cardId: 'willbender', morph: card.morph, faceDown: true };
  const view = LABEL_VIEW([object]);
  const session = {
    ...LABEL_SESSION,
    abilitiesOf: () => [{ keyword: 'morph', cost: { mana: 2 } }],
    state: { objects: new Map([['o1', { ...object, abilities: [{ keyword: 'morph', cost: { mana: 2 } }] }]]) },
  };
  const label = commandLabel({ type: 'activate_ability', objectId: 'o1', abilityIndex: 0 }, session, view);
  assert.doesNotMatch(label, />2</, `etykieta zawyża koszt odkrycia: ${label}`);
  assert.match(label, />1<|1/, 'część generyczna {1}');
  assert.match(label, /\bU\b|ms-u/i, 'pip {U}');
});

test('M268/label: koszt plot w etykiecie niesie pip koloru', () => {
  const card = REGISTRY.get('tumbleweed-rising');
  const view = LABEL_VIEW([{ id: 'o1', cardId: 'tumbleweed-rising', plot: card.plot }]);
  const label = commandLabel({ type: 'plot_card', objectId: 'o1' }, LABEL_SESSION, view);
  assert.match(label, /\bG\b|ms-g/i, `pip {G} w koszcie plot: ${label}`);
  assert.doesNotMatch(label, /koszt[^<]*\b3\b(?![^<]*G)/, 'gołe „3" bez pipa');
});

test('M268/label (klasa): warstwa etykiet nie powiela składanki kosztu', () => {
  // L100/3 + L104: „generic + pipy" ma JEDNO źródło (costSymbols). Każda
  // ręczna sklejka w render.js to kolejna kopia, która rozjedzie się z resztą
  // — dokładnie tak powstał błąd morph (pipy DOKLEJONE do pełnej kwoty).
  const source = fs.readFileSync(new URL('../src/table/render.js', import.meta.url), 'utf8');
  const handRolled = [...source.matchAll(/\.colors\s*\?\?\s*\[\]\)\.map\(\(c\)\s*=>\s*`\{\$\{c\}\}`\)\.join\(''\)/g)];
  assert.deepEqual(handRolled.map((m) => source.slice(0, m.index).split('\n').length), [],
    'ręczne sklejki pipów w render.js — użyj costSymbols()');
});

test('M268/label: etykieta odkrycia nie powtarza słowa „Morph" dwa razy', () => {
  // Pre-existing (widoczne też przed M268): nazwa ZAKRYTEJ karty niesie już
  // znacznik „(Morph)" (CR 708.2 — gracz zna własną kartę, ale widzi, że leży
  // zakryta), a etykieta doklejała drugi raz nazwę mechaniki przy koszcie:
  // „Willbender (Morph) (Morph {1}{U})".
  const card = REGISTRY.get('willbender');
  const object = { id: 'o1', cardId: 'willbender', morph: card.morph, faceDown: true };
  const session = {
    ...LABEL_SESSION,
    nameOf: () => 'Willbender',
    abilitiesOf: () => [{ keyword: 'morph', cost: { mana: 2 } }],
    state: { objects: new Map([['o1', object]]) },
  };
  const label = commandLabel(
    { type: 'activate_ability', objectId: 'o1', abilityIndex: 0 }, session, LABEL_VIEW([object]),
  );
  const occurrences = (label.match(/Morph/gi) ?? []).length;
  assert.equal(occurrences, 1, `„Morph" powtórzone ${occurrences}× w: ${label}`);
});
