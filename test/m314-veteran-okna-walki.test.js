import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, playerView, execute, addObject } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { BOT_ID, HUMAN_ID, createSession, commandOptionKey } from '../src/table/session.js';

/**
 * M314 (zgłoszenie właściciela + weryfikacja L57): Tenth District Veteran
 * („Whenever this creature attacks, untap another target creature you
 * control") + Ghost Warden („{T}: Target creature gets +1/+1 until end of
 * turn"). Właściciel: tapnął Wardena (pump #1), zaatakował Veteranem,
 * trigger odtapował Wardena — i nie dostał OKNA na pump #2 przed
 * obrażeniami („od razu podział obrażeń"). Hipoteza: winna pinezka
 * „nie przerywaj auto-passu" na zdolności Wardena.
 *
 * Weryfikacja (ten plik):
 *  1. Kandydaci triggera MUSZĄ wykluczać atakującego (Oracle: „ANOTHER
 *     target creature you control"; CR — patrz M158/Breaching Hippocamp).
 *     Dotąd Veteran był kandydatem na własny untap — RED.
 *  2. Veteran jako JEDYNY stwór: trigger w ogóle nie odpala (CR 603.3d —
 *     obowiązkowy cel bez kandydata = brak triggera, zdarzenie no_targets).
 *  3./4. Piny SILNIKA (zielone z natury — dowód, że okna istnieją):
 *     po rozstrzygnięciu triggera gracz ATAKUJĄCY dostaje priorytet
 *     (aktywny pierwszy, CR 116.3c) z aktywacją Wardena, a drugie okno ma
 *     po blokach w combat_damage (M172/C) — pump #2 przed obrażeniami.
 *  5./6. Piny SESJI: bez pinezki sesja zatrzymuje się z aktywacją (pump #2
 *     możliwy, 2 pumpy = 16 życia bota); Z pinezką (Feature 2026-08-11)
 *     auto-pass przelatuje oba okna i pump #2 NIE zdąży (17 życia bota).
 *     To jest zaprojektowane zachowanie pinezki — test je utrwala; gracz
 *     ma hamulec ręczny (krzyżyk wyłącza auto-pass / odznaczenie ptaszka).
 */

const REGISTRY = createCardRegistry();

function putCreature(state, id, cardId, controllerId) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId,
    zone: 'battlefield', kind: 'creature',
    power: def.power, toughness: def.toughness, manaCost: def.manaCost,
    abilities: def.abilities ?? [], colors: def.colors ?? [],
    types: def.types ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
  });
  // wstrzyknięte w trakcie tury — bez choroby przywołania
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function game({ blocker = false, onlyVeteran = false } = {}) {
  const state = createGameState({ seed: 42, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  putCreature(state, 'vet', 'tenth-district-veteran', 'p1');
  if (!onlyVeteran) putCreature(state, 'gw', 'ghost-warden', 'p1');
  if (blocker) putCreature(state, 'blk', 'ghost-warden', 'p2');
  return state;
}

function activateWarden(state, targetId) {
  const view = playerView(state, 'p1');
  const cmd = view.legalCommands.find(
    (c) => c.objectId === 'gw' && c.type === 'activate_ability' && c.targets?.[0] === targetId,
  );
  assert.ok(cmd, 'aktywacja Ghost Warden w legalCommands');
  const result = execute(state, cmd);
  assert.ok(result.ok, `aktywacja GW przyjęta: ${JSON.stringify(result.events[0]?.reason)}`);
  // zdolność idzie na STOS — rozstrzygnij (CR 116.3b: pass obu graczy)
  for (let i = 0; i < 4 && state.zones.stack.length > 0; i += 1) {
    const pid = state.turn.priorityPlayerId;
    const pass = playerView(state, pid).legalCommands.find((c) => c.type === 'pass_priority');
    assert.ok(pass, `pass dostępny dla ${pid} przy rozstrzyganiu pumpa`);
    execute(state, pass);
  }
  return result;
}

test('M314/1: jedyny legalny cel triggera to NIE atakujący — auto-cel (M242)', () => {
  const state = game();
  const r = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['vet'] });
  assert.ok(r.ok, `atak przyjęty: ${JSON.stringify(r.events[0]?.reason)}`);
  const view = playerView(state, 'p1');
  // jeden legalny kandydat (gw) → bez okna decyzji (M242: auto), trigger
  // idzie na stos z celem gw — Veteran nie może być własnym celem untapa
  // (Oracle „another target creature you control").
  assert.equal(view.pendingTriggerTarget, null, 'brak pytania przy jednym kandydacie (M242)');
  const auto = (r.events ?? []).some(
    (e) => e.type === 'trigger_target_resolved' && e.auto === true && e.targetId === 'gw',
  );
  assert.ok(auto, 'trigger_target_resolved(auto, cel=gw) — nie atakujący');
  assert.equal(state.zones.stack.length, 1, 'trigger na stosie z wybranym celem');
});

test('M314/1b: dwóch kandydatów — decyzja otwarta BEZ atakującego na liście', () => {
  const state = game();
  putCreature(state, 'gw2', 'ghost-warden', 'p1');
  const r = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['vet'] });
  assert.ok(r.ok);
  const view = playerView(state, 'p1');
  assert.ok(view.pendingTriggerTarget, 'decyzja celu triggera otwarta');
  assert.deepEqual(
    view.pendingTriggerTarget.candidateIds.sort(), ['gw', 'gw2'],
    'kandydaci: własne stwory POZA atakującym („another")',
  );
});

test('M314/2: Veteran jedyny stwór — trigger nie odpala (CR 603.3d, no_targets)', () => {
  const state = game({ onlyVeteran: true });
  const r = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['vet'] });
  assert.ok(r.ok);
  const view = playerView(state, 'p1');
  assert.equal(view.pendingTriggerTarget, null, 'brak decyzji celu — brak legalnego kandydata');
  const noTargets = (r.events ?? []).some(
    (e) => e.type === 'trigger_resolved' && e.noEffect === true && e.reason === 'no_targets',
  );
  assert.ok(noTargets, 'zdarzenie trigger_resolved(noEffect, no_targets) w wyniku');
});

test('M314/3 (pin silnika): okno po triggerze — atakujący MA priorytet, pump #2 przed blokami', () => {
  const state = game({ blocker: true });
  // pump #1 przed walką: Warden tapuje się, Veteran 3/4
  activateWarden(state, 'vet');
  assert.equal(state.objects.get('gw').tapped, true, 'Warden tapnięty kosztem pump #1');
  assert.equal(state.objects.get('vet').powerModifier, 1, 'pump #1 na Veteranie');
  // walka: jedyny kandydat (gw) → auto-cel (M242), trigger na stosie
  const r = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['vet'] });
  assert.ok(r.ok);
  assert.equal(state.zones.stack.length, 1, 'trigger Veterana na stosie');
  // rozstrzygnij trigger (pass obrońcy, pass atakującego)
  for (let i = 0; i < 4 && state.zones.stack.length > 0; i += 1) {
    const pid = state.turn.priorityPlayerId;
    const pass = playerView(state, pid).legalCommands.find((c) => c.type === 'pass_priority');
    assert.ok(pass, `pass dostępny dla ${pid}`);
    execute(state, pass);
  }
  assert.equal(state.objects.get('gw').tapped, false, 'trigger ODTAPIA Wardena');
  // OKNO: aktywny gracz pierwszy (CR 116.3c) — aktywacja Warden dostępna
  const view = playerView(state, 'p1');
  assert.equal(state.turn.step, 'declare_blockers');
  assert.equal(state.turn.priorityPlayerId, 'p1', 'priorytet atakującego po rozstrzygnięciu triggera');
  const cmd = view.legalCommands.find(
    (c) => c.objectId === 'gw' && c.type === 'activate_ability' && c.targets?.[0] === 'vet',
  );
  assert.ok(cmd, 'pump #2 dostępny PRZED deklaracją bloków');
  const pump2 = execute(state, cmd);
  assert.ok(pump2.ok, 'pump #2 przyjęty');
  // zdolność na stosie — rozstrzygnij (pass obu), zanim sprawdzimy efekt
  for (let i = 0; i < 4 && state.zones.stack.length > 0; i += 1) {
    const pid = state.turn.priorityPlayerId;
    const pass = playerView(state, pid).legalCommands.find((c) => c.type === 'pass_priority');
    assert.ok(pass, `pass dostępny dla ${pid} przy rozstrzyganiu pump #2`);
    execute(state, pass);
  }
  assert.equal(state.objects.get('vet').powerModifier, 2, 'pump #2 na Veteranie');
});

test('M314/4 (pin silnika): okno po blokach — pump #2 możliwy też w combat_damage (M172/C)', () => {
  const state = game({ blocker: true });
  activateWarden(state, 'vet');
  const r = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['vet'] });
  assert.ok(r.ok);
  assert.equal(state.zones.stack.length, 1, 'trigger na stosie (auto-cel, M242)');
  // obrońca passuje okno na odpowiedź; PO passie atakującego trigger
  // się rozstrzyga (CR 117.4/116.4)
  assert.equal(state.turn.priorityPlayerId, 'p2', 'po ataku priorytet ma obrońca');
  const pass2 = playerView(state, 'p2').legalCommands.find((c) => c.type === 'pass_priority');
  execute(state, pass2);
  assert.equal(state.zones.stack.length, 1, 'trigger wciąż na stosie — czeka na pass atakującego');
  const pass3 = playerView(state, 'p1').legalCommands.find((c) => c.type === 'pass_priority');
  execute(state, pass3);
  assert.equal(state.objects.get('gw').tapped, false, 'trigger odtapia Wardena');
  assert.equal(state.zones.stack.length, 0, 'stos pusty po rozstrzygnięciu triggera');
  // okno przed blokami (M314/3) — celowo POMINIĘTE: p1 pass
  assert.equal(state.turn.priorityPlayerId, 'p1', 'aktywny pierwszy po rozstrzygnięciu (CR 116.3c)');
  const pass4 = playerView(state, 'p1').legalCommands.find((c) => c.type === 'pass_priority');
  execute(state, pass4);
  // p2 deklaruje puste bloki
  assert.equal(state.turn.priorityPlayerId, 'p2', 'bloki deklaruje obrońca');
  const blocks = execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: {} });
  assert.ok(blocks.ok, `puste bloki: ${JSON.stringify(blocks.events[0]?.reason)}`);
  // combat_damage: priorytet obrońcy (M172/C), po nim ATAKUJĄCY z pełną ofertą
  const pass5 = playerView(state, 'p2').legalCommands.find((c) => c.type === 'pass_priority');
  execute(state, pass5);
  const view = playerView(state, 'p1');
  assert.equal(state.turn.step, 'combat_damage');
  assert.equal(state.turn.priorityPlayerId, 'p1');
  const cmd = view.legalCommands.find(
    (c) => c.objectId === 'gw' && c.type === 'activate_ability' && c.targets?.[0] === 'vet',
  );
  assert.ok(cmd, 'pump #2 dostępny w oknie po blokach, przed resolve_combat');
  const pump2 = execute(state, cmd);
  assert.ok(pump2.ok);
  for (let i = 0; i < 4 && state.zones.stack.length > 0; i += 1) {
    const pid = state.turn.priorityPlayerId;
    const pass = playerView(state, pid).legalCommands.find((c) => c.type === 'pass_priority');
    assert.ok(pass, `pass dostępny dla ${pid} przy rozstrzyganiu pump #2`);
    execute(state, pass);
  }
  assert.equal(state.objects.get('vet').powerModifier, 2, 'pump #2 jeszcze przed obrażeniami');
});

/**
 * Sesyjny wspólnik 5/6: 30 równin u obu, Warden u bota. Wstrzyknięte stwory,
 * pump #1 w main1 (Warden tap). Atak Veteranem → trigger → Warden odtapnięty.
 * Bez pinezki sesja stoi z aktywacją (pump #2 = 16 życia bota), z pinezką
 * auto-pass przelatuje okna (17 życia bota).
 */
function sessionScenario({ pinned }) {
  const decks = new Map([
    [HUMAN_ID, Array.from({ length: 30 }, () => 'basic-plains')],
    [BOT_ID, Array.from({ length: 30 }, () => 'basic-plains')],
  ]);
  // Pinezka jak z panelu akcji: checkbox GRUPY wycisza WSZYSTKIE warianty
  // naraz (render.js, Feature 2026-08-11 + M91/Uwaga B) — tu oba cele GW.
  const activationKeys = ['vet', 'gw'].map((target) => commandOptionKey({
    type: 'activate_ability', objectId: 'gw', abilityIndex: 0, targets: [target],
  }));
  const session = createSession({
    seed: 7, registry: REGISTRY, decks,
    ignoredOptionKeys: pinned ? new Set(activationKeys) : new Set(),
  });
  // mulligan: zatrzymaj rękę (same równiny)
  assert.ok(session.apply(session.view().legalCommands.find((c) => c.type === 'resolve_mulligan_choice')).ok);
  // wstrzyknij stwory (sesja stoi w main1 człowieka)
  putCreature(session.state, 'vet', 'tenth-district-veteran', HUMAN_ID);
  putCreature(session.state, 'gw', 'ghost-warden', HUMAN_ID);
  const state = session.state;
  // zagraj równiny z ręki (żeby auto-pass wiódł do walki)
  for (let i = 0; i < 7; i += 1) {
    const land = session.view().legalCommands.find((c) => c.type === 'play_land');
    if (!land) break;
    assert.ok(session.apply(land).ok);
  }
  // pump #1 w main1
  const act1 = session.view().legalCommands.find(
    (c) => c.objectId === 'gw' && c.type === 'activate_ability' && c.targets?.[0] === 'vet',
  );
  assert.ok(act1, 'pump #1 w ofercie main1');
  assert.ok(session.apply(act1).ok);
  assert.equal(state.objects.get('gw').tapped, true);
  // do kroku deklaracji ataku i atak Veteranem
  for (let i = 0; i < 10 && state.turn.step !== 'declare_attackers'; i += 1) {
    const pass = session.view().legalCommands.find((c) => c.type === 'pass_priority');
    assert.ok(pass, 'pass w drodze do declare_attackers');
    session.apply(pass);
  }
  const attack = session.view().legalCommands.find(
    (c) => c.type === 'declare_attackers' && c.attackerIds?.includes('vet'),
  );
  assert.ok(attack, 'sesja stoi w oknie deklaracji ataku');
  const applied = session.apply({ ...attack, attackerIds: ['vet'] });
  assert.ok(applied.ok);
  // jedyny kandydat (gw) → auto-cel (M242): decyzja się nie otwiera
  const viewAfterAttack = session.view();
  if (viewAfterAttack.pendingTriggerTarget) {
    const choose = viewAfterAttack.legalCommands.find(
      (c) => c.type === 'resolve_trigger_target' && c.targetId === 'gw',
    );
    assert.ok(choose, 'decyzja celu triggera z kandydatem gw');
    assert.ok(session.apply(choose).ok);
  }
  return { session, state };
}

test('M314/5 (sesja, bez pinezki): okno z pump #2 po odtapnięciu — Veteran bije za 4', () => {
  const { session, state } = sessionScenario({ pinned: false });
  const view = session.view();
  assert.equal(view.turn.priorityPlayerId, HUMAN_ID, 'sesja zatrzymana na człowieku');
  assert.equal(view.turn.step, 'declare_blockers', 'okno po rozstrzygnięciu triggera, przed blokami');
  const pump2 = view.legalCommands.find(
    (c) => c.objectId === 'gw' && c.type === 'activate_ability' && c.targets?.[0] === 'vet',
  );
  assert.ok(pump2, 'BEZ pinezki sesja pokazuje pump #2 (hipoteza właściciela potwierdzona)');
  assert.ok(session.apply(pump2).ok, 'pump #2 przyjęty w oknie sesji');
  // domknij turę: pase → auto-resolve walki → 4 obrażeń (4/5 nieblokowany)
  for (let i = 0; i < 8 && state.players[1].life === 20; i += 1) {
    const pass = session.view().legalCommands.find((c) => c.type === 'pass_priority');
    if (!pass) break;
    assert.ok(session.apply(pass).ok);
  }
  assert.equal(state.players[1].life, 16, 'dwie pumpy: Veteran 4/5 zadaje 4 (pump #2 przed obrażeniami)');
});

test('M314/6 (sesja, z pinezką): auto-pass przelatuje oba okna — pump #2 nie zdąża (Feature 2026-08-11)', () => {
  const { session, state } = sessionScenario({ pinned: true });
  // sesja NIE stoi na oknie z aktywacją — przelatuje okno przed blokami,
  // bloki (brak stwora bota → brak deklaracji) i okno po blokach
  const view = session.view();
  // sesja NIE stoi w oknach walki z wyciszoną aktywacją — przelatywa je
  // i sama rozstrzyga walkę (zaprojektowane: ptaszek = „nie przerywaj
  // auto-passu"; hamulec ręczny: krzyżyk albo odznaczenie ptaszka)
  assert.notEqual(view.turn.step, 'declare_blockers', 'okno przed blokami pominięte');
  assert.notEqual(view.turn.step, 'combat_damage', 'okno po blokach pominięte');
  assert.equal(state.players[1].life, 17, 'Veteran 3/4 zadaje 3 — pump #2 nie zdążył przed obrażeniami');
});
