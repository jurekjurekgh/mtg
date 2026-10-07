// D1-mirror (Żywy Tester 2026-10-07, the-edge s77): bot zablokował
// zaczarowanego Pain for All atakującego gracza i odbite obrażenia go
// dobiły. Symetria D1: bloker zadający obrażenia zaczarowanemu stworowi
// dostaje tyle samo z powrotem („it deals that much damage to each
// opponent") — decyzja declare_blockers musi liczyć ten koszt tą samą
// drabiną (selfLifeLossPenalty) i progiem (reflectedDamageLifeRatio).
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

function stolObrony({ aura = true, zycie = 3, mocBlokera = 4 } = {}) {
  const state = createGameState({ seed: 77, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_blockers', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p1';
  state.players.find((p) => p.id === 'p1').life = zycie;
  // Wróg (p2) atakuje 4/4; bot (p1) broni blokerem o zadanej mocy.
  put(state, 'atk', 'highland-game', 'p2', 'battlefield', { power: 4, toughness: 4 });
  if (aura) {
    put(state, 'aura', 'pain-for-all', 'p2', 'battlefield');
    attachAuraToCreature(state, 'aura', 'atk');
  }
  put(state, 'blk', 'giant-spider', 'p1', 'battlefield', {
    power: mocBlokera, toughness: 4, summoningSickness: false,
  });
  state.combat = { attackingPlayerId: 'p2', attackers: ['atk'], blockers: new Map(), blockedAttackers: new Set() };
  return state;
}

const decyzja = (state) => {
  const bot = createHeuristicBot({ seed: 11 });
  bot.chooseCommand(playerView(state, 'p1'), {});
  const trace = bot.trace()[0];
  return { pick: trace.chosen, options: trace.options };
};

const czyBlokuje = (pick) => /declare_blockers\[atk:blk\]|blk/.test(pick);

test('D1M/1: 3 życia, bloker zada 4 w aurę — bot NIE blokuje (odbicie = śmierć)', () => {
  const { pick } = decyzja(stolObrony({ aura: true, zycie: 3, mocBlokera: 4 }));
  assert.ok(!czyBlokuje(pick), `bot odpuszcza samobójczy blok: ${pick}`);
});

test('D1M/2: ten sam atak BEZ aury — bot blokuje (uratowane życie)', () => {
  const { pick } = decyzja(stolObrony({ aura: false, zycie: 3, mocBlokera: 4 }));
  assert.ok(czyBlokuje(pick), `pod presją życia blokuje normalnie: ${pick}`);
});

test('D1M/3: bloker o mocy 0 nie odbija nic — wolno mu blokować aurę', () => {
  // Anty-over-fix: koszt odbicia dotyczy zadanych obrażeń, nie samego bloku.
  const { pick } = decyzja(stolObrony({ aura: true, zycie: 3, mocBlokera: 0 }));
  assert.ok(czyBlokuje(pick), `blok 0-mocowym w aurę jest bezpieczny: ${pick}`);
});

test('D1M/4: zdrowy bot (20 żyć) i tak nie chce wymiany życia za życie', () => {
  // Odbicie 4 = 2×4 z drabiny, więcej niż +4 za zatrzymane obrażenia —
  // bez presji życia blok w aurę jest stratą blokera bez bilansu życia.
  const { pick } = decyzja(stolObrony({ aura: true, zycie: 20, mocBlokera: 4 }));
  assert.ok(!czyBlokuje(pick), `przy pełnym życiu nie wymienia życia 1:1: ${pick}`);
});
