import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';

/**
 * E3 — STRAŻNIK L52 skrótu E (decline „you may [verb] target" w modalu
 * celu, zgłoszenie 2026-09-25g).
 *
 * Skrót jest wynikowo równoważny TYLKO dopóki katalog nie ma kart, które
 * mogłyby odpowiedzieć na trigger na stosie (kontrasygnować go albo
 * zmienić mu cel) — decline nie kładzie triggera na stos, więc przeciwnik
 * nie dostaje okna odpowiedzi (CR 603.5) ani nie widzi celu.
 *
 * Gdy ten test ZACZERWIENI (pierwsza taka karta w katalogu): WYCOFAJ skrót
 * (allowNone w tryFire tylko dla spec.optional + revert testów E na
 * przepływ Etapu F), albo przeprojektuj skrót z oknem odpowiedzi.
 */

const REGISTRY = createCardRegistry();

function effectTypesOf(effect, acc = []) {
  if (effect == null) return acc;
  if (Array.isArray(effect)) {
    for (const e of effect) effectTypesOf(e, acc);
    return acc;
  }
  if (typeof effect === 'object') {
    if (typeof effect.type === 'string') acc.push(effect.type);
    for (const v of Object.values(effect)) {
      if (v != null && typeof v === 'object') effectTypesOf(v, acc);
    }
  }
  return acc;
}

// Efekty przekierowujące/kontrujące, które celują WYŁĄCZNIE w czary (nie
// w ability na stosie) — bezpieczne dla skrótu. Nowy typ redirect_* albo
// counter_* spoza listy = RED.
const SPELL_ONLY_REDIRECT = new Set(['redirect_spell_target']);

test('E3-strażnik: katalog nie ma kart odpowiadających na triggery (counter/redirect ability)', () => {
  const offenders = [];
  for (const def of REGISTRY.all()) {
    for (const ab of def.abilities ?? []) {
      const types = effectTypesOf(ab.effect);
      for (const t of types) {
        // counter_ability nie istnieje w katalogu (Stifle usunięty, ADR 0029);
        // kontrczary celują w czary, nie w ability — skrót ich nie dotyczy.
        if (t === 'counter_ability') offenders.push(`${def.id}: ${t}`);
        if (t.startsWith('redirect_') && !SPELL_ONLY_REDIRECT.has(t)) offenders.push(`${def.id}: ${t}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `pierwsza karta odpowiadająca na ability — wycofaj skrót E (patrz nagłówek testu): ${offenders.join('; ')}`);
});
