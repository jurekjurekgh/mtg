import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import fs from 'node:fs';
import { costSymbols } from '../src/table/mana-icons.js';

/**
 * M267/C — kolorowe pipy w ALTERNATYWNYCH kosztach cleave i escape.
 *
 * Znalezisko z ręcznego czytania transkryptów (profile explorer/hoarder,
 * seedy 511/516/523): panel pokazywał „Rzuć z Cleave: Lunar Rejection
 * (koszt 4)", a Oracle mówi „Cleave {3}{U}". To ta sama klasa co L100 —
 * cena pokazana graczowi musi być ceną z Oracle, bo „{4}" sugeruje, że
 * zapłacą ją cztery many bezbarwne.
 *
 * Skan katalogu wykazał TRZY karty i wszystkie miały ten sam brak:
 *   lunar-rejection   cleave {3}{U} → def.manaCost 4, colors: brak
 *   sweet-oblivion    escape {3}{U} → def.cost 4,     colors: brak
 *   sleep-of-the-dead escape {2}{U} → def.cost 3,     colors: brak
 *
 * Dziś silnik płaci POPRAWNIE, ale przez przypadek: `payEscape`/`payCleave`
 * biorą pipy z `coloredPipsOf(cardId)`, czyli z kosztu BAZOWEGO karty, który
 * u całej trójki ma akurat ten sam pip {U}. Pierwsza karta, której alt-koszt
 * ma inny kolor niż koszt bazowy, złamie regułę płatności naprawdę — dlatego
 * kolory jadą do DEFINICJI (jedno źródło), a nie do samej etykiety.
 */

const REGISTRY = createCardRegistry();

/** Pipy kolorów wypisane w Oracle dla danego słowa kosztu („Cleave {3}{U}"). */
function oraclePips(oracleText, keyword) {
  const match = new RegExp(`${keyword}\\s*(?:—|-)?\\s*((?:\\{[^}]+\\})+)`, 'i').exec(oracleText ?? '');
  if (!match) return null;
  return [...match[1].matchAll(/\{([WUBRG])\}/g)].map((m) => m[1]);
}

test('M267/C: cleave Lunar Rejection niesie pip {U} z Oracle', () => {
  const card = REGISTRY.get('lunar-rejection');
  assert.deepEqual(card.spell.cleave.colors, ['U'], 'Cleave {3}{U}');
  assert.equal(costSymbols(card.spell.cleave.manaCost, card.spell.cleave.colors), '{3}{U}');
});

test('M267/C: escape Sweet Oblivion i Sleep of the Dead niosą pip {U}', () => {
  const sweet = REGISTRY.get('sweet-oblivion');
  assert.deepEqual(sweet.spell.escape.colors, ['U'], 'Escape {3}{U}');
  assert.equal(costSymbols(sweet.spell.escape.cost, sweet.spell.escape.colors), '{3}{U}');
  const sleep = REGISTRY.get('sleep-of-the-dead');
  assert.deepEqual(sleep.spell.escape.colors, ['U'], 'Escape {2}{U}');
  assert.equal(costSymbols(sleep.spell.escape.cost, sleep.spell.escape.colors), '{2}{U}');
});

test('M267/C (klasa): każdy alt-koszt z pipem w Oracle ma `colors` w definicji', () => {
  // Strażnik KLASOWY (L101/2): enumeruje katalog zamiast pinować trzy karty.
  // Następna karta z cleave/escape nie prześliźnie się bez kolorów.
  const offenders = [];
  for (const card of REGISTRY.all()) {
    const spell = card.spell;
    if (!spell) continue;
    for (const [keyword, descriptor] of [['Cleave', spell.cleave], ['Escape', spell.escape]]) {
      if (!descriptor) continue;
      const pips = oraclePips(card.oracleText, keyword);
      if (pips == null || pips.length === 0) continue;
      const declared = descriptor.colors ?? [];
      if (JSON.stringify([...declared].sort()) !== JSON.stringify([...pips].sort())) {
        offenders.push(`${card.id} (${keyword}): oracle=${pips.join('')} def=${declared.join('') || 'brak'}`);
      }
    }
  }
  assert.deepEqual(offenders, [], 'alt-koszty bez pipów kolorów w definicji');
});

test('M267/C: kwota alt-kosztu zgadza się z sumą pipów Oracle', () => {
  // Anty-over-fix: dopisanie `colors` nie może zmienić ŁĄCZNEJ ceny.
  // {3}{U} = 4 many razem (3 generyczne + 1 niebieska).
  const cases = [
    ['lunar-rejection', 'cleave', 4],
    ['sweet-oblivion', 'escape', 4],
    ['sleep-of-the-dead', 'escape', 3],
  ];
  for (const [id, kind, total] of cases) {
    const descriptor = REGISTRY.get(id).spell[kind];
    const amount = kind === 'cleave' ? descriptor.manaCost : descriptor.cost;
    assert.equal(amount, total, `${id}: łączna kwota bez zmian`);
  }
});

test('M267/C (silnik): płatność alt-kosztu czyta pipy ALT-kosztu, nie karty bazowej', () => {
  // Dziś trójka kart ma ten sam pip w koszcie bazowym i alternatywnym, więc
  // `coloredPipsOf(cardId)` trafiał PRZYPADKIEM. Ten test pyta o źródło:
  // czy kod płatności bierze kolory z deskryptora alt-kosztu (jak madness
  // w M161/O2), czy wciąż z kosztu bazowego karty.
  const source = fs.readFileSync(new URL('../src/engine/spells.js', import.meta.url), 'utf8');
  const payLines = source.split('\n');
  const offenders = [];
  payLines.forEach((line, index) => {
    if (!/spendMana\(/.test(line)) return;
    if (!/coloredPipsOf\(object\.cardId\)/.test(line)) return;
    // Kontekst 40 linii w górę mówi, o którą ścieżkę rzutu chodzi.
    const context = payLines.slice(Math.max(0, index - 40), index).join('\n');
    if (/spell\.cleave|pending\.exileCount|escape/i.test(context)) {
      offenders.push(`spells.js:${index + 1}`);
    }
  });
  assert.deepEqual(offenders, [],
    'ścieżki cleave/escape płacą pipami kosztu BAZOWEGO — pierwsza karta '
    + 'o innym kolorze alt-kosztu złamie regułę płatności');
});
