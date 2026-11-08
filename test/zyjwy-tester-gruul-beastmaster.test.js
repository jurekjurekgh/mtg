// Żywy Tester runda E2 (audyt PR #182, 2026-11-08, partia b2): Gruul
// Beastmaster atakował razem z Duskmantle Seerem (6/6) — po rozstrzygnięciu
// triggera ataku to BEASTMASTER (2/2) dostał +2/+0 (sam siebie), zamiast
// „another target creature you control”. Przyczyna: definicja karty niosła
// cel w schemacie czarów (`targets:` na poziomie ZDOLNOŚCI), którego ŻADNA
// gałąź `tryFire` nie czyta (wszystkie czytają `trigger.requiresTarget`) —
// trigger wchodził na stos z pustą listą celów i `pump` (effects.js) spadł
// na domyślny cel: `targets[0] ?? sourceObject.id` (gałąź dla landfall).
// Potrójne naruszenie z jednego zapisu: (1) kontroler nigdy nie wybierał
// celu (CR 603.3d), (2) „another” (notSelf) zignorowane, (3) przy
// braku innego stwora zdolność pompowała źródło zamiast nie wchodzić na
// stos (CR 603.3d). Beastmaster był JEDYNĄ kartą w katalogu z ability-level
// `targets` na triggerze (T4 pilnuje, żeby nie wróciła druga).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { effectivePower } from '../src/engine/permanents.js';
import { triggerEffectIsHostile, triggerTargetEffectFriendly } from '../src/engine/game-state.js';

const REGISTRY = createCardRegistry();

function game() {
  const state = createGameState({ seed: 424, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

function putCard(state, id, cardId, controllerId = 'p1') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone: 'battlefield',
    ...data, types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, equipment: def.equipment,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function passBoth(state) {
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
}

test('E2/BM-1: atak z dwoma innymi stworami — kontroler WYBIERA cel (decyzja istnieje)', () => {
  const state = game();
  putCard(state, 'beast', 'gruul-beastmaster');
  putCard(state, 'elk1', 'highland-game');
  putCard(state, 'elk2', 'highland-game');
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['beast'] }).ok);
  // Dwa kandydatury (M242: jeden kandydat = autocel, tu MUSI być pytanie).
  assert.ok(state.pendingTriggerTargets.length > 0, 'decyzja celu triggera ataku (CR 603.3d)');
  const offers = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'resolve_trigger_target');
  const ids = offers.map((c) => c.targetId).sort();
  assert.deepEqual(ids, ['elk1', 'elk2'], 'kandydaci: INNE własne stwory, źródło wykluczone (notSelf)');
  assert.ok(execute(state, offers.find((c) => c.targetId === 'elk1')).ok);
  passBoth(state);
  assert.equal(effectivePower(state.objects.get('elk1'), state), 4, 'cel: 2 + X (X = moc źródła = 2)');
  assert.equal(effectivePower(state.objects.get('beast'), state), 2, 'źródło bez pompy (nie celowało siebie)');
  assert.equal(effectivePower(state.objects.get('elk2'), state), 2, 'niewybrany stwór bez pompy');
});

test('E2/BM-2: atak z jednym innym stworem — autocel ląduje na NIM, nie na źródle', () => {
  const state = game();
  putCard(state, 'beast', 'gruul-beastmaster');
  putCard(state, 'elk', 'highland-game');
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['beast'] }).ok);
  passBoth(state);
  assert.equal(effectivePower(state.objects.get('elk'), state), 4, 'jedyny legalny cel dostał +2/+0');
  assert.equal(effectivePower(state.objects.get('beast'), state), 2, 'źródło nie napompowało siebie');
});

test('E2/BM-3: atak w pojedynkę — trigger nie wchodzi na stos (CR 603.3d), zero pompy', () => {
  const state = game();
  putCard(state, 'beast', 'gruul-beastmaster');
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['beast'] }).ok);
  assert.equal(state.zones.stack.length, 0, 'brak legalnego celu = zdolność nie trafia na stos');
  assert.ok(state.events.some((e) => e.noEffect === true && e.reason === 'no_targets'),
    'wpis „brak celów” (M106/Z2: gracz dowiaduje się, dlaczego nic)');
  passBoth(state);
  assert.equal(effectivePower(state.objects.get('beast'), state), 2, 'samotny Beastmaster bez samopompy');
});

test('E2/BM-4 (strażnik): żaden trigger w katalogu nie niesie ability-level `targets`', () => {
  const winni = [];
  for (const def of REGISTRY.all()) {
    for (const ab of def.abilities ?? []) {
      if (ab?.type === 'triggered' && Array.isArray(ab.targets) && ab.targets.length > 0) {
        winni.push(def.id);
      }
    }
  }
  assert.deepEqual(winni, [],
    '`targets` na triggerze jest cicho ignorowane (tryFire czyta requiresTarget) — cel triggera to `trigger.requiresTarget`');
});

test('E2/BM-5: klasyfikator intencji zna dynamiczne kwoty pumpa (znak, nie tekst)', () => {
  // 'source_power' (Beastmaster): moc źródła — przyjazny, jak liczbowy +X.
  assert.equal(triggerTargetEffectFriendly({ effect: { type: 'pump', power: 'source_power', toughness: 0 } }), true);
  assert.equal(triggerEffectIsHostile({ type: 'pump', power: 'source_power', toughness: 0 }), false);
  // Licznik typów (Altar of the Goyf): liczba ≥ 0 — przyjazny.
  assert.equal(triggerTargetEffectFriendly({ effect: { type: 'buff_creature_until_end_of_turn', power: 'card_types_in_all_graveyards', toughness: 'card_types_in_all_graveyards' } }), true);
  // permanent_count z ujemnym mnożnikiem (Bloodtithe ×−2): debuff — wrogi.
  const ujemny = { kind: 'permanent_count', types: ['Artifact'], subtypes: ['Blood'], token: true, multiplier: -2 };
  assert.equal(triggerEffectIsHostile({ type: 'pump', power: ujemny, toughness: ujemny }), true);
  assert.equal(triggerTargetEffectFriendly({ effect: { type: 'pump', power: ujemny, toughness: ujemny } }), false);
  // Nieznana dynamika: ani wroga, ani przyjazna — strażnik klasyfikacji
  // zawoła o świadome rozszerzenie (nie cicha domyślność).
  assert.equal(triggerEffectIsHostile({ type: 'pump', power: 'jakis_nowy_deskryptor', toughness: 0 }), false);
  assert.equal(triggerTargetEffectFriendly({ effect: { type: 'pump', power: 'jakis_nowy_deskryptor', toughness: 0 } }), false);
  // Liczby bez zmian: +2/+0 przyjazny, −1/−1 wrogi, +2/−2 wrogi (Moray).
  assert.equal(triggerTargetEffectFriendly({ effect: { type: 'pump', power: 2, toughness: 0 } }), true);
  assert.equal(triggerEffectIsHostile({ type: 'pump', power: -1, toughness: -1 }), true);
  assert.equal(triggerEffectIsHostile({ type: 'pump', power: 2, toughness: -2 }), true);
  assert.equal(triggerTargetEffectFriendly({ effect: { type: 'pump', power: 2, toughness: -2 } }), false);
});
