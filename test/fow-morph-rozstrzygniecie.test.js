// M102/U6 — zgłoszenie właściciela (2026-08-16):
// „Logika FoW morph przeciwnika jest do bani. Zobacz Rozgrywkę zagrania
//  przeciwnika:
//      morph wchodzi na pole bitwy
//      Woolly Loxodon zostaje rozstrzygnięty"
//
// OBJAW: maskowanie jest NIESPÓJNE. Panel „Rozgrywka" w tym samym bloku
// najpierw ukrywa tożsamość zakrytego stwora przeciwnika („morph wchodzi na
// pole bitwy"), a linijkę niżej wprost ją zdradza („Woolly Loxodon zostaje
// rozstrzygnięty"). Cała ochrona informacji ukrytej jest wtedy bezwartościowa
// — gracz i tak czyta z logu, co leży zakryte, i wie, czy opłaca się atakować.
//
// CR 708.2: zakryty czar/permanent jest bezimiennym stworem 2/2 bez tekstu,
// typów kreatur i kosztu. Tożsamość zna wyłącznie jego kontroler (CR 708.6).
//
// ROOT CAUSE: `permanent_cast` niesie flagę `faceDown` i czytelnik logu
// poprawnie maskuje po niej nazwę (M100/BUG A), ale zdarzenie
// `spell_resolved` emitowane przy rozstrzygnięciu permanentu (spells.js)
// NIE niesie tej flagi. Gałąź `case 'spell_resolved'` bezwarunkowo woła
// `nameOf(e.cardId)`, więc nazwa wycieka mimo poprawnie zamaskowanych
// sąsiednich linii.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, execute, addObject } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { describeGameEvent } from '../src/table/session.js';

const REGISTRY = createCardRegistry();
// W stole HUMAN_ID to 'p1' — 'p2' jest przeciwnikiem (jego morph ma być ukryty).
const HUMAN = 'p1';
const FOE = 'p2';

const helpers = {
  nameOf: (id) => REGISTRY.get(id)?.name ?? id,
  nameOfObject: (id) => REGISTRY.get(id)?.name ?? id,
  isPlayer: (id) => [HUMAN, FOE].includes(id),
};
const describe = (e) => describeGameEvent(e, helpers);

/** Rzuca Woolly Loxodona twarzą w dół (morph) w imieniu `playerId`. */
function castFaceDown(playerId) {
  const state = createGameState({ seed: 4, players: [{ id: HUMAN }, { id: FOE }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  const card = REGISTRY.get('woolly-loxodon');
  addObject(state, {
    id: 'lox', instanceId: 'ilox', cardId: card.id, controllerId: playerId, ownerId: playerId,
    zone: 'hand', kind: 'creature', power: card.power, toughness: card.toughness,
    manaCost: card.manaCost, abilities: card.abilities ?? [], keywords: card.keywords ?? [],
    subtypes: card.subtypes ?? [], types: card.types, colors: card.colors, morph: card.morph ?? null,
  });
  for (const p of state.players) { p.mana = 9; p.manaPool = { G: 3, W: 3, U: 3, B: 3, R: 3 }; }

  const cast = execute(state, { type: 'cast_permanent', playerId, objectId: 'lox', faceDown: true });
  assert.equal(cast.ok, true, `rzut morpha odrzucony: ${JSON.stringify(cast.events?.[0])}`);
  for (let i = 0; i < 12 && state.zones.stack.length > 0; i += 1) {
    execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
    execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  }
  return state;
}

test('M102/U6: rozstrzygnięcie morpha PRZECIWNIKA nie zdradza nazwy karty (CR 708.2)', () => {
  const state = castFaceDown(FOE);
  const resolved = state.events.filter((e) => e.type === 'spell_resolved');
  assert.ok(resolved.length > 0, 'brak zdarzenia spell_resolved');
  for (const e of resolved) {
    const text = describe(e);
    if (text == null) continue;
    assert.ok(!/Woolly Loxodon/.test(text),
      `log zdradza tożsamość zakrytej karty przeciwnika: „${text}"`);
    assert.match(text, /morph/i, `rozstrzygnięcie zakrytego czaru ma mówić o morphu: „${text}"`);
  }
});

test('M102/U6: cały blok o morphie przeciwnika jest spójnie zamaskowany', () => {
  const state = castFaceDown(FOE);
  // Dokładnie ten ciąg linii, który zgłosił właściciel.
  const lines = state.events.map(describe).filter((t) => typeof t === 'string' && t.length > 0);
  const leaking = lines.filter((t) => /Woolly Loxodon/.test(t));
  assert.deepEqual(leaking, [],
    `panel „Rozgrywka" zdradza zakrytą kartę w liniach: ${JSON.stringify(leaking)}`);
});

test('M102/U6: WŁASNY morph gracza pozostaje nazwany (CR 708.6)', () => {
  // Kontroler zna tożsamość swojej zakrytej karty — maskowanie nie może
  // odbierać informacji graczowi o jego własnym stworze.
  const state = castFaceDown(HUMAN);
  const lines = state.events.map(describe).filter((t) => typeof t === 'string');
  assert.ok(lines.some((t) => /Woolly Loxodon/.test(t)),
    `własny morph ma być nazwany w logu: ${JSON.stringify(lines)}`);
});

test('M102/U6: zwykły (odkryty) czar przeciwnika nadal jest nazwany', () => {
  // Maskowanie nie może rozlać się na normalne rzuty — regresja byłaby gorsza
  // niż pierwotny błąd (log przestałby cokolwiek mówić o grze przeciwnika).
  const e = { type: 'spell_resolved', cardId: 'woolly-loxodon', controllerId: FOE, fizzled: false, permanent: true };
  assert.match(describe(e), /Woolly Loxodon/);
});
