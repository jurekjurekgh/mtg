// Pętla jakości 2026-10-15c — Żywy Tester, partia 67006 (the-edge × mirrodin-brg):
// Clone Shell, „reszta na spód”. Modal pokazał:
//   [ROZGRYWKA] • Ty: Island — biblioteka → biblioteka
// Karta nie zmieniła strefy — została odłożona na SPÓD tej samej biblioteki
// (game-state.js, `object_moved` z `toBottom: true`). Napis „biblioteka → biblioteka”
// był bezsensowny dla gracza; czytelnie: „na spód biblioteki” (zgodnie z opisem
// M192/Z2 dla look_top_resolved).
//
// Root cause: trasę strefy składano z dwóch etykiet bez uwzględnienia `toBottom`.
// Naprawa: czysta funkcja `trasaRuchuStref`, używana w gałęzi ruchu bota.

import test from 'node:test';
import assert from 'node:assert/strict';
import { trasaRuchuStref, zoneLabel } from '../src/table/session.js';

test('odłożenie na spód tej samej biblioteki: „na spód biblioteki”, nie „biblioteka → biblioteka”', () => {
  const text = trasaRuchuStref({ type: 'object_moved', fromZone: 'library', toZone: 'library', toBottom: true });
  assert.equal(text, 'na spód biblioteki');
  assert.doesNotMatch(text, /→/);
});

test('anty-over-fix: zwykły ruch biblioteka → ręka nadal pokazuje trasę strzałką', () => {
  assert.equal(
    trasaRuchuStref({ type: 'object_moved', fromZone: 'library', toZone: 'hand' }),
    `${zoneLabel('library')} → ${zoneLabel('hand')}`,
  );
});

test('anty-over-fix: biblioteka → biblioteka BEZ toBottom (przetasowanie) — trasa bez zmian', () => {
  assert.equal(
    trasaRuchuStref({ type: 'object_moved', fromZone: 'library', toZone: 'library' }),
    `${zoneLabel('library')} → ${zoneLabel('library')}`,
  );
});

test('anty-over-fix: pole bitwy → cmentarz nadal nazwane strefami', () => {
  assert.equal(
    trasaRuchuStref({ type: 'object_moved', fromZone: 'battlefield', toZone: 'graveyard' }),
    `${zoneLabel('battlefield')} → ${zoneLabel('graveyard')}`,
  );
});
