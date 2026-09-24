/**
 * Pin O-3 z audytu PR #134 (docs/audits/AUDYT_PR134_2026-09-24.md, §5/O-3).
 *
 * O-3: heurystyki bota czytały źródła many bez stanu — dziewięć wywołań
 * `getSourceForObject(o, null)` w `heuristic-bot.js`. Dla Gond Gate („{T}: Add
 * one mana of any color that a Gate you control could produce”) deskryptor
 * `colorsFrom` wymaga pola bitwy, więc bez stanu wracały `colors: []` i Brama
 * była wyceniana jako źródło BEZBARWNE (`czysteKolory`, `landDenialDelta`,
 * `ownPotentialMana`). To nie błąd legalności (silnik czyta stan), tylko
 * zaniżona wycena — ale wycena bota ma czytać te same dane co silnik (L28).
 *
 * Naprawa (kierunek z audytu: „produkowane kolory w PlayerView”, ADR 0017):
 * zdolności many odsłoniętego permanentu są informacją PUBLICZNĄ (CR 605,
 * 113.6), więc widok niesie rozstrzygnięty opis źródła — `entry.manaSource =
 * { colors, amount }` — a bot czyta go przez jeden pomocnik
 * `manaSourceOfView` (fallback: liczenie bez stanu dla widoków składanych
 * ręcznie). Zakryty permanent przeciwnika nie dostaje pola (FoW, ADR 0003).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { getSourceForObject } from '../src/engine/mana-sources.js';
import { manaSourceOfView } from '../src/controllers/heuristic-bot.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

const REGISTRY = createCardRegistry();

function gra() {
  return createGameState({ seed: 3, players: [{ id: 'p1' }, { id: 'p2' }] });
}

function putCard(state, id, cardId, controllerId, patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone: 'battlefield',
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  if (Object.keys(patch).length > 0) {
    // `addObject` odrzuca pola spoza kontraktu helpera (L21) — statusy typu
    // `faceDown` ustawia realna ścieżka silnika, więc fixture robi to samo.
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  }
  return state.objects.get(id);
}

function wpisWidoku(state, playerId, id) {
  const wpis = playerView(state, playerId).zones.battlefield.find((o) => o.id === id);
  assert.ok(wpis, `wpis ${id} w widoku ${playerId}`);
  return wpis;
}

test('O-3/1: widok niesie rozstrzygnięte źródło many Gond Gate (bez stanu było [])', () => {
  const state = gra();
  putCard(state, 'gond', 'gond-gate', 'p1');
  putCard(state, 'dimir', 'dimir-guildgate', 'p1');

  const wpis = wpisWidoku(state, 'p1', 'gond');
  assert.deepEqual(wpis.manaSource, { colors: ['U', 'B'], amount: 1 },
    'kolory „any color a Gate you control could produce” rozstrzygnięte na polu bitwy');
  // Ten sam wpis policzony BEZ stanu (stary sposób bota) — dowód, że pole widoku
  // coś naprawia, a nie tylko dubluje dane.
  assert.deepEqual(getSourceForObject(wpis, null)?.colors ?? [], [],
    'bez stanu deskryptor colorsFrom daje [] (O-3)');
});

test('O-3/2: bot czyta te same kolory co silnik ze stanem (L28)', () => {
  const state = gra();
  putCard(state, 'gond', 'gond-gate', 'p1');
  putCard(state, 'dimir', 'dimir-guildgate', 'p1');
  putCard(state, 'las', 'manor-gate', 'p1');

  for (const id of ['gond', 'dimir', 'las']) {
    const wpis = wpisWidoku(state, 'p1', id);
    const silnik = getSourceForObject(state.objects.get(id), state);
    assert.deepEqual(manaSourceOfView(wpis)?.colors ?? [], silnik?.colors ?? [],
      `${id}: heurystyka i silnik widzą te same produkowane kolory`);
    assert.equal(manaSourceOfView(wpis)?.amount, silnik?.amount ?? 1, `${id}: ta sama ilość`);
  }
});

test('O-3/3: zakryty permanent PRZECIWNIKA nie niesie źródła many (FoW, ADR 0003)', () => {
  const state = gra();
  putCard(state, 'zakryty', 'dimir-guildgate', 'p2', { faceDown: true });

  const uPrzeciwnika = wpisWidoku(state, 'p1', 'zakryty');
  assert.equal(uPrzeciwnika.cardId, null, 'tożsamość zakrytego permanentu jest ukryta');
  assert.equal(uPrzeciwnika.manaSource, undefined,
    'opis źródła many zakrytego permanentu przeciwnika nie trafia do widoku');

  const uKontrolera = wpisWidoku(state, 'p2', 'zakryty');
  assert.equal(uKontrolera.cardId, 'dimir-guildgate', 'kontroler zna swoją kartę');
  assert.ok(uKontrolera.manaSource, 'kontroler widzi źródło many własnego permanentu');
});

test('O-3/4: bez pola w widoku pomocnik wraca do liczenia bez stanu (fixtures)', () => {
  const state = gra();
  putCard(state, 'dimir', 'dimir-guildgate', 'p1');
  const wpis = wpisWidoku(state, 'p1', 'dimir');
  const bezPola = { ...wpis };
  delete bezPola.manaSource;

  assert.deepEqual(manaSourceOfView(bezPola), getSourceForObject(bezPola, null),
    'fallback jest dokładnie starym liczeniem bez stanu — nic nowego po drodze');
});

test('O-3/5: `getSourceForObject(…, null)` ma w bocie JEDNO miejsce (strażnik klasy)', () => {
  const plik = fs.readFileSync(path.join(import.meta.dirname, '..', 'src', 'controllers', 'heuristic-bot.js'), 'utf8');
  const bezKomentarzy = plik
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((linia) => (linia.trimStart().startsWith('//') ? '' : linia))
    .join('\n');
  const trafienia = bezKomentarzy.match(/getSourceForObject\([^)]*,\s*null\s*\)/g) ?? [];
  assert.equal(trafienia.length, 1,
    `dokładnie jedno wywołanie bez stanu (wewnątrz manaSourceOfView), a nie ${trafienia.length}`);
  const funkcja = bezKomentarzy.slice(bezKomentarzy.indexOf('export function manaSourceOfView'));
  assert.ok(funkcja.includes(trafienia[0]), 'to wywołanie siedzi w manaSourceOfView');
});
