// Zgłoszenie F (2026-10-13): po przekierowaniu celu czaru Unbreakable Bond
// („Return target creature card from YOUR graveyard to the battlefield…") stół
// zaproponował karty z grobu PRZECIWnika, a właściciel zapytał, czy nie powinien
// wybierać z własnego grobu. Odpowiedź: **nie** — i to silnik ma rację, a nie
// podpowiedź, którą właściciel dostał od AI. Literalne przepisy (ADR 0030,
// pobrane 2026-10-13 z archiwum CR, plik CR-2026-04-17):
//
//   CR 109.5: „The words »you« and »your« on an object refer to the object’s
//   controller, its would-be controller (…), or its owner (…).”
//   → „your graveyard" na czarze przeciwnika to grób KONTROLERA CZARU. Trigger
//   Willbendera zmienia cel czaru, ale nie jego kontrolera ani tekstu — nowy cel
//   nadal musi leżeć w grobie gracza, który rzucił czar.
//
//   CR 115.7a: „If an effect allows a player to »change the target(s)« of a
//   spell or ability, each target can be changed only to another legal target.
//   If a target can’t be changed to another legal target, the original target
//   is unchanged, even if the original target is itself illegal by then.”
//   → nowy cel musi być INNY (stąd wykluczenie obecnego) i legalny; gdy innego
//   nie ma, efekt nic nie zmienia — decyzja nie ma czego pytać.
//
// Druga część pliku to REGRESJA realnego buga, którego ta reguła dotyczy:
// przy braku innego legalnego celu silnik otwierał decyzję bez żadnej opcji
// (w ofercie zostawało samo „concede"], a partia stała w miejscu).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { legalActivatedAbilities } from '../src/engine/abilities.js';
import { effectiveKeywords } from '../src/engine/permanents.js';
import { describeGameEvent } from '../src/table/session.js';
import { choiceGroupTitle } from '../src/table/render.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, zone) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [], types: def.types ?? [],
    colors: data.colors ?? [], cardName: def.name, morph: data.morph ?? null,
  });
  return state.objects.get(id);
}

function giveMana(state, playerId, amount, colors = {}) {
  const player = state.players.find((p) => p.id === playerId);
  player.mana = amount;
  player.manaPool = { ...colors };
}

function passUntilResolved(state, rounds = 8) {
  for (let i = 0; i < rounds && state.zones.stack.length > 0; i += 1) {
    const holder = state.turn.priorityPlayerId;
    const r = execute(state, { type: 'pass_priority', playerId: holder });
    if (!r.ok) return r;
  }
  return null;
}

/**
 * Scena zgłoszenia: p1 ma twarzą-do-dołu Willbendera i coś w swoim grobie;
 * p2 rzuca Unbreakable Bond celując kartę z WŁASNEGO grobu. `kartyWGrobowP2`
 * to lista kart stwora w grobie p2 (pierwsza = cel czaru).
 */
function scenaZgloszeniaF(kartyWGrobowP2) {
  const state = createGameState({ seed: 24, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = 5;
  // p1 gra Willbendera twarzą do dołu (koszt morph {3}).
  giveMana(state, 'p1', 3, {});
  put(state, 'wb', 'willbender', 'p1', 'hand');
  const zagranie = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'wb', faceDown: true });
  assert.ok(zagranie.ok, 'morph wychodzi z ręki: ' + (zagranie.events?.[0]?.reason ?? ''));
  passUntilResolved(state);
  const willbender = [...state.objects.values()].find((o) => o.cardId === 'willbender');
  assert.ok(willbender?.faceDown, 'Willbender czeka twarzą do dołu');
  // Karta stwora w grobie p1 — NIE może być kandydatem (CR 109.5).
  put(state, 'grobP1', 'spinewoods-paladin', 'p1', 'graveyard');
  // Tura p2: reanimacja celuje kartę z jego grobu (pierwsza z listy).
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  giveMana(state, 'p2', 7, { B: 2 });
  put(state, 'bond', 'unbreakable-bond', 'p2', 'hand');
  const idsGrobP2 = kartyWGrobowP2.map((cardId, i) => {
    const id = i === 0 ? 'celP2' : `altP2-${i}`;
    put(state, id, cardId, 'p2', 'graveyard');
    return id;
  });
  const rzut = execute(state, { type: 'cast_spell', playerId: 'p2', objectId: 'bond', targets: [idsGrobP2[0]] });
  assert.ok(rzut.ok, 'Unbreakable Bond na kartę z własnego grobu: ' + (rzut.events?.[0]?.reason ?? ''));
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok, 'p2 oddaje priorytet');
  assert.equal(state.turn.priorityPlayerId, 'p1', 'p1 dostaje okno na morph');
  // p1 obraca Willbendera twarzą do góry ({1}{U}) — trigger celuje w czar.
  giveMana(state, 'p1', 3, { U: 1 });
  const flip = legalActivatedAbilities(state, 'p1').find((a) => a.objectId === willbender.id);
  assert.ok(flip, 'obrót twarzą do góry jest oferowany');
  const rFlip = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: willbender.id, abilityIndex: flip.abilityIndex });
  assert.ok(rFlip.ok, 'flip: ' + (rFlip.events?.[0]?.reason ?? ''));
  // Passy: trigger wchodzi na stos, rozstrzyga się i otwiera decyzję o nowym celu.
  passUntilResolved(state);
  return { state, idsGrobP2 };
}

test('Zgłoszenie F: „your graveyard" należy do KONTROLERA czaru — kandydaci to grób przeciwnika (CR 109.5)', () => {
  const { state, idsGrobP2 } = scenaZgloszeniaF(['seismic-monstrosaur', 'skymarch-bloodletter']);
  assert.ok(state.pendingRedirectChoice, 'decyzja o nowym celu czeka');

  const required = state.events.filter((e) => e.type === 'redirect_choice_required').at(-1);
  assert.equal(required?.spellControllerId, 'p2',
    'zdarzenie nazywa kontrolera czaru — log tłumaczy z jego perspektywy (CR 109.5)');

  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'resolve_redirect_choice');
  assert.deepEqual(offers.map((o) => o.targetId), ['altP2-1'],
    'kandydatem jest WYŁĄCZNIE inna karta z grobu kontrolera czaru (p2)');
  assert.ok(!offers.some((o) => o.targetId === 'grobP1'),
    'karta z grobu gracza przekierowującego NIE jest kandydatem (CR 109.5)');
  assert.ok(!offers.some((o) => o.targetId === idsGrobP2[0]),
    'obecny cel nie jest kandydatem — cel zmienia się na INNY legalny (CR 115.7a)');

  // Próba wskazania WŁASNEGO grobu jest odrzucana — silnik nie „ocenia
  // legalności z perspektywy gracza przekierowującego”.
  const own = execute(state, { type: 'resolve_redirect_choice', playerId: 'p1', targetId: 'grobP1' });
  assert.equal(own.ok, false, 'własny grób odrzucony');
  assert.equal(own.events?.[0]?.reason, 'illegal_redirect_target',
    'powód odrzucenia: ' + JSON.stringify(own.events?.[0]));
  assert.ok(state.pendingRedirectChoice, 'decyzja trwa po odrzuconej komendzie');

  // Legalny wybór: inna karta z grobu p2 — czar rozstrzyga się z NOWYM celem.
  const ok = execute(state, { type: 'resolve_redirect_choice', playerId: 'p1', targetId: 'altP2-1' });
  assert.ok(ok.ok, 'przekierowanie na kartę z grobu kontrolera czaru: ' + (ok.events?.[0]?.reason ?? ''));
  passUntilResolved(state);
  const wrocil = [...state.objects.values()].find((o) => o.cardId === 'skymarch-bloodletter' && o.zone === 'battlefield');
  assert.ok(wrocil, 'nowy cel wraca na pole bitwy');
  assert.equal(wrocil.controllerId, 'p2', 'pod kontrolą właściciela grobu (p2)');
  assert.equal(wrocil.counters?.lifelink, 1, 'nowy cel wchodzi z licznikiem lifelink (Oracle karty)');
  assert.ok(effectiveKeywords(wrocil, state).includes('lifelink'), 'licznik daje keyword lifelink (CR 122.1b)');
  const zostal = [...state.objects.values()].find((o) => o.cardId === 'seismic-monstrosaur' && o.zone === 'graveyard');
  assert.ok(zostal, 'pierwotny cel został w grobie');
});

test('Zgłoszenie F (bug): bez INNEGO legalnego celu decyzja zamyka się sama, cel bez zmian (CR 115.7a)', () => {
  const { state } = scenaZgloszeniaF(['seismic-monstrosaur']);
  // CR 115.7a: „If a target can’t be changed to another legal target, the
  // original target is unchanged” — decyzji nie ma czego pytać, więc nie może
  // czekać (ślepa decyzja = partia stoi: w ofercie tylko „concede”).
  assert.ok(!state.pendingRedirectChoice,
    'brak innego legalnego celu → decyzja NIE czeka');
  const bezZmian = state.events.filter((e) => e.type === 'redirect_choice_resolved').at(-1);
  assert.ok(bezZmian, 'zdarzenie domknięcia decyzji istnieje');
  assert.equal(bezZmian.toTarget, null, 'cel bez zmian');
  assert.equal(bezZmian.auto, true, 'domknięcie automatyczne');
  assert.equal(bezZmian.unchangedReason, 'no_other_legal_target', 'jawny powód dla logu');
  assert.equal(bezZmian.fromTarget, 'celP2', 'zdarzenie nazywa pierwotny cel');

  // Partia nie stoi: posiadacz priorytetu ma ruch (wcześniej zostawało samo „concede”).
  const holder = state.turn.priorityPlayerId;
  const legalne = playerView(state, holder).legalCommands.map((c) => c.type);
  assert.ok(legalne.includes('pass_priority'),
    'posiadacz priorytetu może grać dalej: ' + JSON.stringify(legalne));
  assert.equal(playerView(state, 'p1').legalCommands.filter((c) => c.type === 'resolve_redirect_choice').length, 0,
    'nie ma czego przekierowywać');

  // Czar rozstrzyga się z PIERWOTNYM celem — karta wraca z grobu p2.
  passUntilResolved(state);
  assert.equal(state.zones.stack.length, 0, 'stos pusty');
  const wrocil = [...state.objects.values()].find((o) => o.cardId === 'seismic-monstrosaur' && o.zone === 'battlefield');
  assert.ok(wrocil, 'pierwotny cel wrócił na pole bitwy (efekt nie zmienił celu)');
  assert.equal(wrocil.controllerId, 'p2', 'pod kontrolą p2');
});

test('Zgłoszenie F: log tłumaczy, CZYJ grób obowiązuje przy nowym celu (CR 109.5)', () => {
  const helpers = { nameOf: () => 'Unbreakable Bond', nameOfObject: () => 'Seismic Monstrosaur' };
  const names = { p1: 'Ty', p2: 'Nieprzyjaciel' };
  const required = describeGameEvent({
    type: 'redirect_choice_required', playerId: 'p1', spellControllerId: 'p2',
    cardId: 'unbreakable-bond', currentTargetId: 'celP2',
  }, helpers, names);
  assert.match(required, /Możesz zmienić cel czaru Unbreakable Bond/, required);
  assert.match(required, /nowy cel musi być innym legalnym celem/, required);
  assert.match(required, /kontrolera: Nieprzyjaciel/, `log nazywa kontrolera czaru: ${required}`);

  const bezZmian = describeGameEvent({
    type: 'redirect_choice_resolved', playerId: 'p1', cardId: 'unbreakable-bond',
    fromTarget: 'celP2', toTarget: null, auto: true, unchangedReason: 'no_other_legal_target',
  }, helpers, names);
  assert.match(bezZmian, /zostaje bez zmian — brak innego legalnego celu \(CR 115\.7a\)/, bezZmian);

  // Zwykłe przekierowanie (jest nowy cel) nie dostaje dopisku o braku celu.
  const zmiana = describeGameEvent({
    type: 'redirect_choice_resolved', playerId: 'p1', cardId: 'unbreakable-bond',
    fromTarget: 'celP2', toTarget: 'altP2-1',
  }, { ...helpers, nameOfObject: () => 'Skymarch Bloodletter' }, names);
  assert.match(zmiana, /zmienia się na Skymarch Bloodletter/, zmiana);
  assert.doesNotMatch(zmiana, /brak innego legalnego celu/, zmiana);
});

test('Zgłoszenie F: decyzja nie jest już opisana jako „Przekierowanie obrażeń”', () => {
  const request = {
    type: 'command',
    options: [{ type: 'resolve_redirect_choice', targetId: 'altP2-1' }],
  };
  const view = { zones: { battlefield: [], hand: [], graveyard: [], stack: [], library: [], exile: [] }, players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Nieprzyjaciel' }], pendingRedirectChoice: { stackId: 'spell-2', spellCardId: 'unbreakable-bond', playerId: 'p1', currentTargetId: 'celP2' } };
  const session = { nameOf: () => 'Unbreakable Bond', nameOfObject: () => 'Skymarch Bloodletter' };
  const title = choiceGroupTitle(request, session, view);
  assert.match(title, /Zmiana celu czaru/, `tytuł grupy opisuje CZYNNOŚĆ: ${title}`);
  assert.doesNotMatch(title, /obrażeń/, `stara etykieta wprowadzała w błąd (obrażenia vs cel czaru): ${title}`);
});
