// M201/C1 + F (zgłoszenia właściciela 2026-08-23) — warstwa OPISU.
//
// C1: „Dreams of Steel and Oil: oglądasz rękę i grób gracza Nieprzyjaciel
//      i WYBIERA kartę do wygnania” — rozjazd osób w jednym zdaniu.
//      Przyczyna: `odmienNaDrugaOsobe` odmienia PIERWSZY czasownik po imieniu
//      gracza; drugi („i wybiera”) zostaje w 3. osobie.
// F:  „Roiling Regrowth … Springbloom Druid: Nieprzyjaciel może poświęcić
//      land” — nazwa karty ZASZYTA w opisie mechaniki. Mechanika nazywa się
//      po pierwszej karcie, która ją wprowadziła, ale używa jej też inna
//      karta (ADR 0002 przeniesione do warstwy prezentacji).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describeGameEvent, odmienNaDrugaOsobe, PLAYER_NAMES, HUMAN_ID, BOT_ID } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';

const REGISTRY = createCardRegistry();
const NAME_BY_ID = new Map(REGISTRY.all().map((c) => [c.id, c.name]));
const helpers = {
  nameOf: (cardId) => NAME_BY_ID.get(cardId) ?? cardId,
  nameOfObject: (id) => id,
};
const describe = (e) => describeGameEvent(e, helpers);

// --- F: nazwa źródła z DANYCH ---------------------------------------------

test('M201/F: opis mechaniki „poświęć land i szukaj” nazywa KARTĘ ze zdarzenia', () => {
  const druid = describe({ type: 'springbloom_choice_required', controllerId: BOT_ID, cardId: 'springbloom-druid' });
  const regrowth = describe({ type: 'springbloom_choice_required', controllerId: BOT_ID, cardId: 'roiling-regrowth' });
  assert.match(druid, /Springbloom Druid/);
  assert.match(regrowth, /Roiling Regrowth/);
  assert.ok(!regrowth.includes('Springbloom'),
    `Roiling Regrowth nie może przedstawiać się jako druid: ${regrowth}`);
});

test('M201/F: brak źródła w zdarzeniu = opis bez zaszytej nazwy (neutralny)', () => {
  const text = describe({ type: 'springbloom_resolved', controllerId: BOT_ID });
  assert.ok(!/Springbloom Druid/.test(text), text);
  assert.match(text, /poświęca land/);
});

test('M201/F: to samo dla rodziny „obejrzyj rękę i grób” (Dreams of Steel and Oil)', () => {
  const text = describe({ type: 'reveal_exile_required', playerId: BOT_ID, opponentId: HUMAN_ID, cardId: 'dreams-of-steel-and-oil' });
  assert.match(text, /Dreams of Steel and Oil/);
  const noSource = describe({ type: 'reveal_exile_required', playerId: BOT_ID, opponentId: HUMAN_ID });
  assert.ok(!/Dreams of Steel and Oil/.test(noSource), noSource);
});

// --- C1: spójna osoba w zdaniu --------------------------------------------

test('M201/C1: opis wyboru karty do wygnania jest w JEDNEJ osobie', () => {
  const text = describe({ type: 'reveal_exile_required', playerId: HUMAN_ID, opponentId: BOT_ID, cardId: 'dreams-of-steel-and-oil' });
  assert.match(text, /wybierasz/i, `oczekiwana 2. osoba: ${text}`);
  assert.ok(!/\bwybiera\b/.test(text), `3. osoba nie może zostać w zdaniu o graczu: ${text}`);
});

/**
 * Strażnik KLASY (nie jednego zdania): `odmienNaDrugaOsobe` zamienia na
 * 2. osobę WYŁĄCZNIE pierwszy czasownik po imieniu gracza. Każdy opis, który
 * po podmiocie ma DWA czasowniki ze słownika odmian, wyprodukuje więc zdanie
 * mieszane („oglądasz … i wybiera”). Reguła dla autorów opisów: jeden
 * czasownik na zdanie o graczu (albo drugie zdanie z własnym podmiotem).
 */
test('M201/C1 (strażnik): żaden opis zdarzenia nie ma dwóch czasowników po podmiocie', () => {
  const source = fs.readFileSync('src/table/session.js', 'utf8');
  const dict = source.match(/const DRUGA_OSOBA = Object\.freeze\(\{([\s\S]*?)\}\);/);
  assert.ok(dict, 'słownik odmian znaleziony');
  const thirdPerson = [...dict[1].matchAll(/'?([\wąćęłńóśźż]+)'?\s*:\s*'([^']+)'/g)].map((m) => m[1]);
  assert.ok(thirdPerson.length > 5, `słownik odmian ma ${thirdPerson.length} pozycji`);

  /**
   * PRZEJRZANE wyjątki (wzorzec L51: whitelist z uzasadnieniem zamiast
   * wyłączenia strażnika). Każdy sprawdzony ręcznie — drugi czasownik NIE
   * dotyczy gracza albo nie jest odmieniany w tym zdaniu.
   */
  const REVIEWED = new Map([
    ['amass_choice_required', 'drugi czasownik („dostaje”) ma inny podmiot: Armia'],
    ['clash_choice_resolved', 'ternarny wybór — w zdaniu pojawia się dokładnie jeden z czasowników'],
    ['devour_choice_required', '„może poświęcać” — bezokolicznik po czasowniku modalnym, nie drugi orzecznik'],
  ]);
  const offenders = [];
  for (const [, type, text] of source.matchAll(/case '([a-z_]+)': return `([^`]+)`/g)) {
    const parts = text.split(/\$\{whoN\(e\.(?:playerId|controllerId)\)\}/);
    if (parts.length < 2) continue;
    const after = parts[1];
    const verbs = [...after.matchAll(/\b([a-ząćęłńóśźż]+)\b/g)].map((m) => m[1])
      .filter((word) => thirdPerson.includes(word));
    if (verbs.length > 1 && !REVIEWED.has(type)) offenders.push(`${type}: ${text} → ${verbs.join(', ')}`);
  }
  assert.deepEqual(offenders, [],
    'opis o graczu z DWOMA czasownikami odmienialnymi — druga część zostanie w 3. osobie:\n' + offenders.join('\n'));
});
