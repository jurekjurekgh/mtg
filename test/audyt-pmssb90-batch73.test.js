// PMSSB-90 — pętla RĘCZNEGO strojenia scoringu bota dla Batcha 73 (bez pełnego B0 i bez
// maszynowego tuningu wag). Piny RED→GREEN dla znalezisk z pomiaru PRZED; każde odnosi się
// do wiersza sekcji 8 planu `docs/plans/PLAN_2026-11-16-pmssb90-batch73-petla-reczna.md`
// i do scenariusza sondy `tools/pmssb90-batch73-petla-sonda.mjs` (pomiar i pin mierzą TEN
// SAM stan — jedno źródło, L41).
import fs from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { SCENARIUSZE, stan, decyzja } from '../tools/pmssb90-batch73-petla-sonda.mjs';

const REGISTRY = createCardRegistry();

/** Scenariusz sondy po id — pin NIE buduje własnego stanu, żeby nie rozjechać się z pomiarem. */
function scenariusz(id) {
  const s = SCENARIUSZE.find((x) => x.id === id);
  assert.ok(s, `sonda PMSSB-90 ma scenariusz ${id}`);
  return s;
}

/** Stan scenariusza zbudowany OD NOWA (wykonanie komendy mutuje stan). */
const budowa = (id, indeks = 0) => {
  const s = scenariusz(id);
  const w = s.warianty?.[indeks] ?? {};
  return { state: s.budowa(w), wariant: w.opis ?? w.krok ?? `(bazowy #${indeks})` };
};

const ofertyAktywacji = (state, gracz, objectId) => (playerView(state, gracz).legalCommands ?? [])
  .filter((c) => c.type === 'activate_ability' && c.objectId === objectId);

const powodOdmowy = (res) => res?.reason ?? res?.events?.[0]?.reason ?? '(brak powodu)';

// ---------------------------------------------------------------------------
// F-90/1 (KRYTYCZNY, fala A) — oferta aktywacji z GROBU bez wyboru ofiary:
// silnik oferował `activate_ability(necro#0)` bez `sacrificeCreatureId`, a
// `performActivation` wymaga tego parametru (`abilities.js:1728`), więc komenda
// WYBRANA PRZEZ BOTA była odrzucana: `illegal_ability:Nielegalny stwór do
// poświęcenia (koszt)`. W partii na żywo `session.js:4009` rzuca wtedy
// „Bot wybrał nielegalną komendę" i przerywa grę. Pomiar: NS-01..NS-04
// (15 wariantów, `ok=false`). Złamanie L48 („oferta = walidacja = wykonanie").
// ---------------------------------------------------------------------------

test('PMSSB-90/F-90-1a: oferta aktywacji Necrosavanta z grobu wylicza PO JEDNYM wariancie na stwora do poświęcenia', () => {
  const { state, wariant } = budowa('NS-01', 1); // fodder 1/1 + nasz najlepszy 4/3
  const oferty = ofertyAktywacji(state, 'p1', 'necro-grave');
  assert.equal(oferty.length, 2, `${wariant}: dwie ofiary = dwa warianty oferty`);
  assert.deepEqual(oferty.map((c) => c.sacrificeCreatureId).sort(), ['nasz-0', 'nasz-1'],
    'każdy wariant mówi, KTÓRY stwór jest poświęcany (bez tego wykonanie odrzuca komendę)');
  for (const c of oferty) assert.equal(c.abilityIndex, 0, 'indeks zdolności z grobu');
});

test('PMSSB-90/F-90-1b: każda OFEROWANA aktywacja z grobu się wykonuje — bez ręcznego doklejania parametru', () => {
  const s = scenariusz('NS-01');
  let sprawdzone = 0;
  for (let i = 0; i < s.warianty.length; i += 1) {
    const { state, wariant } = budowa('NS-01', i);
    for (const cmd of ofertyAktywacji(state, 'p1', 'necro-grave')) {
      const { state: swiezy } = budowa('NS-01', i);
      const res = execute(swiezy, cmd);
      assert.equal(res.ok, true, `${wariant}: oferta ${JSON.stringify(cmd)} → ${powodOdmowy(res)}`);
      sprawdzone += 1;
    }
  }
  // Po JEDNEJ ofercie na każdego stwora, którego można poświęcić (wariant bez stwora = 0).
  const oczekiwane = s.warianty.reduce((suma, w) => suma + w.pole.length, 0);
  assert.equal(sprawdzone, oczekiwane, `wykonane oferty aktywacji z grobu: ${sprawdzone} z ${oczekiwane}`);
});

test('PMSSB-90/F-90-1c: komenda WYBRANA PRZEZ BOTA dla aktywacji z grobu jest wykonalna', () => {
  const s = scenariusz('NS-01');
  for (let i = 0; i < s.warianty.length; i += 1) {
    const { state, wariant } = budowa('NS-01', i);
    const d = decyzja(state, 'p1');
    const maStwora = s.warianty[i].pole.length > 0;
    if (!maStwora) {
      assert.equal(d.cmd?.type, 'pass_priority', `${wariant}: bez stwora do poświęcenia bot pasuje`);
      continue;
    }
    assert.equal(d.cmd?.type, 'activate_ability', `${wariant}: bot aktywuje Necrosavanta (pomiar: 19/11)`);
    const res = execute(state, d.cmd);
    assert.equal(res.ok, true, `${wariant}: wybrana komenda ${JSON.stringify(d.cmd)} → ${powodOdmowy(res)}`);
  }
});

test('PMSSB-90/F-90-1d: bez stwora do poświęcenia oferta z grobu nie istnieje (brak fikcyjnego wariantu)', () => {
  const { state, wariant } = budowa('NS-01', 3); // puste pole
  assert.deepEqual(ofertyAktywacji(state, 'p1', 'necro-grave'), [], `${wariant}: brak kandydatów = brak oferty`);
});

test('PMSSB-90/F-90-1e: STRAŻNIK katalogu — oferta grobowa nie pomija żadnego wyboru, którego wymaga wykonanie', () => {
  // Klasa F-90/1: gałąź grobowa `legalActivatedAbilities` pchała wariant GOŁY. Dziś
  // wylicza ofiarę stwora (`sacrificeCreature`); każda inna forma wyboru w koszcie
  // zdolności z grobu (X, cele, crew/saddle, tap/poświęcenie konkretnego permanentu)
  // znaczy, że enumerację trzeba rozszerzyć — inaczej powstaje ten sam rozjazd
  // oferta/wykonanie. Strażnik czyta KATALOG, więc łapie nowe karty, nie tylko batch 73.
  const WYMAGA_WYBORU = [
    'sacrificeCreaturesByColors', 'sacrificeEnchantedHost', 'sacrificeLand', 'tapCreature',
    'tapOtherCreature', 'tapUntappedSubtype', 'tapXArtifacts', 'tapOtherArtifacts', 'crewPower',
    'saddlePower', 'manaX', 'maxPowerX', 'payLifeX', 'energy', 'energyX',
  ];
  const OBSLUGIWANE = ['sacrificeCreature'];
  const luki = [];
  for (const c of REGISTRY.all()) {
    for (const a of (c.abilities ?? [])) {
      if (a.type !== 'activated' || !a.fromGraveyard) continue;
      const cost = a.cost ?? {};
      const klucze = Object.keys(cost).filter((k) => WYMAGA_WYBORU.includes(k) && !OBSLUGIWANE.includes(k));
      if (klucze.length) luki.push(`${c.id}: koszt ${klucze.join(',')}`);
      if ((a.targets ?? []).length) luki.push(`${c.id}: cele`);
    }
  }
  assert.deepEqual(luki, [], `oferta z grobu musi wyliczać te wybory (F-90/1): ${luki.join(' | ')}`);
});

// ---------------------------------------------------------------------------
// F-90/9 (fala B) — trigger „każdy przeciwnik traci N życia" bez skali życia
// i bez dobicia. Pomiar PRZED: KF-05 dawał 100,00 przy życiu wroga 20 / 6 / 2 / 1
// — ten sam wynik, gdy 1 obrażenie KOŃCZY partię. Root cause: piąte miejsce
// wyceny tej samej instrukcji (`ETB_EFFECT_BONUS.damage_each_opponent`) miało
// płaskie 4, podczas gdy cztery inne ścieżki (modalny trigger, pętla czarów,
// `lose_life` z zakresem each_opponent, legacy) używają `opponentLifeEffectValue`
// = „4×N, a dobicie = 80" (L41: jedna skala dla jednej instrukcji).
// ---------------------------------------------------------------------------

/** Score konkretnej alternatywy z decyzji bota (etykieta komendy jak w sondzie). */
function scoreAlternatywy(d, podciag) {
  const trafienie = (d.opcje ?? []).find((o) => String(o.cmd).includes(podciag));
  assert.ok(trafienie, `brak alternatywy „${podciag}" wśród: ${(d.opcje ?? []).map((o) => o.cmd).join(' | ')}`);
  return trafienie.score;
}

test('PMSSB-90/F-90-9a: chip damage z triggera jest warty więcej, gdy DOBIJA przeciwnika', () => {
  const pelne = decyzja(budowa('KF-05', 0).state, 'p1'); // wróg 20 życia
  const lethal = decyzja(budowa('KF-05', 3).state, 'p1'); // wróg 1 życia = dobicie z chipu
  const sPelne = scoreAlternatywy(pelne, 'cast_spell(plummet-hand');
  const sLethal = scoreAlternatywy(lethal, 'cast_spell(plummet-hand');
  assert.ok(sLethal - sPelne >= 20,
    `dobijający chip musi dominować: ${sLethal} (wróg 1 życia) − ${sPelne} (wróg 20) = ${(sLethal - sPelne).toFixed(2)} < 20`);
  assert.equal(lethal.cmd.type, 'cast_spell', 'przy życiu 1 bot nadal gra czar (dobicie)');
});

test('PMSSB-90/F-90-9b: ANTY-OVER-FIX — skala triggera to ilość obrażeń i dobicie, nie „bliskość śmierci"', () => {
  // Uczciwa granica modelu: `opponentLifeEffectValue` = 4×N albo 80 przy dobięciu.
  // Przy życiu 20 / 6 / 2 chip NIE dobija, więc wszystkie trzy stany mają tę samą
  // wartość — pin pilnuje, żeby naprawa nie dodała drugiej arytmetyki „im mniej życia,
  // tym więcej punktów" (M429: bez bonusów z sufitu).
  const scores = [0, 1, 2].map((i) => scoreAlternatywy(decyzja(budowa('KF-05', i).state, 'p1'), 'cast_spell(plummet-hand'));
  assert.deepEqual([scores[1], scores[2]], [scores[0], scores[0]], `życie 20/6/2 musi dawać tę samą wartość: ${scores.join(', ')}`);
  const zKessigiem = scoreAlternatywy(decyzja(budowa('KF-02', 0).state, 'p1'), 'cast_spell(plummet-hand');
  const bezKessiga = scoreAlternatywy(decyzja(budowa('KF-02', 1).state, 'p1'), 'cast_spell(plummet-hand');
  assert.equal(zKessigiem - bezKessiga, 2, 'nosiciel triggera dodaje 2 pkt poza dobięciem (pomiar PRZED: 100 vs 98)');
});

test('PMSSB-90/F-90-9c: dopłata za nosiciela triggera rośnie do skali dobięcia (ten sam stan minus Kessig)', () => {
  const z = scoreAlternatywy(decyzja(budowa('KF-05', 3).state, 'p1'), 'cast_spell(plummet-hand');
  const bez = decyzja(stan({
    krok: 'main1', mana: { p1: 6 }, zycie: { p1: 20, p2: 1 },
    reka: [{ id: 'plummet-hand', karta: 'plummet' }],
    pole: [{ id: 'wrona', karta: 'murder-of-crows', gracz: 'p2' }],
  }), 'p1');
  assert.ok(z - scoreAlternatywy(bez, 'cast_spell(plummet-hand') >= 20,
    'Kessig przy życiu 1 musi być wart znacznie więcej niż ten sam rzut bez niego');
});

test('PMSSB-90/F-90-9d: STRAŻNIK L41 — jedna skala dla `damage_each_opponent` (bez drugiej arytmetyki)', () => {
  const zrodlo = fs.readFileSync(new URL('../src/controllers/heuristic-bot.js', import.meta.url), 'utf8');
  const wpisy = [...zrodlo.matchAll(/^\s*damage_each_opponent:\s*\(([^)]*)\)\s*=>\s*([^\n]+),$/gm)];
  assert.equal(wpisy.length, 1, `oczekiwany jeden wpis tabeli, znaleziono ${wpisy.length}`);
  const [, args, cialo] = wpisy[0];
  assert.match(cialo, /opponentLifeEffectValue\(/,
    `wpis tabeli musi delegować do wspólnej skali życia: ${cialo.trim()}`);
  assert.match(args, /view/, 'skala życia potrzebuje widoku (życie przeciwnika)');
  assert.ok(!/\b\d+\b/.test(cialo.replace(/opponentLifeEffectValue\([^)]*\)/g, '')),
    `wpis nie może mieć własnej stałej liczbowej: ${cialo.trim()}`);
  // Wspólna skala musi być JEDYNĄ definicją (cztery ścieżki + tabela = pięć użyć).
  assert.equal(zrodlo.match(/const opponentLifeEffectValue = /g)?.length ?? 0, 1, 'jedna definicja skali');
  assert.ok((zrodlo.match(/opponentLifeEffectValue\(view, e/g) ?? []).length >= 5,
    'tabela ETB/payoff dołączyła do wspólnych użyć skali');
});

// ---------------------------------------------------------------------------
// F-90/2 (fala B) — craft bez wyceny. Pomiar PRZED: `activate_ability(saw#1)` =
// −2,00 z materiałem na polu (Angel's Feather) i w grobie (Cloak of the Bat),
// czyli 0 za skutek minus koszt many — bot NIGDY nie craftował, choć tył DFC to
// Vehicle 5/5 z dwiema zdolnościami, a animację tego samego pojazdu bot wycenia
// na +10 (okno ataku) / +13 (okno obrony). Jedyny ślad `craft_transform` w
// heuristic-bot.js to wpis w zbiorze efektów KUMULUJĄCYCH (żadnej wyceny), więc
// pętla efektów aktywacji kończyła na `default` (L50: „akcja bez wyceny").
// Poprawne dziś (kotwice): brak oferty bez drugiego artefaktu i przy manie 2.
// ---------------------------------------------------------------------------

/** Oferta craft w decyzji bota (etykieta `activate_ability(<id>#1)`). */
const craftScore = (d, id = 'saw') => (d.opcje ?? []).find((o) => String(o.cmd).startsWith(`activate_ability(${id}#1`));

test('PMSSB-90/F-90-2a: craft z materiałem na polu jest wyceniony dodatnio i bot go WYBIERA', () => {
  const { state, wariant } = budowa('SS-03', 0);
  const d = decyzja(state, 'p1');
  const oferta = craftScore(d);
  assert.ok(oferta, `${wariant}: brak oferty craft wśród ${(d.opcje ?? []).map((o) => o.cmd).join(' | ')}`);
  assert.ok(oferta.score > 0, `${wariant}: craft z materiałem musi być warty więcej niż 0 (pomiar PRZED: −2,00)`);
  assert.equal(d.cmd.type, 'activate_ability', `${wariant}: bot gra craft, a nie pasuje`);
});

test('PMSSB-90/F-90-2b: craft z materiałem w GROBIE jest wyceniony tak samo (CR 702.167a: artefakt z pola albo karta z grobu)', () => {
  const { state, wariant } = budowa('SS-03', 1);
  const d = decyzja(state, 'p1');
  const oferta = craftScore(d);
  assert.ok(oferta, `${wariant}: brak oferty craft`);
  assert.ok(oferta.score > 0, `${wariant}: materiał w grobie też umożliwia craft (pomiar PRZED: −2,00)`);
});

test('PMSSB-90/F-90-2c: KOTWICA — bez drugiego artefaktu i przy manie 2 oferty craft NIE MA', () => {
  for (const i of [2, 3]) {
    const { state, wariant } = budowa('SS-03', i);
    const d = decyzja(state, 'p1');
    assert.equal(craftScore(d), undefined, `${wariant}: oferta craft nie może istnieć (silnik jej nie daje)`);
    assert.notEqual(d.cmd?.type, 'activate_ability', `${wariant}: bot nie próbuje craftować bez materiału/many`);
  }
});

test('PMSSB-90/F-90-2d: wartość craftu płaci za WYGNANY materiał (drogi artefakt = mniejszy zysk)', () => {
  // `resolve_craft_exile` wybiera NAJSŁABSZY artefakt (`finish(40 − value)`), więc
  // wycena craftu musi odejmować ten sam materiał: śmieć (Angel's Feather, koszt 2)
  // zostawia więcej niż cenny sprzęt (Warrior's Sword, koszt 4).
  const budowaZ = (material) => stan({
    krok: 'main1',
    mana: { p1: 8 },
    pole: [
      { id: 'saw', karta: 'spring-loaded-sawblades', gracz: 'p1' },
      { id: 'material', karta: material, gracz: 'p1' },
    ],
  });
  const smieć = craftScore(decyzja(budowaZ('angels-feather'), 'p1'))?.score;
  const drogi = craftScore(decyzja(budowaZ('warriors-sword'), 'p1'))?.score;
  assert.ok(typeof smieć === 'number' && typeof drogi === 'number', `brak ofert: ${smieć} / ${drogi}`);
  assert.ok(smieć > drogi, `materiał musi być kosztem: śmieć ${smieć} vs Warrior's Sword ${drogi}`);
});

test('PMSSB-90/F-90-2e: STRAŻNIK L41 — `craft_transform` ma wycenę, nie tylko wpis w zbiorze efektów kumulujących', () => {
  const zrodlo = fs.readFileSync(new URL('../src/controllers/heuristic-bot.js', import.meta.url), 'utf8');
  const wystapienia = (zrodlo.match(/'craft_transform'/g) ?? []).length;
  assert.ok(wystapienia >= 2, `oczekiwane ≥2 wystąpienia typu (zbiór kumulujący + wycena), jest ${wystapienia}`);
  assert.match(zrodlo, /effect\.type === 'craft_transform'/, 'pętla efektów aktywacji musi rozpoznawać craft');
  assert.match(zrodlo, /function craftTransformValue\(/, 'wycena craft ma jedną nazwaną funkcję (L41)');
});
