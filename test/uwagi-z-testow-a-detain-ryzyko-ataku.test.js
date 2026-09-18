// Uwaga A właściciela z testów (2026-09-18): bot zatrzymał (detain) MOJĄ
// jedyną kreaturę Azorius Justiciarem, po czym NIE zaatakował żadną ze
// swoich czterech stworów, „bo myśli, że mógłbym go zblokować tą swoją,
// która jest detained”. Zlecenie: „Detain (i inne podobne zdolności/aury)
// powinny powodować, że moja kreatura nie jest brana pod uwagę przy
// ocenianiu sensowności i ryzyka ataku przez bota.”
//
// Źródło reguły (ADR 0030 — pobrane, nie z pamięci):
//  • Oracle reminder text detain (snapshot docs/cards/scryfall-azorius-justiciar.json):
//    „(Until your next turn, those creatures can't attack or block and their
//    activated abilities can't be activated.)”
//  • Ruling WotC 2013-04-15 (api.scryfall.com/cards/rtr/6/rulings): „If a
//    creature is already attacking or blocking when it's detained, it won't
//    be removed from combat. It will continue to attack or block.” — czyli
//    detain odbiera możliwość NOWEGO blokowania; już istniejący blok zostaje.
//
// Root cause: `untappedEnemyBlockers` (heuristic-bot.js) = wszystkie
// nietapnięte wrogie stwory — ignoruje jawne pola widoku `detained`
// i `cantBlock` (game-state.js wystawia oba, ADR 0017). Ten jeden helper
// karmi całe ryzyko ataku (declare_attackers, equip, ewazja, tieProjection),
// więc naprawa siedzi w jednym miejscu (L41).
//
// Anty-over-fix: stwór BEZ zakazu (normalny, nietapnięty) nadal liczy się
// jako ryzyko — detektor ma nadal krzyczeć na prawdziwym przypadku (L67).
import test from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

function stanZJednymWrogimStworem(flagiWroga) {
  const state = createGameState({ seed: 11, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  // Cztery nietapnięte stwory 3/3 bota (p1) — bez choroby przywołania.
  for (const id of ['a1', 'a2', 'a3', 'a4']) {
    addObject(state, {
      id, instanceId: `i-${id}`, cardId: 'highland-game', controllerId: 'p1', ownerId: 'p1',
      zone: 'battlefield', kind: 'creature', power: 3, toughness: 3,
      abilities: [], subtypes: [], types: ['Creature'], keywords: [],
    });
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  }
  // Jedyny wróg (p2): duży bloker 4/4 — z zakazem blokowania albo bez.
  addObject(state, {
    id: 'w1', instanceId: 'i-w1', cardId: 'highland-game', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'creature', power: 4, toughness: 4,
    abilities: [], subtypes: [], types: ['Creature'], keywords: [],
  });
  state.objects.set('w1', Object.freeze({ ...state.objects.get('w1'), summoningSickness: false, ...flagiWroga }));
  return state;
}

function wynikiAtaku(state) {
  const view = playerView(state, 'p1');
  // Kontrakt widoku (ADR 0017): zakaz blokowania musi być widoczny.
  const w1 = view.zones.battlefield.find((o) => o.id === 'w1');
  const bot = createHeuristicBot({ seed: 11 });
  const chosen = bot.chooseCommand(view, {});
  const trace = bot.trace()[0];
  const passScore = trace.options.find((o) => o.cmd === 'pass_priority')?.score ?? Number.NEGATIVE_INFINITY;
  const attacks = trace.options.filter((o) => o.cmd.startsWith('attack['));
  assert.ok(attacks.length > 0, 'oferta ataku musi istnieć');
  const best = attacks.reduce((max, o) => (o.score > max.score ? o : max), attacks[0]);
  const fullAttack = attacks.find((o) => o.cmd === 'attack[a1,a2,a3,a4]');
  return { w1, chosen, passScore, best, fullAttack };
}

test('A/1: widok niesie zakazy blokowania wroga (kontrakt ADR 0017)', () => {
  const state = stanZJednymWrogimStworem({ cantBlock: true });
  const view = playerView(state, 'p1');
  const w1 = view.zones.battlefield.find((o) => o.id === 'w1');
  assert.equal(w1.cantBlock, true, 'widok niesie cantBlock');

  const state2 = stanZJednymWrogimStworem({});
  state2.objects.set('w1', Object.freeze({
    ...state2.objects.get('w1'), detained: true, detainedUntilTurn: state2.turn.number + 2,
  }));
  const view2 = playerView(state2, 'p1');
  assert.equal(view2.zones.battlefield.find((o) => o.id === 'w1').detained, true, 'widok niesie detain');
});

test('A/2: jedyny wróg jest detained → bot atakuje pełnym składem (nie pasuje)', () => {
  const state = stanZJednymWrogimStworem({});
  const turaDetainera = state.turn.number + 2; // until your next turn (CR 701.29)
  state.objects.set('w1', Object.freeze({ ...state.objects.get('w1'), detained: true, detainedUntilTurn: turaDetainera }));
  const { w1, chosen, passScore, best } = wynikiAtaku(state);
  assert.equal(w1.detained, true, 'widok pokazuje flagę detain');
  assert.ok(best.score > passScore,
    `najlepszy atak (${best.score}) musi bić pass (${passScore}), gdy jedyny wróg jest detained`);
  assert.equal(chosen?.type, 'declare_attackers', 'bot wybiera atak, nie pass');
  assert.ok((chosen.attackerIds ?? []).length >= 3, 'bot atakuje niemal pełnym składem');
});

test('A/3: jedyny wróg ma „can\u2019t block” (aura/cecha) → bot też atakuje', () => {
  const state = stanZJednymWrogimStworem({ cantBlock: true });
  const { w1, chosen, passScore, best } = wynikiAtaku(state);
  assert.equal(w1.cantBlock, true, 'widok pokazuje zakaz blokowania');
  assert.ok(best.score > passScore,
    `najlepszy atak (${best.score}) musi bić pass (${passScore}), gdy jedyny wróg nie może blokować`);
  assert.equal(chosen?.type, 'declare_attackers');
});

test('A/4 (anty-over-fix): wróg BEZ zakazu nadal liczy się jako ryzyko bloku', () => {
  const detained = stanZJednymWrogimStworem({});
  const turaDetainera = detained.turn.number + 2;
  detained.objects.set('w1', Object.freeze({ ...detained.objects.get('w1'), detained: true, detainedUntilTurn: turaDetainera }));
  const wynikDetained = wynikiAtaku(detained);

  const normalny = stanZJednymWrogimStworem({});
  const wynikNormalny = wynikiAtaku(normalny);

  assert.ok(wynikNormalny.fullAttack, 'oferta pełnego ataku istnieje w obu wariantach');
  assert.ok(wynikDetained.fullAttack.score > wynikNormalny.fullAttack.score,
    `ryzyko bloku musi obniżać atak: normalny bloker ${wynikNormalny.fullAttack.score} < detained ${wynikDetained.fullAttack.score}`);
});
