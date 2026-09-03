// Audyt PR #93 (2026-09-03), znalezisko B — darmowy rzut DISCOVER (CR 701.53)
// gubił czary modalne: predykat „prostego zakresu” wycinał `spell.modes`, a
// gałąź czaru kładła obiekt na stos bez `chosenMode`. Skutek: czar z „Choose
// one” trafiony przez Discover w ogóle nie był rzucalny — zostawało „weź do
// ręki”, choć Oracle pozwala rzucić i wybrać tryb.
//
// Ta sama klasa co znalezisko A (okno zdolności Vaana), ale inna ścieżka:
// Discover NIE enumeruje celów (M280/F — czar celowany fizzlowałby bez celów,
// CR 608.2b), więc w ofercie są wyłącznie tryby, które celów nie potrzebują.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { commandLabel } from '../src/table/render.js';

const REGISTRY = createCardRegistry();
const MODAL_SORCERY = 'aerith-rescue-mission';   // tryb 0: trzy tokeny Hero (bez celów)
const TARGETED_MODAL = 'vandalize';              // każdy tryb wymaga celu (artefakt / ląd)

function game(playerId = 'p1') {
  const state = createGameState({ seed: 93, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

/** Stan z decyzją Discover i wygnaną („znalezioną”) kartą `cardId`. */
function discoverState(cardId) {
  const state = game();
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id: 'found', instanceId: 'i-found', cardId, controllerId: 'p1', ownerId: 'p1', zone: 'exile',
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  state.pendingDiscover = {
    playerId: 'p1', foundExileId: 'found', foundCardId: cardId,
    restExileIds: [], restorePriorityTo: 'p1', amount: 4,
  };
  return state;
}

/** Etykieta bez znaczników HTML (jak w testach diamentowej odznaki). */
const plain = (html) => String(html).replace(/<[^>]*>/g, '');

const offers = (state, playerId = 'p1') => playerView(state, playerId).legalCommands
  .filter((c) => c.type === 'resolve_discover_choice');
const freeOffers = (state) => offers(state).filter((c) => c.castFree === true);

function resolveStack(state, limit = 40) {
  for (let i = 0; i < limit && state.zones.stack.length > 0; i += 1) {
    const pass = playerView(state, state.turn.priorityPlayerId).legalCommands.find((c) => c.type === 'pass_priority');
    if (!pass) break;
    const r = execute(state, pass);
    if (!r.ok && /(_unresolved|not_your_decision)$/.test(r.events[0]?.reason ?? '')) break;
  }
}

test('A93/B: Discover oferuje darmowy rzut czaru modalnego — z wyborem trybu', () => {
  const state = discoverState(MODAL_SORCERY);
  const free = freeOffers(state);
  assert.ok(free.length > 0,
    'czar z „Choose one” jest rzucalny z Discover (CR 701.53 nie zna wyjątku dla '
    + 'czarów modalnych); dziś jedyną ofertą jest „weź do ręki”');
  assert.ok(free.some((c) => c.modeIndex === 0), 'wariant niesie wybrany tryb');
  assert.ok(offers(state).some((c) => c.castFree === false), '„weź do ręki” nadal dostępne');
});

test('A93/B: darmowy rzut wykonuje efekt WYBRANEGO trybu (nie pierwszego z brzegu)', () => {
  const state = discoverState(MODAL_SORCERY);
  const cast = freeOffers(state).find((c) => c.modeIndex === 0);
  const r = execute(state, cast);
  assert.ok(r.ok, `komenda przyjęta (${r.events[0]?.reason ?? ''})`);
  const stacked = [...state.objects.values()].find((o) => o.zone === 'stack' && o.cardId === MODAL_SORCERY);
  assert.ok(stacked, 'czar na stosie');
  assert.equal(stacked.chosenMode, 0, 'obiekt na stosie pamięta wybrany tryb');
  const spellCast = state.events.find((e) => e.type === 'spell_cast' && e.cardId === MODAL_SORCERY);
  assert.ok(spellCast, 'zdarzenie rzutu istnieje');
  assert.equal(spellCast.modeIndex ?? spellCast.object?.chosenMode, 0,
    'zdarzenie niesie informację o trybie — opis nie odtworzy jej ze stanu (L107)');
  resolveStack(state);
  const heroes = [...state.objects.values()].filter((o) => o.cardId === 'token_hero' && o.zone === 'battlefield');
  assert.equal(heroes.length, 3, 'rozstrzygnięcie wykonuje efekt trybu 0 (trzy tokeny Hero)');
});

test('A93/B: tryb WYMAGAJĄCY celu pozostaje poza ofertą (Discover nie enumeruje celów)', () => {
  // Vandalize — każdy z trzech trybów celuje w artefakt i/lub ląd.
  const state = discoverState(TARGETED_MODAL);
  assert.ok(offers(state).some((c) => c.castFree === false), '„weź do ręki” zawsze legalne');
  assert.equal(freeOffers(state).length, 0,
    'tryb z celem nie może być oferowany — czar wszedłby na stos bez celów '
    + 'i sfizzlował (CR 608.2b, uwaga właściciela F z M280)');
});

test('A93/B: komenda spoza oferty jest ODRZUCONA, a nie fizzluje na stosie', () => {
  const withoutMode = discoverState(MODAL_SORCERY);
  const r1 = execute(withoutMode, { type: 'resolve_discover_choice', playerId: 'p1', castFree: true });
  assert.equal(r1.ok, false, 'rzut modalny bez wyboru trybu: odrzucony (L48: oferta = walidacja)');
  assert.equal(withoutMode.zones.stack.length, 0, 'żaden czar nie wszedł na stos');

  const targeted = discoverState(TARGETED_MODAL);
  const r2 = execute(targeted, { type: 'resolve_discover_choice', playerId: 'p1', castFree: true, modeIndex: 0 });
  assert.equal(r2.ok, false, 'tryb wymagający celu: odrzucony');
  assert.equal(targeted.zones.stack.length, 0);

  const bogus = discoverState(MODAL_SORCERY);
  assert.equal(execute(bogus, { type: 'resolve_discover_choice', playerId: 'p1', castFree: true, modeIndex: 7 }).ok, false,
    'nieistniejący tryb: odrzucony');
});

test('A93/B: etykieta stołu nazywa TRYB — dwa warianty nie wyglądają identycznie', () => {
  // Ruinous Rampage: oba tryby są bezcelowe, więc oferta ma dwa warianty.
  const state = discoverState('ruinous-rampage');
  const free = freeOffers(state);
  assert.equal(free.length, 2, 'dwa warianty rzutu (po jednym na tryb)');
  const found = [...state.objects.values()].find((o) => o.id === 'found');
  const session = {
    view: () => ({
      status: 'active', winnerId: null, playerId: 'p1',
      players: [{ id: 'p1', name: 'Ty', life: 20 }, { id: 'p2', name: 'On', life: 20 }],
      zones: { battlefield: [], hand: [], stack: [], graveyard: [], exile: [found], library: [] },
      turn: { number: 1, activePlayerId: 'p1', phase: 'precombat_main', step: 'precombat_main' },
      legalCommands: [],
    }),
    nameOf: (id) => REGISTRY.get(id)?.name ?? id,
    nameOfObject: (id) => id,
    cardDetails: (id) => REGISTRY.get(id) ?? null,
    colorsOf: (id) => REGISTRY.get(id)?.colors ?? [],
    abilitiesOf: (id) => REGISTRY.get(id)?.abilities ?? [],
    log: [], reasoning: [], state: { seed: 1 },
  };
  const labels = free.map((cmd) => plain(commandLabel(cmd, session, session.view())));
  assert.equal(new Set(labels).size, 2, `etykiety muszą się różnić: ${labels.join(' | ')}`);
  for (const mode of REGISTRY.get('ruinous-rampage').spell.modes) {
    assert.ok(labels.some((l) => l.includes(mode.name)),
      `etykieta nazywa tryb „${mode.name}” (M91/uwaga D) — gracz wybiera na ślepo`);
  }
});

test('A93/B: strażnik klasy — każdy czar modalny katalogu: tryb bezcelowy → oferta, celowy → cisza', () => {
  const modalCards = REGISTRY.all().filter((card) => (card.spell?.modes ?? []).length > 0);
  assert.ok(modalCards.length >= 10, `katalog ma czary modalne (znaleziono ${modalCards.length})`);
  const bledy = [];
  for (const card of modalCards) {
    const state = discoverState(card.id);
    const free = freeOffers(state);
    const targetlessModes = card.spell.modes
      .map((mode, index) => ({ mode, index }))
      .filter(({ mode }) => (mode.targets ?? []).length === 0 && !mode.variableTargets)
      .map(({ index }) => index);
    if (targetlessModes.length === 0) {
      // Karta, w której KAŻDY tryb wymaga celu (Vandalize) — oferta milczy.
      if (free.length > 0) bledy.push(`${card.id}: oferuje tryb wymagający celu`);
      continue;
    }
    const offered = free.map((c) => c.modeIndex).sort();
    if (offered.length === 0) {
      bledy.push(`${card.id}: brak oferty, choć tryby ${targetlessModes.join(',')} nie wymagają celów`);
      continue;
    }
    for (const modeIndex of offered) {
      if (!targetlessModes.includes(modeIndex)) bledy.push(`${card.id}: oferuje tryb celowany #${modeIndex}`);
    }
  }
  assert.deepEqual(bledy, [],
    'Discover musi oferować dokładnie te tryby, które nie wymagają celów — reguła '
    + 'nie zależy od wybranej karty (ADR 0002)');
});
