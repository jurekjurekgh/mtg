// Strażnik klasowy: frazy Oracle ograniczające AKTYWACJĘ muszą istnieć jako
// deskryptory zdolności (audyt PR #185, F-4/F-9; klasy L21/L48, ADR 0002/0022).
//
// Batch 73 wpisał Necrosavanta („{3}{B}{B}, Sacrifice a creature: Return this
// card from your graveyard to the battlefield. Activate only during your
// upkeep.") BEZ żadnego deskryptora restrykcji czasu. Silnik przyjmował
// aktywację w fazie głównej i w kroku końcowym (`execute` z ok=true), a reguła
// istniała wyłącznie jako kara w heurystyce bota (`step !== 'upkeep' →
// finish(-100)`) — czyli człowiek, Żywy Tester i każdy inny kontroler mogli
// zrobić coś, czego Oracle zakazuje (CR 602.1b: tekst po dwukropku
// ograniczający czas aktywacji „functions at all times" i nie jest częścią
// efektu; CR 602.5: nie wolno zacząć aktywacji zabronionej).
//
// Ten plik przegląda `oracleText` WSZYSTKICH wpisów katalogu i wymaga, żeby
// każdej frazie restrykcji odpowiadał deskryptor. Dzięki temu nowa karta nie
// przejdzie z samym tekstem w `oracleText` (tekst jest dla ludzi — silnik czyta
// deskryptory), a reguła nie może osiąść w kontrolerze zamiast w rdzeniu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';

const registry = createCardRegistry();
const karty = [...registry.all()];
const aktywowane = (definition) => (definition.abilities ?? []).filter((a) => a.type === 'activated');
const tekst = (definition) => definition.oracleText ?? '';

/**
 * Karty bez własnych zdolności aktywowanych: fraza należy do zdolności NADANEJ
 * (token/reminder text) i jest pilnowana przy wpisie nosiciela. Pomiar:
 * jedyny taki wpis to Slithering Cryptid (fraza opisuje token Mutagen), a
 * `token_mutagen` ma `timing: 'sorcery'` — asercja w teście STRZ-5.
 */
const bezWlasnychAktywowanych = (definition) => aktywowane(definition).length === 0;

test('STRZ-1: „Activate only during your <krok>" → deskryptor onlyInStep albo forecast', () => {
  const naruszenia = [];
  for (const definition of karty) {
    const match = tekst(definition).match(/Activate (?:this ability )?only during your (\w+)/i);
    if (!match) continue;
    const krok = match[1].toLowerCase();
    if (bezWlasnychAktywowanych(definition)) continue;
    // Forecast (CR 702.57a) sam w sobie jest oknem „only during your upkeep and
    // only once each turn" — bramka kroku siedzi w abilities.js.
    const ok = aktywowane(definition).some((a) => a.onlyInStep === krok || (krok === 'upkeep' && a.forecast === true));
    if (!ok) naruszenia.push(`${definition.id}: „only during your ${krok}" bez onlyInStep/forecast`);
  }
  assert.deepEqual(naruszenia, [],
    'restrykcja kroku musi być deskryptorem — inaczej silnik aktywuje zdolność kiedykolwiek (F-4)');
});

test('STRZ-2: „Activate only as a sorcery" → timing sorcery (albo zdolność nadana)', () => {
  const naruszenia = [];
  for (const definition of karty) {
    if (!/Activate only as a sorcery/i.test(tekst(definition))) continue;
    if (bezWlasnychAktywowanych(definition)) continue;
    // Craft (CR 702.167a) i equip (CR 702.6b) mają okno sorcery w definicji
    // słowa kluczowego, więc `timing` bywa przy nich 'instant' z bramką keyword.
    const ok = aktywowane(definition).some((a) => a.timing === 'sorcery'
      || ['craft', 'equip'].includes(a.keyword) || a.forecast === true);
    if (!ok) naruszenia.push(`${definition.id}: „only as a sorcery" bez timing/keyword`);
  }
  assert.deepEqual(naruszenia, [],
    'okno sorcery musi wynikać z deskryptora (timing albo keyword), nie z tekstu Oracle');
});

test('STRZ-3: „Activate only once each turn" → oncePerTurn (albo forecast)', () => {
  const naruszenia = [];
  for (const definition of karty) {
    if (!/Activate only once each turn/i.test(tekst(definition))) continue;
    if (bezWlasnychAktywowanych(definition)) continue;
    const ok = aktywowane(definition).some((a) => a.oncePerTurn === true || a.forecast === true);
    if (!ok) naruszenia.push(`${definition.id}: „once each turn" bez oncePerTurn`);
  }
  assert.deepEqual(naruszenia, [], 'limit aktywacji musi być deskryptorem (CR 602.5b)');
});

test('STRZ-4: „Activate only if you control <typ>" → condition.controlsType', () => {
  const naruszenia = [];
  for (const definition of karty) {
    const match = tekst(definition).match(/Activate only if you control (?:an|a) (\w+)/i);
    if (!match) continue;
    if (bezWlasnychAktywowanych(definition)) continue;
    const typ = match[1][0].toUpperCase() + match[1].slice(1).toLowerCase();
    const ok = aktywowane(definition).some((a) => a.condition?.controlsType === typ);
    if (!ok) naruszenia.push(`${definition.id}: „only if you control ${typ}" bez condition.controlsType`);
  }
  assert.deepEqual(naruszenia, [],
    'warunek aktywacji musi być deskryptorem (CR 602.5b — restrykcja zostaje przy obiekcie)');
});

test('STRZ-5: kotwice (L13) — pokrycie fraz i wyjątek karty bez własnych aktywacji', () => {
  const zFrazaKroku = karty.filter((d) => /Activate (?:this ability )?only during your \w+/i.test(tekst(d)));
  assert.equal(zFrazaKroku.length, 2, 'Necrosavant (onlyInStep) i Piercing Rays (forecast)');
  assert.deepEqual(zFrazaKroku.map((d) => d.id).sort(), ['necrosavant', 'piercing-rays']);
  assert.equal(registry.get('necrosavant').abilities.find((a) => a.type === 'activated').onlyInStep, 'upkeep');
  assert.equal(registry.get('piercing-rays').abilities.find((a) => a.type === 'activated').forecast, true);

  const bezAktywacji = karty.filter((d) => /Activate only as a sorcery/i.test(tekst(d)) && bezWlasnychAktywowanych(d));
  assert.deepEqual(bezAktywacji.map((d) => d.id), ['slithering-cryptid', 'mister-gutsy'],
    'wyjątki: fraza opisuje zdolność TOKENU, nie zdolność samej karty');
  // Batch 75 (Mister Gutsy): „Activate only as a sorcery" jest w nawiasie
  // opisującym token Junk — nosiciel frazy to token_junk z deskryptorem
  // `timing: 'sorcery'` (wyjątek nie jest luką).
  assert.equal(registry.get('token_junk').abilities.find((a) => a.type === 'activated').timing, 'sorcery',
    'nosiciel frazy (token_junk) ma deskryptor — wyjątek nie jest luką');
});

test('STRZ-6: mutacja — detektor widzi restrykcję bez deskryptora (dowód działania)', () => {
  // Kształt dokładnie z Batcha 73: tekst Oracle jest, deskryptora brak.
  const podrobiona = {
    id: 'podrobiona-karta',
    oracleText: '{3}{B}{B}, Sacrifice a creature: Return this card from your graveyard to the battlefield. Activate only during your upkeep.',
    abilities: [{ type: 'activated', timing: 'instant', fromGraveyard: true, cost: { mana: 5 }, effect: { type: 'reanimate_under_your_control' } }],
  };
  const match = tekst(podrobiona).match(/Activate (?:this ability )?only during your (\w+)/i);
  assert.equal(match?.[1].toLowerCase(), 'upkeep', 'fraza wykryta');
  assert.equal(bezWlasnychAktywowanych(podrobiona), false, 'karta ma zdolność aktywowaną — reguła ją obejmuje');
  assert.equal(aktywowane(podrobiona).some((a) => a.onlyInStep === 'upkeep' || a.forecast === true), false,
    'deskryptora brak → STRZ-1 musi taką kartę odrzucić');
});
