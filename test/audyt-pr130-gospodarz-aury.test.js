// Audyt PR #130 (ADR 0020 pkt 2) — pin RED dla znaleziska D.
//
// D. `return_permanent_from_graveyard` (effects.js) wybierał gospodarza aury
//    automatem: `state.zones.battlefield.find(hostId => isLegalAuraHost(...))`
//    — czyli PIERWSZEGO legalnego gospodarza w kolejności strefy. Tymczasem
//    CR 303.4f i ruling OTJ 2024-04-12 (Annie Flash, the Veteran) mówią, że
//    gracz „chooses what it will enchant" w chwili wejścia aury: to nie jest
//    celowanie (hexproof/protection nie blokują), ale JEST decyzją gracza, gdy
//    legalnych gospodarzy jest więcej niż jeden. Silnik odbierał ten wybór.
//
//    Osiągalne kartami z kolekcji właściciela (ADR 0029): Zoraline
//    („return target permanent card with mana value 3 or less") i Annie Flash
//    (to samo + allowLands) mogą wrócić aurę — w katalogu są 23 aury o MV ≤ 3
//    (Curiosity, Glaring Aegis, Containment Membrane …).
//
//    Reguła naprawy (wzorzec `resolveCraftExileOutcome`, L41): zero
//    gospodarzy → karta zostaje w grobie (jak dotąd), dokładnie JEDEN → wybór
//    bez alternatywy domyka się sam (jak dotąd), dwóch i więcej → blokująca
//    decyzja `pendingAuraHost` / `resolve_aura_host`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';

const registry = createCardRegistry();

function game(players = ['p1', 'p2']) {
  const state = createGameState({ seed: 131, players: players.map((id) => ({ id })) });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  for (const playerId of players) for (let i = 0; i < 4; i++) put(state, `lib-${playerId}-${i}`, 'basic-swamp', playerId, 'library');
  return state;
}

function put(state, id, cardId, playerId = 'p1', zone = 'hand') {
  const def = registry.get(cardId);
  assert.ok(def, `${cardId} w prawdziwym rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId,
    zone, ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes, keywords: def.keywords,
  });
  return state.objects.get(id);
}

const commands = (s, p = s.turn.priorityPlayerId) => playerView(s, p).legalCommands;
const find = (s, cardId, zone = 'battlefield') => [...s.objects.values()].find((o) => o.cardId === cardId && o.zone === zone);
const reasonOf = (r) => r?.events?.find((e) => e.type === 'command_rejected')?.reason ?? '';

function run(s, cmd) {
  assert.ok(cmd, 'oferta komendy istnieje');
  const r = execute(s, cmd);
  assert.ok(r.ok, `komenda przyjęta (${reasonOf(r)})`);
  return r;
}

function resolve(s) {
  for (let i = 0; s.zones.stack.length && i < 40; i += 1) {
    const choices = commands(s);
    run(s, choices.find((c) => c.type.startsWith('resolve_')) ?? choices.find((c) => c.type === 'pass_priority'));
  }
  assert.equal(s.zones.stack.length, 0, 'cały stos rozstrzygnięty');
}

/** Rzuca Annie Flash i dochodzi do rozstrzygnięcia triggera (cel = aura z grobu). */
function annieReturnsAura(s, { extraCreatures = 0 } = {}) {
  for (let i = 0; i < extraCreatures; i += 1) put(s, `walker-${i}`, 'lightwalker', 'p1', 'battlefield');
  put(s, 'annie', 'annie-flash-the-veteran');
  put(s, 'gy-membrane', 'containment-membrane', 'p1', 'graveyard'); // „Enchant creature”, MV 3
  addMana(s, 'p1', 6, { colors: ['R', 'G', 'W'] });
  run(s, commands(s).find((c) => c.type === 'cast_permanent' && c.objectId === 'annie'));
  // Stos: czar → trigger z celem. Odpowiadamy na cel i passujemy, aż efekt
  // wróci aurę (albo stos się wyczerpie).
  for (let i = 0; i < 24 && s.zones.stack.length > 0 && !s.pendingAuraHost; i += 1) {
    const choices = commands(s);
    const pick = choices.find((c) => c.type === 'resolve_trigger_target')
      ?? choices.find((c) => c.type === 'pass_priority');
    assert.ok(pick, 'jest czym popchnąć rozstrzygnięcie triggera');
    run(s, pick);
  }
}

test('audyt PR130/D: dwóch legalnych gospodarzy — o wyborze decyduje gracz (CR 303.4f)', () => {
  const s = game();
  annieReturnsAura(s, { extraCreatures: 2 }); // Lightwalker ×2 + Annie = 3 gospodarzy

  assert.ok(s.pendingAuraHost, 'silnik PYTA o gospodarza, gdy legalnych jest więcej niż jeden');
  assert.equal(s.pendingAuraHost.playerId, 'p1', 'decyduje kontroler efektu');
  const oferty = commands(s).filter((c) => c.type === 'resolve_aura_host');
  assert.equal(oferty.length, 3, 'wariant na każdego legalnego gospodarza (L48: oferta = walidacja)');
  assert.deepEqual(new Set(oferty.map((c) => c.auraHostId)).size, 3, 'warianty są różne');

  // Gracz wybiera NIE pierwszego w kolejności strefy (walker-0), tylko Annie —
  // przed naprawą silnik załączał aurę do `battlefield.find(...)` = walker-0.
  const annieBf = find(s, 'annie-flash-the-veteran', 'battlefield');
  assert.ok(annieBf, 'Annie na polu bitwy');
  run(s, oferty.find((c) => c.auraHostId === annieBf.id));

  const aura = find(s, 'containment-membrane', 'battlefield');
  assert.ok(aura, 'aura weszła na pole bitwy');
  assert.equal(aura.attachedTo, annieBf.id, 'zaczarowany gospodarz WYBRANY przez gracza');
  assert.equal(aura.tapped, true, 'ruling OTJ: wraca tapnięta (entersTapped)');
  assert.equal(s.pendingAuraHost ?? null, null, 'decyzja zdjęta');
  resolve(s);
  assert.equal(s.zones.stack.length, 0, 'stos domknięty po decyzji');
});

test('audyt PR130/D: jeden legalny gospodarz — wybór bez alternatywy domyka się sam', () => {
  const s = game();
  annieReturnsAura(s, { extraCreatures: 0 }); // tylko Annie
  assert.equal(s.pendingAuraHost ?? null, null, 'brak decyzji, gdy alternatywy nie ma (L41)');
  resolve(s);
  const aura = find(s, 'containment-membrane', 'battlefield');
  assert.ok(aura, 'aura weszła');
  assert.equal(aura.attachedTo, find(s, 'annie-flash-the-veteran', 'battlefield').id, 'załączona do jedynego gospodarza');
});

test('audyt PR130/D: nielegalny gospodarz odrzucony, decyzja czeka dalej', () => {
  const s = game();
  annieReturnsAura(s, { extraCreatures: 1 }); // Lightwalker + Annie
  assert.ok(s.pendingAuraHost, 'decyzja otwarta');
  const oferty = commands(s).filter((c) => c.type === 'resolve_aura_host');
  assert.equal(oferty.length, 2, 'dwa warianty');
  const zly = execute(s, { type: 'resolve_aura_host', playerId: 'p1', auraHostId: 'lib-p1-0' });
  assert.equal(zly.ok, false, 'karta z biblioteki nie jest gospodarzem');
  assert.match(reasonOf(zly), /aura_host/, 'powód nazywa decyzję');
  assert.ok(s.pendingAuraHost, 'decyzja nadal czeka — gracz wybiera legalnie');
  assert.equal(find(s, 'containment-membrane', 'battlefield'), undefined, 'aura jeszcze nie weszła');
  run(s, oferty.find((c) => c.auraHostId === 'walker-0'));
  assert.equal(find(s, 'containment-membrane', 'battlefield')?.attachedTo, 'walker-0', 'wybór przyjęty');
});
