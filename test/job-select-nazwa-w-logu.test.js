// M102/U2 — audyt żywym testerem (rola gracza, 2026-08-16).
//
// OBJAW (detektor Żywego Testera, powtarzalny w każdej partii green/red):
//     [ROZGRYWKA]   • ? zostaje załączony do Hero (bestow)
// Gracz widzi w panelu Rozgrywka znak zapytania zamiast nazwy ekwipunku
// (Warrior's Sword) i do tego słowo „bestow", choć to job select — mechanika
// „stwórz token 1/1 Hero i przypnij do niego ten ekwipunek".
//
// ROOT CAUSE: kontrakt zdarzenia `object_attached` w całym silniku to
// { objectId, cardId, hostId, hostCardId, via } — tak emituje je
// `emitAttached` w attachments.js. Efekt job select w effects.js emitował
// je jako { attachmentId, attachmentCardId, ... }, czyli pod innymi
// nazwami pól. Czytelnik logu (session.js) bierze `e.cardId` — dostawał
// undefined i renderował „?", a brak `via: 'equip'|'aura'` spychał opis do
// gałęzi domyślnej, czyli „(bestow)".
//
// To NIE jest problem z nazwą karty (ADR 0002 — bez special-case po nazwie),
// tylko niespójność kontraktu zdarzenia u źródła.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, execute, addObject } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { describeGameEvent } from '../src/table/session.js';

const REGISTRY = createCardRegistry();

/** Stół z Warrior's Sword (job select) gotowym do wejścia na pole bitwy. */
function boardWithJobSelect() {
  const state = createGameState({ seed: 3, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  const card = REGISTRY.get('warriors-sword');
  addObject(state, {
    id: 'sword', instanceId: 'isw', cardId: card.id, controllerId: 'p1', ownerId: 'p1',
    zone: 'hand', kind: 'artifact', power: null, toughness: null, manaCost: card.manaCost,
    abilities: card.abilities ?? [], keywords: card.keywords ?? [], subtypes: card.subtypes ?? [],
    types: card.types, colors: card.colors, equipment: card.equipment ?? null,
  });
  state.players[0].mana = 9;
  state.players[0].manaPool = { W: 3, R: 3, G: 3 };
  return state;
}

/** Przewija stos do końca (triggery job select rozstrzygają się na stosie). */
function resolveStack(state) {
  for (let i = 0; i < 60 && state.zones.stack.length > 0; i += 1) {
    execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
    execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  }
}

test('M102/U2: job select emituje object_attached w kontrakcie silnika (objectId/cardId)', () => {
  const state = boardWithJobSelect();
  const cast = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'sword' });
  assert.equal(cast.ok, true, JSON.stringify(cast.events?.[0]));
  resolveStack(state);

  const attached = state.events.filter((e) => e.type === 'object_attached' && e.via === 'job_select');
  assert.equal(attached.length, 1, 'job select powinien przypiąć ekwipunek do tokenu Hero');
  const e = attached[0];
  // Kontrakt wspólny z emitAttached (attachments.js) — inaczej UI czyta undefined.
  assert.ok(e.objectId, 'zdarzenie musi nieść objectId załącznika');
  assert.ok(e.cardId, 'zdarzenie musi nieść cardId załącznika (inaczej log pokazuje „?")');
  assert.equal(e.cardId, 'warriors-sword');
  assert.ok(e.hostId, 'zdarzenie musi nieść hostId tokenu Hero');
});

test('M102/U2: panel Rozgrywka nazywa ekwipunek i nie mówi „bestow" o job select', () => {
  const state = boardWithJobSelect();
  execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'sword' });
  resolveStack(state);

  const e = state.events.find((ev) => ev.type === 'object_attached' && ev.via === 'job_select');
  assert.ok(e, 'brak zdarzenia job select');
  const nameOf = (id) => REGISTRY.get(id)?.name ?? id;
  const text = describeGameEvent(e, {
    nameOf,
    nameOfObject: (id) => nameOf(state.objects.get(id)?.cardId),
    isPlayer: (id) => ['p1', 'p2'].includes(id),
  });

  assert.ok(!/\?/.test(text), `log nie może zawierać placeholdera „?": ${text}`);
  assert.match(text, /Warrior's Sword/, `log ma nazywać ekwipunek: ${text}`);
  assert.ok(!/bestow/i.test(text), `job select to nie bestow: ${text}`);
});
