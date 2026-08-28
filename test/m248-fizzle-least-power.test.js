// M248 (audyt Żywym Testerem, 2026-08-28) — detektor oś 4 (noop/pewna strata)
// zgłosił z partii alara × mirrodin-wu seed 33: oferta panelu gracza
// „Rzuć: Wretched Banquet (koszt B) → cel: Illusory Demon (Ty)", choć Demon
// NIE był najsłabszym stworem na stole (wrogowie mieli 1/1 i 3/2).
//
// „Destroy target creature if it has the least power — or is tied" to
// intervening-if (CR 608.2a): warunek bada się przy ROZSTRZYGANIU, więc
// wybór celu jest legalny już przy rzuceniu, a czar MAJĄCY cel o mocy większej
// niż minimum NA PEWNO fizzluje — koszt płacony, zero efektu. Gracz widział
// ofertę jak zwykły rzut. To jest dokładnie klasa M102/U8: oferta zostaje,
// ale etykieta MUSI ostrzegać („UWAGA: czar fizzluje …") — wtedy oś detektorów
// traktuje ją jako oznaczoną (WARNED_FIZZLE, M102/U8).
//
// Reguła generyczna po deskryptorze efektu `destroy_if_least_power`
// (ADR 0002), czytająca wyłącznie publiczne pole bitwy (ADR 0017).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, playerView, addObject } from '../src/engine/game-state.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { commandLabel } from '../src/table/render.js';

const REGISTRY = createCardRegistry();

function game(enemyField) {
  const state = createGameState({ seed: 3, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  const put = (id, cardId, ctrl, zone) => {
    const def = REGISTRY.get(cardId);
    addObject(state, {
      id, instanceId: `i-${id}`, cardId, controllerId: ctrl, ownerId: ctrl, zone,
      kind: (def.types ?? []).includes('Land') ? 'land' : ((def.types ?? []).includes('Creature') ? 'creature' : 'spell'),
      ...gameObjectDataOf(def),
      types: def.types ?? [], subtypes: def.subtypes ?? [], keywords: def.keywords ?? [],
      abilities: def.abilities ?? [], power: def.power, toughness: def.toughness,
      manaCost: def.manaCost, colors: def.colors ?? [], spell: def.spell,
    });
    if (zone === 'battlefield') state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false, tapped: false }));
  };
  put('b1', 'basic-swamp', 'p1', 'battlefield');
  put('wb', 'wretched-banquet', 'p1', 'hand');
  put('demon', 'illusory-demon', 'p1', 'battlefield'); // 4/3 własny — z oferty
  enemyField.forEach((cid, i) => put(`e${i}`, cid, 'p2', 'battlefield'));
  return state;
}

function plain(labelHtml) { return String(labelHtml).replace(/<[^>]+>/g, ''); }

// Realny commandLabel potrzebuje sesji z nazwami — wystarcza mini-stub czytający
// rejestr (etykietę składa commandLabel + publiczny widok).
function sessionStub() {
  return {
    nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? String(cardId ?? '?'),
    nameOfObject: (id) => String(id ?? '?'),
    cardDetails: (cardId) => REGISTRY.get(cardId) ?? null,
  };
}

function offerFor(state, targetId) {
  const view = playerView(state, 'p1');
  const cmd = view.legalCommands.find((c) => c.type === 'cast_spell'
    && c.objectId === 'wb' && (c.targets ?? []).includes(targetId));
  assert.ok(cmd, `oferta cast_spell Wretched Banquet → ${targetId} powinna istnieć (cel legalny)`);
  return { cmd, view };
}

test('M248/1: oferta „destroy if least power" w stwora powyżej minimum NIESIE ostrzeżenie fizzle', () => {
  // Wróg ma 1/2 (rustwing-falcon) — Illusory Demon 4/3 nie jest najmniejszy.
  const { cmd, view } = offerFor(game(['rustwing-falcon']), 'demon');
  const label = plain(commandLabel(cmd, sessionStub(), view));
  assert.match(label, /UWAGA: czar fizzluje/, `etykieta ma ostrzegać, było: ${label}`);
  assert.match(label, /najmniejszej mocy/, label);
});

test('M248/2: cel o najmniejszej mocy — etykieta BEZ ostrzegania (legalne, działa)', () => {
  // Wróg ma 1/2 i 4/4: celujemy w 1/2 — destroy_if_least_power zadziała.
  const { cmd, view } = offerFor(game(['rustwing-falcon', 'lurking-green-dragon']), 'e0');
  const label = plain(commandLabel(cmd, sessionStub(), view));
  assert.ok(!/UWAGA: czar fizzluje/.test(label), `bez ostrzeżenia przy słusznej niższej mocy: ${label}`);
});

test('M248/3: remis o minimum („tied for least") — bez ostrzegania', () => {
  // Dwa równe minima: „or is tied for least power" — warunek SPEŁNIONY.
  const state = game(['rustwing-falcon', 'rustwing-falcon']);
  // druga ary my z celującym ilusory? cel = e0 (1/2), demon 4/3 — min wśród wszystkich = 1.
  const { cmd, view } = offerFor(state, 'e0');
  const label = plain(commandLabel(cmd, sessionStub(), view));
  assert.ok(!/UWAGA: czar fizzluje/.test(label), `remis o minimum ma działać: ${label}`);
});
