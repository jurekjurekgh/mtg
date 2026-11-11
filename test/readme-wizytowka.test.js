// README jako wizytówka repozytorium, nie dziennik prac.
//
// Właściciel (2026-11-09): „Myślę, że fajnie by było gdybyś wyczyścił plik
// README ze strony głównej repozytorium. Bo teraz to jakiś śmietnik z wklejoną
// historią wyjętą ze środka projektu. To ma być krótka wizytówka, lista decków,
// a nie dziennik prac."
//
// Pomiar przed zmianą: 353 linie / 51,6 kB, z czego 111 linii (72% pliku, 37,3
// kB) to jedna sekcja „Status" — narracja o sesjach PR #120–#183, zaczynająca
// się od punktu zaczepienia z 2026-11-02 (dwa tygodnie i 6 PR-ów w tyle).
// Dziennik sesji ma swoje miejsce: `docs/PROJECT_HISTORY.md` (ADR 0013).
//
// Ten strażnik pilnuje TRZECH rzeczy, które w README są twierdzeniami o danych,
// a nie ozdobnikami (L56 — twierdzenie o danych sprawdzasz strażnikiem, bo
// inaczej cicho kłamie):
//  1. liczby kart w nagłówku == katalog w `src/cards/card-data.js`;
//  2. każdy odsyłacz względny w README prowadzi do istniejącego pliku
//     (martwy link w wizytówce to ta sama klasa błędu, co w dzienniku);
//  3. README nie zawiera dziennika sesji: żadnych „PR #<nr>", żadnych
//     numerów milestone'ów „M<nr>", żadnej sekcji „Status".
//     Wyjątek: lista talii — pilnuje jej M203/7 (liczności) i A47 (wiersze).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createCardRegistry } from '../src/cards/card-data.js';

const README_PATH = 'README.md';
const readme = fs.readFileSync(README_PATH, 'utf8');

function katalog() {
  const all = createCardRegistry().all();
  const licz = (status) => all.filter((c) => c.support?.status === status).length;
  return { supported: licz('supported'), token: licz('token'), back: licz('back') };
}

test('README: liczby kart w nagłówku == katalog rejestru', () => {
  const { supported, token, back } = katalog();
  // Wizytówka podaje trzy liczby jednym zdaniem; każda musi się zgadzać.
  assert.match(readme, new RegExp(`${supported} kart\\s+obsługiwanych`),
    `nagłówek musi mówić o ${supported} kartach obsługiwanych (stan rejestru)`);
  assert.match(readme, new RegExp(`${token} token`),
    `nagłówek musi mówić o ${token} tokenach (stan rejestru)`);
  assert.match(readme, new RegExp(`${back} tylnych stron`),
    `nagłówek musi mówić o ${back} tylnych stronach (stan rejestru)`);
});

test('README: każdy odsyłacz względny prowadzi do istniejącego pliku', () => {
  const martwe = [];
  for (const m of readme.matchAll(/\]\(([^)\s]+)\)/g)) {
    const cel = m[1].split('#')[0];
    if (!cel || /^[a-z]+:/i.test(cel) || cel.startsWith('#')) continue; // URL-e i kotwice
    if (!fs.existsSync(path.join(...cel.split('/')))) martwe.push(cel);
  }
  const niejednoznaczne = martwe.filter((c) => !/^[a-z]+:\/\//i.test(c));
  assert.deepEqual(niejednoznaczne, [], 'martwe odsyłacze w README');
});

test('README: brak dziennika sesji — bez numerów PR, milestone i sekcji Status', () => {
  assert.doesNotMatch(readme, /\bPR #\d+/, 'README nie podaje numerów PR — to dziennik, nie wizytówka');
  assert.doesNotMatch(readme, /\bM\d{2,3}\b/, 'README nie podaje numerow milestone');
  assert.doesNotMatch(readme, /^##\s+Status\s*$/m, 'sekcja „Status" (punkt zaczepienia sesji) nie wraca do README');
  // Punkt zaczepienia ma JEDNO miejsce: najnowszy handoff (AGENTS.md §0 poz. 6).
  assert.match(readme, /docs\/setup\//, 'README musi odsyłać po bieżący stan do docs/setup/');
});

test('README: sekcje wizytówki istnieją i nie ma pustych obietnic', () => {
  for (const naglowek of ['Jak zagrać', 'Co jest w środku', 'Dokumentacja', 'Talie', 'Uruchomienie', 'Zasady zmian']) {
    assert.match(readme, new RegExp(`^## ${naglowek}$`, 'm'), `brak sekcji „${naglowek}"`);
  }
  // Wizytówka ma być krótka: 40 tys. kB to dawny dziennik (37 kB samej narracji).
  assert.ok(Buffer.byteLength(readme, 'utf8') < 20_000,
    `README ma ${Buffer.byteLength(readme, 'utf8')} B — wizytówka, nie dziennik (limit 20 kB)`);
});
