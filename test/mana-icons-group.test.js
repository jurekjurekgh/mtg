import { test } from 'node:test';
import assert from 'node:assert/strict';
import { manaSymbolsHtml, manaCostHtml } from '../src/table/mana-icons.js';

// =============================================================================
// UX: koszty many jako niełamliwe grupy (zgłoszenie właściciela 2026-08-08 —
// „html brzydko łamie nie mieszczące się napisy"). Poprzednia łatka (M51 „C")
// ustawiła .ms na inline-block + nowrap, co zapobiegało łamaniu WEWNĄTRZ
// pojedynczej ikony, ale NIE MIĘDZY ikonami jednego kosztu. Tu sprawdzamy
// strukturę HTML: wszystkie ikony jednego kosztu są dziećmi JEDNEJ grupy
// .ms-group (atomowość w HTML; atrybuty CSS w src/table/index.html).
// =============================================================================

test('koszt many jest owinięty w jedną grupę .ms-group', () => {
  const html = manaSymbolsHtml('{2}{W}');
  assert.match(html, /^<span class="ms-group">/, 'grupa otwiera');
  assert.match(html, /<\/span>$/, 'grupa zamyka');
  assert.ok(html.includes('class="ms ms-c"'), 'symbol {2} w środku');
  assert.ok(html.includes('class="ms ms-w"'), 'symbol {W} w środku');
});

test('wszystkie ikony jednego kosztu są w JEDNEJ grupie (atomowość)', () => {
  const html = manaSymbolsHtml('{1}{U}{B}');
  assert.equal((html.match(/class="ms-group"/g) ?? []).length, 1, 'dokładnie jedna grupa');
  assert.equal((html.match(/class="ms /g) ?? []).length, 3, 'trzy ikony w grupie');
});

test('hybrydy i phyrexian też są w grupie', () => {
  const html = manaSymbolsHtml('{W/P}{2}{U/R}');
  assert.match(html, /^<span class="ms-group">/);
  assert.ok(html.includes('ms-hybrid'), 'ikony hybrydowe w środku');
});

test('tekst z symbolami jest cały atomowy (jeden koszt = jedna grupa)', () => {
  // Kontrakt dla wywołań w render.js/mana-wizard.js: każdy wywołujący
  // przekazuje JEDEN koszt (lub zwięzłą listę pipów), więc całość ma być
  // jedną niełamliwą jednostką — separator „ i " też zostaje w grupie.
  const html = manaSymbolsHtml('{R} i {G}');
  assert.equal((html.match(/class="ms-group"/g) ?? []).length, 1);
});

test('tekst bez symboli nie jest owijany w grupę', () => {
  assert.equal(manaSymbolsHtml('zwykły tekst'), 'zwykły tekst');
  assert.equal(manaSymbolsHtml(''), '');
});

test('escapowanie tekstu działa wewnątrz grupy', () => {
  const html = manaSymbolsHtml('koszt {R} & <x>');
  assert.match(html, /^<span class="ms-group">koszt /);
  assert.ok(html.includes('&amp;'));
  assert.ok(html.includes('&lt;x&gt;'));
});

test('manaCostHtml deleguje do grupowania', () => {
  assert.match(manaCostHtml('{3}{G}'), /^<span class="ms-group">/);
  assert.equal(manaCostHtml(''), '');
});
