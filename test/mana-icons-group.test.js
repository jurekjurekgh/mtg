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

test('osobne koszty to osobne grupy (proza między symbolami łamie przebieg)', () => {
  // B (Abstruse Interference, L13): kontrakt „cały napis = jedna grupa"
  // opierał się na FAŁSZYWYM założeniu, że każdy wywołujący przekazuje
  // JEDEN koszt. render.js (wpisy Rozgrywki, E3) przekazuje pełne ZDANIA —
  // całość w nowrap .ms-group rozpychała modal. Od teraz grupą jest każdy
  // CIĄGŁY przebieg symboli: „{R} i {G}" to DWA koszty = dwie grupy.
  const html = manaSymbolsHtml('{R} i {G}');
  assert.equal((html.match(/class="ms-group"/g) ?? []).length, 2);
});

test('tekst bez symboli nie jest owijany w grupę', () => {
  assert.equal(manaSymbolsHtml('zwykły tekst'), 'zwykły tekst');
  assert.equal(manaSymbolsHtml(''), '');
});

test('escapowanie działa, a proza jest POZA grupą (łamie się)', () => {
  // B jw. (L13): proza nie wchodzi już do nowrap grupy.
  const html = manaSymbolsHtml('koszt {R} & <x>');
  assert.match(html, /^koszt <span class="ms-group">/);
  assert.ok(html.includes('&amp;'));
  assert.ok(html.includes('&lt;x&gt;'));
});

test('B: zdanie z kosztem w środku — atomowy tylko koszt (Abstruse Interference)', () => {
  // Regresja zgłoszenia: wpis „...zapłaci {1} (Abstruse Interference)"
  // nie może być jedną niełamliwą jednostką (scroll w poziomie modala).
  const html = manaSymbolsHtml('Call zostanie skontrowany, chyba że kontroler zapłaci {1} (Abstruse)');
  assert.equal((html.match(/class="ms-group"/g) ?? []).length, 1, 'tylko koszt w grupie');
  assert.match(html, /^Call zostanie skontrowany/, 'proza przed grupą (łamliwa)');
  assert.match(html, /\(Abstruse\)$/, 'proza za grupą (łamliwa)');
});

test('manaCostHtml deleguje do grupowania', () => {
  assert.match(manaCostHtml('{3}{G}'), /^<span class="ms-group">/);
  assert.equal(manaCostHtml(''), '');
});
