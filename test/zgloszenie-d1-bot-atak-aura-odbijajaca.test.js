// Zgłoszenie D1 właściciela (2026-10-07): bot atakując stwora z aurą
// odbijającą (Pain for All — „Whenever enchanted creature is dealt damage,
// it deals that much damage to each opponent") musi liczyć, że odbite
// obrażenia trafią w NIEGO. Dyrektywa właściciela: gdy odbicie stanowi więcej
// niż 25% życia bota, atak nie powinien nastąpić. Implementacja generyczna —
// po deskryptorze triggera aury z widoku (ADR 0002), koszt przez wspólną
// drabinę samouszkodzenia (PMSSB-36) + odstraszacz po przekroczeniu progu
// (pokrętła reflectedDamageLifeRatio / reflectedDamageDeterrent).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { attachAuraToCreature } from '../src/engine/attachments.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, ...patch,
  });
  return state.objects.get(id);
}

function stol({ aura = true, zycie = 20, flying = false, bloker = 'giant-spider' } = {}) {
  const state = createGameState({ seed: 157, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.players.find((p) => p.id === 'p1').life = zycie;
  // Bot (p1): atakujący 6/6. Wróg (p2): bloker 2/3 (ew. z aurą odbijającą).
  put(state, 'atk', 'highland-game', 'p1', 'battlefield', {
    power: 6, toughness: 6, summoningSickness: false,
    ...(flying ? { keywords: ['flying'] } : {}),
  });
  put(state, 'blk', bloker, 'p2', 'battlefield', { summoningSickness: false });
  if (aura) {
    put(state, 'aura', 'pain-for-all', 'p2', 'battlefield');
    attachAuraToCreature(state, 'aura', 'blk');
  }
  return state;
}

const decyzja = (state) => {
  const bot = createHeuristicBot({ seed: 7 });
  bot.chooseCommand(playerView(state, 'p1'), {});
  const trace = bot.trace()[0];
  return { pick: trace.chosen, options: trace.options };
};

const scoreAtaku = (options, attackerId) => {
  const opt = options.find((o) => o.cmd === `attack[${attackerId}]`);
  return opt ? opt.score : null;
};

test('D1/1: bloker z aurą odbijającą (6 > 25% z 20 żyć) — bot NIE atakuje', () => {
  const { pick, options } = decyzja(stol({ aura: true, zycie: 20 }));
  const score = scoreAtaku(options, 'atk');
  assert.ok(score != null, 'opcja ataku istnieje');
  assert.ok(score < 0, `atak w aurę odbijającą nieopłacalny: score=${score}`);
  assert.ok(!pick.includes('atk'), `bot nie wystawia atakującego: ${pick}`);
});

test('D1/2: ten sam układ BEZ aury — bot atakuje', () => {
  const { pick, options } = decyzja(stol({ aura: false, zycie: 20 }));
  const score = scoreAtaku(options, 'atk');
  assert.ok(score != null && score > 0, `czysty atak opłacalny: score=${score}`);
  assert.ok(pick.includes('atk'), `bot atakuje bez aury: ${pick}`);
});

test('D1/3: aura nie sięga latającego (brak bloku) — odstraszacz nie działa', () => {
  // Bloker bez flying/reach (highland-game 2/1) — latający nie może zostać
  // zablokowany, więc odbicie nie grozi i odstraszacz nie działa.
  const zAura = decyzja(stol({ aura: true, zycie: 20, flying: true, bloker: 'highland-game' }));
  const bezAury = decyzja(stol({ aura: false, zycie: 20, flying: true, bloker: 'highland-game' }));
  const sA = scoreAtaku(zAura.options, 'atk');
  const sB = scoreAtaku(bezAury.options, 'atk');
  assert.equal(sA, sB, `latający omija aurę: z aurą ${sA} == bez ${sB}`);
  assert.ok(zAura.pick.includes('atk'), 'latający atakuje mimo aury');
});

test('D1/4: im niższe życie, tym mocniej kara rośnie (drabina PMSSB-36)', () => {
  const zdrowy = scoreAtaku(decyzja(stol({ aura: true, zycie: 20 })).options, 'atk');
  const ranny = scoreAtaku(decyzja(stol({ aura: true, zycie: 4 })).options, 'atk');
  assert.ok(ranny < zdrowy, `przy 4 życiach kara surowsza: ${ranny} < ${zdrowy}`);
});
