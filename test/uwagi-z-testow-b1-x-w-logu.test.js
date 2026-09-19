// Uwaga B1 właściciela z testów (2026-09-18): „W Rozgrywce ani w logu nie ma
// informacji za ile X bot zagrał Epic Experiment (mogę to sobie tylko
// zgadywać po ilości zatapowanych lądów) — ta informacja powinna znaleźć się
// w layerze Rozgrywka i w logu.”
//
// Root cause: zdarzenie `spell_cast` z castXCostSpell/castFireball NIESIE
// `xValue` (spells.js), ale `describeGameEvent` case 'spell_cast' go nie
// renderował. Log stołu, warstwa „Rozgrywka” i modal „Ruch bota” powstają
// z tej JEDNEJ funkcji (L41: jedno źródło brzmienia) — wystarczy dopisać
// xPart, wzorem `ability_activated` (session.js, tam xPart już jest).
//
// Powiązanie z uwagą B (ten sam PR): bot wybiera teraz X świadomie
// (test/uwagi-z-testow-b-epic-experiment-x.test.js), a gracz widzi, ile X
// wybrał — obie połówki domykają zgłoszenie.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BOT_ID, HUMAN_ID, createSession, describeGameEvent } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { addObject } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

const HELPERS = { nameOf: (cardId) => (cardId === 'epic-experiment' ? 'Epic Experiment' : 'Karta'), nameOfObject: () => 'Obiekt' };
const NAMES = { p1: 'Ty', p2: 'Nieprzyjaciel' };

test('B1/1: opis spell_cast niesie wartość X (log + Rozgrywka mają jedno źródło)', () => {
  const tekst = describeGameEvent({
    type: 'spell_cast', playerId: 'p2', cardId: 'epic-experiment',
    targets: [], targetCardIds: [], xValue: 6, manaSpent: 8,
  }, HELPERS, NAMES);
  assert.match(tekst, /Epic Experiment/, 'nazwa czaru w opisie');
  assert.match(tekst, /X=6/, `wartość X w opisie: „${tekst}”`);
});

test('B1/2: warstwa Rozgrywki (3. osoba) też pokazuje X', () => {
  const tekst = describeGameEvent({
    type: 'spell_cast', playerId: 'p2', cardId: 'epic-experiment',
    targets: [], targetCardIds: [], xValue: 5, manaSpent: 7,
  }, HELPERS, NAMES, { drugaOsoba: false });
  assert.match(tekst, /X=5/);
});

test('B1/3 (anty-over-fix): czar bez X nie dostaje znacznika „(X=…)”', () => {
  const tekst = describeGameEvent({
    type: 'spell_cast', playerId: 'p1', cardId: 'inny-czar',
    targets: [], targetCardIds: [],
  }, HELPERS, NAMES);
  assert.doesNotMatch(tekst, /X=/, `zwykły czar bez X: „${tekst}”`);
});

test('B1/4 (E2E): rzut bota za X ląduje z wartością X w logu sesji', () => {
  const registry = createCardRegistry();
  const decks = new Map([
    [HUMAN_ID, parseDeckText(fs.readFileSync('decks/tarkir-bg.txt', 'utf8'), registry).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync('decks/ravnica.txt', 'utf8'), registry).cardIds],
  ]);
  const session = createSession({ seed: 31, registry, decks });
  // Domknij decyzje mulliganu obu graczy (sesja zatrzymuje na nich grę).
  for (let i = 0; i < 4; i += 1) {
    const mulligan = session.view().legalCommands.find((c) => c.type === 'resolve_mulligan_choice');
    if (!mulligan) break;
    assert.ok(session.apply(mulligan).ok, 'mulligan przyjęty');
  }
  // Stan: główna faza bota, Epic Experiment w ręce i mana {U}{R}+6.
  const state = session.state;
  state.turn = jumpToStep(state.turn, 'main', BOT_ID);
  state.turn.activePlayerId = BOT_ID;
  state.turn.priorityPlayerId = BOT_ID;
  const ee = gameObjectDataOf(registry.get('epic-experiment'));
  addObject(state, {
    id: 'ee-test', instanceId: 'i-ee-test', cardId: 'epic-experiment',
    controllerId: BOT_ID, ownerId: BOT_ID, zone: 'hand', ...ee,
  });
  addMana(state, BOT_ID, 8, { colors: ['U', 'R'] });

  const wynik = session.apply({
    type: 'cast_spell', playerId: BOT_ID, objectId: 'ee-test', targets: [], xValue: 6,
  });
  assert.ok(wynik.ok, wynik.reason);

  const tekst = session.log.map((entry) => entry.text).join('\n');
  assert.match(tekst, /Epic Experiment/, 'nazwa czaru w logu');
  assert.match(tekst, /X=6/, `log sesji niesie wartość X — faktyczny wpis: ${session.log.filter((l) => l.text.includes('Epic')).map((l) => l.text).join(' | ')}`);
});
