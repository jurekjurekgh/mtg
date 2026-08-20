// M165 — korekta wizualna właściciela (2026-08-20): countery na badge kafla
// miały format „+1/+1×2", co wygląda jak działanie matematyczne z „1×2"
// jako ważniejszym. Nowy format: NAJPIERW ilość, potem co, ze spacją —
// „2x +1/+1" (przykład właściciela). Dotyczy OBU ścieżek badge'ów liczników:
// nakładki live (buildStateOverlay) i face (fbadges).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildStateOverlay } from '../src/table/render.js';

class MiniEl {
  constructor(tag) { this.tagName = tag; this.children = []; this.className = ''; this.text = ''; }
  set textContent(v) { this.text = String(v); this.children = []; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  appendChild(child) { this.children.push(child); return child; }
  descendants() { return this.children.flatMap((c) => [c, ...c.descendants()]); }
}
globalThis.document = { createElement: (tag) => new MiniEl(tag) };

test('L1: badge licznika = „2x +1/+1" (ilość najpierw, spacja, x)', () => {
  const visual = new MiniEl('div');
  buildStateOverlay(visual, { isBattlefield: true, kind: 'creature', counters: { '+1/+1': 2, lore: 1 }, saga: null });
  const badges = visual.descendants()
    .filter((el) => String(el.className).includes('ovl-badge'))
    .map((el) => el.textContent);
  assert.ok(badges.includes('2x +1/+1'), `format „2x +1/+1", a badge'e: [${badges}]`);
  assert.ok(badges.includes('1x lore'), `format „1x lore", a badge'e: [${badges}]`);
  assert.ok(!badges.some((t) => t.includes('×')), `bez znaku × na badge'ach: [${badges}]`);
});

test('L2: strażnik formatu — żadne miejsce renderu nie skleja „etykieta×ilość"', () => {
  const src = readFileSync(fileURLToPath(new URL('../src/table/render.js', import.meta.url)), 'utf8');
  // Stare wzorce (etykieta bezpośrednio przed liczbą) muszą zniknąć z OBU
  // ścieżek badge'ów liczników (nakładka + face).
  assert.ok(!src.includes('?? name}×${count}'), 'stary format „etykieta×N" na nakładce');
  assert.ok(!src.includes('?? name} ×${count}'), 'stary format „etykieta ×N" na face');
  // Nowy format (ilość najpierw) obecny.
  assert.ok(src.includes('x ${COUNTER_LABELS[name] ?? name}'), 'nowy format „Nx etykieta" obecny');
});
