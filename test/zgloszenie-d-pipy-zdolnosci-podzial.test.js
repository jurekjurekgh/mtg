// Zgłoszenie D (2026-09-20, uwagi z gry): „Simian Simulacrum... jego zdolność
// (Unearth) wymaga 2 zielonej many. Wkładanie go do talii Dominaria (WU) jest
// mało sensowne. Powinien trafić do talii Dominaria (BRG). Musisz zmodyfikować
// skrypt dzielący karty na talie, żeby przy podziale bezkolorowych kart brał
// pod uwagę pipy kosztów zdolności lub/i wytwarzaną manę."
//
// Reguła (zakres zgłoszenia): karta BEZKOLOROWA z pipami kosztów zdolności
// (CR 903.4 — symbole many w kosztach zdolności są częścią tożsamości) idzie na
// stronę, która te pipy MOŻE ZAPŁACIĆ; wybór podziału (maski, nazwy plików)
// zostaje bez zmian — patrz komentarz w `tools/generate-plan-decks.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { abilityCostColorsOf, buildDecks, splitColorsOf } from '../tools/generate-plan-decks.mjs';
import { splitPlanByColors, MIN_NONLAND } from '../tools/split-deck-colors.mjs';
import { createCardRegistry } from '../src/cards/card-data.js';
import { parseDeckText } from '../src/cards/deck-text.js';

const registry = createCardRegistry();

test('D/1: pipy kosztów zdolności czytamy z deskryptorów (aktywowane, alternatywne), nie z efektów', () => {
  const pips = (id) => abilityCostColorsOf(registry.get(id)).join('');
  // Zdolność aktywowana (unearth) — sedno zgłoszenia.
  assert.equal(pips('simian-simulacrum'), 'G', 'Simian Simulacrum: unearth {2}{G}{G}');
  assert.equal(pips('welder-automaton'), 'R', 'Welder Automaton: zdolność za {R}');
  assert.equal(pips('balamb-garden-seed-academy'), 'UG', 'dwie zdolności w dwóch kolorach (porządek WUBRG)');
  // Koszt alternatywny/dodatkowy CZARU (deskryptory bezpośrednie `spell.*`).
  assert.equal(pips('sleep-of-the-dead'), 'U', 'escape {U}');
  assert.equal(pips('lunar-rejection'), 'U', 'cleave {U}');
  // PUŁAPKA: efekt tworzący KOLOROWY token nie jest kosztem karty (Chocobo
  // tworzy zielonego ptaka, ale jego pip jest czerwony — z flashbacku).
  assert.equal(pips('call-the-mountain-chocobo'), 'R', 'kolor tokenu z efektu NIE liczy się do kart');
  // Karta bez zdolności z kolorowym kosztem — brak pipów.
  assert.equal(pips('lightwalker'), '', 'zwykły stwór bez kolorowych kosztów zdolności');
  assert.equal(pips('basic-forest'), '', 'land podstawowy');
});

test('D/2: karta bezkolorowa z pipami idzie na stronę, która może je zapłacić (nie na balans)', () => {
  // 16 kart W + 16 kart G (obie strony >= MIN_NONLAND) + bezkolorowe
  // wypełniacze; jeden z nich ma zielony pip zdolności.
  const w = Array.from({ length: MIN_NONLAND + 1 }, (_, i) => ({ id: `w${i}`, colors: ['W'], types: ['Creature'] }));
  const g = Array.from({ length: MIN_NONLAND + 1 }, (_, i) => ({ id: `g${i}`, colors: ['G'], types: ['Creature'] }));
  const fillers = [
    { id: 'neutral-1', colors: [], types: ['Artifact'] },
    { id: 'neutral-2', colors: [], types: ['Artifact'] },
    { id: 'green-ability', colors: [], types: ['Artifact'] },
  ];
  const pipsOf = (card) => (card.id === 'green-ability' ? ['G'] : []);
  const withPips = splitPlanByColors([...w, ...g, ...fillers], (c) => c.colors, pipsOf);
  const greenSide = withPips.a.some((c) => c.id === 'green-ability') ? withPips.a : withPips.b;
  const whiteSide = greenSide === withPips.a ? withPips.b : withPips.a;
  assert.ok(greenSide.some((c) => c.id === 'green-ability'),
    'karta z pipem {G} musi być po stronie z zielenią');
  assert.ok(!whiteSide.some((c) => c.id === 'green-ability'), 'nie po stronie bez zieleni');
  // Kompatybilność: bez preferencji (stary kontrakt dwuargumentowy) wynik jest
  // taki jak przed zgłoszeniem — balans liczności.
  const withoutPips = splitPlanByColors([...w, ...g, ...fillers], (c) => c.colors);
  assert.equal(withoutPips.a.length + withoutPips.b.length, withPips.a.length + withPips.b.length,
    'preferencja nie gubi kart');
  assert.equal(withPips.a.length + withPips.b.length, w.length + g.length + fillers.length);
});

test('D/3: realny generator — Simian Simulacrum w Dominaria (BRG), nie w (WU)', () => {
  const files = buildDecks(registry);
  const dominariaWu = files.get('dominaria-wu');
  const dominariaBrg = files.get('dominaria-brg');
  assert.ok(dominariaWu && dominariaBrg,
    'zgłoszenie D nie przemianowuje talii: strony Dominarii to nadal WU i BRG');
  assert.match(dominariaBrg, /1x Simian Simulacrum/,
    'karta z unearth {2}{G}{G} trafia do talii, która ma zieleń');
  assert.doesNotMatch(dominariaWu, /Simian Simulacrum/,
    'i NIE zostaje w talii bez zielonych źródeł (zgłoszenie właściciela)');
  // Mirrodin: Trigon of Corruption ({B} w koszcie zdolności) po stronie z B.
  assert.match(files.get('mirrodin-brg'), /1x Trigon of Corruption/);
  assert.doesNotMatch(files.get('mirrodin-wu'), /Trigon of Corruption/);
  // Talie zachowują próg ADR 0024 (obie strony >= 15 kart nielandowych).
  // „Nielandowe" w ADR 0024 = wszystko poza landami PODSTAWOWYMI (plan
  // dopisuje basic landy pod pipy, a te nie liczą się do progu).
  const nonland = (text) => parseDeckText(text, registry).cardIds
    .filter((cardId) => !cardId.startsWith('basic-')).length;
  assert.ok(nonland(dominariaWu) >= MIN_NONLAND, `dominaria-wu ma ${nonland(dominariaWu)} kart nielandowych`);
  assert.ok(nonland(dominariaBrg) >= MIN_NONLAND, `dominaria-brg ma ${nonland(dominariaBrg)} kart nielandowych`);
});

test('D/4: niezmiennik talii dzielonych — bezkolorowa karta z pipami ma je pokryte sufiksem', () => {
  // Strażnik ogólny (nie na jedną kartę): każda talia o sufiksie kolorów
  // (efekt podziału ADR 0024) musi mieć źródła na pipy WSZYSTKICH swoich
  // bezkolorowych kart z kolorowymi kosztami zdolności — inaczej karta
  // siedzi w talii, która nie może użyć jej zdolności (klasa zgłoszenia D).
  const splitDecks = fs.readdirSync('decks')
    .filter((file) => file.endsWith('.txt'))
    .filter((file) => {
      const suffix = file.replace(/\.txt$/, '').split('-').pop() ?? '';
      return /^[wubrg]+$/.test(suffix) && new Set(suffix).size === suffix.length;
    });
  assert.ok(splitDecks.length >= 8, `znaleziono talie dzielone: ${splitDecks.length}`);
  for (const file of splitDecks) {
    const suffix = file.replace(/\.txt$/, '').split('-').pop();
    const cardIds = parseDeckText(fs.readFileSync(`decks/${file}`, 'utf8'), registry).cardIds;
    for (const cardId of cardIds) {
      const card = registry.get(cardId);
      if (!card || (card.colors ?? []).some((color) => 'WUBRG'.includes(color))) continue;
      const missing = abilityCostColorsOf(card)
        .filter((color) => !suffix.includes(color.toLowerCase()));
      assert.deepEqual(missing, [],
        `${file}: karta ${cardId} ma pipy ${abilityCostColorsOf(card).join('')} poza sufiksem ${suffix}`);
    }
  }
  // Karta bezkolorowa bez pipów zdolności nadal jest wypełniaczem (balans).
  assert.deepEqual(abilityCostColorsOf(registry.get('simian-simulacrum')).length > 0, true);
  assert.equal(typeof splitColorsOf, 'function', 'tożsamość z produkcji many zostaje jedną funkcją (L41)');
});
