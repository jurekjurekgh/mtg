// PMSSB-63 (batch 68) — audyt pozostałych rodzin batcha 68 (bez zmiany wyceny).
// Pomiar: tools/pmssb63-batch68-audyt-sonda.mjs. Każda rodzina ma tu PIN DECYZJI (dobry gracz
// by zrobił to samo) i, gdzie to coś wyjaśnia, pomiar składowych.
// OTWARTE (osobna sesja, nie pinowane jako poprawne): lifelink/latanie/deathtouch na stworzeniu z ręki
// (wycena rzutu identyczna bez względu na słowa kluczowe, 64.80) i prowess Bloodfire (zdolność
// wyzwalana nie jest wyceniana w rzucie, 67.05 bez i z nią).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUDYT_SCENARIOS, runAudyt, buildAudyt, decideWith, bestOf } from '../tools/pmssb63-batch68-audyt-sonda.mjs';

const sc = (prefix) => AUDYT_SCENARIOS.find((s) => s.id.startsWith(prefix));

// ---- Stymied Hopes (THS 64): kontra „unless pays {1}” — przeciwnik ma czym zapłacić → nie kontruj.
test('PMSSB-63/Stymied-1 ciężki czar wroga, wróg bez many: kontra (płacić nie może)', () => {
  assert.equal(runAudyt(sc('STY1')).ok, true);
});
test('PMSSB-63/Stymied-2 ten sam czar, wróg ma 2 many: pass (zapłaci {1}, kontra nic nie da)', () => {
  assert.equal(runAudyt(sc('STY2')).ok, true);
});
test('PMSSB-63/Stymied-3 tani 2-drop wroga: pass (dwie many za trzymanie 2-drop to przegrana wymiana)', () => {
  assert.equal(runAudyt(sc('STY3')).ok, true);
});

// ---- Neurok Invisimancer (SOM 37): ETB „cel nie do blokowania” przy samych wrogach = 0 (nie dajemy wrogowi nieblokowalnego atakującego).
test('PMSSB-63/Neurok-1 wróg 3/3 na stole: rzut (ewazja przeciw blokerom wroga ma wartość)', () => {
  assert.equal(runAudyt(sc('NEU1')).ok, true);
});
test('PMSSB-63/Neurok-2 pusty stół: rzut (2/1 nie do blokowania, zadaje 2 w turę)', () => {
  assert.equal(runAudyt(sc('NEU2')).ok, true);
});
test('PMSSB-63/Neurok-pin ETB nie wybiera wrogiego stwora: evasionEtbValueWeight ×0 nie zmienia wyniku przy samych wrogach', () => {
  const st = buildAudyt(sc('NEU1'));
  const a = bestOf(decideWith(st).bot, 'cast_permanent(neu');
  const st2 = buildAudyt(sc('NEU1'));
  const b = bestOf(decideWith(st2, { evasionEtbValueWeight: 0 }).bot, 'cast_permanent(neu');
  assert.ok(Math.abs(a - b) < 0.01, `ETB z wrogiem = 0 (a=${a}, b=${b})`);
});

// ---- Meteorite (DMU 235): ETB 2 obrażeń + kamień many. Kill 2/1 = +9 nad pustym stołem.
test('PMSSB-63/Meteorite-1 wróg 2/1 na stole: rzut (ETB zabija, kamień many)', () => {
  assert.equal(runAudyt(sc('MET1')).ok, true);
});
test('PMSSB-63/Meteorite-2 pusty stół: rzut (kamień many i 2 w twarz; ETB bez celu stworowego to 0 — akceptacja)', () => {
  assert.equal(runAudyt(sc('MET2')).ok, true);
});

// ---- Child of Night (M19 89): 2-drop z lifelinkiem. Decyzja OK; wartość lifelinka = OTWARTE (patrz nagłówek).
test('PMSSB-63/Child-1 pusty stół, 2 many: rzut 2-dropa', () => {
  assert.equal(runAudyt(sc('CON1')).ok, true);
});

// ---- Bloodfire Expert (KTK 101): 3-drop prowess. Decyzja OK; wartość prowess = OTWARTE (patrz nagłówek).
test('PMSSB-63/Bloodfire-1 pusty stół: rzut 3-dropa', () => {
  assert.equal(runAudyt(sc('BLF1')).ok, true);
});
test('PMSSB-63/Bloodfire-2 wróg 2/2 na stole: rzut 3-dropa', () => {
  assert.equal(runAudyt(sc('BLF2')).ok, true);
});

// ---- Halo Scarab (SNC 239): bankowanie many w Skarb z cmentarza — reguła właściciela M243/C (zachowana).
test('PMSSB-63/Halo-1 Scarab w ręce, pusty stół: rzut 2-dropa na planszę', () => {
  assert.equal(runAudyt(sc('HAL1')).ok, true);
});
test('PMSSB-63/Halo-2 Scarab w cmentarzu, nic innego w ręce: NIE bankuje many (M243/C)', () => {
  assert.equal(runAudyt(sc('HAL2')).ok, true);
});
