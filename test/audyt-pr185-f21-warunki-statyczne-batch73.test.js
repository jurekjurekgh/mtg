// Audyt PR #185 — F-21 (ŚREDNI, UI/klasa): warunek zdolności STATYCZNEJ bez
// klauzuli na kaflu — skutek wygląda na bezwarunkowy.
//
// Znalazł go Żywy Tester w E3 (partia `audyt-batch73-ward` × `innistrad-brg`,
// seed 25, transkrypt `.arena/zt-e3-g10-25.txt`): kafel Leonin Lightbringer
// (batch 73) wydrukował
//   „Leonin Lightbringer · 3 · Creature — Cat Rebel · Ward {2} · +1/+1 ·
//     Pośpiech · +1/+1 · Equipment: Cloak of the Bat · Aura: Grounded · 4/3"
// czyli „+1/+1" BEZ warunku, choć Oracle mówi „As long as this creature is
// equipped, it gets +1/+1". Gracz czyta bonus stały, a silnik (poprawnie,
// F-2/`staticConditionHolds`) liczy go tylko z wyposażeniem.
//
// Pomiar klasy (`.arena/probe-e3d-linie.mjs`, cały katalog 713 kart):
// zdolności statycznych z warunkiem jest 22, a kluczy `condition` 17 —
// `describeStatic` (render.js) opisywał ręcznym łańcuchem `if` tylko 11 z nich.
// Sześć kluczy bez klauzuli (6 kart):
//   equipped                 leonin-lightbringer      „Ward {2} · +1/+1"
//   enteredThisTurn          crew-captain             „Pośpiech · Niezniszczalny"
//   gainedLifeThisTurn       ulna-alley-shopkeep      „Postrach · +2/+0"
//   activePlayerIsController leonin-surveyor          „… · Pierwsze uderzenie · …"
//   enduringStory            oin-the-brave            „+1/+0 · Pośpiech · …"
//   delirium                 spineseeker-centipede    „… · +1/+2 · Czujność"
// Ta sama klasa co M138/Z3 (kafel pokazuje SAM warunek, bez skutku) i F-17
// (próg Threshold bez etykiety) — tylko w drugą stronę: sam skutek.
// Przyczyna: brak JEDNEJ tabeli klauzul (klasa L26 — ręczna lista gałęzi `if`,
// która rośnie z każdym batchem i gubi klucze) oraz brak strażnika wiążącego
// zbiór kluczy w DANYCH kart ze zbiorem etykiet w prezenterze.
// Zasady: ADR 0002 (wartość z deskryptora), L24 (skutek bez śladu nie
// istnieje), L41 (jedno źródło), M127/L29 (polszczyzna).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as render from '../src/table/render.js';
import { createCardRegistry } from '../src/cards/card-data.js';

const { rulesText } = render;
const REGISTRY = createCardRegistry();

const infoOf = (cardId, { bezWarunkuW } = {}) => {
  const def = REGISTRY.get(cardId);
  const abilities = (def.abilities ?? []).map((a, i) => (i === bezWarunkuW ? { ...a, condition: {} } : a));
  return {
    name: def.name,
    keywords: def.keywords ?? [],
    abilities,
    controllerId: 'p1',
    ward: def.ward ?? null,
  };
};
const linia = (cardId) => rulesText(infoOf(cardId));

/** Zdolności statyczne z niepustym `condition` — razem z ich indeksem. */
const statykiZWarunkiem = (cardId) => (REGISTRY.get(cardId).abilities ?? [])
  .map((a, i) => ({ a, i }))
  .filter(({ a }) => a?.type === 'static' && Object.keys(a.condition ?? {}).length > 0);

test('F-21/1: Leonin Lightbringer (batch 73) — kafel mówi, ŻE bonus jest warunkowy', () => {
  const text = linia('leonin-lightbringer');
  assert.match(text, /gdy ma wyposażenie/,
    `warunek „As long as this creature is equipped" nie trafił na kafel: ${JSON.stringify(text)}`);
  assert.match(text, /\+1\/\+1/, `skutek musi zostać (M138/Z3 — nie odwrotnie): ${JSON.stringify(text)}`);
  // Negacja warunku jest w silniku (`condition.equipped: false`, permanents.js)
  // — etykieta ma ją opisać z DANYCH, nie z literału per karta (ADR 0002).
  const negacja = rulesText({
    controllerId: 'p1',
    abilities: [{ type: 'static', condition: { equipped: false }, pump: { power: 1, toughness: 1 } }],
  });
  assert.match(negacja, /gdy nie ma wyposażenia/, `warunek zanegowany: ${JSON.stringify(negacja)}`);
});

test('F-21/2: pięć pozostałych kart klasy — każda klauzula warunku na kaflu', () => {
  const oczekiwane = [
    ['crew-captain', /w turze wejścia/, 'has indestructible as long as it entered this turn'],
    ['ulna-alley-shopkeep', /gdy zyskałeś życie w tej turze/, 'gets +2/+0 as long as you gained life this turn'],
    ['leonin-surveyor', /w twojej turze/, 'During your turn, this creature has first strike'],
    ['oin-the-brave', /enduring story \(Storied\)/, 'As long as you have an enduring story, Óin gets +1/+0 and has haste'],
    ['spineseeker-centipede', /delirium/, 'Delirium — gets +1/+2 and has vigilance as long as …'],
  ];
  for (const [id, wzorzec, oracle] of oczekiwane) {
    const text = linia(id);
    assert.match(text, wzorzec, `${id} (Oracle: „${oracle}") — brak klauzuli warunku: ${JSON.stringify(text)}`);
  }
  // `activePlayerIsController: false` = „as long as it's NOT your turn"
  // (permanents.js:424-428) — druga wartość tego samego klucza.
  const przeciwnik = rulesText({
    controllerId: 'p1',
    abilities: [{ type: 'static', condition: { activePlayerIsController: false }, keywords: ['vigilance'] }],
  });
  assert.match(przeciwnik, /w turze przeciwnika/, `warunek „w turze przeciwnika": ${JSON.stringify(przeciwnik)}`);
});

test('F-21/3: strażnik klasy — każdy klucz `condition` w danych kart ma klauzulę w tabeli', () => {
  assert.ok(render.STATIC_CONDITION_CLAUSES,
    'brak eksportu STATIC_CONDITION_CLAUSES — bez jednej tabeli klucze znów będą ginąć w łańcuchu `if` (L26)');
  assert.ok(typeof render.staticConditionClauses === 'function',
    'brak eksportu staticConditionClauses(ability) — strażnik nie zmierzy, co faktycznie trafia na kafel');

  const kluczeWDanych = new Map(); // klucz → karty
  for (const c of REGISTRY.all()) {
    for (const a of c.abilities ?? []) {
      if (a?.type !== 'static') continue;
      for (const k of Object.keys(a.condition ?? {})) {
        if (!kluczeWDanych.has(k)) kluczeWDanych.set(k, []);
        kluczeWDanych.get(k).push(c.id);
      }
    }
  }
  assert.ok(kluczeWDanych.size >= 17, `pomiar klasy się nie zgadza (oczekiwane ≥17 kluczy, jest ${kluczeWDanych.size})`);

  const bezKlauzuli = [...kluczeWDanych.keys()].filter((k) => !(k in render.STATIC_CONDITION_CLAUSES));
  assert.deepEqual(bezKlauzuli, [],
    `klucze condition BEZ etykiety — kafel drukuje skutek bez warunku: ${bezKlauzuli.map((k) => `${k} (${kluczeWDanych.get(k).join(', ')})`).join('; ')}`);

  const martwe = Object.keys(render.STATIC_CONDITION_CLAUSES).filter((k) => !kluczeWDanych.has(k));
  assert.deepEqual(martwe, [],
    `martwe wpisy tabeli — żadna karta ich nie używa (tabela opisuje DANE, nie aspiracje): ${martwe.join(', ')}`);
});

test('F-21/4: strażnik skuteczności — klauzula faktycznie trafia do linii reguł każdej karty', () => {
  for (const c of REGISTRY.all()) {
    for (const a of c.abilities ?? []) {
      if (a?.type !== 'static') continue;
      const keys = Object.keys(a.condition ?? {});
      if (!keys.length) continue;
      const klauzule = render.staticConditionClauses?.(a) ?? [];
      const text = rulesText({
        name: c.name,
        keywords: c.keywords ?? [],
        abilities: c.abilities ?? [],
        controllerId: 'p1',
        ward: c.ward ?? null,
      });
      for (const kl of klauzule) {
        assert.ok(text.includes(kl),
          `${c.id}: klauzula warunku [${keys}] nie trafiła na kafel — oczekiwane ${JSON.stringify(kl)} w ${JSON.stringify(text)}`);
      }
      // Warunek musi coś WNOSIĆ do linii: ta sama karta z `condition: {}` ma
      // drukować inny tekst (inaczej klauzula jest ozdobą, nie informacją).
      // Wyjątek: próg Threshold niesie opis efektu (F-17 — jedno źródło), więc
      // dla karty z efektem statycznym sprawdzamy samą obecność progu.
      const idx = (c.abilities ?? []).indexOf(a);
      const bez = rulesText(infoOf(c.id, { bezWarunkuW: idx }));
      assert.notEqual(text, bez,
        `${c.id}: warunek [${keys}] nie zmienia linii reguł — skutek wygląda na bezwarunkowy (${JSON.stringify(text)})`);
    }
  }
});

test('F-21/5: regresja — 11 dotychczasowych kluczy bez zmian (pomiar PRZED w .arena/f21-linie-przed.txt)', () => {
  const piny = [
    ["ainok-artillerist", "Zasięg · gdy ma licznik +1/+1"],
    ["lightwalker", "Latanie · gdy ma licznik +1/+1"],
    ["scorpion-sentinel", "+3/+0 · przy 7+ landach"],
    ["vortex-runner", "+1/+0 · przy 8+ landach"],
    ["carapace-forger", "+2/+2 · przy 3+ artefaktach"],
    ["gaelicat", "Latanie Czujność · +2/+0 · przy 2+ artefaktach"],
    ["gearsmith-prodigy", "+1/+0 · gdy kontrolujesz artefakt"],
    ["ramroller", "musi atakować  ·  +2/+0 · gdy kontrolujesz inny artefakt"],
    ["esper-stormblade", "+1/+1 · Latanie · gdy kontrolujesz inny wielokolorowy permanent"],
    ["gray-slaad", "Postrach Dotyk śmierci · przy 4+ stworach w grobie"],
    ["evangel-of-synthesis", "Gdy wejdzie na pole bitwy: dobierz 1 kartę, odrzuć 1 kartę.  ·  +1/+0 · Postrach · przy 2+ dobranych kartach"],
    ["setons-desire", "przy 7+ kartach w twoim grobie: wszystkie stworzenia zdolne do blokowania zaklętego stwora muszą go blokować"],
  ];
  for (const [id, oczekiwana] of piny) {
    assert.equal(linia(id), oczekiwana, `${id}: linia reguł zmieniona względem pomiaru PRZED`);
  }
  assert.equal((linia('setons-desire').match(/7/g) ?? []).length, 1, 'próg Threshold wydrukowany dwa razy (F-17)');
  // Level-up: zakres „2-4" i otwarte „5+" (dwa klucze w jednej klauzuli).
  const kabira = linia('kabira-vindicator');
  assert.match(kabira, /poziomy 2-4/, `zakres poziomów: ${JSON.stringify(kabira)}`);
  assert.match(kabira, /poziomy 5\+/, `próg otwarty: ${JSON.stringify(kabira)}`);
});

test('F-21/6: pomiar klasy — 19 kart / 22 zdolności / 17 kluczy `condition`', () => {
  const karty = [];
  const zdolnosci = [];
  const klucze = new Set();
  for (const c of REGISTRY.all()) {
    for (const a of c.abilities ?? []) {
      if (a?.type !== 'static') continue;
      const ks = Object.keys(a.condition ?? {});
      if (!ks.length) continue;
      zdolnosci.push(c.id);
      ks.forEach((k) => klucze.add(k));
      if (!karty.includes(c.id)) karty.push(c.id);
    }
  }
  // Pomiar PRZED (`.arena/probe-e3d-linie.mjs`, stan 48d0636): liczby są pinem
  // zakresu — nowy batch z nowym warunkiem musi świadomie zaktualizować test.
  assert.equal(karty.length, 19, `karty ze statycznym warunkiem: ${JSON.stringify(karty)}`);
  assert.equal(zdolnosci.length, 22, `zdolności statyczne z warunkiem: ${zdolnosci.length}`);
  assert.equal(klucze.size, 17, `klucze condition: ${JSON.stringify([...klucze].sort())}`);
  assert.ok(karty.includes('leonin-lightbringer'), 'karta batcha 73 musi być w pomiarze klasy');
});
