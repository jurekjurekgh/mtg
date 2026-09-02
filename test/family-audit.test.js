import test from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {
  auditFamilies, collectEffectBranches, formatFamilyViolations,
  FAMILY_EXCEPTIONS, EFFECT_FAMILIES, FIELD_FAMILIES, AUDITED_FILES,
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

test('każda rodzina pól ma zęby — wszczepione omijanie musi pasować, a legalne formy nie (pin anty-vacuous)', () => {
  // Rodzina pól, której wzór nie dopasowuje NIC, jest gorsza niż jej brak:
  // udaje, że klasa „ścieżka mutuje pole sama" jest pilnowana (L26/L112 —
  // fałszywe milczenie bramki). Dowód z audytu PR #92: strażnik odcisku
  // przechodził vacuous, bo zbiór oczekiwany był pusty. Dlatego KAŻDA rodzina
  // musi samej sobie czerwienić na próbce `bypass` i nie może się czepiać
  // form `legal` (inaczej strażnik jest albo martwy, albo krzyczy na wszystko).
  for (const family of FIELD_FAMILIES) {
    assert.ok(Array.isArray(family.bypass) && family.bypass.length >= 2,
      `rodzina ${family.id} nie ma próbek bypassu — nie da się udowodnić, że wzór działa`);
    assert.ok(Array.isArray(family.legal) && family.legal.length >= 1,
      `rodzina ${family.id} nie ma próbek legalnych — wzór może łapać wszystko`);
    for (const line of family.bypass) {
      assert.match(line, family.pattern,
        `rodzina ${family.id} NIE widzi omijania w: ${line} — wzór jest za wąski`);
    }
    for (const line of family.legal) {
      assert.doesNotMatch(line, family.pattern,
        `rodzina ${family.id} MYLI legalny zapis z omijaniem: ${line} — wzór jest za szeroki`);
    }
  }
});

test('licznik dobrań jest chroniony jako rodzina (audyt PR #92, znalezisko 3)', () => {
  const draws = FIELD_FAMILIES.find((f) => f.id === 'draws');
  assert.ok(draws, 'brak rodziny `draws` — ścieżki podnoszące cardsDrawnThisTurn są bez nadzoru');
  assert.equal(draws.owner, 'src/engine/players.js',
    'właścicielem licznika jest choke point recordCardDrawn w players.js');
  assert.ok(AUDITED_FILES.includes('src/engine/effects.js') && AUDITED_FILES.includes('src/engine/spells.js'),
    'pliki z rozjechanymi ścieżkami dobrań muszą być w skanie');
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

test('okno impulsu jest rodzina pilnowaną przez choke point (audyt PR #93, watek 4)', () => {
  const families = ['impulse-window', 'impulse-free-cast'].map((id) => {
    const fam = FIELD_FAMILIES.find((f) => f.id === id);
    assert.ok(fam, `brak rodziny ${id} — playableUntilTurn/playableWithoutPaying mogą znowu pisać trzy pliki`);
    assert.equal(fam.owner, 'src/engine/impulse-window.js',
      `właścicielem ${id} jest choke point impulse-window.js, nie plik, który akurat o tym pamiętał`);
    return fam;
  });
  // 1) Surowych zapisów nie ma w plikach, które kiedyś kleiły pola ręcznie.
  for (const file of ['src/engine/effects.js', 'src/engine/game-state.js', 'src/engine/spells.js',
    'src/engine/resources.js', 'src/table/render.js']) {
    const source = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
      .replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const fam of families) {
      const hit = source.split('\n').find((line) => fam.pattern.test(line));
      assert.equal(hit, undefined, `${file} zapisuje ${fam.label} własnym kodem (ma iść przez impulse-window.js): ${hit?.trim()}`);
    }
  }
  // 2) Warunek „okno żyje" nie może być znów przepisany w cudzym pliku —
  //    to jest dokładnie ta duplikacja, przez którą oferta i walidacja
  //    mogły się rozjechać (L48).
  for (const file of ['src/engine/spells.js', 'src/engine/resources.js', 'src/engine/game-state.js']) {
    const source = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
      .replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(source, /state\.turn\.number\s*<=\s*\w+\?\.playableUntilTurn/,
      `${file} liczy ważność okna impulsu ręcznie — jedyna forma to isImpulseWindowLive/canPlayByImpulseFromExile`);
  }
  // 3) Czytacze choke pointu są NAPRAWDĘ użyte (strażnik bez użycia = dekoracja).
  const used = ['src/engine/spells.js', 'src/engine/resources.js', 'src/engine/game-state.js']
    .map((file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'))
    .filter((src) => /isImpulseWindowLive|canPlayByImpulseFromExile|isFreeImpulseCast|hasFreeCastStamp|carryImpulseWindow/.test(src)).length;
  assert.ok(used >= 3, `choke point czyta tylko ${used} z 3 plików — pomocy nikt nie użył`);
});
