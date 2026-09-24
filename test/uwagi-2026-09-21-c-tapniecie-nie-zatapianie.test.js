// C (zgłoszenie właściciela z żywej gry, 2026-09-21) — Piercing Rays, opis
// w „Rozgrywce": „tapowanie celu" zamiast „tapnięcie". Właściciel: „ma być
// tapnięcie" + „sprawdzić, czy inne karty nie mają tego samego błędu".
//
// Objaw odtworzony na silniku (forecast Piercing Rays w kroku podtrzymania,
// 2026-09-21): linia logu brzmiała
//   „Aktywujesz zdolność: Piercing Rays — tapowanie celu → cel: Highland Game"
// (ABILITY_EFFECT_LABELS.tap_permanent w session.js — ta sama mapa opisuje
// log stołu, więc błąd językowy widać było w KAŻDEJ zdolności tapującej).
//
// Zakres naprawy: cała rodzina „zatap-*" w warstwie WIDOCZNEJ dla gracza —
// etykiety efektów, deskryptory celów, opisy triggerów i warunków na kaflach,
// nazwy trybów kart (Keep Out), linie logu — plus rejestry narzędzi, które
// czytają log (regex detektora fałszywego „brak skutku", L160).
//
// Piny:
//   C/1 (RED→GREEN, zachowanie): ścieżka gracza — aktywacja forecast
//       Piercing Rays → zdarzenie ability_activated → log mówi
//       „tapnięcie celu" i nie zawiera rodziny „zatap-*";
//   C/2 (klasa, źródło): ani jeden plik produktu (src/**, tools/**) nie
//       zawiera rodziny „zatap-*" — nowa karta/etykieta nie wprowadzi jej
//       z powrotem (skan z licznikiem plików, żeby pusty przebieg nie był
//       fałszywie zielony);
//   C/3 (spójność narzędzia): detektor fałszywego „brak skutku" rozpoznaje
//       tapnięcie w logu po NOWYM brzmieniu — inaczej cicha utrata sygnału.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { describeGameEvent, triggerEventLabel } from '../src/table/session.js';
import { targetTypeLabel } from '../src/table/render.js';
import { detectFalseNoEffect } from '../tools/table-tester/detectors.mjs';

const REGISTRY = createCardRegistry();
/** Rodzina terminologiczna, której nie chcemy widzieć w produkcie. */
const ZAKAZANA = /zatap/i;

// --- C/1: ścieżka gracza — forecast Piercing Rays ---------------------------

test('C/1: log aktywacji forecast (Piercing Rays) mówi „tapnięcie celu"', () => {
  const state = createGameState({ seed: 421, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'upkeep', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = 5;
  const put = (id, cardId, ctrl, zone) => {
    const def = REGISTRY.get(cardId);
    const data = gameObjectDataOf(def);
    addObject(state, {
      id, instanceId: `i-${id}`, cardId, controllerId: ctrl, ownerId: ctrl, zone,
      kind: data.kind, power: data.power, toughness: data.toughness, manaCost: data.manaCost,
      abilities: data.abilities ?? [], keywords: def.keywords ?? [],
      subtypes: def.subtypes ?? [], types: def.types ?? [], colors: data.colors ?? [],
      cardName: def.name,
    });
  };
  put('rays', 'piercing-rays', 'p1', 'hand');
  put('cel', 'highland-game', 'p2', 'battlefield');
  for (const [i, land] of ['basic-forest', 'basic-forest', 'basic-swamp', 'basic-plains', 'basic-plains'].entries()) {
    put(`l${i}`, land, 'p1', 'battlefield');
  }
  const oferta = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'rays' && c.targets?.includes('cel'));
  assert.ok(oferta, 'forecast ma być ofertą w kroku podtrzymania (CR 702.57)');
  const wynik = execute(state, oferta);
  assert.equal(wynik.ok, true, 'aktywacja forecast przyjęta');
  const zdarzenie = wynik.events.find((e) => e.type === 'ability_activated');
  assert.ok(zdarzenie, 'zdarzenie ability_activated');
  assert.deepEqual(zdarzenie.effectTypes, ['tap_permanent'], 'deskryptor efektu z karty');
  const tekst = describeGameEvent(zdarzenie, {
    nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? cardId,
    nameOfObject: (id) => {
      const o = state.objects.get(id);
      return o ? (REGISTRY.get(o.cardId)?.name ?? o.cardId) : '?';
    },
    isPlayer: (id) => state.players.some((p) => p.id === id),
  });
  assert.match(tekst, /tapnięcie celu/, `log mówi „tapnięcie celu": ${tekst}`);
  assert.doesNotMatch(tekst, ZAKAZANA, `stara terminologia w logu: ${tekst}`);
});

// --- C/2: żadna widoczna etykieta produktu nie używa rodziny „zatap-*" ------

/** Pliki produktu i narzędzi czytających log — z pominięciem zależności. */
function plikiProduktu(katalogi = ['src', 'tools']) {
  const out = [];
  const POMIN = new Set(['node_modules', '.git', 'dist', 'coverage', 'build']);
  const wejdz = (sciezka) => {
    for (const wpis of readdirSync(sciezka)) {
      if (POMIN.has(wpis)) continue;
      const pelna = join(sciezka, wpis);
      if (statSync(pelna).isDirectory()) wejdz(pelna);
      else if (/\.(js|mjs|html|css)$/.test(pelna)) out.push(pelna);
    }
  };
  for (const katalog of katalogi) wejdz(katalog);
  return out;
}

test('C/2 (klasa): produkty nie znają już terminu „zatapianie" ani jego rodziny', () => {
  const pliki = plikiProduktu();
  assert.ok(pliki.length >= 80, `skan objął zbyt mało plików produktu: ${pliki.length}`);
  const trafienia = [];
  for (const plik of pliki) {
    const zawartosc = readFileSync(plik, 'utf8');
    zawartosc.split('\n').forEach((linia, i) => {
      if (ZAKAZANA.test(linia)) trafienia.push(`${plik}:${i + 1}: ${linia.trim().slice(0, 120)}`);
    });
  }
  assert.deepEqual(trafienia, [],
    'terminologia gracza to „tapnięcie/tapnięty/tapnij" — zostały stare formy');
});

// --- C/3: narzędzia czytające log znają nowe brzmienie ----------------------

test('C/3: detektor fałszywego „brak skutku" łapie tapnięcie w nowym brzmieniu', () => {
  // Kształt z realnych transkryptów (M138/Z4): „zerowy wynik" triggera i tuż
  // obok widoczny skutek TEGO SAMEGO źródła — dowód zmiany stanu.
  const lines = [
    '  [ROZGRYWKA]   • Wedgelight Rammer — trigger bez efektu (nic się nie wydarzyło (zerowy wynik))',
    '  [ROZGRYWKA]   • Wedgelight Rammer zostaje tapnięty',
  ];
  const znaleziska = detectFalseNoEffect(lines);
  assert.equal(znaleziska.length, 1,
    'marker tapnięcia w logu musi być czytany przez detektor (L160: regex i brzmienie razem)');
});

test('C/4: etykiety triggerów i celów mówią „tapnięcie", nie „zatapianie"', () => {
  const etykiety = [
    triggerEventLabel('enchanted_permanent_tapped'),
    triggerEventLabel('self_becomes_tapped'),
    targetTypeLabel('tapped_creature'),
  ];
  for (const etykieta of etykiety) {
    assert.ok(typeof etykieta === 'string' && etykieta.length > 0, `pusta etykieta: ${etykieta}`);
    assert.doesNotMatch(etykieta, ZAKAZANA, `stara terminologia: ${etykieta}`);
  }
  assert.match(etykiety[0], /tapnięcie zaczarowanego permanentu/);
  assert.match(etykiety[2], /tapnięty stwór/);
});
