// PMSSB-90 — pętla RĘCZNEGO strojenia scoringu bota dla Batcha 73 (bez pełnego B0 i bez
// maszynowego tuningu wag). Piny RED→GREEN dla znalezisk z pomiaru PRZED; każde odnosi się
// do wiersza sekcji 8 planu `docs/plans/PLAN_2026-11-16-pmssb90-batch73-petla-reczna.md`
// i do scenariusza sondy `tools/pmssb90-batch73-petla-sonda.mjs` (pomiar i pin mierzą TEN
// SAM stan — jedno źródło, L41).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { SCENARIUSZE, decyzja } from '../tools/pmssb90-batch73-petla-sonda.mjs';

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
