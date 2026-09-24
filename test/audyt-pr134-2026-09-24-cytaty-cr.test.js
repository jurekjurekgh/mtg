// Audyt PR #134 (2026-09-24), znalezisko F-3 — numery CR w komentarzach,
// komunikatach i nazwach testów muszą wskazywać regułę, o którą chodzi
// w BIEŻĄCYM wydaniu Comprehensive Rules.
//
// Dlaczego pin: numery CR DRYFUJĄ między wydaniami (sekcje 701/702/712 są
// numerowane historycznie, nie alfabetycznie), więc cytat przypięty do wydania
// z dnia kodowania mechaniki z czasem zaczyna wskazywać INNĄ regułę. ADR 0030
// wymaga dosłownego tekstu ze źródła — fałszywy numer to fałszywe
// „zweryfikowane u źródła” (kolejna sesja czyta nie tę regułę i „potwierdza”
// bzdurę). W PR #134 doszły nowe wystąpienia trzech przestarzałych numerów,
// a korzeń sięgał M257/M258/M264/M271.
//
// Podział pracy między strażnikami (L41 — jedna reguła w jednym miejscu):
//   • ten plik: cytaty znalezione w audycie PR #134/#135, których NIE wolno
//     stracić (C2), numery z minionej numeracji (C1) i uczciwość komentarzy
//     o bramce surge (C3);
//   • `test/cr-numery-mechanik-straznik.test.js`: pary mechanika ↔ zakazany
//     numer (liniowe, z `wyklucz` i źródłem);
//   • `test/cr-numery-702-tabela-straznik.test.js`: detektor OKNA ±8 linii —
//     każdy cytat `702.<n>` musi siedzieć przy nazwie mechaniki, którą `702.<n>`
//     oznacza w CR 2026-09-25 (pełna tabela sekcji 702 w tamtym pliku).
//
// Mapowanie zweryfikowane 2026-09-24 wobec CR 2026-09-25 (Reality Fracture).
// Źródła dosłownego tekstu: `mtg.wiki/page/Keyword_ability` (spis 702.1–702.195),
// `mtg.wiki/page/Double-faced_card` §Rules (712.1–712.20), `mtg.wiki/page/Endure`
// (701.63a/b), `mtg.fandom.com/wiki/Cloak` + `mtg.wtf/help/rules` (701.58a–h),
// `mtg.wiki/page/Loyalty_counter` (122.1e = loyalty, finality = 122.1h),
// `ancestral.vision/.../casting-spells.html` (601.2b/2f/2h).
//
// | reguła                                         | było w repo | jest (CR 2026-09-25) |
// | Surge                                          | 702.111/a   | 702.117/a            |
// | licznik finality („exile instead of dying”)    | 122.1e      | 122.1h               |
// | Cloak                                          | 701.56a–g   | 701.58a–h            |
// | DFC: każda twarz ma własny zestaw cech         | 711.2       | 712.8                |
// | DFC: ukryte strefy nierozróżnialne             | 711.3       | 712.7                |
// | DFC: cechy twarzy / poza polem bitwy tylko przód| 711.4/711.4a | 712.8/712.8a        |
// | DFC: rzut idzie na stos przodem                | 711.7       | 712.11               |
// | DFC: rozstrzygnięty czar wchodzi tą samą twarzą| 711.8       | 712.13               |
// | DFC: wejście z innej strefy niż stos — przodem | (brak)      | 712.14               |
// | DFC: transform nie-DFC = „nothing happens”     | 712.9       | 712.9 (BEZ ZMIAN)    |
// | DFC: MV permanentu z tyłem = koszt przodu      | 712.8e      | 712.8e (BEZ ZMIAN)   |
// | DFC: transform nie tworzy nowego obiektu       | (brak)      | 712.18               |
//
// L164 (dopisane po pierwszej fali): pierwsze podejście przepisało DFC na
// numerację ze STARSZEGO lustra CR (`ancestral.vision`: 712.4a = cechy twarzy,
// 712.7 = rzut przodem) i przy okazji „poprawiło” dwa cytaty, które były
// poprawne (712.9 → 712.5, 712.8e → 712.4d). W CR 2026-09-25 meld został
// wchłonięty przez sekcję 712 (712.4 = meld cards, 712.5 = siedem par meld),
// więc cechy twarzy przesunęły się na 712.8/712.8a–g. Obie błędne korekty
// cofnięte, a wiersze „BEZ ZMIAN” powyżej istnieją właśnie po to, żeby nikt
// ich drugi raz nie „poprawił”.
//
// Zakres skanu: `src/` i `test/` (kod żywy). `docs/` NIE jest skanowany —
// plany, handoffy, milestones i archiwalne audyty to zapis historyczny sesji
// (ADR 0016); mapowanie dla nich jest w
// docs/audits/AUDYT_PR134_2026-09-24.md §4/F-3.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SELF = path.join(ROOT, 'test/audyt-pr134-2026-09-24-cytaty-cr.test.js');

/**
 * Pliki-strażniki celowo cytują numery przestarzałe (opisują historię rozjazdów
 * i dowody RED) — skan C1 musi je pominąć, inaczej świeci na własną dokumentację.
 */
const POMIN = new Set([
  'test/audyt-pr134-2026-09-24-cytaty-cr.test.js',
  'test/cr-numery-mechanik-straznik.test.js',
  'test/cr-numery-702-tabela-straznik.test.js',
]);

/**
 * Numery z MINIONEJ numeracji — w żywym kodzie zakazane globalnie (nie tylko
 * w kontekście mechaniki). Gdyby któryś z nich stał się kiedyś poprawnym
 * cytatem (np. meld w katalogu właściciela → 712.4a, albo nowa sekcja 711),
 * przenieś zakaz do pary mechanika+numer w
 * `test/cr-numery-mechanik-straznik.test.js` zamiast go kasować.
 */
const PRZESTARZALE = [
  ['711.2', 'DFC: cechy twarzy = 712.8'],
  ['711.3', 'DFC: ukryte strefy = 712.7'],
  ['711.4', 'DFC: cechy przodu = 712.8/712.8a'],
  ['711.7', 'DFC: rzut przodem = 712.11'],
  ['711.8', 'DFC: wejście przodem = 712.13'],
  ['712.4a', 'DFC: cechy twarzy = 712.8a (712.4a to zdolność pary meld)'],
  ['712.4d', 'DFC: MV tyłu = 712.8e (712.4d to podreguła meld)'],
  ['712.5', 'DFC: transform nie-DFC = 712.9 (712.5 to siedem par meld)'],
];

/** Cytaty, które MUSZĄ pozostać (żeby „naprawa” nie polegała na ich usunięciu). */
const WYMAGANE = [
  // F-3 (audyt PR #134)
  ['src/engine/spells.js', '702.117', 'Surge na ścieżce czarów'],
  ['src/engine/resources.js', '702.117', 'Surge na ścieżce permanentów'],
  ['src/engine/zones.js', '122.1h', 'deathZoneFor — licznik finality'],
  ['src/engine/effects.js', '701.58', 'efekt cloak'],
  ['src/engine/permanents.js', '701.58', 'cechy zakrytego permanentu'],
  ['src/engine/mana-sources.js', '106.7', '„could produce”'],
  ['src/engine/permanents.js', '614.1d', 'statyk „wpisy wchodzą odkręcone”'],
  ['src/engine/attachments.js', '704.5m', 'SBA: aura bez legalnego gospodarza'],
  // F-3 fala 2: DFC w numeracji CR 2026-09-25
  ['src/engine/objects.js', '712.8a', 'reset twarzy DFC przy zmianie strefy'],
  ['src/engine/objects.js', '712.13', 'wejście przodem po rzucie'],
  ['src/engine/objects.js', '712.11', 'rzut DFC idzie na stos przodem'],
  ['src/engine/game-state.js', '712.9', 'transform kopii jednostronnej = no-op'],
  ['test/m264-enter-as-copy-dfc.test.js', '712.9', 'pin: kopia Jwari nie ma transformTo'],
  ['src/engine/identity.js', '712.8e', 'MV permanentu z tyłem = koszt przodu'],
  ['test/m258-cr202-kopia-tylu-dfc.test.js', '712.8e', 'pin: MV przekształconego permanentu'],
  ['src/engine/permanents.js', '712.18', 'transform w miejscu = ten sam obiekt, efekty trwają (O-6, naprawione)'],
  ['src/engine/effects.js', '712.18', 'gałąź transform przenosi trwające efekty (O-6)'],
  // F-7 (audyt PR #135, druga fala rozjazdów tej samej klasy)
  ['src/controllers/heuristic-bot.js', '702.20', 'vigilance (nie 702.21 = ward)'],
  ['test/m221d-vigilance-window.test.js', '702.20', 'pin okna kupowania vigilance'],
  ['src/engine/spells.js', '702.170a', 'plot (nie 702.168a = disguise)'],
  ['src/engine/effects.js', '702.123a', 'fabricate (nie 702.122a = crew)'],
  ['src/engine/game-state.js', '702.123a', 'rozstrzygnięcie fabricate: liczniki albo Servo'],
  ['src/table/render.js', '702.34a', 'flashback jako koszt alternatywny (nie 702.33a = kicker)'],
  ['src/cards/card-data.js', '701.63', 'endure to keyword ACTION (nie 702.174 = gift)'],
  ['test/m378-bronacy-gracz-z-meczu.test.js', '702.90b', 'infect do gracza (nie 702.89b = umbra armor)'],
  ['test/m257r4-petla3-bot.test.js', '702.6a', 'sprzęt przypięty tylko do stwora (nie 702.16 = protection)'],
  ['test/m257r4-petla3-bot.test.js', '704.5n', 'SBA odłączające sprzęt'],
  ['test/bug-hunt-2026-08-10.test.js', '702.107', 'outlast (nie 702.100 = evolve)'],
];

function pliki() {
  const out = [];
  for (const dir of ['src', 'test']) {
    const walk = (d) => {
      for (const entry of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
        const full = path.join(ROOT, d, entry.name);
        if (entry.isDirectory()) walk(path.join(d, entry.name));
        else if (/\.(js|mjs|html|css)$/.test(entry.name)
          && full !== SELF && !POMIN.has(path.relative(ROOT, full))) out.push(full);
      }
    };
    walk(dir);
  }
  return out;
}

test('F-3/C1: przestarzałe numery CR nie wracają do src/ ani test/', () => {
  const trafienia = [];
  for (const file of pliki()) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
      for (const [stary, poprawny] of PRZESTARZALE) {
        if (line.includes(stary)) {
          trafienia.push(`${path.relative(ROOT, file)}:${index + 1} — „${stary}" → ${poprawny}`);
        }
      }
    });
  }
  assert.deepEqual(trafienia, [], `cytaty CR z minionej numeracji:\n${trafienia.join('\n')}`);
});

test('F-3/C2: bieżące numery CR są cytowane przy mechanikach, których dotyczą', () => {
  const braki = [];
  for (const [rel, numer, opis] of WYMAGANE) {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    if (!text.includes(numer)) braki.push(`${rel} — brak „${numer}" (${opis})`);
  }
  assert.deepEqual(braki, [], `utracone cytaty CR:\n${braki.join('\n')}`);
});

test('F-3/C3: bramki surge mówią o ograniczeniu silnika, nie o zakazie z CR', () => {
  const text = fs.readFileSync(path.join(ROOT, 'src/engine/spells.js'), 'utf8');
  // CR 601.2b zabrania DWÓCH kosztów alternatywnych; kicker (702.33a) jest
  // DODATKOWY, a delve (702.66a) nie jest ani dodatkowy, ani alternatywny —
  // powoływanie 601.2b przeciwko nim było fałszywe (audyt PR #134, F-3e).
  assert.ok(!/601\.2b: jeden\s*\n?\s*koszt alternatywny/.test(text),
    'komentarz nie może twierdzić, że 601.2b wyklucza kicker/delve');
  assert.ok(text.includes('ograniczenie implementacji') || text.includes('ograniczenie silnika'),
    'bramka ma być opisana jako ograniczenie implementacji');
  assert.ok(text.includes('601.2f'), 'komentarz wskazuje regułę, która łączenie dopuszcza (601.2f)');
});
