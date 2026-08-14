// M89 cd. — bug D: ptaszek wyciszenia (ignoruj opcję w auto-pass) NIE
// pojawia się dla instant z wyborem celu (np. Fake Your Own Death).
// Właściciel: „Instant z wyborem celu - nie ma pola ptaszka pomijania
// (nie przerywaj auto-passu)" (2026-08-14).
//
// Root cause: ptaszek renderowany w panelu akcji wyłącznie dla wpisów BEZ
// `entry.request` (panel akcji renderuje każdą opcję POJEDYNCZO lub
// pakuje w ChoiceRequest dla wyborów wariantów). Instant z `targets`
// (np. cast_spell z wyborem celu) idzie do ChoiceRequest, więc panel
// pokazuje JEDEN przycisk-wizard — ptaszek w tym przycisku nie jest
// rysowany.
//
// Fix: ptaszek wyciszenia musi być rysowany WEWNĄTRZ wizarda wyboru
// (renderChoiceRequest) — przy każdej opcji typu cast_spell / cast_permanent /
// activate_ability / cast_cleave itd. (OPTION_IGNORABLE_TYPES).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('bug D: renderChoiceRequest w choice-request.js obsługuje ignoredOptionKeys/onToggleIgnoredOption/commandOptionKey', () => {
  // Po fixie renderChoiceRequest dostaje parametry ptaszka wyciszenia i
  // dokłada <label class="action-ignore"> przy każdej opcji z listy
  // OPTION_IGNORABLE_TYPES (cast_spell, cast_permanent, activate_ability...).
  const src = fs.readFileSync('src/table/choice-request.js', 'utf8');
  assert.match(src, /ignoredOptionKeys/,
    'renderChoiceRequest MUSI akceptować ignoredOptionKeys (ptaszek wyciszenia)');
  assert.match(src, /onToggleIgnoredOption/,
    'renderChoiceRequest MUSI akceptować onToggleIgnoredOption (callback ptaszka)');
  assert.match(src, /commandOptionKey/,
    'renderChoiceRequest MUSI importować commandOptionKey (klucz opcji)');
});

test('bug D: renderChoiceRequest rysuje label.action-ignore dla opcji z OPTION_IGNORABLE_TYPES', () => {
  // W środku renderChoiceRequest: dla każdej opcji z listy
  // OPTION_IGNORABLE_TYPES musi powstać label z checkboxem.
  const src = fs.readFileSync('src/table/choice-request.js', 'utf8');
  assert.match(src, /action-ignore/,
    'renderChoiceRequest MUSI rysować <label class="action-ignore"> (ptaszek)');
});

test('bug D: OPTION_IGNORABLE_TYPES w render.js zawiera cast_spell (instant z wyborem celu)', () => {
  // Pewność: cast_spell jest w OPTION_IGNORABLE_TYPES, więc instant Fake Your
  // Own Death (cast_spell z targets) kwalifikuje się do ptaszka.
  const src = fs.readFileSync('src/table/render.js', 'utf8');
  const match = src.match(/OPTION_IGNORABLE_TYPES\s*=\s*Object\.freeze\(\[\s*([^\]]+)\s*\]\)/);
  assert.ok(match, 'OPTION_IGNORABLE_TYPES powinien istnieć w render.js');
  assert.match(match[1], /cast_spell/,
    'OPTION_IGNORABLE_TYPES MUSI zawierać cast_spell (Fake Your Own Death, Negate, Carrion Call)');
});

test('bug D: openChoiceRequest w main.js przekazuje ignoredOptionKeys do renderChoiceRequest', () => {
  // openChoiceRequest w main.js wywołuje renderChoiceRequest — po fixie
  // musi przekazać ignoredOptionKeys i onToggleIgnoredOption (commandOptionKey
  // jest importowany w choice-request.js, nie w main.js).
  const src = fs.readFileSync('src/table/main.js', 'utf8');
  const openSection = src.match(/function\s+openChoiceRequest[\s\S]*?\n\s\s\}\s*\n/);
  assert.ok(openSection, 'openChoiceRequest powinien istnieć w main.js');
  assert.match(openSection[0], /ignoredOptionKeys/,
    'openChoiceRequest MUSI przekazywać ignoredOptionKeys do renderChoiceRequest');
  assert.match(openSection[0], /onToggleIgnoredOption/,
    'openChoiceRequest MUSI przekazywać onToggleIgnoredOption do renderChoiceRequest');
});

test('bug D: choice-request.js importuje commandOptionKey (klucz ptaszka wyciszenia)', () => {
  // commandOptionKey musi być importowany w choice-request.js, bo renderChoiceRequest
  // buduje klucz opcji dla ptaszka wyciszenia (z sesji, nie z main.js).
  const src = fs.readFileSync('src/table/choice-request.js', 'utf8');
  assert.match(src, /import\s*\{[^}]*commandOptionKey[^}]*\}\s*from\s*['"]\.\/session\.js['"]/,
    'choice-request.js MUSI importować commandOptionKey z ./session.js');
});
