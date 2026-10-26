// F — zgłoszenie właściciela z gry (2026-10-24, karty z Disguise):
//
//   „Karty ze zdolnością Disguise. Mają z definicji Ward 2.
//    (a) Nie ma badge Ward 2 na nich jak leżą na stole (przykład Riftburst
//        Hellion).
//    (b) Inne karty które wybierają cele nie sprawdzają czy kreatura ma Ward
//        i celują w nie, mimo, że to nie zadziała (heurystyka bota) — przykład
//        zdolność Detain karty Azorius Justiciar. […] Jak karta ma Ward to
//        powinna być wykluczana ze zdolności celowania bota bo marnuje na nie
//        zdolność."
//
// Doprecyzowanie właściciela: „Azorius Justiciar wycelował w [Riftburst]
// Hellion i innego moba — Knighta. Hellion miał ward więc skontrował zdolność
// Justiciara (w ogóle nie powinien w niego celować bez many na opłacenie
// warda). Ale jeszcze dodatkowo zdolność Detain nie docięgnęła Knighta, mimo,
// że nie miał Ward i był legalnym celem. To chyba błąd."
//
// Werdykt per część (weryfikacja wobec CR 2026-09-25, ADR 0030):
//   (Knight) — NIE bug silnika: CR 702.21a dosłownie: „Ward [cost] means
//     'Whenever this permanent becomes the target of a spell or ability an
//     opponent controls, COUNTER THAT SPELL OR ABILITY unless that player
//     pays [cost].'" Ward kontruje CAŁĄ zdolność — to nie jest ścieżka
//     „nielegalny cel" z CR 608.2b (częściowe rozstrzygnięcie). Knight
//     prawidłowo NIE zostaje zatrzymany. Pin F/4.
//   (a) badge — bug prezentacji: obiekt/widok/cardInfo niosły ward poprawnie
//     (linia reguł „Ward {2}" była — m258/W8), ale chipy nakładki kafla biorą
//     się wyłącznie z `grantedKeywords`, a ward zakrycia (definicja 2/2,
//     CR 702.168a disguise / 701.58a cloak) nie jest grantem i dla zakrytego
//     cardInfo zwraca granted=[]. Fix: jawny flag Ward w buildStateOverlay
//     (render.js). Pin F/1 (disguise z prawdziwego rzutu + cloak jako bliźniak).
//   (b) bot — bug heurystyki: podatek ward (M320/M324) czytał cele z
//     `cmd.targets ?? [cmd.targetId]`, a warianty WIELOCZELOWE
//     resolve_trigger_target (m.in. „up to two target creatures" Justiciara)
//     niosą je w `cmd.targetIds` — podatek wynosił 0 i bot wybierał cel
//     z ward bez many na dopłatę. Fix: te same trzy kształty celów przy
//     wardTargetTax (heuristic-bot.js). Piny F/2 (bez zapasu: hellion poza
//     wyborem, Knight zatrzymany) i F/3 (z zapasem: wybór obu + dopłata).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { applyEffect } from '../src/engine/effects.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { cardInfo, buildStateOverlay } from '../src/table/render.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();
const SESSION_MOCK = {
  nameOf: (id) => REGISTRY.get(id)?.name ?? String(id),
  nameOfObject: (id) => String(id),
  cardDetails: (id) => REGISTRY.get(id) ?? null,
  colorsOf: (id) => REGISTRY.get(id)?.colors ?? [],
  view: () => ({ zones: { hand: [], battlefield: [], stack: [], graveyard: [], library: [] } }),
};

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
    .map((el) => el.textContent)
    .filter((t) => !t.includes('zakryty') || t.startsWith('zakryty'));
};

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
function run(state, cmd) {
  assert.ok(cmd, 'komenda istnieje');
  const r = execute(state, cmd);
  assert.equal(r.ok, true, JSON.stringify(r.events?.slice(-1)));
  return r;
}
function freshGame(playerId) {
  const state = createGameState({ seed: 42, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}
function passRound(state) {
  for (let i = 0; i < 6; i += 1) {
    const pass = playerView(state, state.turn.priorityPlayerId).legalCommands
      .find((c) => c.type === 'pass_priority');
    if (!pass) break;
    run(state, pass);
  }
}

test('F/1: badge „Ward {2}" na kaflu zakrytego disguise (i cloaka) — z wpisów playerView obu graczy', () => {
  // Disguise z prawdziwego rzutu (Riftburst Hellion zakryty za {3}).
  const state = freshGame('p1');
  putCard(state, 'hellion', 'riftburst-hellion', 'p1', 'hand');
  addMana(state, 'p1', 3, { colors: ['R'] });
  run(state, playerView(state, 'p1').legalCommands.find((c) => c.objectId === 'hellion' && c.faceDown));
  passRound(state);
  for (const viewer of ['p1', 'p2']) {
    const entry = playerView(state, viewer).zones.battlefield.find((o) => o.faceDown);
    assert.ok(entry, `zakryty Hellion w widoku ${viewer}`);
    assert.equal(entry.faceDownCause, 'disguise');
    const badges = badgesOf(cardInfo(SESSION_MOCK, { ...entry, isBattlefield: true }));
    assert.ok(badges.includes('Ward {2}'), `badge Ward {2} (${viewer}): [${badges}]`);
  }
  // Bliźniak klasy: cloak (Veiled Ascension) — tę samą definicję 2/2 z ward {2}.
  const state2 = freshGame('p1');
  putCard(state2, 'va', 'veiled-ascension', 'p1');
  putCard(state2, 'lib-top', 'welder-automaton', 'p1', 'library');
  applyEffect(state2, { type: 'cloak' }, state2.objects.get('va'), []);
  const cloakedEntry = playerView(state2, 'p2').zones.battlefield.find((o) => o.faceDown);
  assert.ok(cloakedEntry, 'cloakowany w widoku przeciwnika');
  const cloakedBadges = badgesOf(cardInfo(SESSION_MOCK, { ...cloakedEntry, isBattlefield: true }));
  assert.ok(cloakedBadges.includes('Ward {2}'), `badge Ward {2} na cloaku: [${cloakedBadges}]`);
});

/** Scenariusz zgłoszenia: bot (p2) ma Azorius Justiciara i `plains` lądów;
 *  p1 ma zakrytego Helliona (ward {2}) oraz zwykłego stwora (Knight). */
function justiciarScenario(plains) {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p2';
  const h = putCard(state, 'hellion-fd', 'riftburst-hellion', 'p1');
  state.objects.set('hellion-fd', Object.freeze({
    ...h, faceDown: true, faceDownCause: 'disguise', ward: 2,
    keywords: Object.freeze(['ward']), power: 2, toughness: 2, cardName: null,
    summoningSickness: false,
  }));
  const k = putCard(state, 'knight', 'goblin-piker', 'p1');
  state.objects.set('knight', Object.freeze({ ...k, summoningSickness: false }));
  for (let i = 0; i < plains; i += 1) putCard(state, `plains${i}`, 'basic-plains', 'p2');
  putCard(state, 'justiciar', 'azorius-justiciar', 'p2', 'hand');
  run(state, playerView(state, 'p2').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'justiciar'));
  return state;
}

/** Prowadzi decyzję celów triggera (bot albo ręczny wybór) do końca stosu. */
function finishTrigger(state, chooseTargets, chooseWardPay) {
  for (let i = 0; i < 60; i += 1) {
    const view2 = playerView(state, 'p2');
    const targetCmds = view2.legalCommands.filter((c) => c.type === 'resolve_trigger_target');
    if (targetCmds.length) { run(state, chooseTargets(view2, targetCmds)); continue; }
    const wardCmds = view2.legalCommands.filter((c) => c.type === 'resolve_ward_pay_choice');
    if (wardCmds.length) { run(state, chooseWardPay(view2, wardCmds)); continue; }
    const pass = playerView(state, state.turn.priorityPlayerId).legalCommands
      .find((c) => c.type === 'pass_priority');
    if (!pass) break;
    run(state, pass);
    if (state.zones.stack.length === 0 && i > 8) break;
  }
}

test('F/2: bot bez zapasowej many NIE celuje Detainem w zakrytego z ward {2} — Knight zatrzymany', () => {
  const state = justiciarScenario(4); // dokładnie koszt Justiciara — 0 many na ward
  const bot = createHeuristicBot({ seed: 99 });
  let botTargetIds = null;
  finishTrigger(state,
    (view) => { const ch = bot.chooseCommand(view, {}); botTargetIds = ch.targetIds; return ch; },
    (view) => bot.chooseCommand(view, {}));
  assert.ok(Array.isArray(botTargetIds), 'bot podjął decyzję celów triggera');
  assert.ok(!botTargetIds.includes('hellion-fd'),
    `cel z ward wykluczony bez many na dopłatę (wybrał: ${botTargetIds})`);
  assert.equal(state.objects.get('knight')?.detained, true, 'Knight legalnie zatrzymany');
  assert.ok(!state.objects.get('hellion-fd')?.detained, 'Hellion nietknięty');
  assert.ok(!state.events.some((e) => e.type === 'spell_countered'),
    'zdolność Justiciara nie została skontrowana przez ward');
});

test('F/3: bot z zapasem many może wycelować w ward — i wtedy DOPŁACA (oba cele zatrzymane)', () => {
  const state = justiciarScenario(6); // koszt 4 + 2 zapasu na ward
  const bot = createHeuristicBot({ seed: 99 });
  finishTrigger(state,
    (view) => bot.chooseCommand(view, {}),
    (view) => bot.chooseCommand(view, {}));
  assert.equal(state.objects.get('hellion-fd')?.detained, true,
    'Hellion zatrzymany — ward opłacony, zdolność doszła');
  assert.equal(state.objects.get('knight')?.detained, true, 'Knight zatrzymany');
});

test('F/4 (CR 702.21a): niezapłacony ward JEDNEGO celu kontruje CAŁĄ zdolność — drugi legalny cel nietknięty', () => {
  // Scena z doprecyzowania właściciela odtworzona ręcznie: wybór obu celów
  // bez many na ward. Knight NIE zostaje zatrzymany i to jest POPRAWNE —
  // ward kontruje zdolność w całości, to nie jest „nielegalny cel" (608.2b).
  const state = justiciarScenario(4);
  finishTrigger(state,
    (view, cmds) => cmds.find((c) => (c.targetIds ?? []).includes('hellion-fd') && c.targetIds.includes('knight')),
    (view, cmds) => cmds.find((c) => c.pay === false) ?? cmds[0]);
  assert.ok(!state.objects.get('knight')?.detained,
    'Knight niezagrożony: zdolność skontrowana przez ward w całości (CR 702.21a)');
  assert.ok(!state.objects.get('hellion-fd')?.detained, 'Hellion nietknięty');
  assert.ok(state.events.some((e) => e.type === 'spell_countered'),
    'silnik skontrował zdolność Detain przez ward');
});
