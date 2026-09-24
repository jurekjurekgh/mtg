// Audyt PR #136 (sesja 2026-09-24f) — znalezisko F-2.
//
// Wspólny predykat celu „card from an opponent's graveyard"
// (`zones.isCardInOpponentGraveyard`) odsiewał tokeny heurystyką po polu
// `name == null` („obiekty kart mają name: null"). Pole `name` noszą jednak
// NIE TYLKO tokeny: kopia permanentu powstała przez `enterAsCopy` dostaje
// nazwę kopiowanego celu (CR 707.2, `game-state.js:3899`) i NIE ma `isToken`
// (`test/c-enter-as-copy-name.test.js:57` — „karta wchodząca jako kopia to NIE
// token"). Pole nie jest kasowane przy zmianie strefy (`objects.js:203` —
// spread `...object`), więc poległa kopia leży w grobie z `name` ustawionym.
//
// CR 108.2b (dosłownie, CR 2026-09-25): „Tokens aren't considered cards—even
// a card-sized game supplement that represents a token isn't considered a card
// for rules purposes." — z bycia kartą wykluczone są WYŁĄCZNIE tokeny, więc
// karta wchodząca jako kopia jest w grobie zwykłą kartą swojego właściciela
// i jest legalnym celem. Naprawa czyta jawną flagę `isToken` (L43: jawna flaga
// zamiast domysłu po innym polu) w OBU bliźniaczych gałęziach (L41):
// `zones.js` (Scavenging Harpy, Batch 59) i `triggers.js:412` (Puppeteer Clique
// — ta sama heurystyka sprzed PR #136).
//
// Pomiar PRZED (sonda audytu): grób {cardId: 'jwari-shapeshifter',
// name: 'Coralhelm Guide', isToken: false, controllerId: 'p2'} →
// `isCardInOpponentGraveyard(…, 'p1')` = false, pula ETB Harpy = ['goblin-piker'].
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { markDamage, replaceObject } from '../src/engine/permanents.js';
import { runStateBasedActions } from '../src/engine/state-based.js';
import { isCardInOpponentGraveyard } from '../src/engine/zones.js';
import { triggerTargetCandidates } from '../src/engine/triggers.js';
import { moveObjectDirectly } from '../src/engine/objects.js';
import { createBattlefieldToken } from '../src/engine/tokens.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, ownerId, zone = 'battlefield', extra = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  // Pełny `gameObjectDataOf` (jak w `test/c-enter-as-copy-name.test.js`) — m.in.
  // `cardName` (nazwa kopiowalna) i `enterAsCopy`.
  addObject(state, {
    ...gameObjectDataOf(def), types: def.types, keywords: def.keywords, subtypes: def.subtypes ?? [],
    id, instanceId: `i-${id}`, cardId, controllerId: ownerId, ownerId, zone, ...extra,
  });
  return state.objects.get(id);
}

function game() {
  const state = createGameState({ seed: 136, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p2';
  return state;
}

/** Jwari Shapeshifter (WWK) wchodzi jako kopia wskazanego sojuszniczego stwora. */
function resolveCopyAs(state, sourceId, targetId, playerId = 'p2') {
  replaceObject(state, state.objects.get(sourceId), { enteringAsCopy: true });
  state.pendingEnterAsCopy = { playerId, sourceId, candidateIds: [targetId], restorePriorityTo: null };
  const cmd = playerView(state, playerId).legalCommands
    .find((c) => c.type === 'resolve_enter_as_copy' && c.targetId === targetId);
  assert.ok(cmd, `kopia ${targetId} oferowana dla ${sourceId}`);
  assert.ok(execute(state, cmd).ok);
}

/** Poległa kopia: obrażenia śmiertelne + SBA (realna ścieżka śmierci). */
function killCopyInOpponentGraveyard(state) {
  put(state, 'guide', 'coralhelm-guide', 'p2');
  put(state, 'jwari', 'jwari-shapeshifter', 'p2');
  resolveCopyAs(state, 'jwari', 'guide');
  assert.equal(state.objects.get('jwari').name, 'Coralhelm Guide', 'kopia nosi nazwę celu (CR 707.2)');
  assert.notEqual(state.objects.get('jwari').isToken, true, 'karta wchodząca jako kopia to NIE token');
  markDamage(state, 'jwari', 5, 'guide');
  runStateBasedActions(state);
  const graveId = state.zones.graveyard.find((id) => state.objects.get(id).cardId === 'jwari-shapeshifter');
  assert.ok(graveId, 'Jwari leży w grobie');
  return state.objects.get(graveId);
}

test('F-2: poległa kopia „enter as copy" w grobie przeciwnika JEST kartą (CR 108.2b)', () => {
  const state = game();
  const grave = killCopyInOpponentGraveyard(state);
  assert.equal(grave.zone, 'graveyard');
  // Karta poza polem bitwy nie ma kontrolera — model trzyma właściciela
  // (`objects.js:137-139`, CR 400.3/110.2a).
  assert.equal(grave.controllerId, 'p2', 'w grobie kontrolerem jest właściciel');
  assert.notEqual(grave.isToken, true, 'to karta, nie token');
  assert.equal(isCardInOpponentGraveyard(grave, 'p1'), true,
    'CR 108.2b wyklucza z bycia kartą wyłącznie tokeny — kopia karty jest kartą');
});

test('F-2: pula celu ETB Scavenging Harpy zawiera poległą kopię przeciwnika', () => {
  const state = game();
  put(state, 'goblin', 'goblin-piker', 'p2');
  const grave = killCopyInOpponentGraveyard(state);
  markDamage(state, 'goblin', 5, 'guide');
  runStateBasedActions(state);

  put(state, 'harpy', 'scavenging-harpy', 'p1');
  const pool = triggerTargetCandidates(state, { type: 'card_in_opponent_graveyard' }, state.objects.get('harpy'));
  assert.ok(pool.includes(grave.id), `pula = ${pool.join(', ')} — brakuje kopii`);
  assert.ok(pool.length >= 2, 'w puli jest i Goblin Piker, i kopia');
});

test('F-2: bliźniacza gałąź Puppeteer Clique widzi poległą kopię-stwora (L41)', () => {
  const state = game();
  const grave = killCopyInOpponentGraveyard(state);
  put(state, 'clique', 'puppeteer-clique', 'p1');
  const pool = triggerTargetCandidates(
    state, { type: 'creature_card_in_opponent_graveyard' }, state.objects.get('clique'),
  );
  assert.ok(pool.includes(grave.id), `pula = ${pool.join(', ')} — brakuje kopii-stwora`);
});

test('F-2 anty-over-fix: TOKEN w grobie przeciwnika NIE jest kartą (CR 108.2b)', () => {
  const state = game();
  // Realny token (flaga `isToken` z `tokens.js`), potem do grobu jedynym
  // choke pointem zmian stref (poświęcony token leży w grobie do SBA).
  createBattlefieldToken(state, 'p2', {
    cardId: 'token_human', name: 'Human', kind: 'creature', power: 1, toughness: 1,
    colors: ['W'], types: ['Creature'], subtypes: ['Human'],
  });
  const tokenId = state.zones.battlefield.find((id) => state.objects.get(id).cardId === 'token_human');
  assert.ok(tokenId, 'token na polu bitwy');
  const token = state.objects.get(moveObjectDirectly(state, tokenId, 'graveyard', 'grave-token').id);
  assert.equal(token.isToken, true, 'token ma jawną flagę');
  assert.ok(token.name, 'token nosi nazwę');
  assert.equal(isCardInOpponentGraveyard(token, 'p1'), false,
    'token nie jest kartą — nie może być celem „target card from a graveyard"');

  put(state, 'harpy', 'scavenging-harpy', 'p1');
  const pool = triggerTargetCandidates(state, { type: 'card_in_opponent_graveyard' }, state.objects.get('harpy'));
  assert.deepEqual(pool, [], `pula = ${pool.join(', ')} — token nie może być kandydatem`);
});

test('F-2 anty-over-fix: karta z WŁASNEGO grobu nadal nie jest celem', () => {
  const state = game();
  const mine = put(state, 'moja', 'goblin-piker', 'p1', 'graveyard');
  put(state, 'harpy', 'scavenging-harpy', 'p1');
  assert.equal(isCardInOpponentGraveyard(mine, 'p1'), false, 'cel tylko z grobu PRZECIWNIKA');
  const pool = triggerTargetCandidates(state, { type: 'card_in_opponent_graveyard' }, state.objects.get('harpy'));
  assert.deepEqual(pool, [], 'pusty grób przeciwnika = brak kandydatów (M106/Z2)');
});
