// Audyt 2026-10-04 (batch 63/T2): katalog używał typu efektu, którego silnik NIE
// zna (`search_library_to_battlefield_tapped` — Greater Tanuki i nowa karta
// Natural Connection). `applyEffect` RZUCA na nieznany typ („Nieznany typ
// efektu: …"), więc karta z takim zapisem wywala partię przy rozstrzygnięciu;
// Greater Tanuki maskował to własną ścieżką channel (spells.js), ale zapis był
// martwy i mylący. Strażnik: każdy `effect(s)[].type` z katalogu (także tryby
// `modes`, zagnieżdżenia, zdolności) musi mieć rozgałęzienie w `src/`
// (`effect.type === '…'`). Kotwice liczności (L13) rosną z każdym batchem kart.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createCardRegistry } from '../src/cards/card-data.js';

const registry = createCardRegistry();

function plikiSrc(dir = 'src') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return plikiSrc(p);
    return e.name.endsWith('.js') ? [p] : [];
  });
}

// Zbiór typów efektów, które silnik obsługuje (rozgałęzienia po `effect.type`).
const ZNANE = new Set();
for (const plik of plikiSrc()) {
  const tekst = fs.readFileSync(plik, 'utf8');
  for (const m of tekst.matchAll(/effect\??\.type\s*[!=]==?\s*'([A-Za-z_0-9]+)'/g)) ZNANE.add(m[1]);
}

/**
 * Typy efektów z dowolnego węzła definicji karty: `effect`, `effects`
 * (w tym `spell.modes[].effects`), rekurencyjnie. Deskryptory celów/triggerów
 * (`targets`, `requiresTarget`, `trigger`) NIE są efektami — nie zbieramy ich.
 */
function zbierzEfekty(node, out = new Set()) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) { for (const x of node) zbierzEfekty(x, out); return out; }
  for (const [k, v] of Object.entries(node)) {
    if (k === 'effect' || k === 'effects') {
      for (const e of Array.isArray(v) ? v : [v]) {
        if (e && typeof e.type === 'string') out.add(e.type);
      }
    }
    zbierzEfekty(v, out);
  }
  return out;
}

const UZYTE = new Set();
for (const def of registry.all()) zbierzEfekty(def, UZYTE);

test('AUD-E1: każdy typ efektu w katalogu ma rozgałęzienie w silniku', () => {
  const nieznane = [...UZYTE].filter((t) => !ZNANE.has(t)).sort();
  assert.deepEqual(nieznane, [],
    'nieznany typ efektu = `applyEffect` rzuca „Nieznany typ efektu" i partia pada');
});

test('AUD-E2: kotwice liczności (L13) — zbiory rosną z batchami kart i mechanik', () => {
  // Batch 63/T2 (2026-10-04): katalog używa 167 typów efektów; silnik zna 200
  // (po naprawie `search_library_to_battlefield_tapped` → istniejący efekt).
  assert.equal(UZYTE.size, 184, 'tyle typów efektów używa katalog (Batch 63/T2)');
  assert.ok(ZNANE.size >= 200, `silnik zna co najmniej 200 typów efektów (jest ${ZNANE.size})`);
});

test('AUD-E3: mutacja — detektor widzi typ spoza silnika (dowód działania)', () => {
  const z = zbierzEfekty({
    spell: { effects: [{ type: 'nie_ma_takiego' }] },
    abilities: [{ effect: [{ type: 'pump', power: 1, toughness: 1 }] }],
  });
  assert.ok(z.has('nie_ma_takiego'), 'typ spoza silnika wchodzi do zbioru');
  assert.ok(z.has('pump'), 'znany typ też');
  assert.ok(!ZNANE.has('nie_ma_takiego'), 'i nie ma go w zbiorze znanych');
});

test('AUD-E4: deskryptory celów i triggerów NIE są efektami (brak fałszywych trafień)', () => {
  const z = zbierzEfekty({
    spell: { targets: [{ type: 'creature' }], effects: [{ type: 'pump' }] },
    abilities: [{ trigger: { event: 'enter_battlefield', requiresTarget: { type: 'player' } }, effect: { type: 'draw_cards', amount: 1 } }],
  });
  assert.deepEqual([...z].sort(), ['draw_cards', 'pump']);
});
