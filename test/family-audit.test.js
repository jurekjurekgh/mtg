import test from 'node:test';
import assert from 'node:assert/strict';
import {
  auditFamilies, collectEffectBranches, formatFamilyViolations,
  FAMILY_EXCEPTIONS, EFFECT_FAMILIES,
} from '../tools/family-audit.mjs';

/**
 * Analizator rodzin jako narzędzie stałe (pętla jakości, kierunek 2 z M277).
 *
 * Ad hoc `/tmp/fam*.mjs` (M274/M276/M277) znajdowały błędy #24/#26/#28 przez
 * porównanie zbioru helperów wołanych przez warianty jednej rodziny. Ten
 * strażnik utrwala metodę: wariant wykonujący surową mutację rodziny musi
 * przechodzić przez choke point rodziny albo delegować do innego członka.
 *
 * Wzorzec: L107 (ścieżka omija choke point). Narzędzie: L112/L113 (zasięg
 * skanu = zasięg klasy; wyjątek jako WARUNEK z powodem, nie wyciszenie).
 */

test('rodziny efektów i mutacje pól: zero naruszeń', () => {
  const report = auditFamilies();
  assert.equal(
    report.effect.length, 0,
    'Wariant rodziny efektów wykonuje surową mutację z pominięciem choke pointu:\n'
    + formatFamilyViolations(report),
  );
  assert.equal(
    report.field.length, 0,
    'Pole mutowane poza plikiem-właścicielem helpera (choke point życia/trucizny):\n'
    + formatFamilyViolations(report),
  );
});

test('każdy wyjątek rodziny ma uzasadnienie >= 30 znaków (ADR 0027 pkt 3)', () => {
  for (const [key, reason] of Object.entries(FAMILY_EXCEPTIONS)) {
    assert.match(key, /^[a-z]+\.[a-z_0-9]+$/, `zły klucz wyjątku: ${key}`);
    assert.ok(
      typeof reason === 'string' && reason.trim().length >= 30,
      `Wyjątek ${key} nie ma sensownego uzasadnienia — ADR 0027 wymaga POWODU.`,
    );
  }
});

test('parser gałęzi efektów nie gubi typu stojącego za komentarzem', () => {
  // Regresja z budowy analizatorów: `//` zjadał znak nowej linii i sklejał
  // nagłówek następnej gałęzi z komentarzem.
  const zrodlo = `
    // komentarz opisujący kontrakt obrażeń
    if (effect.type === 'damage') {
      dealNonCombatDamage(state, sourceObject, targetId, amount);
    }
  `;
  const [branch] = collectEffectBranches(zrodlo);
  assert.equal(branch.type, 'damage');
  assert.match(branch.body, /dealNonCombatDamage/);
  assert.doesNotMatch(branch.body, /komentarz/, 'komentarze są usuwane z ciała');
});

test('parser dopasowuje zagnieżdżone klamry (nie ucina gałęzi na pierwszym })', () => {
  const zrodlo = `
    if (effect.type === 'damage_divided') {
      for (const t of targets) {
        if (t) dealNonCombatDamage(state, sourceObject, t, 1);
      }
    }
  `;
  const [branch] = collectEffectBranches(zrodlo);
  assert.match(branch.body, /for \(const t of targets\)/);
  assert.match(branch.body, /dealNonCombatDamage/);
});

test('audyt wykrywa wariant obrażeń z surową mutacją życia (kontrola narzędzia)', () => {
  // Kontrola, że NARZĘDZIE widzi wzorzec, który znalazło w M276 (#28):
  // odejmowanie życia własnym changeLife zamiast dealNonCombatDamage.
  const zrodlo = `if (effect.type === 'damage_to_controller') { changeLife(state, p1, -1); }`;
  const [branch] = collectEffectBranches(zrodlo);
  const damageFamily = EFFECT_FAMILIES.find((f) => f.id === 'damage');
  const manualHit = damageFamily.manual.find((m) => m.re.test(branch.body));
  const viaChoke = damageFamily.choke.some((c) => c.test(branch.body));
  assert.ok(manualHit, 'sygnał ręcznej mutacji został rozpoznany');
  assert.equal(viaChoke, false, 'brak choke pointu w wariancie z surową mutacją');
});
