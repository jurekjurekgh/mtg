// Regresje z audytu PR #65 (M156, ADR 0020 B) — raport:
// docs/audits/AUDYT_PR65_2026-08-20.md
//
//   F1 — Lotusguard Disciple (Batch 38): `triggerTargetEffectFriendly` nie
//        rozpoznawał `grant_keywords_until_end_of_turn` jako efektu PRZYJAZNEGO,
//        więc bot obdarowywał lifelink+indestructible NAJLEPSZEGO stwora
//        PRZECIWNIKA (friendly=false → preferowany cel wrogi). Klasa L50/M150-A.
//   F2 — Divine Offering (Batch 38): `destroy_artifact_gain_life_mana_value`
//        bez wyceny (remis wariantów = baza 50 > pass) — bot rzucał czar we
//        WŁASNY jedyny artefakt-źródło many. Klasa L50/M91-C/M147-F1.
//   F3 — Divine Offering vs CR: „Destroy target artifact. You gain life equal
//        to its mana value." — zysk życia NIE zależy od powodzenia zniszczenia
//        (indestructible/regeneracja blokują tylko PIERWSZE zdanie; mana value
//        z LKI). Implementacja warunkowała życie faktycznym zniszczeniem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function putCard(state, id, cardId, controllerId, zone, over = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: over.kind ?? data.kind, power: over.power ?? data.power, toughness: over.toughness ?? data.toughness,
    manaCost: over.manaCost ?? data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    keywords: over.keywords ?? def.keywords ?? [], subtypes: over.subtypes ?? def.subtypes ?? [],
    types: over.types ?? def.types ?? [], colors: data.colors ?? [], cardName: def.name,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

/** Tura gracza `pid` (main, priorytet, mana). */
function turnOf(pid, opponent) {
  const state = createGameState({ seed: 65, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', pid);
  state.turn.activePlayerId = pid;
  state.turn.priorityPlayerId = pid;
  addMana(state, pid, 10);
  addMana(state, opponent, 10);
  return state;
}

/** Kolejkuje decyzję celu triggera dokładnie jak processTriggers (pendingTriggerTargets). */
function queueTriggerTarget(state, source, ability) {
  state.pendingTriggerTargets.push({
    playerId: source.controllerId, sourceId: source.id, cardId: source.cardId,
    ability: Object.freeze(JSON.parse(JSON.stringify(ability))), candidates: [],
    allowNone: false, fixedTargetIds: [], extra: {},
  });
}

// --- F1: przyjazny trigger grant_keywords celuje we WŁASNEGO stwora ---
test('F1a: bot obdarowuje keywordami WŁASNEGO stwora (Lotusguard ETB)', () => {
  const state = turnOf('p2', 'p1');
  putCard(state, 'mine', 'highland-game', 'p2', 'battlefield', { power: 2, toughness: 2 });
  putCard(state, 'foe', 'thornhide-wolves', 'p1', 'battlefield');
  const lotus = putCard(state, 'lotus', 'lotusguard-disciple', 'p2', 'battlefield');
  queueTriggerTarget(state, lotus, REGISTRY.get('lotusguard-disciple').abilities[0]);

  const view = playerView(state, 'p2');
  // Flaga friendly w ofertach (liczona z deskryptora efektu — ADR 0002).
  const offers = view.legalCommands.filter((c) => c.type === 'resolve_trigger_target');
  assert.ok(offers.length > 0, 'są oferty celu triggera');
  assert.ok(offers.every((o) => o.friendly === true),
    `grant_keywords ma być klasyfikowany jako przyjazny: ${JSON.stringify(offers)}`);

  const choice = createHeuristicBot({ seed: 65 }).chooseCommand(view, {});
  assert.equal(choice.type, 'resolve_trigger_target');
  assert.equal(choice.targetId, 'mine',
    `bot ma obdarować WŁASNEGO stwora, nie wroga: ${JSON.stringify(choice)}`);
});

// --- F1 (anty-over-fix): wrogi trigger celuje nadal we wroga ---
test('F1b: wrogi trigger (exile_nonland_permanent_linked, Static Net) celuje we wroga', () => {
  const state = turnOf('p2', 'p1');
  putCard(state, 'mine', 'highland-game', 'p2', 'battlefield', { power: 2, toughness: 2 });
  putCard(state, 'foe', 'thornhide-wolves', 'p1', 'battlefield');
  const net = putCard(state, 'net', 'static-net', 'p2', 'battlefield');
  queueTriggerTarget(state, net, REGISTRY.get('static-net').abilities[0]);

  const choice = createHeuristicBot({ seed: 65 }).chooseCommand(playerView(state, 'p2'), {});
  assert.equal(choice.type, 'resolve_trigger_target');
  assert.equal(choice.targetId, 'foe',
    `wygnanie linked ma celować w permanent PRZECIWNIKA: ${JSON.stringify(choice)}`);
});

// --- F2: Divine Offering — brak samobójczego rzutu we własny artefakt ---
test('F2a: bot NIE rzuca Divine Offering we własny jedyny artefakt', () => {
  const state = turnOf('p2', 'p1');
  putCard(state, 'offering', 'divine-offering', 'p2', 'hand');
  putCard(state, 'own-talisman', 'pristine-talisman', 'p2', 'battlefield');

  const choice = createHeuristicBot({ seed: 65 }).chooseCommand(playerView(state, 'p2'), {});
  assert.notEqual(choice.type, 'cast_spell',
    `bot zniszczył czarem własny artefakt-źródło many: ${JSON.stringify(choice)}`);
});

test('F2b: bot rzuca Divine Offering w artefakt przeciwnika (deterministycznie)', () => {
  const state = turnOf('p2', 'p1');
  putCard(state, 'offering', 'divine-offering', 'p2', 'hand');
  putCard(state, 'own-talisman', 'pristine-talisman', 'p2', 'battlefield');
  putCard(state, 'foe-lantern', 'seers-lantern', 'p1', 'battlefield');

  const choice = createHeuristicBot({ seed: 65 }).chooseCommand(playerView(state, 'p2'), {});
  assert.equal(choice.type, 'cast_spell', `bot powinien rzucić czar: ${JSON.stringify(choice)}`);
  assert.equal(choice.targets?.[0], 'foe-lantern',
    `cel ma być artefakt przeciwnika: ${JSON.stringify(choice)}`);
});

// --- F3: życie z Divine Offering niezależne od powodzenia zniszczenia (CR) ---
test('F3: artefakt z indestructible przeżywa, ale życie jest przyznane', () => {
  const state = turnOf('p1', 'p2');
  putCard(state, 'offering', 'divine-offering', 'p1', 'hand');
  putCard(state, 'foe-art', 'seers-lantern', 'p2', 'battlefield', { keywords: ['indestructible'] });
  const mv = REGISTRY.get('seers-lantern').manaCost;
  assert.ok(mv > 0, 'artefakt ma niezerowy mana value dla sensu testu');

  const lifeBefore = state.players.find((p) => p.id === 'p1').life;
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'offering', targets: ['foe-art'] }).ok);
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });

  assert.equal(state.objects.get('foe-art')?.zone, 'battlefield',
    'indestructible: destroy nie ma efektu (CR 702.12)');
  const lifeAfter = state.players.find((p) => p.id === 'p1').life;
  assert.equal(lifeAfter, lifeBefore + mv,
    `życie = mana value celu niezależnie od powodzenia destroy (${lifeBefore} → ${lifeAfter}, MV=${mv})`);
});
