// M88: ekstraktory DOM testera stołu (tools/table-tester/run-game.mjs)
// zwracają czytelne linie transkryptu — bez zlepień sąsiednich wpisów
// DOM przez textContent + .replace(/\s+/g, ' ') i bez utraty kontekstu
// przez .slice(0, N).
//
// Audyt: modala „Rozgrywka" ma wiele <div.bot-move-line> obok
// siebie (każdy wpis osobno); tester czytał cały `body` jednym
// textContent i zlepiał wszystko w jedno zdanie. To samo z modalami
// wyboru (intro + lista opcji) i kaflami stołu (kilka <div> w jednym
// .tile: .fname, .fcost, .ftype, .fbox).
//
// Testy importują ekstraktory (wydzielone z run-game.mjs do osobnego
// modułu testowalnego) i asercjami pilnują kształtu transkryptu.
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractBotMoves, extractModalChoice, extractTileText } from '../tools/table-tester/extract.mjs';

function fakeEl({ textContent = '', children = [] } = {}) {
  return {
    textContent,
    children,
    className: '',
    // Minimalny kontrakt używany przez ekstraktory:
    querySelector: (sel) => null,
    querySelectorAll: (sel) => [],
  };
}

test('extractBotMoves: każdy wpis modala jako osobna linia (nie zlepione)', () => {
  // Symuluj DOM: tytuł + 3 wpisy (jak realny modal po akcjach bota).
  const lines = extractBotMoves({
    title: 'Rozgrywka',
    entries: [
      { text: 'Tura 5 — Nieprzyjaciel' },
      { text: 'Faza: Główna 1' },
      { text: 'G Garruk\'s Companion wchodzi na bitwisko' },
      { text: 'G Garruk\'s Companion zostaje rozstrzygnięty' },
    ],
  });
  assert.equal(lines.length, 5, 'tytuł + 4 wpisy = 5 linii');
  // Każda linia musi być OSOBNYM stringiem (nie połączone spacją).
  assert.deepEqual(lines, [
    'Rozgrywka',
    '  • Tura 5 — Nieprzyjaciel',
    '  • Faza: Główna 1',
    '  • G Garruk\'s Companion wchodzi na bitwisko',
    '  • G Garruk\'s Companion zostaje rozstrzygnięty',
  ]);
  // Główna obserwacja: „Faza: Główna 1" NIE jest zlepiona z
  // „Garruk's Companion" w jedno zdanie (poprzedni bug).
  assert.ok(!lines.some((l) => /Główna 1.*Garruk/.test(l)),
    'Faza nie może być zlepiona z kolejnym wpisem');
});

test('extractBotMoves: pusty modal → nagłówek i koniec', () => {
  const lines = extractBotMoves({ title: 'Rozgrywka', entries: [] });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /Rozgrywka/);
});

test('extractModalChoice: pełne intro + lista opcji z wyróżnioną wybraną', () => {
  const lines = extractModalChoice({
    intro: 'Mulligan: Zatrzymaj tę rękę (keep — 7 kart) vs Weź mulligana — odłóż 1',
    options: [
      { text: 'Mulligan: Zatrzymaj tę rękę (keep — 7 kart)' },
      { text: 'Mulligan: Weź mulligana — odłóż 1 kartę na spód' },
    ],
    chosenIndex: 1,
  });
  // intro + każda opcja osobno (wybrana z markerem ▶ w tej samej linii)
  assert.equal(lines.length, 3, 'intro + 2 opcje');
  assert.match(lines[0], /^Mulligan/);
  // Wybrana opcja wyróżniona.
  assert.ok(lines.some((l) => /▶/.test(l) && /Weź mulligana/.test(l)),
    'wybrana opcja ma marker ▶');
});

test('extractModalChoice: combat wizard — ataki z separatorem + zatwierdzenie', () => {
  const lines = extractModalChoice({
    intro: 'Deklaracja atakujących (3 opcje)',
    options: [
      { text: 'Garruk\'s Companion (3/2)' },
      { text: 'Hunter\'s Blowgun' },
    ],
    chosenIndex: 0,
    confirmText: 'Zatwierdź atak',
  });
  assert.equal(lines.length, 4, 'intro + 2 opcje + zatwierdzenie');
  assert.ok(lines.some((l) => /Zatwierdź/.test(l)));
});

test('extractTileText: kafel z .fname + .fcost + .ftype + .fbox → pola rozdzielone "·"', () => {
  // Symuluj kafel karty: div.tile > .face > .ftop > .fname + .fcost, .ftype, .fbox
  const tile = fakeEl({
    textContent: 'Vow of Wildness3VEnchantment — AuraCantAttackYou',
    children: [
      { textContent: 'Vow of Wildness', className: 'fname' },
      { textContent: '3V', className: 'fcost' },
      { textContent: 'Enchantment — Aura', className: 'ftype' },
      { textContent: 'CantAttackYou', className: 'fbox' },
    ],
  });
  const text = extractTileText(tile);
  // NIE zlepione spacją (poprzedni bug), ale czytelnie rozdzielone "·".
  assert.match(text, /Vow of Wildness/);
  assert.match(text, /·/);
  assert.match(text, /Enchantment/);
  assert.ok(!/Vow of Wildness3V/.test(text),
    'nazwa i koszt NIE mogą być zlepione bez separatora');
});

test('extractTileText: pusty kafel → pusty string', () => {
  assert.equal(extractTileText(fakeEl({})), '');
  assert.equal(extractTileText(null), '');
});
