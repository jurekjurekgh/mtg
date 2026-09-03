// Uwaga właściciela B (2026-08-10): chipy nazw kart w wizardzie Surveil
// (Curate) były „czarne na czarnym" — ciemne tło bez jawnego koloru tekstu
// w JASNYM modalu. Strażnik: chip ma mieć jasne tło i jawny kolor tekstu.
//
// M293 (tura 14): chipa nie rysuje już kreator — rysuje `src/table/picker.js`
// (kształt `chip`), a `.look-wizard-card` został HAKIEM bez własnych reguł.
// Dlatego pomiar jest na STYLU EFEKTYWNYM realnego elementu (klasy z rendera →
// reguły → scalone deklaracje), tak jak `test/m129-*` (lekcja L125): test
// czytający tekst CSS pilnowałby duplikatu, nie faktu. Druga asercja to zaporę
// antyduplikacyjną: hook kreatora nie może odzyskać własnego tła.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MiniEl, effectiveDeclarationsFor, lightness, loadRules, withDocument } from './harness/css-effective.js';

const RULES = loadRules();

/** Render wizarda scry i jego pierwszy chip (realne klasy, nie zgadywane). */
async function firstChip() {
  const { renderLookWizard } = await import('../src/table/choice-request.js');
  return withDocument(() => {
    const host = new MiniEl('div');
    renderLookWizard(host, {
      kind: 'surveil',
      cards: [{ id: 'o1', cardId: 'curate', name: 'Curate' }, { id: 'o2', cardId: 'woolly', name: 'Woolly Spider' }],
      onComplete: () => {},
      onCancel: () => {},
      onOpenCard: () => {},
    });
    const has = (el, cls) => String(el.className).split(/\s+/).includes(cls);
    // Dokładnie po tokencie: `look-wizard-cards` (kontener) zawiera podciąg
    // `look-wizard-card` i pierwszy nieostrożny find zwracał kontener.
    const chip = host.find((el) => has(el, 'look-wizard-card'));
    const name = host.find((el) => has(el, 'look-wizard-card-name'));
    return { chip, name };
  });
}

test('look-wizard-card: chip karty jest czytelny w jasnym modalu (styl efektywny)', async () => {
  const { chip } = await firstChip();
  assert.ok(chip, 'wizard przeglądania rysuje chipy');
  assert.match(chip.className, /(^| )picker-chip( |$)/, 'chip należy do rodziny `.picker-chip` (jeden rysownik)');
  const { decls, matched } = effectiveDeclarationsFor(RULES, chip.className);
  assert.ok(matched.length > 0, `żadna reguła nie aplikuje się do chipa: ${chip.className}`);
  const bg = decls.background ?? decls['background-color'];
  assert.match(String(bg), /#[0-9a-fA-F]{6}/, 'chip ma jawnie ustawione tło');
  assert.ok(lightness(bg.match(/#[0-9a-fA-F]{6}/)[0]) > 0.7,
    `tło chipa ma być JASNE w jasnym modalu (jest ${bg}; bug 2026-08-10: ciemne #27272a)`);
  assert.match(String(decls.color ?? ''), /var\(--text\)/, 'chip ma jawny kolor tekstu z motywu');
});

test('M293: hak kreatora nie dubluje wyglądu chipa (rysuje picker)', async () => {
  const { chip } = await firstChip();
  const hook = String(chip.className).split(/\s+/).filter((c) => c === 'look-wizard-card');
  assert.ok(hook.length > 0, 'hak kreatora został na elemencie');
  for (const cls of hook) {
    const dzierzy = RULES.filter((r) => r.selector.includes(cls) && /background|min-height|padding/.test(r.body));
    assert.deepEqual(dzierzy.map((r) => r.selector), [],
      `.${cls} jest HAKIEM — wygląd ma pochodzić z .picker-chip (inaczej wraca duplikat z tury 13)`);
  }
});

test('M293: nazwa w chipie pozostaje klikalnym celem (podkreślenie + palec)', async () => {
  const { name } = await firstChip();
  assert.ok(name, 'nazwa karty w chipie');
  assert.match(name.className, /(^| )log-card( |$)/, 'delegacja pełnego ekranu w main.js klika po .log-card');
  const { decls } = effectiveDeclarationsFor(RULES, name.className);
  assert.match(String(decls['text-decoration'] ?? ''), /underline/, 'klikalna nazwa jest podkreślona');
  assert.match(String(decls.cursor ?? ''), /pointer/, 'klikalna nazwa ma kursor wskazujący');
});
