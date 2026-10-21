// Audyt PR #171 (2026-10-21d), zgłoszenie właściciela U:
//   „Kod nie pilnuje czy płacę X czerną maną. Przed chwilą przy X=1
//    zapłaciłem BRR i czar zadziałał."
//
// Pin H/4: Consume Spirit {X}{1}{B}, Oracle: „Spend only black mana on X."
// Silnik MA obsługę `xCost.black` (legalXCostCasts i castXCostSpell) —
// oferta powinna NIE obejmować X bez czarnej many. Rzut MUSI wymagać
// pipów [(B), (B), (B)] dla X=2 (baza+1 czarny pip na X) i zapłacić
// 3 czarne many. Przy BRR w puli X=1 powinno być ODRZUCONE.
//
// Testujemy zarówno ofertę (`legalXCostCasts`) jak i sam rzut
// (`execute({type:'cast_spell', xValue:1, ...})`). Oba mają odrzucić
// wariant X=1, gdy pula nie ma czarnej many.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addMana } from '../src/engine/resources.js';
import { legalXCostCasts } from '../src/engine/spells.js';
import { jumpToStep } from '../src/engine/turn.js';

const registry = createCardRegistry();

function game() {
  const s = createGameState({ seed: 67, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn.activePlayerId = 'p1';
  s.turn.priorityPlayerId = 'p1';
  s.turn = jumpToStep(s.turn, 'main1', 'p1');
  s.turn.activePlayerId = 'p1';
  s.turn.priorityPlayerId = 'p1';
  return s;
}

function put(state, id, cardId, zone, patch = {}) {
  const def = registry.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: 'p1', ownerId: 'p1',
    zone, ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes,
    keywords: def.keywords ?? [], ...patch,
  });
  return state.objects.get(id);
}

test('U/A ⭐ RED: legalXCostCasts odrzuca X=1 gdy pula ma BRR (brak czarnej many)', () => {
  const s = game();
  put(s, 'cs', 'consume-spirit', 'hand');
  // pool = { B:1, R:2 } — właściciel właśnie taką pulę potwierdził w zgłoszeniu
  // Realny setup: 3 osobne tapnięcia — 1 Swamp (B) + 2 Mountains (R, R).
addMana(s, 'p1', 1, { colors: ['B'] });
addMana(s, 'p1', 1, { colors: ['R'] });
addMana(s, 'p1', 1, { colors: ['R'] });
  const p1 = s.players.find((pl) => pl.id === 'p1');
  console.log('  pula p1:', JSON.stringify({ mana: p1.mana, pool: p1.manaPool }));

  const object = s.objects.get('cs');
  const offers = legalXCostCasts(s, 'p1', 'cs', object, p1.mana);
  console.log('  legalXCostCasts:', JSON.stringify(offers.map((o) => ({ x: o.xValue, targets: o.targets }))));
  // X=0 powinno być legalne (bazowy koszt {1}{B} pokryty 1B+1R z pool — ale tu możemy
  // mieć kolor B w pool, więc {1}{B} = 1 generic + 1 black ⇒ bazowy {1}{B} się
  // opłaci pulą BRR, ale X=0 nie ma pipów koloru, więc się zmieści).
  const x1 = offers.find((o) => o.xValue === 1);
  console.log('  oferta X=1:', x1 ?? 'BRAK');
  assert.equal(x1, undefined,
    'PO FIXIE (NIEZMIENIONE — silnik ma obsługę): oferta X=1 MUSI być odrzucona gdy pula NIE MA czarnej many (tylko 1B na bazie {1}{B}); X płaci się wyłącznie czarną (CR 601.2f/606 + „Spend only black mana on X")');
});

test('U/B ⭐ RED: cast_spell z xValue=1 + pula BRR → execute MUSI odrzucić „Niewystarczająca mana" (nie udaje się)', () => {
  const s = game();
  put(s, 'cs', 'consume-spirit', 'hand');
  // Realny setup: 3 osobne tapnięcia — 1 Swamp (B) + 2 Mountains (R, R).
addMana(s, 'p1', 1, { colors: ['B'] });
addMana(s, 'p1', 1, { colors: ['R'] });
addMana(s, 'p1', 1, { colors: ['R'] });
  // MUSI trafić do X=1 — właściciel mówi „zapłaciłem BRR" i czar zadziałał.
  const r = execute(s, {
    type: 'cast_spell', playerId: 'p1', objectId: 'cs',
    xValue: 1, targets: ['p2'],
  });
  console.log('  cast →', { ok: r.ok, reason: r.reason });
  assert.equal(r.ok, false,
    'PO WYJAŚNIENIU BUGA (czerwona flaga): cast MUSI zostać odrzucony z '
    + 'powodu braku czarnej many na X=1 (nawet jeśli pula ma łącznie 3 many, '
    + 'konieczne są 1B (baza) + 1B (X) = 2 czarne, w puli jest tylko 1B).');
  assert.match(r.reason ?? '', /(Niewystarcz|kolor)/,
    'Powód odrzucenia musi jasno wskazywać na problem z czarną maną, a nie '
    + 'kryć się pod „cant" genericznym.');
});
