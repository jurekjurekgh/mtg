import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute } from '../src/engine/game-state.js';
import { initialTurn, jumpToStep } from '../src/engine/turn.js';

// Audyt PR #170 (2026-10-21, polowanie CR 702.15 Lifelink / 615.6): zdarzenie
// `damage_dealt` przy CZĘŚCIOWO zapobiegniętych obrażeniach bojowych na GRACZA
// trafiało do strumienia komendy DWUKROTNIE (state.events raz — log i triggery
// w porządku, ale wynik `resolve_combat` niósł duplikat, więc stół rysował
// dwa razy linię „X zadaje N (gracz)").
//
// Root cause (combat.js dealCombatDamageToPlayer): przy `prevented > 0`
// strumień komendy dostawał `state.events.slice(before)` — ciosem
// damage_prevented (tarcze/statyczna prewencja) ORAZ damage_dealt — po czym
// łańcuch if/else wypychał damage_dealt jeszcze raz. Ścieżka blokera
// (assignDamageToAttackers) ma checkpoint tuż przed tarczami i jest czysta;
// wzorzec „push do state.events + raz do events" (triggers.js) naruszony
// tylko w ścieżce obrażeń na gracza.
//
// Rekreacja buga: mutacja `if (prevented > 0) events.push(...state.events.slice(before))`
// z powrotem na `slice(before)` czerwieni oba testy poniżej.

function addAttacker(state) {
  addObject(state, {
    id: 'att', instanceId: 'i-att', cardId: 'c-att', controllerId: 'p1', zone: 'battlefield',
    kind: 'creature', power: 5, toughness: 5, manaCost: 2, abilities: [], keywords: ['lifelink'],
    subtypes: [], types: ['Creature'], colors: [],
  });
  state.objects.set('att', Object.freeze({ ...state.objects.get('att'), summoningSickness: false }));
}

function enterCombat() {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep({ ...initialTurn('p1') }, 'declare_attackers', 'p1');
  addAttacker(state);
  execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['att'] });
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: {} });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  return state;
}

test('A: częściowo zapobiegnięte obrażenia na gracza — damage_dealt w strumieniu komendy RAZ (CR 615.6)', () => {
  const state = enterCombat();
  // Tarcza Withstand „prevent the next 3 damage" na graczu p2.
  state.damageShields = [{ targetId: 'p2', remaining: 3, sourceCardId: 'withstand' }];
  const r = execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' });
  assert.equal(r.ok, true, JSON.stringify(r.events));

  // Stan gry: 5 − 3 zapobiegnięte = 2 zadane; lifelink liczy tylko ZADANE (CR 702.15b).
  assert.equal(state.players.find((p) => p.id === 'p2').life, 18);
  assert.equal(state.players.find((p) => p.id === 'p1').life, 22);

  // Strumień komendy: damage_dealt dokładnie raz, z kwotą zadaną (CR 615.6).
  const dealt = r.events.filter((e) => e.type === 'damage_dealt' && e.target === 'p2');
  assert.equal(dealt.length, 1, `damage_dealt w wyniku komendy: ${dealt.length}×`);
  assert.equal(dealt[0].amount, 2);

  // Zdarzenie prewencji (tarcza) nadal obecne w strumieniu — log „zniwelowane 3".
  const prevented = r.events.filter((e) => e.type === 'damage_prevented');
  assert.equal(prevented.length, 1);
  assert.equal(prevented[0].amount, 3);

  // Globalny strumień (triggery) — bez zmian, raz.
  assert.equal(state.events.filter((e) => e.type === 'damage_dealt' && e.target === 'p2').length, 1);
});

test('B: pełna prewencja i brak prewencji — strumień komendy bez duplikatów', () => {
  // Pełna prewencja: tarcza 7 zjada całość — damage_dealt z kwotą 0 raz.
  const full = enterCombat();
  full.damageShields = [{ targetId: 'p2', remaining: 7, sourceCardId: 'withstand' }];
  const rFull = execute(full, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' });
  assert.equal(rFull.ok, true, JSON.stringify(rFull.events));
  assert.equal(rFull.events.filter((e) => e.type === 'damage_dealt' && e.target === 'p2').length, 1);
  assert.equal(full.players.find((p) => p.id === 'p2').life, 20);
  assert.equal(full.players.find((p) => p.id === 'p1').life, 20, 'lifelink: 0 zadanych = 0 życia (CR 702.15b)');

  // Bez prewencji — ścieżka historyczna bez zmian: raz.
  const plain = enterCombat();
  const rPlain = execute(plain, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' });
  assert.equal(rPlain.ok, true, JSON.stringify(rPlain.events));
  assert.equal(rPlain.events.filter((e) => e.type === 'damage_dealt' && e.target === 'p2').length, 1);
  assert.equal(plain.players.find((p) => p.id === 'p2').life, 15);
});
