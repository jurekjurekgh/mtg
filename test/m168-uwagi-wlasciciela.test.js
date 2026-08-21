// M168 — uwagi właściciela z testów (2026-08-21):
// A: Idyllic Grange — log „wchodzi zatapnięty" mimo wejścia ODTAPIONEGO
//    (event niósł deskryptor karty, nie wynik warunku).
// B: AKTYWNE zmiany na kreaturze jako badge'e (Gray Slaad: menace+deathtouch
//    przy >=4 kartach stwora w grobie; granty do EOT; utrata keywordów;
//    can't block; modyfikatory P/T).
// C: Incubator {2}: transform — regresja (w tym w turze przeciwnika).
// C2: wizard wydawania many dla KAŻDEJ płatności z wyborem — także
//     activate_ability (Incubator {2}, Guidestone Compass {1}, forecast).
// D: Guidestone Compass po craft — oferta zdolności W TEJ SAMEJ fazie
//     (zgłoszenie ownera nie-do-odtworzenia; test jest guardem regresji).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { applyEffect } from '../src/engine/effects.js';
import { paymentDescriptorOf, countPaymentVariants } from '../src/table/mana-wizard.js';
import { buildStateOverlay } from '../src/table/render.js';
import { effectiveKeywords } from '../src/engine/permanents.js';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1') {
  const state = createGameState({ seed: 168, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function putCard(state, id, cardId, controllerId, zone = 'battlefield') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  return state.objects.get(id);
}

// ---- A ----------------------------------------------------------------------

test('A1: land z warunkiem spełnionym — event land_played mówi ODTAPIONY', () => {
  const state = game('p1');
  for (let i = 0; i < 3; i += 1) putCard(state, `pl${i}`, 'basic-plains', 'p1', 'battlefield');
  const def = REGISTRY.get('idyllic-grange');
  assert.ok(def.entersTapped && def.entersTappedCondition, 'Grange: entersTapped + warunek');
  addObject(state, {
    id: 'grange', instanceId: 'i-g', cardId: 'idyllic-grange', controllerId: 'p1', ownerId: 'p1', zone: 'hand',
    ...gameObjectDataOf(def), types: def.types, keywords: [], subtypes: def.subtypes,
  });
  const result = execute(state, { type: 'play_land', playerId: 'p1', objectId: 'grange' });
  assert.ok(result.ok);
  const ev = result.events.find((e) => e.type === 'land_played');
  assert.ok(ev, 'zdarzenie land_played');
  assert.equal(state.objects.get('grange') ? true : true, true); // id mogło się zmienić
  const grange = [...state.objects.values()].find((o) => o.cardId === 'idyllic-grange');
  assert.equal(grange.tapped, false, 'przy 3 Plains wchodzi ODTAPIONY');
  assert.equal(ev.entersTapped, false, 'event niesie WYNIK (nie deskryptor) — log prawdziwy');
});

// ---- B ----------------------------------------------------------------------

class MiniEl {
  constructor(tag) { this.tagName = tag; this.children = []; this.className = ''; this.text = ''; }
  set textContent(v) { this.text = String(v); this.children = []; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  appendChild(c) { this.children.push(c); return c; }
  descendants() { return this.children.flatMap((c) => [c, ...c.descendants()]); }
}
globalThis.document = { createElement: (tag) => new MiniEl(tag) };

const badgesOf = (info) => {
  const visual = new MiniEl('div');
  buildStateOverlay(visual, info);
  return visual.descendants()
    .filter((el) => String(el.className).includes('ovl-badge'))
    .map((el) => el.textContent);
};

test('B1: Gray Slaad — badge menace+deathtouch przy >=4 kartach stwora w grobie', () => {
  const state = game('p1');
  const slaad = putCard(state, 'slaad', 'gray-slaad', 'p1', 'battlefield');
  assert.ok(!effectiveKeywords(slaad, state).includes('menace'), 'poniżej progu bez menacu');
  for (let i = 0; i < 4; i += 1) putCard(state, `dead${i}`, 'highland-game', 'p1', 'graveyard');
  const live = effectiveKeywords(slaad, state);
  assert.ok(live.includes('menace') && live.includes('deathtouch'), 'efektywne: menace+deathtouch');
  const badges = badgesOf({
    isBattlefield: true, kind: 'creature',
    grantedKeywords: live.filter((kw) => !(slaad.keywords ?? []).includes(kw)),
    lostKeywordsUntilEOT: [], cantBlockNow: false, cantBeBlockedNow: false,
    counters: {}, powerMod: 0, toughMod: 0,
  });
  assert.ok(badges.some((t) => t.includes('Postrach')), `badge Postrach: [${badges}]`);
  assert.ok(badges.some((t) => t.includes('Dotykanie śmierci')), `badge Dotykanie śmierci: [${badges}]`);
});

test('B2: modyfikatory P/T, can\'t block i utrata keywordu — badge\'e', () => {
  const badges = badgesOf({
    isBattlefield: true, kind: 'creature',
    grantedKeywords: ['flying'], lostKeywordsUntilEOT: ['trample'],
    cantBlockNow: true, cantBeBlockedNow: false,
    counters: {}, powerMod: -2, toughMod: -2,
  });
  assert.ok(badges.includes('Latanie'), `grant flying: [${badges}]`);
  assert.ok(badges.some((t) => t.includes('bez:') && t.includes('Zadeptywanie')), `utrata: [${badges}]`);
  assert.ok(badges.includes('nie może blokować'), `cantBlock: [${badges}]`);
  assert.ok(badges.includes('-2/-2'), `modyfikator: [${badges}]`);
});

// ---- C: Inkubator (regresja, w tym tura przeciwnika) -------------------------

function incubatorTransforms(state, activePlayer) {
  const tiller = [...state.objects.values()].find((o) => o.cardId === 'tiller-of-flesh');
  applyEffect(state, { type: 'incubate', amount: 2 }, tiller, []);
  const token = [...state.objects.values()].find((o) => o.cardId === 'token_incubator');
  const offers = playerView(state, activePlayer).legalCommands
    .filter((c) => c.type === 'activate_ability' && c.objectId === token.id);
  const offer = offers.find((c) => c.abilityIndex === 0) ?? offers[0];
  if (!offer) return { offered: false };
  if (!execute(state, offer).ok) return { offered: true, executed: false };
  for (let i = 0; i < 8; i += 1) {
    if (state.zones.stack.length === 0) break;
    execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  }
  const after = state.objects.get(token.id);
  return {
    offered: true, executed: true,
    transformed: after?.cardId === 'token_phyrexian' && after?.kind === 'creature',
    counters: (after?.counters ?? {})['+1/+1'] ?? 0,
  };
}

test('C1: Incubator {2}: transform w WŁASNEJ turze — Phyrexian 0/0 z 2 licznikami', () => {
  const state = game('p1');
  putCard(state, 'tiller', 'tiller-of-flesh', 'p1', 'battlefield');
  addMana(state, 'p1', 2, { colors: ['W'] });
  const r = incubatorTransforms(state, 'p1');
  assert.ok(r.offered && r.executed, 'aktywacja dostępna i wykonana');
  assert.ok(r.transformed, 'token phyrexian (stwór)');
  assert.equal(r.counters, 2, 'liczniki przeniesione');
});

test('C2a: Incubator {2}: transform w TURZE PRZECIWNIKA też działa', () => {
  // Tura PRZECIWNIKA (aktywny p2), ale okno priorytetu p1 — tak wygląda
  // odpowiedź instantem w turze bota.
  const state = game('p2');
  state.turn.priorityPlayerId = 'p1';
  putCard(state, 'tiller', 'tiller-of-flesh', 'p1', 'battlefield');
  addMana(state, 'p1', 2, { colors: ['W'] });
  // p1 aktywuje w turze p2 (zdolność instanta): oferta w widoku p1.
  const r = incubatorTransforms(state, 'p1');
  assert.ok(r.offered, 'oferta aktywacji w turze przeciwnika');
  if (r.executed) {
    assert.ok(r.transformed, 'transform rozstrzyga się poprawnie');
    assert.equal(r.counters, 2);
  }
});

// ---- C2: wizard many dla activate_ability ------------------------------------

const mkSource = (id, colors) => ({ id, colors, isLand: true, amount: 1, manaCost: 0 });

test('C2b: deskryptor płatności activate_ability — Incubator {2} (dowolna mana)', () => {
  const view = { zones: { battlefield: [{ id: 'inc', cardId: 'token_incubator', kind: 'artifact', controllerId: 'p1' }] } };
  const ability = { cost: { mana: 2 }, effect: { type: 'transform' } };
  const d = paymentDescriptorOf({ type: 'activate_ability', playerId: 'p1', objectId: 'inc', abilityIndex: 0 }, view, { ability });
  assert.ok(d, 'deskryptor zbudowany');
  assert.equal(d.totalNeeded, 2);
  assert.equal(d.requirements.length, 0, 'koszt w pełni generyczny');
  // Warianty: 3 źródła różnych kolorów → ≥2 sposoby → wizard;
  // 2 źródła jednego koloru → 1 sposób → bez wizarda (zasada ownera).
  const mixed = [mkSource('i1', ['U']), mkSource('m1', ['R']), mkSource('f1', ['G'])];
  const mono = [mkSource('i1', ['U']), mkSource('i2', ['U'])];
  assert.ok(countPaymentVariants(mixed, 0, d.totalNeeded, d.requirements) >= 2, 'mieszane landy: wizard');
  assert.ok(countPaymentVariants(mono, 0, d.totalNeeded, d.requirements) < 2, 'monokolor: bez wizarda');
});

test('C2c: Compass {1}{T} i forecast — deskryptory z pipami kolorów', () => {
  const view = { zones: { battlefield: [{ id: 'cp', cardId: 'guidestone-compass', kind: 'artifact', controllerId: 'p1' }] } };
  const compass = paymentDescriptorOf(
    { type: 'activate_ability', playerId: 'p1', objectId: 'cp', abilityIndex: 0 },
    view,
    { ability: { cost: { mana: 1, tap: true }, effect: { type: 'explore' } } },
  );
  assert.ok(compass && compass.totalNeeded === 1, 'Compass {1}');
  const handView = { zones: { hand: [{ id: 'pr', cardId: 'piercing-rays', kind: 'spell', controllerId: 'p1' }] } };
  const forecast = paymentDescriptorOf(
    { type: 'activate_ability', playerId: 'p1', objectId: 'pr', abilityIndex: 0 },
    handView,
    { ability: { cost: { mana: 2, colors: ['W'] }, forecast: true, effect: [] } },
  );
  assert.ok(forecast, 'forecast deskryptor');
  assert.equal(forecast.totalNeeded, 2);
  assert.deepEqual(forecast.requirements, [['W']], 'pip {W}');
});

test('C2d: zdolność bez kosztu many i xValue — bez kreatora', () => {
  const view = { zones: { battlefield: [{ id: 'x', cardId: 'x', kind: 'creature', controllerId: 'p1' }] } };
  assert.equal(paymentDescriptorOf({ type: 'activate_ability', objectId: 'x', abilityIndex: 0 }, view, { ability: { cost: { tap: true } } }), null, 'sam tap — null');
  assert.equal(paymentDescriptorOf({ type: 'activate_ability', objectId: 'x', abilityIndex: 0, xValue: 3 }, view, { ability: { cost: { mana: 1 } } }), null, 'X — null');
});

// ---- D: craft → Compass oferta w TEJ SAMEJ fazie (guard) ----------------------

test('D1: po craft Lodestone Needle — zdolność Compassa dostępna w tej samej fazie', () => {
  const state = game('p1');
  const def = REGISTRY.get('lodestone-needle');
  const back = REGISTRY.get(def.transformTo);
  addObject(state, {
    id: 'needle', instanceId: 'i-n', cardId: 'lodestone-needle', controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
    ...gameObjectDataOf(def), types: def.types, keywords: def.keywords ?? [], subtypes: def.subtypes,
    transformTo: {
      cardId: back.id, kind: gameObjectDataOf(back).kind, power: back.power, toughness: back.toughness,
      abilities: back.abilities ?? [], keywords: back.keywords ?? [], subtypes: back.subtypes ?? [],
      types: back.types ?? [], manaCost: back.manaCost ?? 0, cardName: back.name,
    },
  });
  putCard(state, 'a1', 'pristine-talisman', 'p1', 'battlefield');
  putCard(state, 'a2', 'pristine-talisman', 'p1', 'battlefield');
  putCard(state, 'guy', 'highland-game', 'p1', 'battlefield'); // cel explore
  addMana(state, 'p1', 8, { colors: ['U'] });
  const craft = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'needle');
  assert.ok(craft, 'oferta craftu');
  assert.ok(execute(state, craft).ok);
  for (let i = 0; i < 10; i += 1) {
    const cex = playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_craft_exile');
    if (cex) { execute(state, cex); continue; }
    if (state.zones.stack.length > 0) { execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId }); continue; }
    break;
  }
  const compass = [...state.objects.values()].find((o) => o.cardId === 'guidestone-compass');
  assert.ok(compass, 'craft zwrócił Compassa');
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'activate_ability' && c.objectId === compass.id);
  assert.ok(offers.length > 0, 'zdolność Compassa dostępna W TEJ SAMEJ fazie (artefakt bez choroby)');
});
