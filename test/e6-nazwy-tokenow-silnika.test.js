// E6 (pętla jakości, PLAN_2026-09-11b) — nazwy tokenów tworzonych przez
// MECHANIKI silnika w logu gracza (oś 2 audytu żywym testerem: zdarzenie
// nieczytelne dla gracza).
//
// Znalezione ręcznie/detektorem 2026-09-12 w partii g6 (wiedzmin-brg ↔ kaladesh,
// seed 3003, profil hoarder): „[ROZGRYWKA] • token_servo ginie" — surowy
// identyfikator zamiast nazwy. Root cause: mapa nazw tokenów (`collectTokenNames`,
// M188/B) jest budowana z KATALOGU kart, a Servo powstaje z mechaniki fabricate
// w kodzie silnika (CR 702.122a) — deskryptora nie ma w rejestrze, więc `nameOf`
// zwracał cardId. Token po śmierci znika ze stanu (CR 111.7), więc opis miał do
// dyspozycji wyłącznie cardId.
//
// Naprawa jest GENERYCZNA (ADR 0002 — bez listy nazw i bez przypadków po nazwie
// karty): cardId tokenu to slug jego nazwy (`tokenCardIdFromName` w
// src/engine/tokens.js — jedno źródło prawdy, L41), więc brak wpisu w rejestrze
// odtwarzamy odwrotnością tej reguły (`tokenNameFromCardId`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tokenCardIdFromName, tokenNameFromCardId } from '../src/engine/tokens.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('E6/1: reguła sluga i jej odwrotność są wzajemnie jednoznaczne', () => {
  assert.equal(tokenCardIdFromName('Servo'), 'token_servo');
  assert.equal(tokenCardIdFromName('Zombie Army'), 'token_zombie_army');
  assert.equal(tokenNameFromCardId('token_servo'), 'Servo');
  assert.equal(tokenNameFromCardId('token_zombie_army'), 'Zombie Army');
  assert.equal(tokenNameFromCardId('token_phyrexian'), 'Phyrexian');
  assert.equal(tokenNameFromCardId('goblin-piker'), null, 'nie-token → null (fallback na cardId)');
  assert.equal(tokenNameFromCardId('token_'), null, 'pusty slug → null');
  assert.equal(tokenNameFromCardId(null), null);
  for (const name of ['Servo', 'Clue', 'Incubator', 'Zombie Army', 'Treasure']) {
    assert.equal(tokenNameFromCardId(tokenCardIdFromName(name)), name, `round-trip: ${name}`);
  }
});

test('E6/2: każdy `token_*` w kodzie silnika ma nazwę odtwarzalną z identyfikatora', () => {
  // Strażnik klasy (L27: każda klasa znaleziona ręcznie → detektor/strażnik):
  // nowy token mechaniki silnika nie może wrócić do logu jako surowy cardId.
  const dir = join(ROOT, 'src', 'engine');
  const found = new Map();
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.js'))) {
    const source = readFileSync(join(dir, file), 'utf8');
    for (const match of source.matchAll(/cardId:\s*'(token_[a-z0-9_]+)'/g)) {
      if (!found.has(match[1])) found.set(match[1], file);
    }
  }
  assert.ok(found.size >= 5, `strażnik widzi tokeny silnika (znalazł ${found.size})`);
  for (const [cardId, file] of found) {
    const name = tokenNameFromCardId(cardId);
    assert.ok(name && name.length > 0, `${cardId} (${file}) — brak nazwy wyświetlanej`);
    assert.notEqual(name, cardId, `${cardId} (${file}) — nazwa nie może być surowym id`);
    assert.equal(tokenCardIdFromName(name), cardId,
      `${cardId} (${file}) — slug nazwy musi wracać do tego samego id`);
  }
  assert.ok(found.has('token_servo'), 'token z fabricate (zgłoszenie E6) jest w zbiorze');
});
