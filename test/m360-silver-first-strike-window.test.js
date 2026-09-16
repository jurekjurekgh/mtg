import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';

const REGISTRY = createCardRegistry();

function game(pid = 'p1') {
  const state = createGameState({ seed: 360, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', pid);
  state.turn.activePlayerId = pid;
  state.turn.priorityPlayerId = pid;
  return state;
}

function putCard(state, id, cardId, controllerId, zone) {
  const def = REGISTRY.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, aura: def.aura ?? null,
  });
  const o = state.objects.get(id);
  if (zone === 'battlefield') state.objects.set(id, Object.freeze({ ...o, summoningSickness: false }));
  return state.objects.get(id);
}

function libs(state) {
  for (let i = 0; i < 12; i++) {
    putCard(state, `l1-${i}`, 'basic-forest', 'p1', 'library');
    putCard(state, `l2-${i}`, 'basic-forest', 'p2', 'library');
  }
}

function toCombatDamage(state, attackerIds, assignments, active = 'p1', defender = 'p2') {
  state.turn = jumpToStep(state.turn, 'declare_attackers', active);
  state.turn.activePlayerId = active;
  assert.ok(execute(state, { type: 'declare_attackers', playerId: active, attackerIds }).ok);
  execute(state, { type: 'pass_priority', playerId: active });
  execute(state, { type: 'pass_priority', playerId: defender });
  assert.ok(execute(state, { type: 'declare_blockers', playerId: defender, assignments }).ok);
  execute(state, { type: 'pass_priority', playerId: defender });
  execute(state, { type: 'pass_priority', playerId: active });
  assert.equal(state.turn.step, 'combat_damage');
}

function resolveCombat(state, by = 'p1') {
  const cmd = playerView(state, by).legalCommands.find((c) => c.type === 'resolve_combat');
  assert.ok(cmd, 'oferta resolve_combat');
  const r = execute(state, cmd);
  assert.ok(r.ok, r.events?.[0]?.reason);
}

// M360/Srebro B3 (CR 510.4 + 510.3, mtg.wiki/Combat_damage_step, CR 2026-08-07,
// pobrane 2026-09-16): przy first/double strike są DWA kroki obrażeń („If any
// attacking or blocking creatures have first strike or double strike, there is
// an additional combat damage step"), a po KAŻDYM aktywny dostaje priorytet
// (510.3: „the active player gets priority"). Silnik robił oba przebiegi
// w jednej komendzie bez okna.
test('M360/B3a: okno między first strike a zwykłymi obrażeniami (Shock ratuje sierżanta)', () => {
  const state = game();
  libs(state);
  putCard(state, 'sarge', 'akroan-sergeant', 'p1', 'battlefield'); // 2/2 first strike
  putCard(state, 'blk', 'etherium-abomination', 'p2', 'battlefield'); // 4/3
  putCard(state, 'shock', 'shock', 'p1', 'hand');
  toCombatDamage(state, ['sarge'], { sarge: ['blk'] });
  addMana(state, 'p1', 8, { colors: ['R'] }); // mana nie przechodzi między krokami (CR 500.4)
  // Przebieg first strike: 2 w blokera (3 wytrzymałości — żyje).
  resolveCombat(state, 'p1');
  // Po pierwszym kroku obrażeń gra WRACA do priorytetu — drugi resolve dopiero po nim.
  assert.equal(state.turn.step, 'combat_damage', 'krok obrażeń trwa (drugi przebieg przed nami)');
  const shock = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'shock');
  assert.ok(shock, 'Shock grywalny między przebiegami (CR 510.3)');
  assert.ok(execute(state, { ...shock, targets: ['blk'] }).ok);
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' }); // Shock rozstrzyga: bloker 2+2 = martwy
  assert.equal(state.objects.get('blk')?.zone ?? 'graveyard', 'graveyard', 'bloker zginął przed zwykłymi obrażeniami');
  resolveCombat(state, 'p1'); // drugi przebieg: nikogo — sierżant przeżył
  assert.equal(state.turn.step, 'end_of_combat');
  assert.equal(state.objects.get('sarge')?.zone, 'battlefield', 'sierżant przeżył dzięki oknu');
});

// CR 510.4: w drugim kroku biją ci, co „mieli ani first ani double strike,
// GDY PIERWSZY KROK SIĘ ZACZĄŁ” — nadanie first strike pomiędzy nie wyklucza.
test('M360/B3b: nadany między krokami first strike nie kasuje zwykłych obrażeń', () => {
  const state = game();
  libs(state);
  putCard(state, 'sarge', 'akroan-sergeant', 'p1', 'battlefield');
  putCard(state, 'grizzly', 'skinbrand-goblin', 'p1', 'battlefield'); // 2/2 bez strike
  putCard(state, 'blk', 'akroan-sergeant', 'p2', 'battlefield');
  putCard(state, 'blade', 'squires-lightblade', 'p1', 'hand'); // Flash, ETB: FS do EOT
  toCombatDamage(state, ['sarge', 'grizzly'], { sarge: ['blk'] }); // grizzly nieblokowany
  addMana(state, 'p1', 10, { colors: ['W'] }); // mana nie przechodzi między krokami (CR 500.4)
  resolveCombat(state, 'p1'); // first strike: sarge bije blokera
  const blade = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === 'blade');
  assert.ok(blade, 'Lightblade (flash) grywalny między przebiegami');
  assert.ok(execute(state, { ...blade }).ok);
  // ETB trigger: cel grizzly.
  let g = 0;
  while (state.zones.stack.length > 0 && g++ < 12) {
    const me = state.turn.priorityPlayerId;
    const tgt = playerView(state, me).legalCommands.find((c) => c.type === 'resolve_trigger_target');
    if (tgt) { execute(state, { ...tgt, targetId: 'grizzly' }); continue; }
    execute(state, { type: 'pass_priority', playerId: me });
  }
  const lifeBefore = state.players.find((p) => p.id === 'p2').life;
  resolveCombat(state, 'p1'); // drugi przebieg: grizzly bije gracza MIMO nadanego FS
  const lifeAfter = state.players.find((p) => p.id === 'p2').life;
  // 2 (moc) + 1 (pompa Lightblade'a) — grizzly zadał MIMO nadanego first strike.
  assert.equal(lifeBefore - lifeAfter, 3, 'grizzly zadał zwykłe obrażenia (miał ani strike na początku)');
});

// Pin: bez first/double strike — jedna komenda jak dotąd (zero churnu UX).
test('M360/B3c: bez strike — pojedynczy resolve_combat kończy obrażenia', () => {
  const state = game();
  libs(state);
  putCard(state, 'grizzly', 'skinbrand-goblin', 'p1', 'battlefield');
  putCard(state, 'blk', 'skinbrand-goblin', 'p2', 'battlefield');
  toCombatDamage(state, ['grizzly'], { grizzly: ['blk'] });
  resolveCombat(state, 'p1');
  assert.equal(state.turn.step, 'end_of_combat', 'jeden resolve kończy obrażenia');
  assert.equal(state.pendingCombatSecondPass ?? null, null, 'brak pending drugiego przebiegu');
});
