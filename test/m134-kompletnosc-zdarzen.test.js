// =============================================================================
// M134 — „puste kolejki decyzji": przegląd profilaktyczny z backlogu
// (wskazany przez właściciela 2026-08-18, wywodzi się z lekcji L24
// o „cichych skutkach").
//
// WYNIK PRZEGLĄDU: log jest KOMPLETNY. Wszystkie 177 zdarzeń emitowanych
// w `src/engine/` ma opis w `describeGameEvent`, a wszystkie 50 komend
// `resolve_*` oferowanych w widoku jest obsługiwanych w `execute` (brak
// soft-locków). Nie było więc czego naprawiać — i to jest wynik pomiaru,
// nie porażka przeglądu.
//
// ZNALEZISKO JEST INNE: `EVENT_TYPES` zawierało SZEŚĆ typów, których nikt
// nigdy nie emitował. Cztery były w pełni martwe (`delayed_trigger_scheduled`,
// `proliferate_target_required`, `reveal_resolved`, `reveal_order_required`)
// i zostały usunięte; dwa (`game_created`, `proliferate_resolved`) są używane
// przez warstwę stołu i zostają. To lekcja L29 od drugiej strony: rejestr
// obiecywał zdarzenia, które nie istnieją.
//
// TRWAŁA WARTOŚĆ TEGO MILESTONE'U to poniższe strażniki. Dotąd kompletność
// logu nie była niczym pilnowana — brak opisu wychodził dopiero SUROWYM
// SLUGIEM w logu gracza (`default: return e.type` w session.js), czyli tak,
// jak w M96 („proliferate_resolved") i M126 („stun×2"). Strażnik działa
// w OBIE strony (L31: strażnik słownika ≠ strażnik miejsc użycia):
//
//   (a) każde zdarzenie EMITOWANE w engine ma opis w describeGameEvent;
//   (b) każdy typ w EVENT_TYPES jest gdzieś UŻYWANY (koniec martwych wpisów).
// =============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { EVENT_TYPES } from '../src/protocol/types.js';

/** Wszystkie typy zdarzeń faktycznie emitowane przez silnik: `event('x', …)`. */
function emittedByEngine() {
  const found = new Map(); // type → plik pierwszego wystąpienia
  for (const file of fs.readdirSync('src/engine').filter((f) => f.endsWith('.js'))) {
    const source = fs.readFileSync(path.join('src/engine', file), 'utf8');
    for (const match of source.matchAll(/event\(\s*'([a-z_0-9]+)'/g)) {
      if (!found.has(match[1])) found.set(match[1], file);
    }
  }
  return found;
}

/** Typy obsłużone gałęzią `case 'x':` w describeGameEvent. */
function describedTypes() {
  const source = fs.readFileSync('src/table/session.js', 'utf8');
  const body = source.slice(source.indexOf('export function describeGameEvent'));
  return new Set([...body.matchAll(/case '([a-z_0-9]+)':/g)].map((m) => m[1]));
}

// --- (a) każde emitowane zdarzenie ma opis dla gracza -----------------------

test('M134 (L24): KAŻDE zdarzenie emitowane w engine ma opis w logu', () => {
  const emitted = emittedByEngine();
  const described = describedTypes();
  const missing = [...emitted.keys()]
    .filter((type) => !described.has(type))
    .sort()
    .map((type) => `${type} (src/engine/${emitted.get(type)})`);
  assert.deepEqual(missing, [],
    'zdarzenie bez gałęzi `case` w describeGameEvent trafia do `default: return e.type`,\n'
    + 'czyli pokazuje graczowi SUROWY identyfikator (tak powstały błędy M96 i M126):\n'
    + missing.join('\n'));
});

test('M134: pomiar bazowy — engine emituje co najmniej 177 typów zdarzeń', () => {
  // Strażnik „w dół": gdyby ktoś masowo wyciął emisje (albo zepsuł regex
  // powyżej), test (a) zrobiłby się trywialnie zielony. Ta asercja pilnuje,
  // że skan nadal WIDZI zdarzenia.
  const emitted = emittedByEngine();
  assert.ok(emitted.size >= 177,
    `skan widzi tylko ${emitted.size} typów — poprzedni pomiar to 177; `
    + 'jeśli to świadoma zmiana, zaktualizuj próg');
});

// --- (b) rejestr bez martwych wpisów ---------------------------------------

test('M134 (L29 odwrotnie): żaden typ w EVENT_TYPES nie jest martwy', () => {
  // Rejestr, który obiecuje nieistniejące zdarzenia, wprowadza w błąd tak samo
  // jak brakujący wpis: kolejna sesja pisze pod niego obsługę „na zapas".
  const emitted = emittedByEngine();
  const used = new Set(emitted.keys());
  // Typ może też być używany przez warstwę stołu (np. lista wyciszeń w
  // session.js albo opis w describeGameEvent) — to legalne użycie.
  for (const file of ['src/table/session.js', 'src/table/render.js', 'src/table/main.js']) {
    const source = fs.readFileSync(file, 'utf8');
    for (const type of EVENT_TYPES) {
      if (source.includes(`'${type}'`)) used.add(type);
    }
  }
  const dead = EVENT_TYPES.filter((type) => !used.has(type)).sort();
  assert.deepEqual(dead, [],
    'typy zarejestrowane, ale nigdzie nieużywane (usuń je z EVENT_TYPES):\n' + dead.join('\n'));
});

// --- (c) brak soft-locków: każda oferta ma obsługę --------------------------

test('M134: każda komenda resolve_* oferowana w widoku jest obsługiwana w execute', () => {
  // Oferta bez obsługi = gra staje (gracz klika, nic się nie dzieje).
  // Pomiar z przeglądu: 50 komend oferowanych, 50 obsługiwanych.
  const source = fs.readFileSync('src/engine/game-state.js', 'utf8');
  const offered = new Set([...source.matchAll(/command\('(resolve_[a-z_0-9]+)'/g)].map((m) => m[1]));
  const handled = new Set([...source.matchAll(/cmd\.type\s*(?:===|!==)\s*'(resolve_[a-z_0-9]+)'/g)].map((m) => m[1]));
  for (const match of source.matchAll(/case '(resolve_[a-z_0-9]+)'/g)) handled.add(match[1]);
  const orphans = [...offered].filter((cmd) => !handled.has(cmd)).sort();
  assert.deepEqual(orphans, [],
    'komendy oferowane graczowi, ale bez obsługi w execute (soft-lock):\n' + orphans.join('\n'));
  assert.ok(offered.size >= 50, `skan widzi ${offered.size} ofert resolve_* — spodziewane >= 50`);
});
