// Audyt PR #134 → PR #135 (2026-09-24), pozycja Z-1 (Etap D1) — klasa
// `power + grantedPower` w wycenach bota.
//
// Kontrakt widoku (ADR 0017, `playerView` w `game-state.js`):
//   • `power` / `toughness` to wartości EFEKTYWNE — `effectivePower`
//     (`permanents.js`) = baza (`tempBasePT` albo 2/2 przy zakrytym) +
//     `powerModifier` + liczniki + załączniki + statyki + anthemy + buffy do
//     końca tury;
//   • `grantedPower` / `grantedToughness` to `grantedStatBonus` — TEN SAM
//     dodatek z efektów ciągłych (załączniki + statyki + anthemy + EOT),
//     wysłany jawnie, bo kafel potrzebował go do badge'a (M188/A);
//   • liczniki +1/+1 NIE wchodzą do `grantedPower` (M188/A3) — mają własny
//     badge, więc `grantedPower ⊆ power − baza − liczniki`.
// Czyli `grantedPower` jest PODZBIOREM `power`: suma `power + grantedPower`
// podwaja bonus z efektów ciągłych.
//
// Stan przed naprawą (trzy miejsca, wszystkie w `heuristic-bot.js`):
//   1. `attackerCanBeBlocked` — próg ewazji „can't be blocked by creatures with
//      power N or less” (Batch53/C, Rust-Shield Rampager);
//   2. wycena equipmentu (`effectivePower` celu przy `cantBeBlockedMaxPower`);
//   3. druga ścieżka tej samej wyceny (`effectiveTargetPower`).
// Czwarte miejsce (`cantBeBlockedTargetValue`) naprawił audyt PR #133 (F-4) —
// ten pin domyka klasę i pilnuje, żeby idiom nie wrócił (L27: klasa, nie
// pojedynczy przypadek; L48: jedno źródło prawdy o mocy efektywnej).
//
// Skutek gracza przed naprawą: bloker 1/1 z aurą +2/+2 (moc efektywna 3,
// `grantedPower` 2) był liczony jako 5, więc nie łapał się pod próg „power 3 or
// less” — atakujący wydawał się blokowalny i bot rezygnował z ataku, który
// przechodził. W wycenie equipmentu zawyżona baza zniekształcała zarówno
// warunkową ewazję, jak i przyrost pompy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { attackerCanBeBlocked } from '../src/controllers/heuristic-bot.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const SELF = 'test/audyt-pr135-2026-09-24-moc-efektywna.test.js';

/** Atakujący z ewazją mocową: „can't be blocked by creatures with power 3 or less”. */
const atakujący = () => ({
  id: 'a1', keywords: [], cantBeBlockedByPower: 3, tapped: false,
});

/** Wpis PlayerView blokera: `power` EFEKTYWNE, `grantedPower` = dodatek z efektów. */
const bloker = (power, grantedPower) => ({ id: `b${power}`, keywords: [], power, grantedPower });

test('Z-1/1: próg ewazji czyta moc EFEKTYWNĄ z widoku, nie sumę z grantedPower', () => {
  // 1/1 z aurą +2/+2: widok niesie power = 3 (efektywne) i grantedPower = 2.
  // Próg „power 3 or less” → bloker NIE może blokować → nikt nie może.
  // Przed naprawą: 3 + 2 = 5 > 3, bloker „mógł” blokować (funkcja zwracała
  // true) i bot odpuszczał atak, który przechodził.
  assert.equal(attackerCanBeBlocked(atakujący(), [bloker(3, 2)]), false,
    'bloker o mocy efektywnej 3 mieści się pod progiem 3 — atakujący nie może być zablokowany');
});

test('Z-1/2: kontrola — bloker POWYŻEJ progu nadal blokuje (anty-over-fix)', () => {
  // 2/2 z aurą +2/+2: power efektywne 4 > próg 3 → blokuje. Poprawka nie może
  // polegać na ignorowaniu mocy ani na odrzucaniu wszystkich blokerów.
  assert.equal(attackerCanBeBlocked(atakujący(), [bloker(4, 2)]), true,
    'moc efektywna 4 jest ponad progiem 3 — bloker może blokować');
  // Bez żadnych bonusów: 5/5 (grantedPower nieobecne w widoku).
  assert.equal(attackerCanBeBlocked(atakujący(), [{ id: 'b5', keywords: [], power: 5 }]), true,
    'zwykły bloker 5/5 może blokować');
});

test('Z-1/3: menace z progiem — liczą się blokerzy ZDOLNI do bloku (CR 702.111b)', () => {
  // Menace wymaga DWÓCH zdolnych blokerów. Dwóch blokerów o mocy efektywnej 3
  // (każdy z grantem 2) jest wykluczonych progiem → atakujący nieblokowalny.
  // Przed naprawą obaj „mogli” blokować (3+2=5) i menace było ignorowane.
  const atak = { ...atakujący(), keywords: ['menace'] };
  assert.equal(attackerCanBeBlocked(atak, [bloker(3, 2), bloker(3, 2)]), false,
    'żaden z dwóch blokerów nie może blokować (próg mocy) — menace nic nie zmienia');
  // Kontrola: jeden wykluczony progiem, drugi powyżej → nadal za mało dla menace.
  assert.equal(attackerCanBeBlocked(atak, [bloker(3, 2), bloker(5, 0)]), false,
    'menace wymaga dwóch zdolnych blokerów (702.111b)');
  // Kontrola: dwóch powyżej progu → może być zablokowany.
  assert.equal(attackerCanBeBlocked(atak, [bloker(4, 2), bloker(5, 0)]), true,
    'dwóch zdolnych blokerów — menace spełnione');
});

/** Linie kodu bez komentarzy (idiom bywa opisywany w komentarzach jako historia). */
function linieKodu(plik) {
  return fs.readFileSync(plik, 'utf8').split('\n')
    .map((linia) => {
      const t = linia.trim();
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return '';
      const idx = linia.indexOf('//');
      return idx >= 0 ? linia.slice(0, idx) : linia;
    });
}

test('Z-1/4: w src/ i test/ nie ma idiomu „power + grantedPower” (strażnik klasy)', () => {
  const IDIOM = [
    /\.power\b[^;\n]*\+[^;\n]*\.grantedPower\b/,
    /\.grantedPower\b[^;\n]*\+[^;\n]*\.power\b/,
  ];
  const pliki = [];
  const walk = (d) => {
    for (const entry of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const full = path.join(ROOT, d, entry.name);
      if (entry.isDirectory()) walk(path.join(d, entry.name));
      else if (/\.js$/.test(entry.name)) pliki.push(full);
    }
  };
  walk('src');
  walk('test');
  const trafienia = [];
  for (const plik of pliki) {
    const rel = path.relative(ROOT, plik);
    if (rel === SELF) continue;
    linieKodu(plik).forEach((linia, i) => {
      if (IDIOM.some((re) => re.test(linia))) {
        trafienia.push(`${rel}:${i + 1} — ${linia.trim().slice(0, 110)}`);
      }
    });
  }
  assert.deepEqual(trafienia, [],
    'moc/wytrzymałość z PlayerView jest EFEKTYWNA — `grantedPower` to ten sam dodatek dla badge\'a\n'
    + '(kontrakt: test/m188-uwagi-wlasciciela.test.js A1/A3). Użyj `power` albo `combatPower`:\n'
    + trafienia.join('\n'));
});
