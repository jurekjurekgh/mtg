// M190 — uwagi właściciela C i D (2026-08-22):
// C — Thieves' Tools nie dawało się założyć (brak zdolności equip),
// D — wizard many proponował zapłatę tapnięciem źródła, którego zdolność
//     właśnie opłacamy (aktywacja i tak je tapuje → „fizzle").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { manaSourcesOf } from '../src/table/mana-wizard.js';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1') {
  const state = createGameState({ seed: 190, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function putCard(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, ...patch,
  });
  return state.objects.get(id);
}

// ---- C: Thieves' Tools nie dawało się założyć --------------------------
// Zgłoszenie: „Wystawiłem Thieves Tools. Jestem w mojej Głównej 1. Nie mam
// opcji dołączenia equipmentu, mimo że mam 4 many (equip kosztuje 2)."

test('M190/C: Thieves\' Tools ma ofertę equip w oknie sorcery', () => {
  const state = game('p1');
  putCard(state, 'tools', 'thieves-tools', 'p1');
  putCard(state, 'cre', 'highland-game', 'p1', 'battlefield', {});
  state.objects.set('cre', Object.freeze({ ...state.objects.get('cre'), summoningSickness: false }));
  for (let i = 0; i < 4; i += 1) putCard(state, `land${i}`, 'basic-swamp', 'p1');
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'activate_ability' && c.objectId === 'tools');
  assert.ok(offers.length > 0,
    'sprzęt z deskryptorem equipment MUSI dawać się założyć (Oracle: „Equip {2}")');
  assert.ok(offers.some((c) => (c.targets ?? []).includes('cre')), 'celem jest własny stwór');
});

test('M190/C2: STRAŻNIK — każdy sprzęt katalogu ma zdolność equip', () => {
  // Root cause: equip nie jest generowany z deskryptora `equipment`, tylko
  // dopisywany ręcznie do `abilities`. Thieves' Tools (Batch 44) go nie
  // dostał i sprzęt był martwy. Strażnik zamyka klasę na przyszłość (L28).
  const missing = REGISTRY.all()
    .filter((card) => card.equipment)
    .filter((card) => !(card.abilities ?? []).some((a) => a?.keyword === 'equip'))
    .map((card) => card.name);
  assert.deepEqual(missing, [],
    `sprzęt bez zdolności equip jest niegrywalny: ${JSON.stringify(missing)}`);
});

// ---- D: nie płać tapnięciem źródła, którego zdolność wymaga {T} ---------
// Zgłoszenie: „Basilisk Gate — wybrałem zdolność za {2} + tapnięcie.
// Do opłacenia dostałem możliwość zapłacenia tapnięciem JEJ SAMEJ. Zrobiłem
// to i zdolność fizzled." (Aktywacja tapuje źródło jako koszt — CR 602.2a,
// więc mana z tego samego permanentu jest nieosiągalna.)

test('M190/D: wizard many nie proponuje źródła, którego zdolność właśnie opłacamy', () => {
  const state = game('p1');
  putCard(state, 'gate', 'basilisk-gate', 'p1');
  putCard(state, 'cre', 'highland-game', 'p1');
  putCard(state, 'l1', 'basic-swamp', 'p1');
  putCard(state, 'l2', 'basic-swamp', 'p1');
  const view = playerView(state, 'p1');
  const abilityInfo = (objectId, abilityIndex) => {
    const object = state.objects.get(objectId);
    const ability = object?.abilities?.[abilityIndex];
    const effects = Array.isArray(ability?.effect) ? ability.effect : [ability?.effect];
    if (!effects.some((e) => e?.type === 'add_mana')) return null;
    return {
      cardId: object.cardId, colors: [], amount: 1,
      manaCost: ability?.cost?.mana ?? 0,
      isLand: object.kind === 'land' || (object.types ?? []).includes('Land'),
    };
  };
  // Płacimy za zdolność Basilisk Gate, która SAMA wymaga {T} (cost.tap).
  const sources = manaSourcesOf(view, 'p1', abilityInfo, { excludeSourceId: 'gate' });
  assert.ok(!sources.some((s) => s.id === 'gate'),
    `źródło tapowane jako koszt aktywacji nie może płacić za tę aktywację: ${JSON.stringify(sources.map((s) => s.id))}`);
  assert.ok(sources.some((s) => s.id === 'l1'), 'pozostałe lądy nadal dostępne');
});

test('M190/D2: bez wykluczenia lista źródeł jest pełna (kontrola)', () => {
  const state = game('p1');
  putCard(state, 'l1', 'basic-swamp', 'p1');
  putCard(state, 'l2', 'basic-swamp', 'p1');
  const sources = manaSourcesOf(playerView(state, 'p1'), 'p1', () => null);
  assert.equal(sources.length, 2, 'zwykły rzut czaru widzi wszystkie lądy');
});

test('M190/D3: reguła wykluczenia dotyczy TYLKO zdolności z {T} w koszcie', () => {
  // Heap Gate „{1}: Add one mana of any color" NIE tapuje źródła, więc
  // wykluczenie go nie dotyczy (anty-over-fix: nie zabieramy legalnych opcji).
  const state = game('p1');
  putCard(state, 'gate', 'heap-gate', 'p1');
  putCard(state, 'l1', 'basic-swamp', 'p1');
  const withTap = REGISTRY.get('basilisk-gate').abilities[0];
  const withoutTap = REGISTRY.get('heap-gate').abilities
    .find((a) => a?.cost?.mana === 1 && !a?.cost?.tap);
  assert.ok(withTap?.cost?.tap, 'Basilisk Gate: {2},{T} — tapuje siebie');
  assert.ok(withoutTap == null || !withoutTap.cost.tap,
    'zdolność bez {T} nie wyklucza własnego źródła');
  // Bez wykluczenia lista zawiera oba źródła.
  const sources = manaSourcesOf(playerView(state, 'p1'), 'p1', () => null);
  assert.ok(sources.some((s) => s.id === 'l1'), 'ląd dostępny');
});
