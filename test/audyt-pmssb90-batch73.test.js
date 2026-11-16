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
import { SCENARIUSZE, stan, decyzja, pomiarPrzed } from '../tools/pmssb90-batch73-petla-sonda.mjs';

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

// ---------------------------------------------------------------------------
// F-90/3 (fala B) — warunek celu ETB nie był wyceniany. Spring-Loaded Sawblades:
// „gdy wchodzi, zadaj 5 obrażeń CELowanemu TAPNIĘTEMU stworowi, który kontroluje
// przeciwnik". Pomiar PRZED: SS-04 = 77,40 we WSZYSTKICH czterech wariantach —
// wróg odkręcony 3/3 (trigger NIE MA celu i fizzluje), tapnięty 3/3, tapnięty 7/7
// i tapnięty 1/1 obok odkręconego 6/7; SS-02 = 77,40 we własnym main1 (wróg
// odkręcony) i tyle samo w turze rywala po jego ataku. Pusty stół wroga 60,30,
// więc dopłata za „jakiegokolwiek wroga" wynosiła 17,10, a za „tapniętego" i za
// jakość celu — 0. Root cause: `etbEnemyHasTarget` dla specy celów zależnych od
// STANU PUBLICZNEGO spadał do `foes.length > 0`, a `publicEtbTargets` w ogóle nie
// znał typu `tapped_creature` ani flagi `opponentControls`.
// ---------------------------------------------------------------------------

const castScore = (d, podciag = 'cast_permanent(ss-hand') => scoreAlternatywy(d, podciag);

test('PMSSB-90/F-90-3a: bez TAPNIĘTEGO stwora wroga ETB nie dostaje premii (trigger fizzluje)', () => {
  const odkrecony = decyzja(budowa('SS-04', 0).state, 'p1'); // wróg ma tylko odkręconego 3/3
  const tapniety = decyzja(budowa('SS-04', 1).state, 'p1'); // wróg ma tapniętego 3/3
  const sOdk = castScore(odkrecony);
  const sTap = castScore(tapniety);
  assert.ok(sTap - sOdk >= 10,
    `legalny cel ETB musi być warty więcej niż jego brak: tapnięty ${sTap} vs odkręcony ${sOdk} (Δ ${(sTap - sOdk).toFixed(2)})`);
  assert.ok(sOdk < 65,
    `bez legalnego celu karta jest gołym artefaktem za {1}{W} (pusty stół wroga = 60,30), a nie ${sOdk}`);
});

test('PMSSB-90/F-90-3b: flash na turę rywala jest warte więcej, gdy jego stwory są tapnięte po ataku', () => {
  // SS-02: ta sama karta, ten sam wróg 3/3 — różni się TYLKO tapnięciem i oknem.
  const naszaTura = castScore(decyzja(budowa('SS-02', 0).state, 'p1')); // wróg odkręcony
  const poAtaku = castScore(decyzja(budowa('SS-02', 1).state, 'p1')); // declare_blockers rywala, wróg tapnięty
  assert.ok(poAtaku > naszaTura + 10,
    `okno z tapniętym celem musi być lepsze: tura rywala ${poAtaku} vs nasza ${naszaTura}`);
});

test('PMSSB-90/F-90-3c: `opponentControls` — mój własny tapnięty stwór NIE jest legalnym celem ETB', () => {
  // Porównanie izoluje SAMĄ flagę: ten sam kształt stołu (mój 3/3), różnica tylko w
  // tapnięciu — oraz kontrast z wrogim tapniętym stworem (cel legalny).
  const buduj = ({ tap, gracz, wrog }) => stan({
    krok: 'main1', mana: { p1: 4 },
    reka: [{ id: 'ss-hand', karta: 'spring-loaded-sawblades' }],
    pole: [
      { id: 'nasz', karta: 'burning-yard-trainer', gracz, tap },
      ...(wrog ? [{ id: 'wrog-tap', karta: 'soulmender', gracz: 'p2', tap: true }] : []),
    ],
  });
  const mojTapniety = castScore(decyzja(buduj({ tap: true, gracz: 'p1' }), 'p1'));
  const mojOdkrecony = castScore(decyzja(buduj({ tap: false, gracz: 'p1' }), 'p1'));
  const wrogTapniety = castScore(decyzja(buduj({ tap: true, gracz: 'p1', wrog: true }), 'p1'));
  assert.ok(Math.abs(mojTapniety - mojOdkrecony) < 0.01,
    `tapnięcie WŁASNEGO stwora nie może tworzyć celu ETB: ${mojTapniety} vs ${mojOdkrecony}`);
  assert.ok(wrogTapniety - mojTapniety >= 10,
    `dopiero TAPNIĘTY STWÓR WROGA daje premię: ${wrogTapniety} vs ${mojTapniety}`);
  assert.ok(mojTapniety < 65, `bez wrogiego celu karta jest gołym artefaktem (60,30), nie ${mojTapniety}`);
});

test('PMSSB-90/F-90-3d: ANTY-OVER-FIX — premia za ETB jest płaska jak inne wpisy tabeli (destroy/exile/damage)', () => {
  // Granica modelu zapisana uczciwie: przy ISTNIEJĄCYM legalnym celu premia za ETB
  // jest stała (tapnięty 3/3 = tapnięty 7/7 = tapnięty 1/1) — tak samo jak wpisy
  // `destroy_permanent` (18) i `exile_target_creature` (20). Jakość celu wycenia
  // ścieżka WYBORU celu (pin 3e: 44 vs −80), nie premia za rzut. Pin pilnuje, żeby
  // naprawa warunku nie dodała drugiej skali jakości do tabeli ETB (M429).
  const scores = [1, 2, 3].map((i) => castScore(decyzja(budowa('SS-04', i).state, 'p1')));
  assert.deepEqual([scores[1], scores[2]], [scores[0], scores[0]],
    `tapnięty 3/3 / 7/7 / 1/1 muszą dawać tę samą premię za rzut: ${scores.join(', ')}`);
});

test('PMSSB-90/F-90-3e: KOTWICA — wybór CELU triggera rozróżnia lethal od chipu (44 vs −80)', () => {
  const [w] = pomiarPrzed({ scen: 'SS-01', przelot: true });
  const wybor = (w.przebieg ?? []).find((k) => String(k.cmd).startsWith('resolve_trigger_target'));
  assert.ok(wybor, `brak wyboru celu ETB w przebiegu: ${(w.przebieg ?? []).map((k) => k.cmd).join(' | ')}`);
  const opcje = wybor.scoreOpcji.map(Number);
  assert.equal(opcje.length, 2, 'dwa tapnięte cele = dwie gałęzie');
  assert.ok(opcje[0] > 0 && opcje[1] < -60 && opcje[0] - opcje[1] > 100,
    `5 obrażeń na tapniętego 3/3 (zabija) musi dominować nad 7/7 (chip): ${wybor.scoreOpcji.join(' vs ')}`);
  assert.match(wybor.cmd, /tap-3-3/, 'bot wybiera cel, który 5 obrażeń zabija');
});

test('PMSSB-90/F-90-3f: STRAŻNIK L41 — jedna lista legalnych celów ETB zna stan publiczny (tap/kontrola)', () => {
  const zrodlo = fs.readFileSync(new URL('../src/controllers/heuristic-bot.js', import.meta.url), 'utf8');
  const predykat = zrodlo.slice(zrodlo.indexOf('function publicEtbTargets('), zrodlo.indexOf('function battleDefenseValue('));
  assert.ok(predykat.length > 200, 'nie znaleziono `publicEtbTargets`');
  assert.match(predykat, /'tapped_creature'/, 'predykat celów musi znać typ `tapped_creature`');
  assert.match(predykat, /object\.tapped/, 'typ `tapped_creature` wymaga sprawdzenia tapnięcia');
  assert.match(predykat, /spec\.opponentControls/, 'flaga `opponentControls` musi być honorowana');
  const bramka = zrodlo.slice(zrodlo.indexOf('const etbEnemyHasTarget = '), zrodlo.indexOf('const THIS_TURN_STATE_TARGET_SPECS'));
  assert.match(bramka, /publicEtbTargets\(/,
    'bramka ETB musi pytać TĘ SAMĄ listę celów, co ścieżka wyboru celu (L41), nie `foes.length > 0`');
});

// ---------------------------------------------------------------------------
// F-90/4 (fala B) — Threshold „all creatures able to block enchanted creature
// block it" (Seton's Desire, artId 648) nie miał ŻADNEJ wyceny: w
// heuristic-bot.js nie istniały ani typ efektu `must_block_enchanted`, ani klucz
// warunku `minGraveyardCards`, choć silnik wymóg egzekwuje (permanents.js:468 —
// warunek ciągły, combat.js:373 `mustBlockHostCounts` przy deklaracji bloków).
// Pomiar PRZED: SD-01 = 72,00 przy grobie 6 / 7 / 9 kart (próg nic nie dodaje);
// SD-02 pusty stół wroga 72,00 = stół z blokerami; SD-05 host z drugim
// atakującym 75,60 = host bez niego i = wariant z wrogim 2/1 BEZ reach (nie ma
// czego ściągać z lotnika).
// ---------------------------------------------------------------------------

const sdScore = (d, host = 'nasz-3-2') => scoreAlternatywy(d, `cast_permanent(sd-hand->${host}`);

test('PMSSB-90/F-90-4a: próg Threshold (7+ kart we własnym grobie) jest schodkiem, nie ciągłą skalą', () => {
  const [ponizej, prog, powyzej] = [0, 1, 2].map((i) => sdScore(decyzja(budowa('SD-01', i).state, 'p1')));
  assert.ok(prog - ponizej >= 5, `spełniony próg musi dodawać wartość wymogu bloku: ${prog} vs ${ponizej}`);
  assert.equal(powyzej, prog, '9 kart = 7 kart (próg, nie skala „im więcej grobu, tym lepiej")');
  assert.equal(ponizej, 72.0, 'KOTWICA M429: poniżej progu aura jest warta tyle, co przed naprawą (samo +2/+2)');
});

test('PMSSB-90/F-90-4b: wymóg bloku jest wart coś tylko wtedy, gdy rywal MA czym blokować (CR 509.1c)', () => {
  const zBlokerami = sdScore(decyzja(budowa('SD-02', 0).state, 'p1'), 'host');
  const pustyWrog = sdScore(decyzja(budowa('SD-02', 2).state, 'p1'), 'host');
  assert.ok(zBlokerami - pustyWrog >= 5,
    `wrogowie zdolni blokować muszą podnosić wartość aury: ${zBlokerami} vs pusty stół ${pustyWrog}`);
});

test('PMSSB-90/F-90-4c: ściągnięcie jedynego reach-blokera na hosta odsłania MOJEGO lotnika', () => {
  // SD-05: (0) host 3/2 + mój lotnik 4/4, u wroga 2/2 REACH — musi blokować hosta,
  // więc lotnik idzie nieblokowany; (2) ten sam układ, ale wrogi 2/1 BEZ reach —
  // lotnika i tak nigdy nie blokował, więc wymóg niczego nie odsłania.
  const zLotnikiem = sdScore(decyzja(budowa('SD-05', 0).state, 'p1'), 'host');
  const bezDrugiego = sdScore(decyzja(budowa('SD-05', 1).state, 'p1'), 'host');
  const bezReach = sdScore(decyzja(budowa('SD-05', 2).state, 'p1'), 'host');
  assert.ok(zLotnikiem > bezReach,
    `wymóg bloku musi być warty więcej, gdy odsłania innego atakującego: ${zLotnikiem} vs ${bezReach}`);
  assert.ok(zLotnikiem > bezDrugiego, `drugi atakujący podnosi wartość wymogu: ${zLotnikiem} vs ${bezDrugiego}`);
});

test('PMSSB-90/F-90-4d: host aury — największe ciało z ewazją, nie drobiazg (ten sam wymóg bloku)', () => {
  const d = decyzja(budowa('SD-04', 0).state, 'p1'); // mam 1/1, 3/2 i 4/4 flying; u wroga 2/2 reach
  const drobiazg = sdScore(d, 'nasz-0');
  const lotnik = sdScore(d, 'nasz-2');
  assert.ok(lotnik > drobiazg, `4/4 z lataniem → 6/6 musi być lepszym hostem niż 1/1 → 3/3: ${lotnik} vs ${drobiazg}`);
  assert.match(d.cmd.targetId ?? d.cmd.targets?.[0] ?? '', /nasz-2/, 'bot zakłada aurę na lotnika');
});

test('PMSSB-90/F-90-4f: „YOUR graveyard" (CR 109.5) — grób przeciwnika nie spełnia mojego progu', () => {
  // Mutacja kontrolna mJ3 (liczenie wszystkich obiektów w grobie bez filtra
  // właściciela i bez wykluczenia tokenów) PRZEŻYŁA pierwszy zestaw pinów: scenariusze
  // SD mają pusty grób wroga, więc filtr nic nie zmieniał. Ten pin buduje stan, w
  // którym to rozróżnienie jest jedyną różnicą — grób WROGA ma 9 kart, mój 3.
  const karty = ['plummet', 'basic-forest', 'leonin-lightbringer', 'setons-desire',
    'spring-loaded-sawblades', 'get-the-point', 'necrosavant', 'messengers-speed', 'might-beyond-reason'];
  const state = stan({
    krok: 'main1',
    mana: { p1: 6 },
    reka: [{ id: 'sd-hand', karta: 'setons-desire' }],
    pole: [
      { id: 'nasz-3-2', karta: 'leonin-lightbringer', gracz: 'p1' },
      { id: 'bloker-1', karta: 'leafcrown-dryad', gracz: 'p2' },
      { id: 'bloker-2', karta: 'soulmender', gracz: 'p2' },
    ],
    grob: [
      ...karty.slice(0, 3).map((karta, i) => ({ id: `moj-${i}`, karta, gracz: 'p1' })),
      ...karty.slice(0, 9).map((karta, i) => ({ id: `wrogi-${i}`, karta, gracz: 'p2' })),
    ],
  });
  const score = sdScore(decyzja(state, 'p1'));
  assert.equal(score, 72.0, '9 kart w grobie WROGA i 3 w moim = próg NIESPEŁNIONY (samo +2/+2)');
});

test('PMSSB-90/F-90-4e: STRAŻNIK L41 — wymóg bloku i próg Threshold mają po jednej regule w bocie', () => {
  const zrodlo = fs.readFileSync(new URL('../src/controllers/heuristic-bot.js', import.meta.url), 'utf8');
  assert.match(zrodlo, /'must_block_enchanted'/, 'typ efektu musi być rozpoznany w wycenie');
  assert.match(zrodlo, /function mustBlockEnchantedValue\(/, 'jedna nazwana funkcja wyceny wymogu bloku');
  assert.match(zrodlo, /minGraveyardCards/, 'klucz warunku Threshold musi być czytany z widoku');
  assert.equal(zrodlo.match(/function myGraveyardCardCount|const myGraveyardCardCount/g)?.length ?? 0, 1,
    'jedna reguła liczenia KART we własnym grobie (CR 108.2b: tokeny nie są kartami)');
  const cialo = zrodlo.slice(zrodlo.indexOf('function mustBlockEnchantedValue('), zrodlo.indexOf('function auraStaticAbilityValue('));
  assert.match(cialo, /attackerCanBeBlocked\(/, 'zdolność do blokowania liczy ten sam predykat co reszta bota');
  assert.match(cialo, /cantBlockRemovalValue\(/, 'ściągnięcie blokera liczy ta sama miara co „cel nie może blokować"');
});

// ---------------------------------------------------------------------------
// F-90/5 (fala B) — explore: wybór „wierzch biblioteki czy grób" był PŁASKI
// (`finish(cmd.putInGraveyard ? 10 : 40)`), więc bot ZAWSZE odkładał na wierzch.
// Pomiar PRZED: RG-02 A/B/C = 40 (wierzch) / 10 (grób) także wtedy, gdy
// zmielenie jednej karty dopełnia delirium (4+ typy, CR 207.2c) albo próg
// Threshold (7+ kart) — czyli w stanie, w którym grób jest realnym paliwem;
// RG-01 = 40/10 dla Plummeta, którego ręka potrzebuje, i dla zbędnej drugiej
// kopii River Herald Guide. Kontrola dodatnia: scry (GT-04) model karty ZNA
// (ląd 20/−10, drugi Get the Point 23/20, Guide 20/11) — explore i surveil to
// TA SAMA decyzja (CR 701.44a vs CR 701.25), więc należy im się ta sama skala.
// ---------------------------------------------------------------------------

/** Wybór explore z przebiegu scenariusza (sonda rozlicza stos decyzjami bota). */
function wyborExplore(id, indeks) {
  const [w] = pomiarPrzed({ scen: id, przelot: true }).filter((x) => x.wariant === scenariusz(id).warianty[indeks].opis);
  assert.ok(w, `brak wariantu ${indeks} scenariusza ${id} w pomiarze`);
  const krok = (w.przebieg ?? []).find((k) => String(k.cmd).startsWith('resolve_explore_choice'));
  assert.ok(krok, `brak decyzji explore w przebiegu ${id}/${indeks}: ${(w.przebieg ?? []).map((k) => k.cmd).join(' | ')}`);
  return { milled: krok.cmd.includes('putInGraveyard:true'), score: krok.score, opcje: krok.scoreOpcji ?? [] };
}

test('PMSSB-90/F-90-5a: ANTY-OVER-FIX — użyteczna karta NIE idzie do grobu (RG-02 A/B)', () => {
  // REZYDUALNE ZNALEZISKO F-90/5b (udokumentowane w raporcie PMSSB-90, nie naprawione
  // w tej pętli): `graveyardReadingCardsInHand` zna delve i reanimację, ale NIE zna
  // warunków czytających grób po liczbie kart/typach (Threshold `minGraveyardCards`,
  // delirium CR 207.2c), więc dopełnienie progu jedną zmieloną kartą nie podnosi
  // wartości mielenia. W RG-02 A (Angel's Feather → 4. typ i 7. karta, w ręce Seton's
  // Desire) bot zostawia kartę na wierzchu. Ten pin ZAMRAŻA tamtą decyzję, żeby
  // naprawa jakości karty nie zaczęła millować kart, które realnie chcemy dobrać —
  // a przyszła naprawa F-90/5b musi go świadomie przepiąć (jak re-piny PMSSB-67/F2).
  const a = wyborExplore('RG-02', 0);
  const b = wyborExplore('RG-02', 1);
  assert.equal(a.milled, false, `Angel's Feather (artefakt za 2, w zasięgu many) zostaje: ${a.opcje.join(' | ')}`);
  assert.equal(b.milled, false, `Plummet (instant za 2, w zasięgu many) zostaje: ${b.opcje.join(' | ')}`);
});

test('PMSSB-90/F-90-5b: przy spełnionych progach użyteczna karta ZOSTAJE na wierzchu (RG-02 C)', () => {
  const c = wyborExplore('RG-02', 2); // grób 5 typów/12 kart — mill niczego nie dopełnia
  assert.equal(c.milled, false, `bez wartości progowej nie mielimy karty, którą chcemy dobrać: ${JSON.stringify(c)}`);
});

test('PMSSB-90/F-90-5c: jakość karty decyduje — martwa karta idzie do grobu, potrzebna zostaje', () => {
  // RG-05 (scenariusz dodany przy naprawie): ten sam stan, różni się TYLKO
  // odsłoniętą kartą. Marut 7/7 za 8 przy braku lądów na stole to dobro poza
  // zasięgiem many (`cardKeepValue` = −3 — „poza zasięgiem, chętnie oddamy"),
  // Plummet za 2 jest w zasięgu. Grób 4 karty / 3 typy i pusta ręka po rzucie,
  // więc żaden próg delirium/Threshold nie wchodzi w grę — mierzymy SAMĄ jakość.
  const marut = wyborExplore('RG-05', 0);
  const plummet = wyborExplore('RG-05', 1);
  assert.equal(marut.milled, true, `martwa karta musi iść do grobu: ${marut.opcje.join(' | ')}`);
  assert.equal(plummet.milled, false, `karta w zasięgu many zostaje na wierzchu: ${plummet.opcje.join(' | ')}`);
});

test('PMSSB-90/F-90-5d: STRAŻNIK L41 — explore, surveil i clash mają jedną skalę wartości karty', () => {
  const zrodlo = fs.readFileSync(new URL('../src/controllers/heuristic-bot.js', import.meta.url), 'utf8');
  const start = zrodlo.indexOf("case 'resolve_explore_choice': {");
  const koniec = zrodlo.indexOf("case 'resolve_craft_exile': {");
  assert.ok(start > 0 && koniec > start, 'nie znaleziono gałęzi explore');
  const galez = zrodlo.slice(start, koniec);
  assert.match(galez, /cardKeepValue\(/, 'explore musi wyceniać odsłoniętą kartę tą samą miarą co scry/surveil/clash');
  assert.match(galez, /graveyardReadingCardsInHand\(/, 'paliwo grobu liczy ten sam predykat co surveil');
  assert.match(galez, /drawDeckingPenalty\(/, 'presja deck-outu (CR 121.4) wspólna z surveil');
  assert.ok(!/finish\(cmd\.putInGraveyard \? 10 : 40\)/.test(galez), 'płaska stała 40/10 musi zniknąć');
});

test('PMSSB-90/F-90-5e: presja deck-outu (CR 121.4) obniża wartość mielenia przy krótkiej bibliotece', () => {
  // RG-06: ten sam stan co RG-05 (wariant Plummet) poza rozmiarem biblioteki, więc
  // mierzy WYŁĄCZNIE człon deck-outu (`drawDeckingPenalty`, wspólny z surveil —
  // mielona karta to dobranie, którego już nie będzie). Porównanie odpornościowe na
  // kolejność gałęzi: gałąź „zostaw na wierzchu" to punkt odniesienia (20), a gałąź
  // „miel" jest w obu stanach niższa.
  const liczby = (w) => w.opcje.map((o) => Number(o)).sort((a, b) => a - b);
  const krotka = wyborExplore('RG-06', 0); // biblioteka 3 karty
  const zdrowa = wyborExplore('RG-06', 1); // biblioteka 20 kart
  const [millKrotka, keepKrotka] = liczby(krotka);
  const [millZdrowa, keepZdrowa] = liczby(zdrowa);
  assert.equal(keepKrotka, keepZdrowa, 'punkt odniesienia (karta zostaje) nie zależy od biblioteki');
  assert.ok(millKrotka < millZdrowa - 1,
    `mielenie przy bibliotece 3 musi być tańsze niż przy 20: ${millKrotka} vs ${millZdrowa}`);
  assert.equal(krotka.milled, false, 'przy krótkiej bibliotece karta w zasięgu many zostaje na wierzchu');
  assert.equal(zdrowa.milled, false, 'przy zdrowej bibliotece też (kotwica RG-05)');
});

// ---------------------------------------------------------------------------
// F-90/7 + F-90/8 (fala C) — wycena EQUIPU (`equipValuation`, jedna dla obu
// gałęzi `activate_ability`). Pomiar PRZED: Greatsword of Tyr (cała treść siedzi
// w triggerze „whenever equipped creature attacks, put a +1/+1 counter on it and
// tap up to one target creature defending player controls") dawał −11,00 dla
// KAŻDEGO hosta — Leonina 3/2 (który z własnej statyki `condition.equipped`
// dostaje dodatkowe +1/+1), Highland Game 2/1 i Illusory Demona 4/3 — więc bot
// NIGDY go nie zakładał (`nothingAdded` → kara −12). Ten sam trigger jest
// wyceniany przy RZUCIE sprzętu (`anticipatedTailValue`, likelihood 0.5 dla
// `equipped_creature_attacks`) — dwie skale dla jednej informacji (L41).
// Dodatkowo Brawler's Plate: pierwsze założenie 20,00 (Leonin) / 18,00
// (Highland), a PRZENIESIENIE tego samego Plate z Highland Game na Leonina
// = −8,00, choć Leonin wyciska z niego więcej (F-90/7: rozjazd gałęzi).
// ---------------------------------------------------------------------------

/** Score oferty equipu z decyzji bota: `activate_ability(<sprzęt>#<indeks>-><host>)`. */
const equipScore = (id, indeks, podciag) => scoreAlternatywy(decyzja(budowa(id, indeks).state, 'p1'), podciag);

test('PMSSB-90/F-90-8a: sprzęt, którego treść siedzi w triggerze, jest wart założenia (nie kara „nic nie dodaje")', () => {
  const s = equipScore('LL-05', 0, 'activate_ability(sprzet#1->leonin)');
  assert.ok(s > 0,
    `Greatsword (+1/+1 co atak i tapnięcie blokera) musi bić pass (0,00), pomiar PRZED: −11,00 → ${s}`);
});

test('PMSSB-90/F-90-8b: ten sam sprzęt rozróżnia hosta — Leonin (+1/+1 dopóki wyposażony) > Highland Game', () => {
  const leonin = equipScore('LL-05', 0, 'activate_ability(sprzet#1->leonin)');
  const maly = equipScore('LL-05', 0, 'activate_ability(sprzet#1->maly)');
  assert.ok(leonin > maly,
    `host z własną statyką condition.equipped wyciska więcej z tego samego sprzętu: ${leonin} vs ${maly}`);
});

test('PMSSB-90/F-90-7a: przeniesienie sprzętu na hosta, który wyciska więcej, nie jest karane jak ruch w próżnię', () => {
  const przeniesienie = equipScore('LL-05', 3, 'activate_ability(sprzet#0->leonin)'); // Plate z Highland Game
  const pierwsze = equipScore('LL-05', 2, 'activate_ability(sprzet#0->leonin)'); // Plate niezałożony
  assert.ok(przeniesienie > 0, `przeniesienie na lepszego hosta musi bić pass, pomiar PRZED: −8,00 → ${przeniesienie}`);
  assert.ok(przeniesienie < pierwsze,
    `przeniesienie jest warte mniej niż pierwsze założenie (stary host traci pompę): ${przeniesienie} vs ${pierwsze}`);
});

test('PMSSB-90/F-90-7b: przeniesienie sprzętu z triggerem na lepszego hosta też przechodzi (M288/C, nie reguła większej mocy)', () => {
  const s = equipScore('LL-05', 1, 'activate_ability(sprzet#1->leonin)'); // Greatsword z Highland Game
  assert.ok(s > 0, `przeniesienie Greatsworda na Leonina musi bić pass: ${s}`);
});

test('PMSSB-90/F-90-8c: ANTY-OVER-FIX — trigger ataku jest martwy na hoście, który legalnie nie atakuje (M244/F)', () => {
  // LL-06 izoluje JEDNĄ zmienną: host 3/2 z defenderem (Wishful Merfolk) kontra
  // Leonin 3/2. Greatsword odpala się wyłącznie przy ataku nosiciela, więc na
  // defenderze to martwy tekst i equip musi przegrać z passem — inaczej naprawa
  // F-90/8 byłaby bonusem z sufitu (M429).
  const defender = equipScore('LL-06', 0, 'activate_ability(sprzet#1->host)');
  const leonin = equipScore('LL-06', 1, 'activate_ability(sprzet#1->host)');
  assert.ok(defender < 0, `trigger ataku na defenderze jest martwy: ${defender} musi być poniżej pass (0,00)`);
  assert.ok(leonin > defender, `ten sam sprzęt na ciele, które atakuje, jest wart więcej: ${leonin} vs ${defender}`);
});

test('PMSSB-90/F-90-8d: STRAŻNIK L41 — wycena equipu czyta treść triggerów sprzętu i statykę hosta z jednego źródła', () => {
  const src = fs.readFileSync('src/controllers/heuristic-bot.js', 'utf8');
  const start = src.indexOf('const ATTACK_GATED_EQUIP_EVENTS');
  assert.ok(start > 0, 'bramka triggerów ataku istnieje');
  const cialo = src.slice(start, start + 12000);
  assert.ok(cialo.includes('function equipValuation(view, source, creature)'),
    'helpery muszą siedzieć przy wycenie equipu (jedno źródło, nie osobny model)');
  for (const wyrazenie of ['equippedStaticPumpOf(', 'equipTriggerTailValue(']) {
    assert.ok(cialo.includes(wyrazenie),
      `wycena equipu musi znać ${wyrazenie}… — inaczej treść karty jest niewidzialna (F-90/8)`);
  }
  assert.ok(cialo.includes('tailValue'), 'tail sprzętu musi wchodzić do wartości i do bramki „nic nie dodaje"');
});

test('PMSSB-90/F-90-8e: treść triggera ma wartość, nie tylko brak kary — miecz rosnący > statyczna pompa', () => {
  // LL-07: ten sam host (Highland Game 2/1, bez własnej statyki `equipped`), więc
  // różnica może pochodzić WYŁĄCZNIE z treści sprzętu. Bez członu `tailValue`
  // w gałęzi pierwszego założenia miecz dawałby 14,00 (10 + 2×2) i przegrywał
  // z Plate 18,00 — czyli naprawa F-90/8 sprowadziłaby się do zdjęcia kary −12,
  // a treść karty wciąż nie byłaby liczona.
  const miecz = scoreAlternatywy(decyzja(budowa('LL-07', 0).state, 'p1'), '->host)');
  const plate = scoreAlternatywy(decyzja(budowa('LL-07', 1).state, 'p1'), '->host)');
  assert.ok(miecz > plate,
    `Greatsword (+1/+1 co atak, tapnięcie blokera) musi bić Brawlers Plate (+2/+2 trample): ${miecz} vs ${plate}`);
});

// ---------------------------------------------------------------------------
// F-90/11 (fala C) — grant POŚPIECHU (haste) w aurze był wyceniany płasko, bez
// pytania, czy nosiciel może go spożytkować. Pomiar PRZED (M-04, TEN SAM host
// Leafcrown Dryad 2/2 w pięciu stanach): 79,20 = 79,20 = 79,20 = 79,20 dla hosta
// odkręconego-gotowego, CHOREGO, tapniętego i tapniętego-chorego, a M-01 dawał
// main1 = main2 = 78,30 — czyli pośpiech był wart tyle samo w oknie ataku i po
// walce. Ścieżka EQUIPU tę bramkę już miała (`equipValuation.hasteAdds` =
// `freshGrants.includes('haste') && creature.summoningSickness === true` → +6,
// M243/D-G) — dwie ścieżki grantu tego samego słowa kluczowego, dwa modele (L41).
// ---------------------------------------------------------------------------

/** Score rzutu aury Messenger's Speed z decyzji bota (host jak w scenariuszu). */
const auraScore = (id, indeks) => scoreAlternatywy(decyzja(budowa(id, indeks).state, 'p1'), 'cast_permanent(ms-hand->');

test('PMSSB-90/F-90-11a: pośpiech jest warty więcej na hoście CHORYM — tylko tam odblokowuje atak', () => {
  const chory = auraScore('M-04', 1);
  const gotowy = auraScore('M-04', 0);
  assert.ok(chory > gotowy,
    `choroba = jedyny stan, w którym haste coś odblokowuje: ${chory} (chory) vs ${gotowy} (gotowy), pomiar PRZED 79,20 = 79,20`);
});

test('PMSSB-90/F-90-11b: pośpiech na hoście TAPNIĘTYM nie odblokowuje ataku (CR 508.1a — atakuje tylko odkręcony)', () => {
  const chory = auraScore('M-04', 1);
  const tapniety = auraScore('M-04', 2);
  const tapnietyChory = auraScore('M-04', 3);
  assert.ok(chory > tapniety, `gotowy do ataku chory > tapnięty: ${chory} vs ${tapniety}`);
  assert.equal(tapnietyChory, tapniety,
    `choroba na ciele tapniętym nic nie zmienia (atak i tak nielegalny): ${tapnietyChory} vs ${tapniety}`);
});

test('PMSSB-90/F-90-11c: ANTY-OVER-FIX — aura jest PERMANENTNA: host gotowy == tapnięty (trample odroczony, nie zmarnowany)', () => {
  // Granica modelu (udokumentowana decyzja w `auraKeywordValue`: aura zostaje na
  // polu, więc NIE podlega oknu walki jak granty-do-EOT — M179/A1 + M218/3, gdzie
  // „flying poza atakiem = −10"). Różnica między hostem gotowym a tapniętym to
  // okno TRAMPLE w tej jednej turze, nie wartość aury — pin pilnuje, żeby naprawa
  // F-90/11 nie wprowadziła drugiej kary okna (M429).
  assert.equal(auraScore('M-04', 0), auraScore('M-04', 2),
    'host gotowy i tapnięty dostają tę samą wartość aury permanentnej');
});

test('PMSSB-90/F-90-11d: ANTY-OVER-FIX — premia za pośpiech jest bramkowana ŚWIEŻOŚCIĄ grantu (M431)', () => {
  // Relic Robber 2/2 (takie samo ciało jak Leafcrown Dryad 2/2) pośpiech JUŻ ma,
  // więc grant się nadpisuje (warstwa 6: duplikat nic nie dodaje) i premia za
  // „użyteczny pośpiech" nie może się pojawić — inaczej F-90/11 płaciłoby za sam
  // tekst karty, nie za realny przyrost.
  const chory = auraScore('M-04', 1);
  const nadpisany = auraScore('M-04', 4);
  assert.ok(chory > nadpisany,
    `świeży pośpiech na chorym ciele > nadpisany pośpiech na tak samo chorym ciele 2/2: ${chory} vs ${nadpisany}`);
});

test('PMSSB-90/F-90-11e: timing — aura z pośpiechem jest warta więcej PRZED walką niż po niej (main1 > main2)', () => {
  const main1 = scoreAlternatywy(decyzja(budowa('M-01', 0).state, 'p1'), 'cast_permanent(ms-hand->');
  const main2 = scoreAlternatywy(decyzja(budowa('M-01', 4).state, 'p1'), 'cast_permanent(ms-hand->');
  assert.ok(main1 > main2,
    `w main2 pośpiech nie wypłaci się w tej turze, a choroba do kolejnej minie: ${main1} (main1) vs ${main2} (main2), pomiar PRZED 78,30 = 78,30`);
});

test('PMSSB-90/F-90-11f: STRAŻNIK L41 — ścieżka aury bramkuje pośpiech tak jak ścieżka equipu', () => {
  const src = fs.readFileSync('src/controllers/heuristic-bot.js', 'utf8');
  const start = src.indexOf('function auraKeywordValue(view, descriptor, host)');
  assert.ok(start > 0, 'wycena grantów słów kluczowych aury istnieje');
  const cialo = src.slice(start, src.indexOf('\n  }', start));
  assert.match(cialo, /swieze\.includes\('haste'\)/, 'pośpiech wyceniany osobno (nie tylko jako „świeży grant")');
  assert.match(cialo, /summoningSickness === true/, 'bramka choroby nosiciela — jak `equipValuation.hasteAdds`');
  assert.match(cialo, /precombat_main/, 'okno ataku musi być jeszcze przed nami (aura to sorcery — CR 307.1: tylko faza główna)');
});
