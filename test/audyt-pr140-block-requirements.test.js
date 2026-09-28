import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createCardDeck } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { legalBlockerOptions, blockCandidatePool, mandatoryBlockerIds, minimalMandatoryBlocks } from '../src/engine/combat.js';
import { renderCombatWizard } from '../src/table/choice-request.js';
import { clearStatModifiers } from '../src/engine/permanents.js';

// CR pobrany online 2026-09-28, wydanie 2026-09-25 (pełny plik i SHA w raporcie).
// CR 509.1c: „If the number of requirements that are being obeyed is fewer
// than the maximum possible number of requirements that could be obeyed
// without disobeying any restrictions, the declaration of blockers is illegal.”
// https://mtg.wiki/page/Declare_blockers_step
// CR 506.5: „A creature blocks alone if it's the only creature declared as
// a blocker during the declare blockers step.” — CAŁA deklaracja, nie grupa
// pod jednym atakującym. Źródło pełnego tekstu:
// https://api.github.com/repos/nwgarne/mtg-data/contents/rules/cr-raw.txt
// CR 400.7: zmiana strefy tworzy nowy obiekt bez dawnych wymogów.
const registry = createCardRegistry();
function put(state, id, cardId, playerId = 'p1', zone = 'hand') {
  const [{ objectId, ...data }] = createCardDeck({ cardIds: [cardId], ownerId: playerId, registry });
  addObject(state, { ...data, id, instanceId: `i-${id}`, controllerId: playerId, zone });
}
function game() {
  const s = createGameState({ seed: 142, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main', 'p1');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  for (const p of ['p1', 'p2']) for (let i = 0; i < 12; i++) put(s, `lib-${p}-${i}`, 'basic-swamp', p, 'library');
  return s;
}
function creature(s, id, playerId, { color = 'G', keywords = [], abilities = [], subtypes = ['Warrior'], alone = false, required = 0, slots = 1 } = {}) {
  addObject(s, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId: playerId,
    zone: 'battlefield', kind: 'creature', types: ['Creature'], colors: [color],
    subtypes, keywords, power: 4, toughness: 4,
    abilities: [...abilities, ...(alone ? [{ type: 'static', cantBlockAlone: true }] : [])],
  });
  const counter = `test-slot-${id}`;
  s.objects.set(id, Object.freeze({ ...s.objects.get(id), summoningSickness: false,
    blocksIfAble: required > 0, ...(required ? { blockRequirementCount: required } : {}),
    ...(slots > 1 ? { counters: { [counter]: 1 } } : {}),
  }));
  if (slots > 1) {
    // Testowy nośnik istniejącej statyki Cenn's Tactician, nie nowa karta.
    creature(s, `slot-source-${id}`, playerId, {
      abilities: Array.from({ length: slots - 1 }, () => ({ type: 'static', grantsExtraBlockWithCounter: counter })),
    });
    s.objects.set(`slot-source-${id}`, Object.freeze({ ...s.objects.get(`slot-source-${id}`), tapped: true }));
  }
}
const commands = (s, p = s.turn.priorityPlayerId) => playerView(s, p).legalCommands;
function run(s, cmd) {
  assert.ok(cmd, 'komenda jest w ofercie');
  const r = execute(s, cmd);
  assert.equal(r.ok, true, JSON.stringify(r));
  return r;
}
function resolve(s) {
  for (let i = 0; s.zones.stack.length && i < 40; i++) run(s, commands(s).find((c) => c.type === 'pass_priority'));
  assert.equal(s.zones.stack.length, 0);
}
function kick(s, targetId, id) {
  put(s, id, 'timely-interference');
  addMana(s, 'p1', 3);
  run(s, commands(s, 'p1').find((c) => c.type === 'cast_spell' && c.objectId === id && c.kicked === true && c.targets?.[0] === targetId));
  resolve(s);
  assert.equal(s.objects.get(targetId).blocksIfAble, true);
}
function combat(s, attackerIds) {
  s.turn = jumpToStep(s.turn, 'declare_attackers', 'p1');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  run(s, { type: 'declare_attackers', playerId: 'p1', attackerIds });
  s.turn = jumpToStep(s.turn, 'declare_blockers', 'p2');
  s.turn.activePlayerId = 'p1'; s.turn.priorityPlayerId = 'p2';
}
function blocks(s, assignments) {
  return execute(s, { type: 'declare_blockers', playerId: 'p2', assignments });
}
function partialGame() {
  const s = game();
  creature(s, 'aR', 'p1', { keywords: ['menace'], abilities: [{ type: 'static', cantBeBlockedExceptByColors: ['R'] }] });
  creature(s, 'aG', 'p1', { abilities: [{ type: 'static', cantBeBlockedExceptByColors: ['G'] }] });
  creature(s, 'bR', 'p2', { color: 'R' }); creature(s, 'bG', 'p2', { color: 'G' });
  kick(s, 'bR', 'kickR'); kick(s, 'bG', 'kickG');
  combat(s, ['aR', 'aG']);
  return s;
}
const key = (a) => JSON.stringify(Object.entries(a).filter(([, ids]) => ids.length).sort(([a], [b]) => a.localeCompare(b)).map(([id, ids]) => [id, [...ids].sort()]));

test('PR140/F6: dwa kickery, maksimum częściowe — żaden cap nie dopuszcza pustego bloku', () => {
  const s = partialGame();
  for (const cap of [1, 2, 32, 1024]) {
    const options = legalBlockerOptions(s, 'p2', cap);
    assert.ok(options.length > 0 && options.length <= cap);
    assert.ok(options.every((a) => key(a) === key({ aG: ['bG'] })), `cap=${cap}`);
  }
  const before = structuredClone(s);
  assert.equal(blocks(s, {}).ok, false);
  assert.deepEqual(s, before, 'odmowa atomowa');
  assert.equal(blocks(s, { aG: ['bG'] }).ok, true);
});

test('PR140/F6: auto-pass też realizuje maksimum częściowe, nie pomija wszystkich', () => {
  const s = partialGame();
  assert.deepEqual(minimalMandatoryBlocks(s, 'p2', mandatoryBlockerIds(s, 'p2')), { aG: ['bG'] });
  run(s, { type: 'pass_priority', playerId: 'p2' });
  const result = run(s, { type: 'pass_priority', playerId: 'p1' });
  const event = result.events.find((e) => e.type === 'blockers_declared');
  assert.ok(event, 'automatyczna deklaracja nie zniknęła');
  assert.deepEqual(s.combat.blockers.get('aG'), ['bG']);
  assert.equal(s.combat.blockers.has('aR'), false);
});

test('PR140/F6: nieosiągalny wymóg nie tworzy obowiązku nielegalnego bloku', () => {
  const s = game();
  creature(s, 'a', 'p1', { keywords: ['menace'] });
  creature(s, 'b', 'p2', { required: 1 });
  combat(s, ['a']);
  assert.deepEqual(legalBlockerOptions(s, 'p2'), [{}]);
  assert.equal(blocks(s, {}).ok, true);
});

test('PR140/F6: powtórzone Timely liczy wymogi, nie tylko liczbę stworów', () => {
  const s = game();
  for (const color of ['R', 'G']) {
    creature(s, `a${color}`, 'p1', { keywords: ['menace'], abilities: [{ type: 'static', cantBeBlockedExceptByColors: [color, 'W'] }] });
    creature(s, `b${color}`, 'p2', { color });
  }
  creature(s, 'help', 'p2', { color: 'W' });
  kick(s, 'bR', 't1'); kick(s, 'bR', 't2'); kick(s, 'bG', 't3');
  assert.equal(s.objects.get('bR').blockRequirementCount, 2);
  assert.equal(playerView(s, 'p2').zones.battlefield.find((o) => o.id === 'bR').blockRequirementCount, 2);
  combat(s, ['aR', 'aG']);
  assert.equal(blocks(structuredClone(s), { aG: ['bG', 'help'] }).ok, false, '1 < osiągalne 2');
  for (const cap of [1, 32, 1024]) assert.ok(legalBlockerOptions(s, 'p2', cap).every((a) => key(a) === key({ aR: ['bR', 'help'] })));
  assert.equal(blocks(s, { aR: ['bR', 'help'] }).ok, true);
});

test('PR140/F6: realny Ember Beast może mieć partnera pod INNYM atakującym', () => {
  const s = game();
  for (const color of ['R', 'G']) creature(s, `a${color}`, 'p1', { abilities: [{ type: 'static', cantBeBlockedExceptByColors: [color] }] });
  put(s, 'beast', 'ember-beast', 'p2', 'battlefield');
  put(s, 'green', 'highland-game', 'p2', 'battlefield');
  combat(s, ['aR', 'aG']);
  const expected = { aR: ['beast'], aG: ['green'] };
  assert.ok(blockCandidatePool(s, 'p2').aR.includes('beast'), 'kreator nie gubi legalnego kandydata');
  assert.ok(legalBlockerOptions(s, 'p2').some((a) => key(a) === key(expected)));
  assert.equal(blocks(s, expected).ok, true);
});

test('PR140/F6: samotny multibloker nadal blokuje alone (liczba stworów, nie par)', () => {
  const s = game();
  creature(s, 'a1', 'p1'); creature(s, 'a2', 'p1');
  creature(s, 'alone', 'p2', { slots: 2, alone: true, required: 1 });
  combat(s, ['a1', 'a2']);
  assert.equal(blocks(structuredClone(s), { a1: ['alone'], a2: ['alone'] }).ok, false);
  assert.deepEqual(legalBlockerOptions(s, 'p2'), [{}]);
});

test('PR140/F6: jeden bloker nie liczy się dwa razy przeciw menace mimo dwóch slotów', () => {
  const s = game();
  creature(s, 'a', 'p1', { keywords: ['menace'] });
  creature(s, 'b', 'p2', { slots: 2 });
  combat(s, ['a']);
  assert.equal(blocks(s, { a: ['b', 'b'] }).ok, false);
});

test('PR140/F6: legalna ręczna deklaracja spoza cap nadal akceptowana', () => {
  const s = game();
  const ids = Array.from({ length: 5 }, (_, i) => `a${i}`);
  for (const id of ids) creature(s, id, 'p1');
  for (let i = 0; i < 5; i++) creature(s, `b${i}`, 'p2', { required: 1 });
  combat(s, ids);
  const expected = Object.fromEntries(ids.map((id, i) => [id, [`b${4 - i}`]]));
  assert.equal(legalBlockerOptions(s, 'p2', 1).length, 1);
  assert.equal(blocks(s, expected).ok, true);
});

test('PR140/F6: dodatkowe sloty dają partnera kilku wymuszonym pod menace', () => {
  const s = game();
  for (const color of ['R', 'G']) {
    creature(s, `a${color}`, 'p1', { keywords: ['menace'], abilities: [{ type: 'static', cantBeBlockedExceptByColors: [color, 'W'] }] });
    creature(s, `b${color}`, 'p2', { color, required: 1 });
  }
  creature(s, 'help', 'p2', { color: 'W', slots: 2 });
  combat(s, ['aR', 'aG']);
  const expected = { aR: ['bR', 'help'], aG: ['bG', 'help'] };
  assert.equal(key(minimalMandatoryBlocks(s, 'p2', ['bR', 'bG'])), key(expected));
  assert.equal(blocks(s, expected).ok, true);
});

test('PR140/F6: wymóg znika przy Force Away i w cleanupie', () => {
  const s = game();
  put(s, 'b', 'highland-game', 'p2', 'battlefield');
  kick(s, 'b', 't1'); kick(s, 'b', 't2');
  const cleanup = structuredClone(s);
  clearStatModifiers(cleanup);
  assert.equal(cleanup.objects.get('b').blocksIfAble, false);
  assert.equal(cleanup.objects.get('b').blockRequirementCount ?? 0, 0);
  put(s, 'bounce', 'force-away'); addMana(s, 'p1', 2, { colors: ['U'] });
  run(s, commands(s).find((c) => c.type === 'cast_spell' && c.objectId === 'bounce' && c.targets?.[0] === 'b'));
  resolve(s);
  const returned = [...s.objects.values()].find((o) => o.instanceId === 'i-b' && o.zone === 'hand');
  assert.ok(returned);
  assert.equal(returned.blocksIfAble, false);
  assert.equal(returned.blockRequirementCount ?? 0, 0);
});

// Niezależna, mała enumeracja ORACLE TESTOWEGO: bez helperów legalności engine.
// Odczytuje wyłącznie jawne profile (kolory, menace, alone, sloty, liczby wymogów).
function oracle(att, def) {
  let best = -1; const legal = []; const current = {};
  const score = (a) => {
    const used = new Set(Object.values(a).flat());
    return def.reduce((n, b) => n + (used.has(b.id) ? b.required : 0), 0);
  };
  const visit = (i) => {
    if (i === def.length) {
      if (att.some((a) => a.menace && current[a.id]?.length === 1)) return;
      const used = new Set(Object.values(current).flat());
      if (used.size === 1 && def.some((b) => used.has(b.id) && b.alone)) return;
      const result = Object.fromEntries(Object.entries(current).filter(([, ids]) => ids.length).map(([id, ids]) => [id, [...ids]]));
      const count = score(result); best = Math.max(best, count); legal.push({ assignment: result, count }); return;
    }
    const b = def[i];
    const targets = att.filter((a) => a.colors.includes(b.color));
    const subsets = [[]];
    for (const a of targets) for (const subset of [...subsets]) if (subset.length < b.slots) subsets.push([...subset, a.id]);
    for (const subset of subsets) {
      for (const a of subset) (current[a] ??= []).push(b.id);
      visit(i + 1);
      for (const a of subset) current[a].pop();
    }
  };
  visit(0);
  return { best, legal, score };
}

test('PR140/F6: 36 małych układów — maksimum/oferta/walidacja zgodne z niezależną enumeracją', () => {
  const colors = ['R', 'G', 'W'];
  for (let seed = 0; seed < 36; seed++) {
    const s = game();
    const att = Array.from({ length: 1 + seed % 3 }, (_, i) => ({ id: `a${i}`, menace: (seed + i) % 3 === 0,
      colors: colors.filter((_, j) => (seed * 7 + i * 3 + j) % 4 !== 0) }));
    const def = Array.from({ length: 1 + seed % 4 }, (_, i) => ({ id: `b${i}`, required: (seed + i * 7) % 3,
      color: colors[(seed + i) % 3], slots: (seed + i) % 5 === 0 ? 2 : 1, alone: (seed * 3 + i) % 7 === 0 }));
    for (const a of att) creature(s, a.id, 'p1', { keywords: a.menace ? ['menace'] : [], abilities: [{ type: 'static', cantBeBlockedExceptByColors: a.colors }] });
    for (const b of def) creature(s, b.id, 'p2', b);
    combat(s, att.map((a) => a.id));
    const expected = oracle(att, def);
    const optimal = expected.legal.filter((a) => a.count === expected.best);
    const keys = new Set(optimal.map((a) => key(a.assignment)));
    for (const cap of [1, 3, 32, 4096]) {
      const menu = legalBlockerOptions(s, 'p2', cap);
      assert.ok(menu.length > 0 && menu.length <= cap, `seed=${seed} cap=${cap}`);
      assert.equal(new Set(menu.map(key)).size, menu.length, 'bez duplikatów');
      for (const a of menu) assert.ok(keys.has(key(a)), `seed=${seed} cap=${cap}: ${key(a)} nie osiąga legalnego maksimum=${expected.best}`);
      if (cap === 4096) assert.deepEqual(new Set(menu.map(key)), keys, `pełna mała przestrzeń seed=${seed}`);
    }
    for (const sample of [optimal[0], optimal.at(-1)]) assert.equal(blocks(structuredClone(s), sample.assignment).ok, true, `manual seed=${seed}`);
    const suboptimal = expected.legal.find((a) => a.count < expected.best);
    if (suboptimal) assert.equal(blocks(structuredClone(s), suboptimal.assignment).ok, false, `zbyt mało wymogów seed=${seed}`);
  }
});

test('PR140/F6: większy split 18 menace + wspólny partner — maksimum jeden, nie zero', () => {
  const s = game();
  const types = ['Advisor', 'Ally', 'Angel', 'Antelope', 'Ape', 'Archer', 'Archon', 'Artificer', 'Assassin',
    'Atog', 'Aurochs', 'Avatar', 'Badger', 'Barbarian', 'Basilisk', 'Bat', 'Bear', 'Beast'];
  const attackers = [];
  for (let i = 0; i < types.length; i++) {
    const id = `a${i}`; attackers.push(id);
    creature(s, id, 'p1', { keywords: ['menace'], abilities: [{ type: 'static', cantBeBlockedBySubtypes: types.filter((_, j) => i !== j) }] });
    creature(s, `b${i}`, 'p2', { required: 1, subtypes: [types[i]] });
  }
  creature(s, 'help', 'p2', { subtypes: ['Spirit'] });
  combat(s, attackers);
  const options = legalBlockerOptions(s, 'p2');
  assert.ok(options.length > 0);
  for (const a of options) {
    assert.equal(Object.values(a).flat().filter((id) => id !== 'help').length, 1);
    assert.ok(Object.values(a).flat().includes('help'));
  }
  const minimal = minimalMandatoryBlocks(s, 'p2', mandatoryBlockerIds(s, 'p2'));
  assert.ok(minimal);
  assert.equal(Object.values(minimal).flat().length, 2);
  assert.equal(blocks(s, minimal).ok, true);
});


// Minimalny DOM jak w test/choice-request-ui; idzie prawdziwy PlayerView i wizard.
class MiniEl {
  constructor(tag) { this.tagName = tag; this.children = []; this.listeners = {}; this.dataset = {}; this.className = ''; this.checked = false; this.disabled = false; this.text = ''; }
  set textContent(value) { this.text = String(value); this.children = []; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  set innerHTML(value) { this.textContent = String(value).replace(/<[^>]*>/g, ''); }
  get innerHTML() { return this.textContent; }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...nodes) { this.children = nodes.flat(); }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  emit(type) { for (const fn of this.listeners[type] ?? []) fn({ target: this }); }
  click() { this.emit('click'); }
}
function findAll(host, tag) { return [...(host.tagName === tag ? [host] : []), ...host.children.flatMap((c) => findAll(c, tag))]; }
function wizard(s) {
  globalThis.document = { createElement: (tag) => new MiniEl(tag) };
  const host = new MiniEl('div'); const calls = []; const view = playerView(s, 'p2');
  renderCombatWizard(host, { kind: 'blockers', view, blockCandidates: view.blockCandidates,
    options: view.legalCommands.filter((c) => c.type === 'declare_blockers'),
    session: { nameOf: (id) => registry.get(id)?.name ?? id, nameOfObject: () => '?' },
    onComplete: (c) => calls.push(c) });
  return { host, calls };
}
function check(host, name) {
  const row = findAll(host, 'label').find((l) => l.textContent.includes(name));
  assert.ok(row, `wiersz ${name}`);
  const input = findAll(row, 'input')[0]; input.checked = true; input.emit('change');
}
function click(host, label) {
  const button = findAll(host, 'button').find((b) => b.textContent === label);
  assert.ok(button, label); button.click();
}

test('PR140/F6 UI: inne grupy bloków spełniają alone — wizard wysyła legalną deklarację', () => {
  const s = game();
  for (const color of ['R', 'G']) creature(s, `a${color}`, 'p1', { abilities: [{ type: 'static', cantBeBlockedExceptByColors: [color] }] });
  put(s, 'beast', 'ember-beast', 'p2', 'battlefield'); put(s, 'green', 'highland-game', 'p2', 'battlefield');
  combat(s, ['aR', 'aG']);
  const { host, calls } = wizard(s);
  check(host, 'Ember Beast'); check(host, 'Highland Game'); click(host, 'Zatwierdź bloki');
  assert.equal(calls.length, 1);
  assert.equal(execute(s, calls[0]).ok, true);
});

test('PR140/F6 UI: zatwierdzenie zera nie omija maksimum częściowego, poprawny blok działa', () => {
  const s = partialGame(); const { host, calls } = wizard(s);
  click(host, 'Zatwierdź bloki');
  assert.equal(calls.length, 0, 'wizard zatrzymuje mniej wymogów niż w legalnej ofercie');
  check(host, 'test-bG'); click(host, 'Zatwierdź bloki');
  assert.equal(calls.length, 1);
  assert.equal(execute(s, calls[0]).ok, true);
});

test('PR140/F6 UI: Bez bloków też nie wysyła nielegalnego zera', () => {
  const s = partialGame(); const { host, calls } = wizard(s);
  click(host, 'Bez bloków');
  assert.equal(calls.length, 0);
  check(host, 'test-bG'); click(host, 'Zatwierdź bloki');
  assert.equal(calls.length, 1);
  assert.equal(execute(s, calls[0]).ok, true);
});


test('PR140/F6: elastyczny partner musi ustąpić wąskiemu (dopasowanie, nie greedy)', () => {
  const s = game();
  for (const color of ['R', 'G']) {
    creature(s, `a${color}`, 'p1', { keywords: ['menace'], abilities: [{ type: 'static', cantBeBlockedExceptByColors: [color, 'W'] }] });
    creature(s, `b${color}`, 'p2', { color, required: 1 });
  }
  creature(s, 'flex', 'p2', { color: 'W' }); creature(s, 'narrow', 'p2', { color: 'R' });
  combat(s, ['aR', 'aG']);
  const expected = { aR: ['bR', 'narrow'], aG: ['bG', 'flex'] };
  assert.equal(key(minimalMandatoryBlocks(s, 'p2', ['bR', 'bG'])), key(expected));
  for (const cap of [1, 32, 1024]) assert.ok(legalBlockerOptions(s, 'p2', cap).every((a) => key(a) === key(expected)));
  assert.equal(blocks(s, expected).ok, true);
});

test('PR140/F6: cap przestrzeni uwzględnia sloty, fallback nie zabiera ich blokerowi', () => {
  const s = game();
  const attackers = Array.from({ length: 6 }, (_, i) => `a${i}`);
  for (const id of attackers) creature(s, id, 'p1');
  creature(s, 'multi', 'p2', { slots: 3 });
  combat(s, attackers);
  // 1 + C(6,1) + C(6,2) + C(6,3) = 42 > 32, choć stary szacunek
  // (6+1)^1 = 7 błędnie dopuszczał pełną (zduplikowaną) enumerację rund.
  const offers = legalBlockerOptions(s, 'p2', 32);
  assert.ok(offers.length <= 32);
  assert.ok(offers.some((a) => Object.values(a).flat().length === 3), 'wariant używający trzech legalnych slotów');
  for (const a of offers) assert.equal(blocks(structuredClone(s), a).ok, true);
});

test('PR140/F6: partner globalnego alone może wymagać osobnej pary pod menace', () => {
  const s = game();
  creature(s, 'aR', 'p1', { abilities: [{ type: 'static', cantBeBlockedExceptByColors: ['R'] }] });
  creature(s, 'aG', 'p1', { keywords: ['menace'], abilities: [{ type: 'static', cantBeBlockedExceptByColors: ['G'] }] });
  creature(s, 'bR', 'p2', { color: 'R', alone: true, required: 1 });
  creature(s, 'g1', 'p2', { color: 'G' }); creature(s, 'g2', 'p2', { color: 'G' });
  combat(s, ['aR', 'aG']);
  const expected = { aR: ['bR'], aG: ['g1', 'g2'] };
  assert.equal(key(minimalMandatoryBlocks(s, 'p2', ['bR'])), key(expected));
  assert.ok(blockCandidatePool(s, 'p2').aR.includes('bR'));
  assert.equal(blocks(s, expected).ok, true);
});

test('PR140/F6: cap jest budżetem pracy enumeratora także przy pięciu slotach', () => {
  const s = game();
  const attackers = Array.from({ length: 10 }, (_, i) => `a${i}`);
  for (const id of attackers) creature(s, id, 'p1');
  creature(s, 'multi', 'p2', { slots: 5 });
  combat(s, attackers);
  const originalGet = s.objects.get; let reads = 0; let offers;
  // Licznik pracy, nie zegar i nie regex implementacji. Przerywa natychmiast
  // po przekroczeniu budżetu, żeby mutant starej enumeracji nie zawiesił suite.
  s.objects.get = function (id) {
    assert.ok(++reads <= 10000, 'małe menu nie może enumerować kombinatorycznie wszystkich slotów');
    return originalGet.call(this, id);
  };
  try { offers = legalBlockerOptions(s, 'p2', 32); }
  finally { delete s.objects.get; }
  assert.ok(offers.length <= 32);
  assert.ok(offers.some((a) => Object.values(a).flat().length === 5));
  for (const a of offers) assert.equal(blocks(structuredClone(s), a).ok, true);
});
