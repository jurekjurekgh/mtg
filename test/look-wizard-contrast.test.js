import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Uwaga właściciela B (2026-08-10): chipy nazw kart w wizardzie Surveil
// (Curate) były „czarne na czarnym" — ciemne tło bez jawnego koloru tekstu
// w JASNYM modalu. Strażnik: reguła .look-wizard-card musi mieć jasne tło
// i jawny kolor tekstu z motywu.

function ruleOf(css, selector) {
  const match = css.match(new RegExp(`${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`));
  return match ? match[1] : null;
}

/** Jasność względna koloru #rrggbb (0 = czarny, 1 = biały). */
function lightness(hex) {
  const v = parseInt(hex.slice(1), 16);
  const r = (v >> 16) & 255; const g = (v >> 8) & 255; const b = v & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

test('look-wizard-card: chip karty jest czytelny w jasnym modalu (jasne tło + jawny tekst)', () => {
  const css = fs.readFileSync('src/table/index.html', 'utf8');
  const rule = ruleOf(css, '.look-wizard-card');
  assert.ok(rule, 'brak reguły .look-wizard-card w index.html');
  const bg = rule.match(/background:\s*(#[0-9a-fA-F]{6})/);
  assert.ok(bg, 'chip ma jawnie ustawione tło');
  assert.ok(lightness(bg[1]) > 0.7,
    `tło chipa ma być JASNE w jasnym modalu (jest ${bg[1]}; bug 2026-08-10: ciemne #27272a)`);
  assert.match(rule, /color:\s*var\(--text\)/, 'chip ma jawny kolor tekstu z motywu');
});
