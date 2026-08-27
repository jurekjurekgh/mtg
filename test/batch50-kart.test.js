// Batch 50 (2026-08-26) — 5 kart z listy właściciela (artId 567–571).
// Dane Oracle: docs/cards/scryfall-*.json (pobrane 2026-08-26).
//
// Karty:
//   - Dimir Guildgate (GRN)   → dual land entersTapped + {T}: U/B (wzorzec Dismal Backwater)
//   - Vow of Flight (CMR)      → aura +2/+2, flying, cantAttackYou (wzorzec Serra's Embrace)
//   - Nanoform Sentinel (EOE)  → trigger self-tap → untap target (once/turn) [nowa mechanika]
//   - Jwar Isle Avenger (OGW)  → Flying + Surge (alt-cost) [nowa mechanika]
//   - Manifest Dread (DSK)     → sorcery: manifest dread [nowa mechanika]
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { attachAuraToCreature } from '../src/engine/attachments.js';
import { effectivePower, effectiveToughness, effectiveKeywords, tapObject } from '../src/engine/permanents.js';
import { rulesText, commandLabel } from '../src/table/render.js';
import { processTriggers } from '../src/engine/triggers.js';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1', step = 'main') {
  const state = createGameState({ seed: 50, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function put(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness, manaCost: def.manaCost ?? data.manaCost,
    spell: data.spell, abilities: data.abilities ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], types: def.types ?? [], colors: def.colors ?? [],
    entersTapped: def.entersTapped ?? false, aura: data.aura ?? null, surge: def.surge ?? null,
  });
  if (Object.keys(patch).length) {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  }
  return state.objects.get(id);
}

// ---- Dimir Guildgate --------------------------------------------------------

test('B50: Dimir Guildgate — dane Oracle zgadzają się z definicją', () => {
  const def = REGISTRY.get('dimir-guildgate');
  assert.deepEqual(def.types, ['Land']);
  assert.deepEqual(def.subtypes, ['Gate']);
  assert.equal(def.entersTapped, true);
  assert.ok(def.imageUri.includes('b7129bdf'), 'imageUri z druku GRN');
  assert.equal(def.artId, 570);
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
});

test('B50: Dimir Guildgate — {T}: dodaj {U} lub {B} (dwie opcje koloru)', () => {
  const state = game('p1', 'main');
  put(state, 'gate', 'dimir-guildgate', 'p1', 'battlefield');
  const view = playerView(state, 'p1');
  const manaCmds = view.legalCommands.filter((c) => c.type === 'activate_ability' && c.objectId === 'gate');
  assert.ok(manaCmds.length >= 1, 'oferta zdolności many istnieje');
  const before = state.players.find((p) => p.id === 'p1').mana;
  const r = execute(state, manaCmds[0]);
  assert.ok(r.ok, `aktywacja many odrzucona: ${r.events?.[0]?.reason}`);
  const after = state.players.find((p) => p.id === 'p1').mana;
  assert.equal(after, before + 1, 'dodano 1 manę');
  const pool = state.players.find((p) => p.id === 'p1').manaPool;
  const keys = [...Object.keys(pool)].filter((k) => pool[k] > 0);
  assert.ok(keys.some((k) => k.includes('U') || k.includes('B')), `mana w kolorze U/B, pool: ${JSON.stringify(pool)}`);
});

test('B50: Dimir Guildgate — wchodzi zatapnięty (entersTapped)', () => {
  const state = game('p1', 'main');
  put(state, 'gate', 'dimir-guildgate', 'p1', 'hand');
  const view = playerView(state, 'p1');
  const play = view.legalCommands.find((c) => c.type === 'play_land' && c.objectId === 'gate');
  assert.ok(play, 'ląd można zagrać');
  const r = execute(state, play);
  assert.ok(r.ok, `zagranie lądu odrzucone: ${r.events?.[0]?.reason}`);
  const onBoard = [...state.objects.values()].find((o) => o.cardId === 'dimir-guildgate' && o.zone === 'battlefield');
  assert.ok(onBoard, 'ląd na polu bitwy');
  assert.equal(onBoard.tapped, true, 'ląd wchodzi zatapniety');
});

// ---- Vow of Flight ----------------------------------------------------------

test('B50: Vow of Flight — dane Oracle zgadzają się z definicją (aura +2/+2, flying, cantAttackYou)', () => {
  const def = REGISTRY.get('vow-of-flight');
  assert.deepEqual(def.types, ['Enchantment']);
  assert.deepEqual(def.subtypes, ['Aura']);
  assert.deepEqual(def.colors, ['U']);
  assert.equal(def.aura.cantAttackYou, true);
  assert.deepEqual(def.aura.pump, { power: 2, toughness: 2 });
  assert.deepEqual(def.aura.keywords, ['flying']);
  assert.equal(def.artId, 571);
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
});

test('B50: Vow of Flight — zaczarowany stwór dostaje +2/+2 i flying', () => {
  const state = game('p1', 'main');
  const creature = put(state, 'bear', 'highland-game', 'p2', 'battlefield');
  put(state, 'vow', 'vow-of-flight', 'p1', 'battlefield');
  attachAuraToCreature(state, 'vow', 'bear');
  const host = state.objects.get('bear');
  assert.equal(effectivePower(host, state), (creature.power ?? 0) + 2, '+2 mocy');
  assert.equal(effectiveToughness(host, state), (creature.toughness ?? 0) + 2, '+2 wytrzymałości');
  assert.ok(effectiveKeywords(host, state).includes('flying'), 'flying nadane');
});

test('B50: Vow of Flight — zaczarowany stwór przeciwnika NIE może atakować (1v1, CR cantAttackYou)', () => {
  const state = game('p2', 'declare_attackers');
  put(state, 'bear', 'highland-game', 'p2', 'battlefield', { summoningSickness: false });
  put(state, 'vow', 'vow-of-flight', 'p1', 'battlefield');
  attachAuraToCreature(state, 'vow', 'bear');
  const view = playerView(state, 'p2');
  const attack = view.legalCommands.find((c) => c.type === 'declare_attackers' && (c.attackerIds ?? []).includes('bear'));
  assert.ok(!attack, 'stwór z Vow of Flight nie może zostać zadeklarowany do ataku na właściciela aury');
});

// ---- Nanoform Sentinel ------------------------------------------------------

test('B50: Nanoform Sentinel — dane Oracle i trigger self_becomes_tapped (once/turn)', () => {
  const def = REGISTRY.get('nanoform-sentinel');
  assert.deepEqual(def.types, ['Artifact', 'Creature']);
  assert.equal(def.power, 3);
  assert.equal(def.toughness, 2);
  const trig = def.abilities[0].trigger;
  assert.equal(trig.event, 'self_becomes_tapped');
  assert.equal(trig.oncePerTurn, true);
  assert.deepEqual(trig.requiresTarget, { type: 'permanent', notSelf: true });
  assert.equal(def.artId, 568);
});

test('B50: Nanoform Sentinel — opis kafla nazywa CEL („odkręć docelowy inny permanent")', () => {
  // M223 (audyt Batch 50): kafel mówił „Zatapnięcie tego permanentu: odkręć"
  // — bez „docelowy", więc gracz nie wiedział, że odkręca INNY permanent.
  const def = REGISTRY.get('nanoform-sentinel');
  const text = rulesText({ abilities: def.abilities, faceDown: false });
  assert.match(text, /zostaje zatapnięty/, `opis triggera: ${text}`);
  assert.match(text, /docelowy inny permanent/, `opis musi nazwać cel: ${text}`);
  assert.match(text, /raz na turę/, `opis musi wspomnieć limit: ${text}`);
});

function tapAndProcess(state, id) {
  const before = state.events.length;
  tapObject(state, id, state.objects.get(id).controllerId);
  const tapEvent = state.events[state.events.length - 1];
  return processTriggers(state, [tapEvent]);
}

test('B50: Nanoform Sentinel — tapnięcie odkręca INNY docelowy permanent', () => {
  const state = game('p1', 'main');
  put(state, 'nano', 'nanoform-sentinel', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'land', 'basic-island', 'p1', 'battlefield', { tapped: true });
  const produced = tapAndProcess(state, 'nano');
  assert.ok(produced.some((e) => e.type === 'trigger_target_required'), 'trigger celu odpalił się');
  const view = playerView(state, 'p1');
  const pick = view.legalCommands.find((c) => c.type === 'resolve_trigger_target' && c.targetId === 'land');
  assert.ok(pick, 'oferta celu: tapnięty ląd');
  const r = execute(state, pick);
  assert.ok(r.ok, `resolve_trigger_target odrzucone: ${r.events?.[0]?.reason}`);
  // rozstrzygamy stos triggera
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.equal(state.objects.get('land').tapped, false, 'docelowy ląd został odkręcony');
});

test('B50: Nanoform Sentinel — „another\" NIE celuje w siebie', () => {
  const state = game('p1', 'main');
  put(state, 'nano', 'nanoform-sentinel', 'p1', 'battlefield', { summoningSickness: false });
  tapAndProcess(state, 'nano');
  const view = playerView(state, 'p1');
  const selfPick = view.legalCommands.find((c) => c.type === 'resolve_trigger_target' && c.targetId === 'nano');
  assert.ok(!selfPick, 'notSelf: własne źródło nie jest legalnym celem („another")');
});

// ---- Jwar Isle Avenger (Surge) ----------------------------------------------

test('B50: Jwar Isle Avenger — dane Oracle + deskryptor surge', () => {
  const def = REGISTRY.get('jwar-isle-avenger');
  assert.deepEqual(def.types, ['Creature']);
  assert.equal(def.power, 3);
  assert.equal(def.toughness, 3);
  assert.deepEqual(def.keywords, ['flying']);
  assert.deepEqual(def.surge, { cost: 3, colors: ['U'] });
  assert.equal(def.artId, 567);
});

test('B50: Jwar Isle Avenger — surge OFEROWANY po rzucie innego czaru, brak bez niego', () => {
  const withoutSpell = game('p1', 'main');
  addMana(withoutSpell, 'p1', 10);
  put(withoutSpell, 'jwar', 'jwar-isle-avenger', 'p1', 'hand');
  const v1 = playerView(withoutSpell, 'p1');
  assert.ok(!v1.legalCommands.some((c) => c.type === 'cast_permanent' && c.objectId === 'jwar' && c.surgeCast),
    'bez rzuconego wcześniej czaru surge NIE jest legalny');

  const withSpell = game('p1', 'main');
  addMana(withSpell, 'p1', 10);
  withSpell.spellsCastThisTurnByPlayer = { p1: 1 };
  put(withSpell, 'jwar', 'jwar-isle-avenger', 'p1', 'hand');
  const v2 = playerView(withSpell, 'p1');
  assert.ok(v2.legalCommands.some((c) => c.type === 'cast_permanent' && c.objectId === 'jwar' && c.surgeCast),
    'po rzucie innego czaru surge jest legalny');
});

test('B50: Jwar Isle Avenger — etykieta surge różni się od zwykłego rzutu (oś 2)', () => {
  const def = REGISTRY.get('jwar-isle-avenger');
  const view = {
    zones: { hand: [{ id: 'j', cardId: 'jwar-isle-avenger', surge: def.surge }], battlefield: [], stack: [], graveyard: [], library: [] },
    players: [{ id: 'p1' }, { id: 'p2' }],
  };
  const session = { nameOf: (id) => REGISTRY.get(id)?.name ?? id, nameOfObject: () => '?' };
  const strip = (s) => s.replace(/<[^>]+>/g, '');
  const surge = strip(commandLabel({ type: 'cast_permanent', objectId: 'j', surgeCast: true }, session, view));
  const normal = strip(commandLabel({ type: 'cast_permanent', objectId: 'j' }, session, view));
  assert.match(surge, /^Rzuć za surge: Jwar Isle Avenger/, `etykieta surge: ${surge}`);
  assert.notEqual(surge, normal, 'surge musi być odróżnialny od zwykłego rzutu');
});

test('B50: Jwar Isle Avenger — surge kosztuje {2}{U} (3), a nie {4}{U} (5)', () => {
  const state = game('p1', 'main');
  addMana(state, 'p1', 3); // dokładnie koszt surge
  state.spellsCastThisTurnByPlayer = { p1: 1 };
  put(state, 'jwar', 'jwar-isle-avenger', 'p1', 'hand');
  const view = playerView(state, 'p1');
  const surge = view.legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === 'jwar' && c.surgeCast);
  const normal = view.legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === 'jwar' && !c.surgeCast);
  assert.ok(surge, 'surge oferowany przy 3 manie');
  assert.ok(!normal, 'normalny rzut (koszt 5) NIE jest opłacalny przy 3 manie');
  const r = execute(state, surge);
  assert.ok(r.ok, `surge cast odrzucony: ${r.events?.[0]?.reason}`);
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  const onBoard = [...state.objects.values()].find((o) => o.cardId === 'jwar-isle-avenger' && o.zone === 'battlefield');
  assert.ok(onBoard, 'Jwar Isle Avenger wchodzi na pole bitwy po surge');
  assert.ok(effectiveKeywords(onBoard, state).includes('flying'), 'ma flying po wejściu');
});

// ---- Manifest Dread ---------------------------------------------------------

function putLibTop(state, id, cardId, controllerId) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone: 'library',
    kind: data.kind, power: data.power, toughness: data.toughness, spell: data.spell,
    abilities: data.abilities ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
    types: def.types ?? [], colors: def.colors ?? [], manaCost: def.manaCost,
  });
  return state.objects.get(id);
}

test('B50: Manifest Dread — dane Oracle (sorcery, {1}{G}, effect manifest_dread)', () => {
  const def = REGISTRY.get('manifest-dread');
  assert.deepEqual(def.types, ['Sorcery']);
  assert.deepEqual(def.colors, ['G']);
  assert.equal(def.spell.effects[0].type, 'manifest_dread');
  assert.equal(def.artId, 569);
  assert.equal(def.support.status, 'supported');
});

function castManifestDread(state) {
  put(state, 'md', 'manifest-dread', 'p1', 'hand');
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'md');
  assert.ok(cast, 'Manifest Dread można rzucić');
  assert.ok(execute(state, cast).ok, 'rzut ok');
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
}

test('B50: Manifest Dread — wybór z 2 kart: jedna face-down 2/2, druga do grobu', () => {
  const state = game('p1', 'main');
  addMana(state, 'p1', 10);
  putLibTop(state, 'creat', 'razorfoot-griffin', 'p1');
  putLibTop(state, 'noncreat', 'shock', 'p1');
  state.zones.library = ['creat', 'noncreat', ...state.zones.library.filter((id) => id !== 'creat' && id !== 'noncreat')];
  castManifestDread(state);

  const view = playerView(state, 'p1');
  const choices = view.legalCommands.filter((c) => c.type === 'resolve_manifest_dread').map((c) => c.cardId);
  assert.deepEqual(choices.sort(), ['creat', 'noncreat'], 'obie karty z wierzchu do wyboru');
  const r = execute(state, { type: 'resolve_manifest_dread', playerId: 'p1', cardId: 'creat' });
  assert.ok(r.ok, `resolve odrzucone: ${r.events?.[0]?.reason}`);

  const facedown = [...state.objects.values()].find((o) => o.faceDown && o.zone === 'battlefield');
  assert.ok(facedown, 'karta zmanifestowana na polu bitwy');
  assert.equal(facedown.power, 2);
  assert.equal(facedown.toughness, 2);
  assert.equal(facedown.cardName, null, 'face-down bez nazwy (CR 708.2)');
  const graveCards = [...state.objects.values()].filter((o) => o.zone === 'graveyard').map((o) => o.cardId);
  assert.ok(graveCards.includes('shock'), 'druga karta do grobu');
});

test('B50: Manifest Dread — obrót twarzą do góry KARTY STWORA za koszt many', () => {
  const state = game('p1', 'main');
  addMana(state, 'p1', 10);
  putLibTop(state, 'creat', 'razorfoot-griffin', 'p1');
  putLibTop(state, 'noncreat', 'shock', 'p1');
  state.zones.library = ['creat', 'noncreat', ...state.zones.library.filter((id) => id !== 'creat' && id !== 'noncreat')];
  castManifestDread(state);
  execute(state, { type: 'resolve_manifest_dread', playerId: 'p1', cardId: 'creat' });
  const facedown = [...state.objects.values()].find((o) => o.faceDown && o.zone === 'battlefield');
  assert.equal(facedown.manifestReady, true, 'karta stwora może być obrócona');
  const flip = playerView(state, 'p1').legalCommands.find((c) => c.type === 'turn_manifest_face_up' && c.objectId === facedown.id);
  assert.ok(flip, 'oferta obrotu twarzą do góry');
  const r = execute(state, flip);
  assert.ok(r.ok, `obrót odrzucony: ${r.events?.[0]?.reason}`);
  const up = state.objects.get(facedown.id);
  assert.equal(up.faceDown, false, 'stwór odkryty');
  assert.equal(up.cardId, 'razorfoot-griffin', 'ujawniona właściwa karta');
});

test('B50: Manifest Dread — po rozstrzygnięciu czar OPUSZCZA stos (brak pendingSpell, bez crasha)', () => {
  // M223 (audyt Batch 50, g8 worek-mroczny): rozstrzygnięcie decyzji manifest
  // zostawiało czar na stosie z pendingSpell → crash „Pending spell odwołuje
  // się do nieistniejącego czaru". Manifest Dread to CZAR — musi się dokończyć.
  const state = game('p1', 'main');
  addMana(state, 'p1', 10);
  putLibTop(state, 'creat', 'razorfoot-griffin', 'p1');
  putLibTop(state, 'noncreat', 'shock', 'p1');
  state.zones.library = ['creat', 'noncreat', ...state.zones.library.filter((id) => id !== 'creat' && id !== 'noncreat')];
  castManifestDread(state);
  execute(state, { type: 'resolve_manifest_dread', playerId: 'p1', cardId: 'creat' });
  assert.equal(state.pendingSpell, null, 'wstrzymany czar dokończony (brak pendingSpell)');
  const mdOnStack = state.zones.stack.some((id) => state.objects.get(id)?.cardId === 'manifest-dread');
  assert.ok(!mdOnStack, 'Manifest Dread opuścił stos po rozstrzygnięciu');
  const mdInGrave = [...state.objects.values()].some((o) => o.cardId === 'manifest-dread' && o.zone === 'graveyard');
  assert.ok(mdInGrave, 'Manifest Dread w grobie (sorcery po rozstrzygnięciu)');
  // Gra toczy się dalej — gracz ma normalne akcje, nie tylko „Poddaj partię".
  const view = playerView(state, 'p1');
  assert.ok(view.legalCommands.some((c) => c.type !== 'concede'), 'gracz ma legalne ruchy poza koncesją');
});

test('B50: Manifest Dread — karta NIE-stwór zmanifestowana NIE da się obrócić', () => {
  const state = game('p1', 'main');
  addMana(state, 'p1', 10);
  putLibTop(state, 'noncreat', 'shock', 'p1');
  putLibTop(state, 'creat', 'razorfoot-griffin', 'p1');
  state.zones.library = ['noncreat', 'creat', ...state.zones.library.filter((id) => id !== 'creat' && id !== 'noncreat')];
  castManifestDread(state);
  execute(state, { type: 'resolve_manifest_dread', playerId: 'p1', cardId: 'noncreat' });
  const facedown = [...state.objects.values()].find((o) => o.faceDown && o.zone === 'battlefield');
  assert.equal(facedown.manifestReady, false, 'nie-stwór: brak możliwości obrotu (CR 701.34e)');
  const flip = playerView(state, 'p1').legalCommands.find((c) => c.type === 'turn_manifest_face_up' && c.objectId === facedown.id);
  assert.ok(!flip, 'brak oferty obrotu dla nie-stwora');
});

test('B50: Nanoform Sentinel — triggers only once each turn', () => {
  const state = game('p1', 'main');
  put(state, 'nano', 'nanoform-sentinel', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'land', 'basic-island', 'p1', 'battlefield', { tapped: true });
  const first = tapAndProcess(state, 'nano');
  assert.ok(first.some((e) => e.type === 'trigger_target_required'), 'pierwsze tapnięcie odpala trigger');
  // rozstrzygnij i odkręć nano, żeby móc tapnąć drugi raz w tej samej turze
  const view = playerView(state, 'p1');
  const pick = view.legalCommands.find((c) => c.type === 'resolve_trigger_target' && c.targetId === 'land');
  execute(state, pick);
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  state.objects.set('nano', Object.freeze({ ...state.objects.get('nano'), tapped: false }));
  const second = tapAndProcess(state, 'nano');
  assert.ok(!second.some((e) => e.type === 'trigger_target_required'),
    'drugie tapnięcie w tej samej turze NIE odpala triggera (once each turn)');
});
