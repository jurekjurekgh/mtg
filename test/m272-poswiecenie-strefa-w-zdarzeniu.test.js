import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * M272 (błąd #20, CR 122.1b + 701.17a) — poświęcenie jest śmiercią, więc
 * licznik finality przekierowuje permanent do wygnania. Wtedy „dies" się NIE
 * wydarzyło i zdolności śmierci nie odpalają.
 *
 * Konsumentem tej informacji jest `triggers.js`, który filtruje po POLU
 * ZDARZENIA: `if (ev.toZone === 'exile') return`. Cztery emitery
 * `permanent_sacrificed` w game-state.js (exploit, wybór ofiary, Jedzenie,
 * devour) przenosiły permanent poprawnie przez `deathZoneFor`, ale strefy NIE
 * przekazywały dalej — trigger widział `undefined` i odpalał mimo wygnania.
 *
 * Strażnik SKANUJĄCY ŹRÓDŁA (wariant L107/15): pole `toZone` jest kontraktem
 * zdarzenia, więc pilnujemy go u KAŻDEGO emitera, także przyszłego.
 */
const PLIKI = ['src/engine/game-state.js', 'src/engine/effects.js',
  'src/engine/abilities.js', 'src/engine/spells.js', 'src/engine/triggers.js'];

function emitery(zrodlo, nazwa) {
  const linie = zrodlo.split('\n');
  const wynik = [];
  linie.forEach((linia, index) => {
    if (!linia.includes(`event('${nazwa}'`)) return;
    // Ładunek zdarzenia bywa wieloliniowy — bierzemy okno do zamknięcia.
    wynik.push({ numer: index + 1, tekst: linie.slice(index, index + 8).join('\n') });
  });
  return wynik;
}

test('każdy emiter permanent_sacrificed przekazuje toZone (CR 122.1b)', () => {
  let zliczone = 0;
  for (const plik of PLIKI) {
    const zrodlo = fs.readFileSync(path.resolve(plik), 'utf8');
    for (const { numer, tekst } of emitery(zrodlo, 'permanent_sacrificed')) {
      zliczone += 1;
      assert.ok(
        tekst.includes('toZone'),
        `${plik}:${numer} — zdarzenie poświęcenia bez toZone: triggery śmierci `
        + 'nie rozpoznają wygnania przez licznik finality (CR 122.1b)',
      );
    }
  }
  assert.ok(zliczone >= 13, `spodziewano się co najmniej 13 emiterów, znaleziono ${zliczone}`);
});

test('każdy emiter permanent_destroyed przekazuje toZone (CR 122.1b)', () => {
  for (const plik of PLIKI) {
    const zrodlo = fs.readFileSync(path.resolve(plik), 'utf8');
    for (const { numer, tekst } of emitery(zrodlo, 'permanent_destroyed')) {
      assert.ok(tekst.includes('toZone'), `${plik}:${numer} — zniszczenie bez toZone`);
    }
  }
});

test('emitery poświęcenia nie wymuszają prefiksu grave- na wygnaniu', () => {
  // Id obiektu w strefie musi zgadzać się ze strefą — inaczej log stołu
  // i podglądy stref pokazują wygnaną kartę jako leżącą na cmentarzu.
  const zrodlo = fs.readFileSync(path.resolve('src/engine/game-state.js'), 'utf8');
  const linie = zrodlo.split('\n');
  linie.forEach((linia, index) => {
    if (!linia.includes('deathZoneFor')) return;
    if (!linia.includes('moveObjectDirectly')) return;
    assert.ok(
      !/`grave-\$\{state\.objectSequence/.test(linia),
      `game-state.js:${index + 1} — sztywny prefiks grave- przy strefie z deathZoneFor`,
    );
  });
});
