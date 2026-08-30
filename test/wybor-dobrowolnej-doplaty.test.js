// M101/B — zgłoszenie właściciela (2026-08-15): trigger Furious Forebear
// z „dobrowolną dopłatą" pokazuje DWIE opcje o IDENTYCZNEJ treści:
//
//     [ Dobrowolna dopłata ]
//     [ Dobrowolna dopłata ]
//
// Nie da się wybrać właściwej — gracz klika w ciemno, a wybór decyduje
// o zapłaceniu many i odpaleniu efektu („You may pay {N}. When you do, …").
//
// Root cause: `commandLabel` w src/table/render.js NIE MA gałęzi `case` dla
// `resolve_optional_pay_choice`, więc obie komendy (pay: true / pay: false)
// spadają do `default`, gdzie etykietą jest nazwa TYPU komendy
// (REASONING_ACTION_LABELS['resolve_optional_pay_choice'] === 'Dobrowolna
// dopłata'). Nazwa typu opisuje CAŁĄ decyzję, a nie poszczególną opcję —
// dokładnie tak samo dla obu wariantów. Sąsiednie wybory tak/nie
// (resolve_food_choice, resolve_discover_choice, resolve_explore_choice)
// mają własne gałęzie i opisują skutek każdej opcji.
//
// Ten sam defekt dotyczy `resolve_pay_or_sacrifice` („Zapłata albo
// poświęcenie" × 2) — ta sama klasa błędu, ta sama poprawka.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commandLabel } from '../src/table/render.js';

const view = {
  zones: { hand: [], battlefield: [], stack: [], graveyard: [], library: [], exile: [] },
  players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Nieprzyjaciel' }],
};
const session = { nameOf: (id) => String(id), nameOfObject: (id) => String(id), cardDetails: () => null };

const label = (cmd) => commandLabel(cmd, session, view);

test('M101/B: dwie opcje dobrowolnej dopłaty mają RÓŻNE etykiety', () => {
  const tak = label({ type: 'resolve_optional_pay_choice', playerId: 'p1', pay: true });
  const nie = label({ type: 'resolve_optional_pay_choice', playerId: 'p1', pay: false });
  assert.notEqual(tak, nie, `obie opcje wyglądają identycznie: „${tak}"`);
});

test('M101/B: etykieta mówi, CO robi dana opcja (zapłać / nie płać)', () => {
  const tak = label({ type: 'resolve_optional_pay_choice', playerId: 'p1', pay: true });
  const nie = label({ type: 'resolve_optional_pay_choice', playerId: 'p1', pay: false });
  assert.match(tak, /zapłać/i, tak);
  assert.match(nie, /nie płać|rezygn|bez /i, nie);
});

test('M101/B: znany koszt dopłaty trafia do etykiety', () => {
  // Gracz musi wiedzieć, ILE płaci, zanim kliknie (komenda niesie koszt,
  // gdy silnik go zna — etykieta ma go pokazać, jak inne oferty rzutów).
  const tak = label({ type: 'resolve_optional_pay_choice', playerId: 'p1', pay: true, cost: 2 });
  assert.match(tak, /2/, tak);
});

test('M101/B: zgłoszony przypadek — trigger Furious Forebear ({1}{W}) w prawdziwej grze', async () => {
  const { createGameState, execute, addObject, playerView } = await import('../src/engine/game-state.js');
  const { createCardRegistry } = await import('../src/cards/card-data.js');
  const { gameObjectDataOf } = await import('../src/cards/materialize.js');
  const { addMana } = await import('../src/engine/resources.js');
  const registry = createCardRegistry();
  const addCard = (state, id, cardId, zone) => {
    const def = registry.get(cardId);
    const data = gameObjectDataOf(def);
    addObject(state, {
      id, instanceId: `i-${id}`, cardId, controllerId: 'p1', zone,
      kind: data.kind, power: data.power, toughness: data.toughness, manaCost: data.manaCost,
      spell: data.spell, abilities: data.abilities ?? [], keywords: def.keywords ?? [],
      subtypes: def.subtypes ?? [], types: def.types ?? [], colors: data.colors ?? [],
      cardName: def.name,
    });
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  };
  const state = createGameState({ players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Nieprzyjaciel' }], seed: 1 });

  // M257-r5b/B: test niezależny od strony startu — pin aktora (p1).
  state.turn.activePlayerId = 'p1'; state.turn.priorityPlayerId = 'p1';
  addCard(state, 'ff', 'furious-forebear', 'graveyard');
  addCard(state, 'ofiara', 'monastery-flock', 'battlefield');
  addMana(state, 'p1', 4);
  // Śmierć innego stwora pod kontrolą gracza odpala trigger z dopłatą {1}{W}.
  state.objects.set('ofiara', Object.freeze({ ...state.objects.get('ofiara'), damage: 99 }));
  execute(state, { type: 'pass_priority', playerId: 'p1' });

  const gameView = playerView(state, 'p1');
  const opcje = gameView.legalCommands.filter((c) => c.type === 'resolve_optional_pay_choice');
  assert.equal(opcje.length, 2, 'trigger miał zaoferować wybór tak/nie');

  const gameSession = {
    nameOf: (id) => registry.get(id)?.name ?? String(id),
    nameOfObject: (id) => {
      const o = state.objects.get(id);
      return o ? (registry.get(o.cardId)?.name ?? id) : String(id);
    },
    cardDetails: (id) => registry.get(id),
  };
  const etykiety = opcje.map((c) => commandLabel(c, gameSession, gameView));
  assert.notEqual(etykiety[0], etykiety[1], `obie opcje identyczne: „${etykiety[0]}"`);
  const plain = etykiety.map((t) => t.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
  // Nazwa źródła i koszt {1}{W} — gracz wie, za co płaci.
  assert.ok(plain.some((t) => /Zapłać/.test(t) && /Furious Forebear/.test(t) && /1.*W/.test(t)), plain.join(' | '));
  assert.ok(plain.some((t) => /Nie płać/.test(t)), plain.join(' | '));
});

test('M101/B: ta sama klasa błędu w „zapłata albo poświęcenie"', () => {
  const tak = label({ type: 'resolve_pay_or_sacrifice', playerId: 'p1', pay: true });
  const nie = label({ type: 'resolve_pay_or_sacrifice', playerId: 'p1', pay: false });
  assert.notEqual(tak, nie, `obie opcje wyglądają identycznie: „${tak}"`);
  assert.match(tak, /zapłać/i, tak);
  assert.match(nie, /poświęć/i, nie);
});
