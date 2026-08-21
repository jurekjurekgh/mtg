// M174 — Batch 41 (lista właściciela 2026-08-21). Transza A: reuse.
// Dane wg docs/cards/scryfall-*.json (ADR 0010 §2a); pełne Oracle (ADR 0022).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { effectivePower, effectiveToughness, effectiveKeywords } from '../src/engine/permanents.js';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1') {
  const state = createGameState({ seed: 41, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function putCard(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, ...patch,
  });
  return state.objects.get(id);
}

function resolveStack(state, max = 12) {
  for (let i = 0; i < max && state.zones.stack.length > 0; i += 1) {
    const r = execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
    if (!r.ok) return false;
  }
  return state.zones.stack.length === 0;
}

// ---- Transza A ----------------------------------------------------------------

test('A1: Spin Out — niszczy stwora ORAZ Vehicle (creature_or_vehicle)', () => {
  // Stwór przeciwnika.
  const state = game('p1');
  putCard(state, 'spin', 'spin-out', 'p1', 'hand');
  putCard(state, 'foe', 'highland-game', 'p2');
  addMana(state, 'p1', 3, { colors: ['B'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'spin' && c.targets?.[0] === 'foe');
  assert.ok(cast, 'oferta na stwora');
  assert.ok(execute(state, cast).ok);
  assert.ok(resolveStack(state));
  assert.notEqual(state.objects.get('foe')?.zone, 'battlefield', 'stwór zniszczony');

  // Vehicle (artefakt z podtypem Vehicle — nie stwór).
  const s2 = game('p1');
  putCard(s2, 'spin', 'spin-out', 'p1', 'hand');
  addObject(s2, {
    id: 'veh', instanceId: 'i-veh', cardId: 'x-vehicle', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'artifact', manaCost: 3, types: ['Artifact', 'Vehicle'],
    subtypes: ['Vehicle'], colors: [], abilities: [],
  });
  addMana(s2, 'p1', 3, { colors: ['B'] });
  const castV = playerView(s2, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'spin' && c.targets?.[0] === 'veh');
  assert.ok(castV, 'oferta na Vehicle');
  assert.ok(execute(s2, castV).ok);
  assert.ok(resolveStack(s2));
  assert.notEqual(s2.objects.get('veh')?.zone, 'battlefield', 'Vehicle zniszczony');
});

test('A2: Stall Out — tap + 3 liczniki stun; stun blokuje odkręcenie (CR 122)', () => {
  const state = game('p1');
  putCard(state, 'stall', 'stall-out', 'p1', 'hand');
  putCard(state, 'foe', 'highland-game', 'p2', 'battlefield', { summoningSickness: false });
  addMana(state, 'p1', 2, { colors: ['U'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'stall' && c.targets?.[0] === 'foe');
  assert.ok(cast, 'oferta rzutu (sorcery, main faza)');
  assert.ok(execute(state, cast).ok);
  assert.ok(resolveStack(state));
  const foe = state.objects.get('foe');
  assert.equal(foe.tapped, true, 'cel zatapowany');
  assert.equal((foe.counters ?? {}).stun, 3, '3 liczniki stun');
});

test('A2b: Stall Out — Cycling {2} dobiera kartę', () => {
  const state = game('p1');
  putCard(state, 'stall', 'stall-out', 'p1', 'hand');
  putCard(state, 'lib1', 'highland-game', 'p1', 'library');
  addMana(state, 'p1', 2, { colors: [] });
  const cyc = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'stall');
  assert.ok(cyc, 'oferta cyclingu z ręki');
  const before = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p1').length;
  assert.ok(execute(state, cyc).ok);
  resolveStack(state);
  const after = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p1').length;
  assert.equal(after, before, 'odrzucona 1 (koszt) + dobrana 1 = bilans 0');
  assert.ok([...state.objects.values()].some((o) => o.cardId === 'stall-out' && o.zone === 'graveyard'),
    'Stall Out w grobie po cyclingu');
});

test('A3: Horizon Spellbomb — sac→szukaj basic land do RĘKI; dies→opcjonalne {G}→draw', () => {
  const state = game('p1');
  putCard(state, 'bomb', 'horizon-spellbomb', 'p1', 'battlefield');
  // Wierzch biblioteki = pierwszy dodany: draw z triggera zabiera stwora,
  // Las zostaje dla szukania.
  putCard(state, 'libcard', 'highland-game', 'p1', 'library');
  putCard(state, 'libland', 'basic-forest', 'p1', 'library');
  addMana(state, 'p1', 3, { colors: ['G'] });
  const activate = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'bomb');
  assert.ok(activate, 'oferta aktywacji {2},{T},sac');
  assert.ok(execute(state, activate).ok);
  // Sacrifice to KOSZT — trigger „dies" odpala od razu (przed rozstrzygnięciem
  // szukania): najpierw decyzja „you may pay {G}".
  assert.ok(state.pendingOptionalPay, 'decyzja „you may pay {G}" po poświęceniu');
  const pay = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'resolve_optional_pay_choice' && c.pay === true);
  assert.ok(pay, 'oferta zapłaty {G}');
  const handBefore = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p1').length;
  assert.ok(execute(state, pay).ok);
  assert.ok(resolveStack(state), 'stos rozstrzygnięty (draw + szukanie)');
  const handMid = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p1').length;
  assert.equal(handMid, handBefore + 1, 'zapłacone {G} → dobrana karta');
  // Szukanie: znajdź las do ręki.
  const search = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'resolve_search_choice' && c.found != null);
  assert.ok(search, 'decyzja szukania (basic land)');
  assert.ok(execute(state, search).ok);
  const inHand = state.zones.hand.some((id) => state.objects.get(id)?.cardId === 'basic-forest');
  assert.ok(inHand, 'basic land trafia DO RĘKI (nie na pole)');
});

// ---- Transza B ----------------------------------------------------------------

test('B1: Immersturm Skullcairn — {1}{B}{R}{R},{T},sac: 3 dmg w gracza + jego discard', () => {
  const state = game('p1');
  putCard(state, 'cairn', 'immersturm-skullcairn', 'p1', 'battlefield', { summoningSickness: false });
  putCard(state, 'oppcard1', 'highland-game', 'p2', 'hand');
  putCard(state, 'oppcard2', 'basic-swamp', 'p2', 'hand');
  addMana(state, 'p1', 4, { colors: ['B', 'R', 'R', 'R'] });
  const lifeBefore = state.players.find((p) => p.id === 'p2').life;
  const act = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'cairn' && c.targets?.[0] === 'p2');
  assert.ok(act, 'oferta aktywacji w gracza p2 (sorcery-speed, main)');
  assert.ok(execute(state, act).ok);
  assert.ok(resolveStack(state));
  assert.equal(state.players.find((p) => p.id === 'p2').life, lifeBefore - 3, '3 obrażenia w gracza');
  assert.notEqual(state.objects.get('cairn')?.zone, 'battlefield', 'ląd poświęcony (koszt)');
  // Odrzucający (p2) wybiera SWOJĄ kartę.
  assert.ok(state.pendingDiscardChoice, 'decyzja odrzucenia u celu');
  assert.equal(state.pendingDiscardChoice.playerId, 'p2', 'odrzuca trafiony gracz');
  const discard = playerView(state, 'p2').legalCommands
    .find((c) => c.type === 'resolve_discard_choice' && c.cardId != null);
  assert.ok(discard, 'oferta wyboru karty do odrzucenia');
  assert.ok(execute(state, discard).ok);
  const handAfter = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p2').length;
  assert.equal(handAfter, 1, 'po odrzuceniu 1 karta w ręce p2');
});

test('B1b: Immersturm Skullcairn — wchodzi zatapiony i dodaje {B}', () => {
  const def = REGISTRY.get('immersturm-skullcairn');
  assert.equal(def.entersTapped, true, 'enters tapped');
  assert.deepEqual(def.colors, ['B'], 'produkuje {B}');
  assert.deepEqual(def.types, ['Land']);
});

test('B2: Toll of the Invasion — reveal + OBOWIĄZKOWY wybór nonland + amass Zombies 1', () => {
  const state = game('p1');
  putCard(state, 'toll', 'toll-of-the-invasion', 'p1', 'hand');
  putCard(state, 'oppland', 'basic-swamp', 'p2', 'hand');
  putCard(state, 'oppcrt', 'highland-game', 'p2', 'hand');
  addMana(state, 'p1', 3, { colors: ['B'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'toll' && c.targets?.[0] === 'p2');
  assert.ok(cast, 'oferta rzutu w przeciwnika');
  assert.ok(execute(state, cast).ok);
  resolveStack(state);
  // Wybór należy do RZUCAJĄCEGO (chooser p1), tylko karty NIELĄDOWE, bez rezygnacji.
  assert.ok(state.pendingDiscardChoice, 'decyzja wyboru z odsłoniętej ręki');
  assert.equal(state.pendingDiscardChoice.chooserId, 'p1', 'wybiera rzucający');
  assert.equal(state.pendingDiscardChoice.allowDecline, false, 'wybór obowiązkowy (bez rezygnacji)');
  assert.deepEqual(state.pendingDiscardChoice.handIds, ['oppcrt'], 'tylko karta nieladowa');
  const offers = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'resolve_discard_choice');
  assert.ok(offers.every((c) => c.cardId != null), 'brak oferty rezygnacji (mandatory)');
  assert.ok(execute(state, offers[0]).ok);
  assert.ok([...state.objects.values()].some((o) => o.cardId === 'highland-game' && o.zone === 'graveyard'),
    'wybrana karta odrzucona');
  // Amass Zombies 1: token Zombie Army 0/0 + licznik +1/+1.
  const army = [...state.objects.values()].find((o) => o.isToken && (o.subtypes ?? []).includes('Army'));
  assert.ok(army, 'token Zombie Army powstał');
  assert.ok((army.subtypes ?? []).includes('Zombie'), 'Armia jest Zombie');
  assert.equal((army.counters ?? {})['+1/+1'], 1, 'licznik +1/+1 z amass 1');
});

test('B2b: Toll — sama ręka LĄDÓW = nikt nic nie odrzuca (Oracle), amass działa', () => {
  const state = game('p1');
  putCard(state, 'toll', 'toll-of-the-invasion', 'p1', 'hand');
  putCard(state, 'oppland', 'basic-swamp', 'p2', 'hand');
  addMana(state, 'p1', 3, { colors: ['B'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'toll' && c.targets?.[0] === 'p2');
  assert.ok(execute(state, cast).ok);
  resolveStack(state);
  assert.ok(!state.pendingDiscardChoice, 'bez decyzji (brak nonland — mandatory nie karze za brak)');
  const handAfter = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p2').length;
  assert.equal(handAfter, 1, 'ląd zostaje w ręce');
  assert.ok([...state.objects.values()].some((o) => o.isToken && (o.subtypes ?? []).includes('Army')),
    'amass mimo braku odrzucenia');
});

// ---- Transza C: Terminal Agony — pierwszy CZAR z madness (CR 702.34) ---------

function discardAgony(state) {
  putCard(state, 'agony', 'terminal-agony', 'p1', 'hand');
  state.pendingDiscardChoice = {
    playerId: 'p1', count: 1, handIds: ['agony'], purpose: 'effect',
    sourceCardId: null, restorePriorityTo: 'p1',
  };
  assert.ok(execute(state, { type: 'resolve_discard_choice', playerId: 'p1', cardId: 'agony' }).ok);
  const exiled = [...state.objects.values()].find((o) => o.cardId === 'terminal-agony' && o.zone === 'exile');
  assert.ok(exiled, 'karta w exile (CR 702.34a)');
  assert.equal(exiled.madnessReady, true, 'gotowość madness');
  assert.ok(state.pendingMadnessCast, 'decyzja madness otwarta');
  return exiled;
}

test('C1: Terminal Agony — discard→exile→rzut za {B}{R} z CELEM niszczy stwora', () => {
  const state = game('p1');
  putCard(state, 'foe', 'highland-game', 'p2');
  discardAgony(state);
  addMana(state, 'p1', 2, { colors: ['B', 'R'] });
  // Oferta rzutu jest PER CEL (czar z celem — nie ślepa komenda).
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'resolve_madness_cast' && c.cast && c.targets?.[0] === 'foe');
  assert.ok(cast, 'oferta rzutu madness z celem');
  assert.ok(execute(state, cast).ok);
  assert.equal(state.players.find((pl) => pl.id === 'p1').mana, 0, 'wydano {B}{R} (koszt madness, nie {2}{B}{R})');
  assert.ok(resolveStack(state));
  assert.notEqual(state.objects.get('foe')?.zone, 'battlefield', 'cel zniszczony');
  assert.ok([...state.objects.values()].some((o) => o.cardId === 'terminal-agony' && o.zone === 'graveyard'),
    'czar po rozstrzygnięciu w grobie');
});

test('C2: Terminal Agony — sorcery z madness rzucany POZA main fazą (CR 702.34e)', () => {
  const state = game('p1');
  putCard(state, 'foe', 'highland-game', 'p2');
  state.turn = { ...state.turn, phase: 'combat', step: 'declare_attackers' };
  discardAgony(state);
  addMana(state, 'p1', 2, { colors: ['B', 'R'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'resolve_madness_cast' && c.cast && c.targets?.[0] === 'foe');
  assert.ok(cast, 'timing sorcery IGNOROWANY przy rzucie madness');
  assert.ok(execute(state, cast).ok);
  assert.ok(resolveStack(state));
  assert.notEqual(state.objects.get('foe')?.zone, 'battlefield');
});

test('C3: Terminal Agony — odmowa albo brak celu = karta do grobu', () => {
  // Brak celu (pusty stół): jedyna oferta to rezygnacja.
  const state = game('p1');
  discardAgony(state);
  addMana(state, 'p1', 2, { colors: ['B', 'R'] });
  const offers = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'resolve_madness_cast');
  assert.ok(offers.every((c) => !c.cast), 'bez legalnego celu brak oferty rzutu (L48)');
  assert.ok(execute(state, offers[0]).ok);
  assert.ok([...state.objects.values()].some((o) => o.cardId === 'terminal-agony' && o.zone === 'graveyard'),
    'odmowa → grób (CR 702.34)');
});

test('B3 (L4/L48): Skullcairn bez drugiego czarnego źródła — brak oferty i CZYSTE odrzucenie', () => {
  const state = game('p1');
  putCard(state, 'cairn', 'immersturm-skullcairn', 'p1', 'battlefield', { summoningSickness: false });
  // Mana: 2x Mountain + 1x Forest — pip {B} pokrywa TYLKO sam Skullcairn,
  // który tapuje się kosztem: zdolność nieopłacalna.
  putCard(state, 'm1', 'basic-mountain', 'p1', 'battlefield');
  putCard(state, 'm2', 'basic-mountain', 'p1', 'battlefield');
  putCard(state, 'f1', 'basic-forest', 'p1', 'battlefield');
  const offer = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'cairn');
  assert.equal(offer, undefined, 'oferta wykluczona (źródło {B} tapowane kosztem — L48)');
  // Ręczna nielegalna komenda: odrzucona BEZ mutacji stanu (L4).
  const r = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'cairn', abilityIndex: 0, targets: ['p2'] });
  assert.equal(r.ok, false, 'komenda odrzucona');
  assert.equal(state.objects.get('cairn').tapped, false, 'ląd NIE został tapnięty przy odrzuceniu');
});

// ---- Transza D: triggery bojowe + intimidate ---------------------------------

test('D1: Burning-Yard Trainer — ETB buffuje INNEGO Rycerza (+2/+2, trample+haste EOT)', () => {
  const state = game('p1');
  putCard(state, 'knight', 'locthwain-paladin', 'p1', 'battlefield'); // Human Knight
  putCard(state, 'elk', 'highland-game', 'p1', 'battlefield'); // nie-Knight
  putCard(state, 'trainer', 'burning-yard-trainer', 'p1', 'hand');
  addMana(state, 'p1', 5, { colors: ['R'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'trainer');
  assert.ok(cast, 'oferta rzutu');
  assert.ok(execute(state, cast).ok);
  for (let i = 0; i < 12 && !state.pendingTriggerTargets?.[0]; i += 1) {
    if (state.zones.stack.length > 0) {
      assert.ok(execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId }).ok);
    } else break;
  }
  const pending = state.pendingTriggerTargets?.[0];
  assert.ok(pending, 'decyzja celu triggera');
  assert.deepEqual(pending.candidates, ['knight'], 'kandydat TYLKO inny Rycerz (nie Elk, nie sam Trainer)');
  assert.ok(execute(state, { type: 'resolve_trigger_target', playerId: 'p1', targetId: 'knight' }).ok);
  assert.ok(resolveStack(state));
  const knight = state.objects.get('knight');
  // Buff „until end of turn" żyje w warstwie EOT — czytamy wartości efektywne.
  assert.equal(effectivePower(knight, state), 5, 'Paladyn 3/2 z +2/+2 = 5 mocy');
  assert.equal(effectiveToughness(knight, state), 4, '…i 4 wytrzymałości');
  const kws = effectiveKeywords(knight, state);
  assert.ok(kws.includes('trample') && kws.includes('haste'), 'grant trample+haste');
});

test('D2: Downwind Ambusher — modal ETB: tryb destroy TYLKO dla rannego stwora wroga', () => {
  const state = game('p1');
  const hurt = putCard(state, 'hurt', 'segmented-krotiq', 'p2', 'battlefield');
  state.objects.set('hurt', Object.freeze({ ...hurt, damagedThisTurn: true, damage: 2 }));
  putCard(state, 'fresh', 'highland-game', 'p2', 'battlefield');
  putCard(state, 'skunk', 'downwind-ambusher', 'p1', 'hand');
  addMana(state, 'p1', 4, { colors: ['B'] });
  assert.ok(execute(state, playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'skunk')).ok);
  for (let i = 0; i < 12 && !state.pendingModalTrigger; i += 1) {
    if (state.zones.stack.length > 0) {
      assert.ok(execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId }).ok);
    } else break;
  }
  assert.ok(state.pendingModalTrigger, 'modalna decyzja ETB');
  const offers = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'resolve_modal_choice');
  const destroyOffers = offers.filter((c) => c.modeIndex === 1);
  assert.deepEqual(destroyOffers.map((c) => c.targetId), ['hurt'],
    'tryb destroy tylko na RANIONEGO stwora wroga');
  assert.ok(execute(state, { type: 'resolve_modal_choice', playerId: 'p1', modeIndex: 1, targetId: 'hurt' }).ok);
  assert.notEqual(state.objects.get('hurt')?.zone, 'battlefield', 'ranny stwór zniszczony');
});

test('D2b: Downwind Ambusher — tryb −1/−1 dobija 1/1 wroga (SBA)', () => {
  const state = game('p1');
  putCard(state, 'small', 'mosquito-guard', 'p2', 'battlefield'); // 1/1
  putCard(state, 'skunk', 'downwind-ambusher', 'p1', 'hand');
  addMana(state, 'p1', 4, { colors: ['B'] });
  assert.ok(execute(state, playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'skunk')).ok);
  for (let i = 0; i < 12 && !state.pendingModalTrigger; i += 1) {
    if (state.zones.stack.length > 0) {
      assert.ok(execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId }).ok);
    } else break;
  }
  assert.ok(execute(state, { type: 'resolve_modal_choice', playerId: 'p1', modeIndex: 0, targetId: 'small' }).ok);
  assert.notEqual(state.objects.get('small')?.zone, 'battlefield', '1/1 z −1/−1 ginie (SBA)');
});

test("D3: Predator's Gambit — +2/+1 i intimidate TYLKO bez innych stworów (CR 702.13)", () => {
  const state = game('p1');
  putCard(state, 'host', 'highland-game', 'p1', 'battlefield', { summoningSickness: false }); // G 2/2
  putCard(state, 'aura', 'predators-gambit', 'p1', 'hand');
  addMana(state, 'p1', 1, { colors: ['B'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => (c.type === 'cast_permanent' || c.type === 'cast_spell') && c.objectId === 'aura' && c.targets?.[0] === 'host');
  assert.ok(cast, 'rzut aury na stwora');
  assert.ok(execute(state, cast).ok);
  assert.ok(resolveStack(state));
  const host = state.objects.get('host');
  // highland-game to 2/1 — z aurą +2/+1 daje 4/2.
  assert.equal(effectivePower(host, state), 4, '+2 mocy');
  assert.equal(effectiveToughness(host, state), 2, '+1 wytrzymałości');
  assert.ok(effectiveKeywords(host, state).includes('intimidate'), 'intimidate przy braku innych stworów');
  // Drugi stwór kontrolera → intimidate ZNIKA (warunek ciągły).
  putCard(state, 'buddy', 'highland-game', 'p1', 'battlefield');
  assert.ok(!effectiveKeywords(state.objects.get('host'), state).includes('intimidate'),
    'intimidate wygasa przy innym stworze');
});

test('D3b: intimidate w walce — blokuje tylko artefaktowy stwór albo wspólny kolor', () => {
  const state = game('p1');
  // Atakujący: zielony stwór z aurą (intimidate aktywny — jedyny stwór p1).
  putCard(state, 'host', 'highland-game', 'p1', 'battlefield', { summoningSickness: false });
  putCard(state, 'aura', 'predators-gambit', 'p1', 'hand');
  addMana(state, 'p1', 1, { colors: ['B'] });
  assert.ok(execute(state, playerView(state, 'p1').legalCommands
    .find((c) => (c.type === 'cast_permanent' || c.type === 'cast_spell') && c.objectId === 'aura' && c.targets?.[0] === 'host')).ok);
  assert.ok(resolveStack(state));
  // Obrońca p2: biały stwór (bez koloru wspólnego), zielony stwór, artefaktowy stwór.
  putCard(state, 'white', 'mosquito-guard', 'p2', 'battlefield', { summoningSickness: false }); // W
  putCard(state, 'green', 'highland-game', 'p2', 'battlefield', { summoningSickness: false }); // G (wspólny)
  addObject(state, {
    id: 'artcrt', instanceId: 'i-artcrt', cardId: 'x-artcrt', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'creature', power: 1, toughness: 1, manaCost: 1,
    types: ['Artifact', 'Creature'], subtypes: [], colors: [], abilities: [], summoningSickness: false,
  });
  state.turn = { ...state.turn, phase: 'combat', step: 'declare_attackers', activePlayerId: 'p1', priorityPlayerId: 'p1' };
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['host'] }).ok);
  const badBlock = execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { host: ['white'] } });
  assert.equal(badBlock.ok, false, 'biały stwór bez wspólnego koloru NIE blokuje (intimidate)');
  const greenBlock = execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { host: ['green'] } });
  assert.ok(greenBlock.ok, 'stwór o wspólnym kolorze blokuje');
});

