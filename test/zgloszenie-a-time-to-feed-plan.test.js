// Zgłoszenie A (2026-09-20, uwagi z gry): „W talii Theros znalazłem kartę
// Time to Feed. Możesz mi to wytłumaczyć??? Dane tej karty to:
// 561THS Time to Feed THS — Wiedźmin".
//
// Przyczyna: plan karty w naszym słowniku kolekcji (`tools/collection-art-ids.csv`,
// wiersz `561THS`) niósł wartość „Theros" — czyli nazwę SETU karty (THS), nie
// kolumnę „Plan / Setting" z arkusza właściciela. Generator talii (ADR 0023)
// czyta plan karty i dlatego Time to Feed trafił do `decks/theros.txt`.
// Precedens tej samej klasy: `test/zgloszenie-c-shock-plan.test.js`
// (Shock z planem realnego bloku AER zamiast „Warhammer Fantasy").
//
// Pin jest DWUSTRONNY (L41/L48): wartości w katalogu i w słowniku kolekcji są
// dwiema reprezentacjami tego samego faktu, więc test porównuje je wprost —
// M197/K3 pilnuje zgodności katalog↔druk, a ten plik dobija jeszcze
// przynależność talii (objaw zgłoszenia był w talii, nie w danych).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const REGISTRY = (await import('../src/cards/card-data.js')).createCardRegistry();

/** Wiersz słownika kolekcji dla artId (format: `561THS,Time to Feed,<plan>`). */
function slownikRow(artId) {
  const rows = readFileSync('tools/collection-art-ids.csv', 'utf8').split('\n');
  const row = rows.find((line) => line.startsWith(`${artId},`));
  assert.ok(row, `słownik kolekcji ma wiersz ${artId}`);
  return row.split(',');
}

function talia(nazwa) {
  return readFileSync(`decks/${nazwa}.txt`, 'utf8')
    .split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
}

test('A: Time to Feed ma plan „Wiedźmin" (kolumna plan właściciela, nie nazwa setu)', () => {
  const card = REGISTRY.get('time-to-feed');
  assert.ok(card, 'karta w katalogu');
  assert.equal(card.plan, 'Wiedźmin',
    `plan karty: oczekiwany „Wiedźmin" (arkusz właściciela), jest „${card.plan}"`);
  assert.equal(card.set, 'THS', 'set zostaje realny (THS — identyfikator wydania)');
  const [, name, plan] = slownikRow('561THS');
  assert.equal(plan, 'Wiedźmin', 'słownik kolekcji też niesie plan z arkusza');
  assert.equal(name, 'Time to Feed', 'wiersz słownika dotyczy właściwej karty');
});

test('A: Time to Feed siedzi w talii planu Wiedźmin (BG), nie w theros', () => {
  assert.ok(talia('wiedzmin-bg').includes('1x Time to Feed'),
    'wiedzmin-bg zawiera 1x Time to Feed (karta mono-zielona → strona BG)');
  for (const deck of ['theros', 'wiedzmin-wur']) {
    assert.ok(!talia(deck).includes('1x Time to Feed'),
      `${deck} nie zawiera Time to Feed — karta trzyma się planu i koloru`);
  }
});
