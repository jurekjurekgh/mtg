// E7/D2 (zgłoszenie właściciela z testów żywej gry): bot rzucił Frightful
// Delusion („counter target spell unless its controller pays {1}") na czar
// właściciela, choć właściciel miał nietapnięty ląd i mógł zapłacić {1} —
// „bot powinien czekać, aż owner wyda całą manę. Inaczej marnuje swój czar".
//
// Root cause: wycena kontr traktuje `counter_spell_unless_pays` DOKŁADNIE jak
// `counter_spell` (Batch 44: „premia jak counter_spell") — nie modeluje
// dopłaty. A dopłata to sedno tego efektu (CR: kontroler celu DECYDUJE): gdy
// kontroler czaru-na-stosie ma czym zapłacić {amount} (pula + nietapnięte
// LĄDY — auto-tap silnika dotyczy wyłącznie lądów, resources.js producibleMana),
// kontra najpewniej wygaśnie bezskutecznie: bot wymienia CAŁĄ kartę z ręki na
// {1}many i odrzut przeciwnika. Trzymaj kontrę — czekaj, aż przeciwnik wyda
// manę (albo aż nie będzie miał czym zapłacić).
//
// Fix (generyczny, ADR 0002): gdy kontroler celu MOŻE zapłacić — wariant
// schodzi poniżej passu; gdy NIE może — pełna premia jak dotąd.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, zone) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  const d = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: d.kind, power: d.power, toughness: d.toughness, manaCost: d.manaCost, spell: d.spell,
    abilities: d.abilities ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
    types: def.types ?? [], colors: d.colors ?? [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function frightfulChoice({ opponentUntappedLands, opponentPool = 0 }) {
  const state = createGameState({ seed: 237, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1'); // tura przeciwnika
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 9);
  put(state, 'fr', 'frightful-delusion', 'p2', 'hand');
  // Groźny czar na stosie przeciwnika (wysoki wpływ — pełna premia za kontrę).
  put(state, 'spell', 'fireball', 'p1', 'stack');
  // Zasoby przeciwnika (płatnika {1}): pula + nietapnięte LĄDY.
  for (let i = 0; i < opponentUntappedLands; i++) {
    const land = put(state, `land${i}`, 'basic-island', 'p1', 'battlefield');
    state.objects.set(land.id, Object.freeze({ ...land, tapped: false }));
  }
  if (opponentPool > 0) addMana(state, 'p1', opponentPool);
  return createHeuristicBot({ seed: 237 }).chooseCommand(playerView(state, 'p2'), {});
}

test('E7/D2: bot NIE kontruje unless-pays, gdy kontroler celu ma nietapnięte źródła na {1}', () => {
  const c = frightfulChoice({ opponentUntappedLands: 2 });
  const isCounter = c.type === 'cast_spell' && c.objectId === 'fr';
  assert.ok(!isCounter, `przeciwnik zapłaci {1} — trzymaj kontrę (było: ${JSON.stringify(c)})`);
});

test('E7/D2: bot KONTRUJE unless-pays, gdy kontroler celu nie ma czym zapłacić', () => {
  const c = frightfulChoice({ opponentUntappedLands: 0, opponentPool: 0 });
  const isCounter = c.type === 'cast_spell' && c.objectId === 'fr';
  assert.ok(isCounter, `bez many na {1} kontra jest pełnowartościowa: ${JSON.stringify(c)}`);
});

test('E7/D2: sama PULA (bez lądów) też wystarcza przeciwnikowi na dopłatę', () => {
  const c = frightfulChoice({ opponentUntappedLands: 0, opponentPool: 2 });
  const isCounter = c.type === 'cast_spell' && c.objectId === 'fr';
  assert.ok(!isCounter, `pula {2} pokrywa {1} — trzymaj kontrę: ${JSON.stringify(c)}`);
});
