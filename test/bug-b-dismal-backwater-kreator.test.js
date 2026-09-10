import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { manaSourcesOf, sourceColorsLabel } from '../src/table/mana-wizard.js';
import { getSourceForObject } from '../src/engine/mana-sources.js';

/**
 * Zgłoszenie właściciela B (2026-09-10): „Dismal Backwater w kreatorze many
 * jest opisany jako »Tapnij: Dismal Backwater (bezbarwna)«. Chodzi o ikonki
 * many — niebieską i czarną.” ({T}: Add {U} or {B} — Oracle.)
 *
 * Root cause: widok pola bitwy (playerView) NIE niesie deskryptorów zdolności
 * (abilities) obiektów. `untappedLandSourcesOf` liczy kolory lądu przez
 * `getSourceForObject(obiekt_z_widoku)` — dla lądów opisywanych deskryptorem
 * (Dismal Backwater, Balamb Garden, Manor Gate…) gałąź deskryptora nie widzi
 * zdolności i ląd wpada w zachowawczy fallback „colorless”. Silnik płacenia
 * czyta PEŁNY stan (dlatego rzut w ogóle działał), więc rozjazd był cichy
 * (klasa L14/L41 — dwie kopie tej samej reguły).
 *
 * Fix: ląd bez kolorów w widoku pyta o produkcję mostek `abilityInfo`
 * (pełny stan sesji — ten sam, którego kreator używa dla źródeł
 * nie-lądowych), z indeksem zdolności `null` = „produkcja za samo {T}”.
 * Lądy rzeczywiście bezbarwne (Basilisk Gate {C}) zostają bezbarwne —
 * pełny stan też im kolorów nie przypisuje.
 */

const REGISTRY = createCardRegistry();

function game(playerId = 'p1') {
  const state = createGameState({ seed: 109, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function putCard(state, id, cardId, controllerId, patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone: 'battlefield',
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, ...patch,
  });
  return state.objects.get(id);
}

/** Mostek abilityInfo 1:1 jak w main.js (pełny stan sesji). */
function makeAbilityInfo(state) {
  return (objectId, abilityIndex) => {
    const obj = state.objects?.get(objectId);
    if (!obj) return null;
    // Fix B: indeks null = pytanie o produkcję „za samo {T}” całego obiektu
    // (fallback kolorów lądów, których deskryptorów nie niesie widok).
    if (abilityIndex == null) {
      const src = getSourceForObject(obj, state);
      if (!src || (src.amount ?? 0) <= 0) return null;
      return {
        cardId: obj.cardId, colors: src.colors ?? [], amount: src.amount ?? 1,
        manaCost: 0, costColors: [],
        isLand: obj.kind === 'land' || (obj.types ?? []).includes('Land'),
      };
    }
    const ability = obj.abilities?.[abilityIndex];
    const effects = Array.isArray(ability?.effect) ? ability.effect : [ability?.effect];
    if (!effects.some((e) => e?.type === 'add_mana')) return null;
    const src = getSourceForObject(obj, state);
    return {
      cardId: obj.cardId, colors: src?.colors ?? [], amount: src?.amount ?? 0,
      manaCost: ability?.cost?.mana ?? 0, costColors: ability?.cost?.colors ?? [],
      isLand: obj.kind === 'land' || (obj.types ?? []).includes('Land'),
    };
  };
}

test('B/1: Dismal Backwater w kreatorze produkuje {U}{B}, nie „bezbarwna”', () => {
  const state = game('p1');
  putCard(state, 'bw', 'dismal-backwater', 'p1');
  putCard(state, 'l1', 'basic-swamp', 'p1');
  const view = playerView(state, 'p1');
  // Widok nie niesie abilities — to właśnie warunek błędu.
  const viewBw = view.zones.battlefield.find((o) => o.id === 'bw');
  assert.ok(viewBw, 'setup: Dismal Backwater w widoku');
  assert.ok(!viewBw.abilities, 'setup: widok bez deskryptorów zdolności');

  const sources = manaSourcesOf(view, 'p1', makeAbilityInfo(state));
  const bw = sources.find((s) => s.id === 'bw');
  assert.ok(bw, 'Dismal Backwater jest źródłem many');
  assert.deepEqual(bw.colors, ['U', 'B'],
    `ląd z Oracle „{T}: Add {U} or {B}” nie może być bezbarwny (jest: ${JSON.stringify(bw.colors)})`);
  // Etykieta kreatora: ikonki kolorów zamiast „bezbarwna”.
  assert.ok(!sourceColorsLabel(bw.colors).includes('bezbarwna'), 'etykieta bez „bezbarwna”');
});

test('B/2: lądy rzeczywiście bezbarwne zostają bezbarwne (Basilisk Gate)', () => {
  const state = game('p1');
  putCard(state, 'gate', 'basilisk-gate', 'p1');
  const sources = manaSourcesOf(playerView(state, 'p1'), 'p1', makeAbilityInfo(state));
  const gate = sources.find((s) => s.id === 'gate');
  assert.ok(gate, 'Basilisk Gate jest źródłem many');
  assert.deepEqual(gate.colors, [], '{T}: Add {C} — bezbarwna bez zmian');
  assert.equal(sourceColorsLabel(gate.colors), 'bezbarwna');
});

test('B/3: lądy podstawowe i bez mostka — zachowanie bez zmian', () => {
  const state = game('p1');
  putCard(state, 'l1', 'basic-island', 'p1');
  putCard(state, 'l2', 'basic-swamp', 'p1');
  const sources = manaSourcesOf(playerView(state, 'p1'), 'p1', () => null);
  assert.deepEqual(sources.map((s) => s.colors), [['U'], ['B']],
    'podtypy podstawowe działają bez mostka (CR 305.6)');
});
